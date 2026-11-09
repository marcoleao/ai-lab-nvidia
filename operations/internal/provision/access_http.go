package provision

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type HTTPDoer interface {
	Do(*http.Request) (*http.Response, error)
}

func accessClient(o Options) *http.Client {
	allowed := map[string]bool{}
	for key, value := range accessEndpoints(o) {
		if key == "identity_admin" {
			continue
		}
		u, _ := url.Parse(value)
		allowed[u.Host] = true
	}
	transport := &http.Transport{Proxy: nil, DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		if !allowed[address] {
			return nil, codedError("PLATFORM_ACCESS_HTTP_TARGET_REJECTED")
		}
		_, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}
		return (&net.Dialer{Timeout: 3 * time.Second}).DialContext(ctx, "tcp4", net.JoinHostPort("127.0.0.1", port))
	}}
	return &http.Client{Transport: transport, Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
}
func (e *Engine) accessRequest(ctx context.Context, o Options, endpoint, method, path, token string, payload any) (map[string]any, int, error) {
	var body io.Reader
	if payload != nil {
		body = bytes.NewReader(jsonBytes(payload))
	}
	req, err := http.NewRequestWithContext(ctx, method, accessEndpoints(o)[endpoint]+path, body)
	if err != nil {
		return nil, 0, codedError("PLATFORM_ACCESS_HTTP_REQUEST_INVALID")
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("X-Vault-Token", token)
	}
	client := e.HTTP
	if client == nil {
		client = accessClient(o)
	}
	response, err := client.Do(req)
	if err != nil {
		return nil, 0, codedError("PLATFORM_ACCESS_HTTP_UNAVAILABLE")
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, (1<<20)+1))
	if err != nil || len(data) > 1<<20 {
		return nil, response.StatusCode, codedError("PLATFORM_ACCESS_HTTP_RESULT_INVALID")
	}
	result := map[string]any{}
	if len(bytes.TrimSpace(data)) > 0 {
		if json.Unmarshal(data, &result) != nil {
			return nil, response.StatusCode, codedError("PLATFORM_ACCESS_HTTP_RESULT_INVALID")
		}
	}
	return result, response.StatusCode, nil
}
func (e *Engine) waitAccessHTTP(ctx context.Context, o Options) error {
	waitCtx, cancel := context.WithTimeout(ctx, 3*time.Minute)
	defer cancel()
	for {
		discovery, status, err := e.accessRequest(waitCtx, o, "identity", "GET", "/realms/platform/.well-known/openid-configuration", "", nil)
		if err == nil && status == 200 {
			issuer := accessEndpoints(o)["identity"] + "/realms/platform"
			if discovery["issuer"] != issuer || discovery["authorization_endpoint"] != issuer+"/protocol/openid-connect/auth" || discovery["token_endpoint"] != issuer+"/protocol/openid-connect/token" || discovery["jwks_uri"] != issuer+"/protocol/openid-connect/certs" {
				return codedError("PLATFORM_IDENTITY_ISSUER_MISMATCH")
			}
			health, status, err := e.accessRequest(waitCtx, o, "secret_store", "GET", "/v1/sys/health", "", nil)
			_, initializedOK := health["initialized"].(bool)
			_, sealedOK := health["sealed"].(bool)
			if err == nil && (status == 200 || status == 501 || status == 503) && initializedOK && sealedOK {
				return nil
			}
		}
		select {
		case <-waitCtx.Done():
			return codedError("PLATFORM_ACCESS_HEALTH_TIMEOUT")
		case <-time.After(500 * time.Millisecond):
		}
	}
}

type baoState struct {
	Schema                                 int
	Installation, Profile, Owner           string
	UnsealKey, RootToken, RoleID, SecretID string
	RootRevocationRequested, Complete      bool
}

func baoReceipt(state baoState) []byte {
	return jsonBytes(map[string]any{"schema": state.Schema, "installation": state.Installation, "profile": state.Profile, "owner": state.Owner, "complete": state.Complete, "root_revoked": state.Complete && state.RootToken == "", "approle_configured": state.RoleID != "" && state.SecretID != ""})
}
func saveBaoState(o Options, state baoState) error {
	return atomicFile(filepath.Join(o.ControlRoot, "access-recovery.json"), jsonBytes(state), 0600)
}
func (e *Engine) baoLiveReceipt(ctx context.Context, o Options, state baoState) ([]byte, error) {
	health, err := e.baoCall(ctx, o, "GET", "sys/health", "", nil, 200, 501, 503)
	if err != nil {
		return nil, err
	}
	return jsonBytes(map[string]any{"bootstrap": json.RawMessage(baoReceipt(state)), "initialized": health["initialized"], "sealed": health["sealed"]}), nil
}
func dataMap(value map[string]any) map[string]any {
	data, _ := value["data"].(map[string]any)
	return data
}
func stringAt(value map[string]any, key string) string { s, _ := value[key].(string); return s }
func (e *Engine) baoCall(ctx context.Context, o Options, method, path, token string, payload any, wanted ...int) (map[string]any, error) {
	value, status, err := e.accessRequest(ctx, o, "secret_store", method, "/v1/"+path, token, payload)
	if err != nil {
		return nil, err
	}
	for _, code := range wanted {
		if status == code {
			return value, nil
		}
	}
	return nil, fmt.Errorf("%w: %s %s status=%d", codedError("PLATFORM_SECRET_STORE_API_REJECTED"), method, path, status)
}
func (e *Engine) ensureBaoObject(ctx context.Context, o Options, path, token string, desired map[string]any) error {
	value, status, err := e.accessRequest(ctx, o, "secret_store", "GET", "/v1/"+path, token, nil)
	if err != nil {
		return err
	}
	if status == 404 || status == 200 && (len(dataMap(value)) == 0 || path == "auth/oidc/config" && stringAt(dataMap(value), "oidc_client_id") == "" && stringAt(dataMap(value), "oidc_discovery_url") == "") {
		if _, err = e.baoCall(ctx, o, "POST", path, token, desired, 200, 204); err != nil {
			return err
		}
		value, status, err = e.accessRequest(ctx, o, "secret_store", "GET", "/v1/"+path, token, nil)
		if err != nil {
			return err
		}
	}
	if status != 200 {
		return codedError("PLATFORM_SECRET_STORE_CONFIGURATION_UNCONFIRMED")
	}
	actual := dataMap(value)
	for key, wanted := range desired {
		if key == "oidc_client_secret" {
			continue
		}
		if string(jsonBytes(actual[key])) != string(jsonBytes(wanted)) {
			return codedError("PLATFORM_SECRET_STORE_CONFIGURATION_CONFLICT")
		}
	}
	return nil
}
func accessPolicies() map[string]string {
	self := `path "sys/capabilities-self" { capabilities = ["update"] }
`
	operator := self + `path "platform/data/services/*" { capabilities = ["create", "read", "update", "delete"] }
path "platform/metadata/*" { capabilities = ["read", "list"] }
`
	viewer := self + `path "platform/metadata/*" { capabilities = ["list"] }
`
	admin := operator + `path "sys/policies/acl/platform-*" { capabilities = ["create", "read", "update", "delete", "list"] }
path "auth/oidc/*" { capabilities = ["create", "read", "update", "delete", "list"] }
path "auth/approle/role/platform-*" { capabilities = ["create", "read", "update", "delete", "list"] }
path "identity/group*" { capabilities = ["create", "read", "update", "delete", "list"] }
path "auth/token/create" { capabilities = ["update"] }
path "sys/audit" { capabilities = ["read"] }
`
	installer := operator + `path "sys/policies/acl/platform-*" { capabilities = ["read"] }
path "auth/oidc/config" { capabilities = ["read"] }
path "auth/oidc/role/platform" { capabilities = ["read"] }
path "sys/mounts" { capabilities = ["read"] }
path "sys/auth" { capabilities = ["read"] }
path "sys/audit" { capabilities = ["read"] }
`
	return map[string]string{"platform-operator": operator, "platform-viewer": viewer, "platform-security-admin": admin, "platform-installer": installer}
}
func (e *Engine) ensureBaoMount(ctx context.Context, o Options, path, key, kind, root string, options map[string]string) error {
	value, err := e.baoCall(ctx, o, "GET", path, root, nil, 200)
	if err != nil {
		return err
	}
	actual, _ := dataMap(value)[key+"/"].(map[string]any)
	if actual == nil {
		payload := map[string]any{"type": kind}
		if options != nil {
			payload["options"] = options
		}
		if _, err = e.baoCall(ctx, o, "POST", path+"/"+key, root, payload, 200, 204); err != nil {
			return err
		}
		value, err = e.baoCall(ctx, o, "GET", path, root, nil, 200)
		if err != nil {
			return err
		}
		actual, _ = dataMap(value)[key+"/"].(map[string]any)
	}
	if actual["type"] != kind {
		return codedError("PLATFORM_SECRET_STORE_MOUNT_CONFLICT")
	}
	if options != nil {
		actualOptions, _ := actual["options"].(map[string]any)
		for name, wanted := range options {
			if actualOptions[name] != wanted {
				return codedError("PLATFORM_SECRET_STORE_MOUNT_CONFLICT")
			}
		}
	}
	return nil
}
func (e *Engine) ensureBaoGroups(ctx context.Context, o Options, root, accessor string) error {
	for _, role := range []string{"operator", "viewer", "security-admin"} {
		name := map[string]string{"operator": "platform-operators", "viewer": "platform-viewers", "security-admin": "platform-security-admins"}[role]
		value, status, err := e.accessRequest(ctx, o, "secret_store", "GET", "/v1/identity/group/name/"+name, root, nil)
		if err != nil {
			return err
		}
		if status == 404 {
			value, err = e.baoCall(ctx, o, "POST", "identity/group", root, map[string]any{"name": name, "type": "external", "policies": []string{"platform-" + role}, "metadata": map[string]string{"installation_id": o.InstallationID}}, 200)
			if err != nil {
				return err
			}
			value, err = e.baoCall(ctx, o, "GET", "identity/group/name/"+name, root, nil, 200)
			if err != nil {
				return err
			}
		}
		group := dataMap(value)
		meta, _ := group["metadata"].(map[string]any)
		if group["name"] != name || group["type"] != "external" || meta["installation_id"] != o.InstallationID || string(jsonBytes(group["policies"])) != string(jsonBytes([]string{"platform-" + role})) {
			return codedError("PLATFORM_SECRET_STORE_GROUP_CONFLICT")
		}
		alias, _ := group["alias"].(map[string]any)
		if stringAt(alias, "id") == "" {
			if _, err = e.baoCall(ctx, o, "POST", "identity/group-alias", root, map[string]any{"name": name, "mount_accessor": accessor, "canonical_id": group["id"]}, 200); err != nil {
				return err
			}
			value, err = e.baoCall(ctx, o, "GET", "identity/group/name/"+name, root, nil, 200)
			if err != nil {
				return err
			}
			alias, _ = dataMap(value)["alias"].(map[string]any)
			if alias["name"] != name || alias["mount_accessor"] != accessor || alias["canonical_id"] != group["id"] {
				return codedError("PLATFORM_SECRET_STORE_GROUP_UNCONFIRMED")
			}
		} else if alias["name"] != name || alias["mount_accessor"] != accessor || alias["canonical_id"] != group["id"] {
			return codedError("PLATFORM_SECRET_STORE_GROUP_CONFLICT")
		}
	}
	return nil
}
func (e *Engine) configureBao(ctx context.Context, o Options, seed accessSeed, state *baoState) error {
	root := state.RootToken
	audits, err := e.baoCall(ctx, o, "GET", "sys/audit", root, nil, 200)
	if err != nil {
		return err
	}
	device, _ := dataMap(audits)["platform/"].(map[string]any)
	if device == nil {
		return codedError("PLATFORM_SECRET_STORE_DECLARATIVE_AUDIT_REQUIRED")
	}
	if err = e.verifyBaoAudit(ctx, o, root); err != nil {
		return err
	}
	if err = e.ensureBaoMount(ctx, o, "sys/mounts", "platform", "kv", root, map[string]string{"version": "2"}); err != nil {
		return err
	}
	for name, policy := range accessPolicies() {
		value, status, err := e.accessRequest(ctx, o, "secret_store", "GET", "/v1/sys/policies/acl/"+name, root, nil)
		if err != nil {
			return err
		}
		if status == 404 {
			if _, err = e.baoCall(ctx, o, "PUT", "sys/policies/acl/"+name, root, map[string]string{"policy": policy}, 200, 204); err != nil {
				return err
			}
		} else if status != 200 || strings.TrimSpace(stringAt(dataMap(value), "policy")) != strings.TrimSpace(policy) {
			return codedError("PLATFORM_SECRET_STORE_POLICY_CONFLICT")
		}
	}
	if err = e.ensureBaoMount(ctx, o, "sys/auth", "oidc", "oidc", root, nil); err != nil {
		return err
	}
	if err = e.ensureBaoObject(ctx, o, "auth/oidc/config", root, map[string]any{"oidc_discovery_url": accessEndpoints(o)["identity"] + "/realms/platform", "oidc_client_id": "openbao", "oidc_client_secret": seed.OIDCSecret, "default_role": "platform"}); err != nil {
		return err
	}
	role := map[string]any{"role_type": "oidc", "user_claim": "sub", "groups_claim": "groups", "bound_claims": map[string]any{"groups": []string{"platform-operators", "platform-viewers", "platform-security-admins"}}, "allowed_redirect_uris": []string{accessEndpoints(o)["secret_store"] + "/ui/vault/auth/oidc/oidc/callback", "http://localhost:8250/oidc/callback"}, "oidc_scopes": []string{"openid", "profile", "email"}, "token_policies": []string{}, "token_ttl": 3600, "token_max_ttl": 14400}
	if err = e.ensureBaoObject(ctx, o, "auth/oidc/role/platform", root, role); err != nil {
		return err
	}
	auth, err := e.baoCall(ctx, o, "GET", "sys/auth", root, nil, 200)
	if err != nil {
		return err
	}
	oidc, _ := dataMap(auth)["oidc/"].(map[string]any)
	accessor := stringAt(oidc, "accessor")
	if accessor == "" {
		return codedError("PLATFORM_SECRET_STORE_OIDC_ACCESSOR_MISSING")
	}
	if err = e.ensureBaoGroups(ctx, o, root, accessor); err != nil {
		return err
	}
	if err = e.ensureBaoMount(ctx, o, "sys/auth", "approle", "approle", root, nil); err != nil {
		return err
	}
	if err = e.ensureBaoObject(ctx, o, "auth/approle/role/platform-installer", root, map[string]any{"token_policies": []string{"platform-installer"}, "token_ttl": 900, "token_max_ttl": 3600, "secret_id_ttl": 0, "secret_id_num_uses": 0}); err != nil {
		return err
	}
	if state.RoleID == "" {
		value, err := e.baoCall(ctx, o, "GET", "auth/approle/role/platform-installer/role-id", root, nil, 200)
		if err != nil {
			return err
		}
		state.RoleID = stringAt(dataMap(value), "role_id")
		if state.RoleID == "" {
			return codedError("PLATFORM_SECRET_STORE_APPROLE_INVALID")
		}
		if err = saveBaoState(o, *state); err != nil {
			return err
		}
	}
	if state.SecretID == "" {
		value, err := e.baoCall(ctx, o, "POST", "auth/approle/role/platform-installer/secret-id", root, map[string]any{}, 200)
		if err != nil {
			return err
		}
		state.SecretID = stringAt(dataMap(value), "secret_id")
		if state.SecretID == "" {
			return codedError("PLATFORM_SECRET_STORE_APPROLE_INVALID")
		}
		if err = saveBaoState(o, *state); err != nil {
			return err
		}
	}
	return nil
}
func (e *Engine) capabilityProof(ctx context.Context, o Options, token string, wantWrite bool) error {
	value, err := e.baoCall(ctx, o, "POST", "sys/capabilities-self", token, map[string]any{"paths": []string{"platform/data/services/_capability_probe"}}, 200)
	if err != nil {
		return err
	}
	caps, ok := value["capabilities"].([]any)
	if !ok {
		caps, _ = dataMap(value)["capabilities"].([]any)
	}
	read, write := false, false
	for _, cap := range caps {
		read = read || cap == "read"
		write = write || cap == "update"
	}
	if wantWrite && (!read || !write) || !wantWrite && (read || write) {
		return codedError("PLATFORM_SECRET_STORE_AUTHORIZATION_UNCONFIRMED")
	}
	return nil
}
func (e *Engine) verifyBaoBootstrapPermissions(ctx context.Context, o Options, root string) error {
	for _, role := range []string{"platform-operator", "platform-viewer"} {
		value, err := e.baoCall(ctx, o, "POST", "auth/token/create", root, map[string]any{"policies": []string{role}, "ttl": "5m", "renewable": false, "display_name": "platform-installation-proof"}, 200)
		if err != nil {
			return err
		}
		auth, _ := value["auth"].(map[string]any)
		token := stringAt(auth, "client_token")
		if token == "" {
			return codedError("PLATFORM_SECRET_STORE_PROOF_TOKEN_MISSING")
		}
		proofErr := e.capabilityProof(ctx, o, token, role == "platform-operator")
		if _, err = e.baoCall(ctx, o, "POST", "auth/token/revoke", root, map[string]string{"token": token}, 200, 204); err != nil {
			return err
		}
		_, status, err := e.accessRequest(ctx, o, "secret_store", "GET", "/v1/auth/token/lookup-self", token, nil)
		if err != nil || status != 403 {
			return codedError("PLATFORM_SECRET_STORE_REVOCATION_UNCONFIRMED")
		}
		if proofErr != nil {
			return proofErr
		}
	}
	return nil
}
func (e *Engine) baoInstallerLogin(ctx context.Context, o Options, state baoState) (string, error) {
	value, err := e.baoCall(ctx, o, "POST", "auth/approle/login", "", map[string]string{"role_id": state.RoleID, "secret_id": state.SecretID}, 200)
	if err != nil {
		return "", err
	}
	auth, _ := value["auth"].(map[string]any)
	token := stringAt(auth, "client_token")
	if token == "" {
		return "", codedError("PLATFORM_SECRET_STORE_APPROLE_INVALID")
	}
	return token, nil
}
func (e *Engine) verifyBaoOIDC(ctx context.Context, o Options, token string) error {
	if err := e.verifyBaoAudit(ctx, o, token); err != nil {
		return err
	}
	for name, policy := range accessPolicies() {
		value, err := e.baoCall(ctx, o, "GET", "sys/policies/acl/"+name, token, nil, 200)
		if err != nil {
			return err
		}
		if strings.TrimSpace(stringAt(dataMap(value), "policy")) != strings.TrimSpace(policy) {
			return codedError("PLATFORM_SECRET_STORE_POLICY_CONFLICT")
		}
	}
	value, err := e.baoCall(ctx, o, "POST", "auth/oidc/oidc/auth_url", "", map[string]string{"role": "platform", "redirect_uri": accessEndpoints(o)["secret_store"] + "/ui/vault/auth/oidc/oidc/callback"}, 200)
	if err != nil {
		return err
	}
	u, err := url.Parse(stringAt(dataMap(value), "auth_url"))
	base, _ := url.Parse(accessEndpoints(o)["identity"])
	if err != nil || u.Scheme != base.Scheme || u.Host != base.Host || u.Path != "/realms/platform/protocol/openid-connect/auth" || u.Query().Get("client_id") != "openbao" || u.Query().Get("redirect_uri") != accessEndpoints(o)["secret_store"]+"/ui/vault/auth/oidc/oidc/callback" {
		return codedError("PLATFORM_SECRET_STORE_OIDC_CONFIGURATION_UNCONFIRMED")
	}
	return nil
}
func (e *Engine) bootstrapSecretStore(ctx context.Context, o Options) ([]byte, error) {
	seed, err := readAccessSeed(o)
	if err != nil {
		return nil, err
	}
	state := baoState{}
	err = accessPrivateRead(o, "access-recovery.json", &state)
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	if state.Schema != 0 && (state.Schema != 1 || state.Installation != o.InstallationID || state.Profile != o.Profile || state.Owner != seed.Owner) {
		return nil, codedError("PLATFORM_SECRET_STORE_OWNERSHIP_CONFLICT")
	}
	health, err := e.baoCall(ctx, o, "GET", "sys/health", "", nil, 200, 501, 503)
	if err != nil {
		return nil, err
	}
	if health["initialized"] == false {
		if state.Schema != 0 {
			return nil, codedError("PLATFORM_SECRET_STORE_DATA_CHANGED")
		}
		value, err := e.baoCall(ctx, o, "PUT", "sys/init", "", map[string]int{"secret_shares": 1, "secret_threshold": 1}, 200)
		if err != nil {
			return nil, err
		}
		keys, _ := value["keys_base64"].([]any)
		if len(keys) != 1 || stringAt(value, "root_token") == "" {
			return nil, codedError("PLATFORM_SECRET_STORE_INITIALIZATION_UNCONFIRMED")
		}
		key, _ := keys[0].(string)
		if key == "" {
			return nil, codedError("PLATFORM_SECRET_STORE_INITIALIZATION_UNCONFIRMED")
		}
		state = baoState{Schema: 1, Installation: o.InstallationID, Profile: o.Profile, Owner: seed.Owner, UnsealKey: key, RootToken: stringAt(value, "root_token")}
		if err = saveBaoState(o, state); err != nil {
			return nil, err
		}
	} else if state.Schema == 0 || state.UnsealKey == "" {
		return nil, codedError("PLATFORM_SECRET_STORE_RECOVERY_MATERIAL_MISSING")
	}
	if health["sealed"] == true {
		value, err := e.baoCall(ctx, o, "PUT", "sys/unseal", "", map[string]string{"key": state.UnsealKey}, 200)
		if err != nil {
			return nil, err
		}
		if value["sealed"] != false {
			return nil, codedError("PLATFORM_SECRET_STORE_UNSEAL_UNCONFIRMED")
		}
	}
	activeCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	for {
		_, status, activeErr := e.accessRequest(activeCtx, o, "secret_store", "GET", "/v1/sys/health", "", nil)
		if activeErr == nil && status == 200 {
			break
		}
		select {
		case <-activeCtx.Done():
			return nil, codedError("PLATFORM_SECRET_STORE_ACTIVE_TIMEOUT")
		case <-time.After(200 * time.Millisecond):
		}
	}
	if !state.Complete && !state.RootRevocationRequested {
		if state.RootToken == "" {
			return nil, codedError("PLATFORM_SECRET_STORE_BOOTSTRAP_CREDENTIAL_MISSING")
		}
		if err = e.configureBao(ctx, o, seed, &state); err != nil {
			return nil, err
		}
		if err = e.verifyBaoBootstrapPermissions(ctx, o, state.RootToken); err != nil {
			return nil, err
		}
	}
	token, err := e.baoInstallerLogin(ctx, o, state)
	if err != nil {
		return nil, err
	}
	defer func() {
		revokeCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		_, _ = e.baoCall(revokeCtx, o, "POST", "auth/token/revoke-self", token, map[string]any{}, 200, 204)
	}()
	if err = e.verifyBaoOIDC(ctx, o, token); err != nil {
		return nil, err
	}
	if err = e.capabilityProof(ctx, o, token, true); err != nil {
		return nil, err
	}
	// Technical credentials are real installation secrets, not validation data.
	for path, values := range map[string]map[string]string{"identity/database": {"password": seed.DatabasePassword}, "openbao/oidc": {"client_secret": seed.OIDCSecret}} {
		name := "platform/data/services/" + path
		existing, status, err := e.accessRequest(ctx, o, "secret_store", "GET", "/v1/"+name, token, nil)
		if err != nil {
			return nil, err
		}
		if status == 404 {
			if _, err = e.baoCall(ctx, o, "POST", name, token, map[string]any{"data": values, "options": map[string]int{"cas": 0}}, 200, 204); err != nil {
				return nil, err
			}
		} else if status != 200 || string(jsonBytes(dataMap(existing)["data"])) != string(jsonBytes(values)) {
			return nil, codedError("PLATFORM_ACCESS_CREDENTIAL_DRIFT")
		}
	}
	if !state.Complete {
		state.RootRevocationRequested = true
		if err = saveBaoState(o, state); err != nil {
			return nil, err
		}
		_, status, err := e.accessRequest(ctx, o, "secret_store", "GET", "/v1/auth/token/lookup-self", state.RootToken, nil)
		if err != nil {
			return nil, err
		}
		if status == 200 {
			_, revokeErr := e.baoCall(ctx, o, "POST", "auth/token/revoke-self", state.RootToken, map[string]any{}, 200, 204)
			_, status, err = e.accessRequest(ctx, o, "secret_store", "GET", "/v1/auth/token/lookup-self", state.RootToken, nil)
			if err != nil {
				return nil, err
			}
			if status != 403 {
				if revokeErr != nil {
					return nil, revokeErr
				}
				return nil, codedError("PLATFORM_SECRET_STORE_ROOT_REVOCATION_UNCONFIRMED")
			}
		}
		if status != 403 {
			return nil, codedError("PLATFORM_SECRET_STORE_ROOT_REVOCATION_UNCONFIRMED")
		}
		state.RootToken = ""
		state.Complete = true
		if err = saveBaoState(o, state); err != nil {
			return nil, err
		}
	}
	if err = e.verifyAccessUIs(ctx, o); err != nil {
		return nil, err
	}
	return e.baoLiveReceipt(ctx, o, state)
}

func (e *Engine) verifyAccessUIs(ctx context.Context, o Options) error {
	for _, target := range []struct{ endpoint, path string }{{"identity", "/admin/platform/console/"}, {"secret_store", "/ui/"}} {
		base := accessEndpoints(o)[target.endpoint]
		next := base + target.path
		for attempt := 0; attempt < 4; attempt++ {
			req, err := http.NewRequestWithContext(ctx, "GET", next, nil)
			if err != nil {
				return codedError("PLATFORM_ACCESS_UI_INVALID")
			}
			client := e.HTTP
			if client == nil {
				client = accessClient(o)
			}
			response, err := client.Do(req)
			if err != nil {
				return codedError("PLATFORM_ACCESS_UI_UNAVAILABLE")
			}
			body, readErr := io.ReadAll(io.LimitReader(response.Body, 1<<20))
			_ = response.Body.Close()
			if readErr != nil {
				return codedError("PLATFORM_ACCESS_UI_UNAVAILABLE")
			}
			if response.StatusCode == 200 && bytes.Contains(bytes.ToLower(body), []byte("<html")) {
				break
			}
			if response.StatusCode < 300 || response.StatusCode > 399 || attempt == 3 {
				return codedError("PLATFORM_ACCESS_UI_UNCONFIRMED")
			}
			location, err := url.Parse(response.Header.Get("Location"))
			if err != nil || response.Header.Get("Location") == "" {
				return codedError("PLATFORM_ACCESS_UI_INVALID")
			}
			current, _ := url.Parse(next)
			resolved := current.ResolveReference(location)
			expected, _ := url.Parse(base)
			if resolved.Scheme != expected.Scheme || resolved.Host != expected.Host || !(strings.HasPrefix(resolved.Path, "/ui/") || strings.HasPrefix(resolved.Path, "/admin/")) {
				return codedError("PLATFORM_ACCESS_UI_REDIRECT_REJECTED")
			}
			next = resolved.String()
		}
	}
	return nil
}
func (e *Engine) verifyBaoAudit(ctx context.Context, o Options, token string) error {
	value, err := e.baoCall(ctx, o, "GET", "sys/audit", token, nil, 200)
	if err != nil {
		return err
	}
	device, _ := dataMap(value)["platform/"].(map[string]any)
	options, _ := device["options"].(map[string]any)
	if device["type"] != "file" || options["file_path"] != "/openbao/audit/events.jsonl" || options["log_raw"] == "true" || options["log_raw"] == true {
		return codedError("PLATFORM_SECRET_STORE_AUDIT_UNCONFIRMED")
	}
	return nil
}
