package provision

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"os"
	"path/filepath"
	"time"
)

type originMaterial struct {
	Schema                                                           int
	Installation, Profile, Owner, Generation, Revision               string
	CA, Server, ServerKey, Client, ClientKey                         []byte
	IngressServer, IngressServerKey, IngressClient, IngressClientKey []byte
}

func (e *Engine) readOriginMaterial(o Options, pending bool) (originMaterial, error) {
	name := "origin-material.json"
	if pending {
		name = "origin-pending-material.json"
	}
	var m originMaterial
	if err := accessPrivateRead(o, name, &m); err != nil {
		return m, err
	}
	owner, err := os.ReadFile(filepath.Join(o.DataRoot, "network.owner"))
	if err != nil {
		return m, err
	}
	if m.Schema != 1 || m.Installation != o.InstallationID || m.Profile != o.Profile || m.Owner != string(owner) || len(m.Generation) != 32 || !hashPattern.MatchString(m.Generation+m.Generation) || !validID(m.Revision) {
		return m, codedError("PLATFORM_ORIGIN_MATERIAL_BINDING_INVALID")
	}
	return m, nil
}

func (e *Engine) workingOriginMaterial(o Options) (originMaterial, error) {
	m, err := e.readOriginMaterial(o, true)
	if os.IsNotExist(err) {
		return e.readOriginMaterial(o, false)
	}
	return m, err
}

func originCert(data []byte) (*x509.Certificate, error) {
	block, rest := pem.Decode(data)
	if block == nil || block.Type != "CERTIFICATE" || len(rest) != 0 {
		return nil, codedError("PLATFORM_ORIGIN_CERTIFICATE_INVALID")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, codedError("PLATFORM_ORIGIN_CERTIFICATE_INVALID")
	}
	return cert, nil
}

func verifyOriginMaterial(m originMaterial, now time.Time) error {
	ca, err := originCert(m.CA)
	if err != nil || !ca.IsCA || ca.CheckSignatureFrom(ca) != nil {
		return codedError("PLATFORM_ORIGIN_CA_INVALID")
	}
	pool := x509.NewCertPool()
	pool.AddCert(ca)
	for index, pair := range []struct {
		cert, key []byte
		usage     x509.ExtKeyUsage
	}{{m.Server, m.ServerKey, x509.ExtKeyUsageServerAuth}, {m.Client, m.ClientKey, x509.ExtKeyUsageClientAuth}} {
		leaf, err := originCert(pair.cert)
		if err != nil {
			return err
		}
		if _, err = tls.X509KeyPair(pair.cert, pair.key); err != nil {
			return codedError("PLATFORM_ORIGIN_KEY_MISMATCH")
		}
		name := ""
		if index == 0 {
			name = "gateway.localhost"
		}
		if _, err = leaf.Verify(x509.VerifyOptions{Roots: pool, CurrentTime: now, DNSName: name, KeyUsages: []x509.ExtKeyUsage{pair.usage}}); err != nil {
			return codedError("PLATFORM_ORIGIN_CERTIFICATE_UNTRUSTED_OR_EXPIRED")
		}
		if leaf.NotAfter.Before(now.Add(24 * time.Hour)) {
			return codedError("PLATFORM_ORIGIN_CERTIFICATE_RENEWAL_REQUIRED")
		}
	}
	return nil
}

func newOriginMaterial(o Options, owner, revision string, now time.Time) (originMaterial, error) {
	m := originMaterial{Schema: 1, Installation: o.InstallationID, Profile: o.Profile, Owner: owner, Revision: revision}
	generation, err := randomIdentity()
	if err != nil {
		return m, err
	}
	m.Generation = generation
	serial := func() (*big.Int, error) { return rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128)) }
	caKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return m, err
	}
	caSerial, err := serial()
	if err != nil {
		return m, err
	}
	ca := &x509.Certificate{SerialNumber: caSerial, Subject: pkix.Name{CommonName: "AI Platform origin " + generation}, NotBefore: now.Add(-5 * time.Minute), NotAfter: now.Add(365 * 24 * time.Hour), IsCA: true, BasicConstraintsValid: true, MaxPathLenZero: true, KeyUsage: x509.KeyUsageCertSign | x509.KeyUsageCRLSign}
	caDER, err := x509.CreateCertificate(rand.Reader, ca, ca, &caKey.PublicKey, caKey)
	if err != nil {
		return m, err
	}
	m.CA = pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: caDER})
	issue := func(server bool, name string) ([]byte, []byte, error) {
		key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		if err != nil {
			return nil, nil, err
		}
		value, err := serial()
		if err != nil {
			return nil, nil, err
		}
		leaf := &x509.Certificate{SerialNumber: value, Subject: pkix.Name{CommonName: name}, NotBefore: now.Add(-5 * time.Minute), NotAfter: now.Add(90 * 24 * time.Hour), KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth}}
		if server {
			leaf.DNSNames = []string{name}
			leaf.ExtKeyUsage = []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}
		}
		der, err := x509.CreateCertificate(rand.Reader, leaf, ca, &key.PublicKey, caKey)
		if err != nil {
			return nil, nil, err
		}
		keyDER, err := x509.MarshalPKCS8PrivateKey(key)
		if err != nil {
			return nil, nil, err
		}
		return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: keyDER}), nil
	}
	m.Server, m.ServerKey, err = issue(true, "gateway.localhost")
	if err != nil {
		return m, err
	}
	m.Client, m.ClientKey, err = issue(false, "platform-installer")
	if err != nil {
		return m, err
	}
	m.IngressServer, m.IngressServerKey, err = issue(true, "ingress.localhost")
	if err != nil {
		return m, err
	}
	m.IngressClient, m.IngressClientKey, err = issue(false, "platform-ingress")
	// The signing key is intentionally not persisted. Rotation replaces the CA
	// and all leaves. Installer and ingress identities use distinct keys.
	return m, err
}

func (e *Engine) prepareOriginMaterial(o Options) ([]byte, error) {
	active, activeErr := e.readOriginMaterial(o, false)
	if activeErr != nil && !os.IsNotExist(activeErr) {
		return nil, activeErr
	}
	pending, pendingErr := e.readOriginMaterial(o, true)
	if pendingErr != nil && !os.IsNotExist(pendingErr) {
		return nil, pendingErr
	}
	revision := o.OriginRevision
	if revision == "" {
		revision = active.Revision
		if pendingErr == nil {
			revision = pending.Revision
		}
		if revision == "" {
			revision = "initial"
		}
	}
	if pendingErr == nil {
		if pending.Revision != revision {
			return nil, codedError("PLATFORM_ORIGIN_PENDING_REVISION")
		}
		if err := verifyOriginMaterial(pending, e.Now()); err != nil {
			return nil, err
		}
		return jsonBytes(map[string]string{"material_digest": digest(jsonBytes(pending))}), nil
	}
	if activeErr == nil && active.Revision == revision {
		if err := verifyOriginMaterial(active, e.Now()); err != nil {
			return nil, err
		}
		return jsonBytes(map[string]string{"material_digest": digest(jsonBytes(active))}), nil
	}
	var record originRecord
	if err := networkControl(o, "origin.resources.json", &record); err != nil {
		return nil, err
	}
	for _, old := range record.Retained {
		if old.Revision == revision {
			return nil, codedError("PLATFORM_ORIGIN_RETIRED_REVISION")
		}
	}
	owner, err := os.ReadFile(filepath.Join(o.DataRoot, "network.owner"))
	if err != nil {
		return nil, err
	}
	m, err := newOriginMaterial(o, string(owner), revision, e.Now())
	if err != nil {
		return nil, err
	}
	if err = atomicFile(filepath.Join(o.ControlRoot, "origin-pending-material.json"), jsonBytes(m), 0600); err != nil {
		return nil, err
	}
	return jsonBytes(map[string]string{"material_digest": digest(jsonBytes(m))}), nil
}
