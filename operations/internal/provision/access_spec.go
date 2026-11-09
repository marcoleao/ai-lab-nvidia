package provision

import (
	"encoding/json"
	"fmt"
	"net/netip"
	"os"
	"path/filepath"
	"strings"
)

type accessSeed struct {
	Schema                                                                                int
	Installation, Profile, Owner                                                          string
	DatabaseAdminPassword, DatabasePassword, MasterPassword, OperatorPassword, OIDCSecret string
}
type accessImage struct {
	Reference string `json:"reference"`
	Config    string `json:"config"`
}
type accessRelease struct {
	Version   string                 `json:"version"`
	Index     string                 `json:"index"`
	Platforms map[string]accessImage `json:"platforms"`
}
type accessFile struct {
	Data []byte
	Mode int64
}
type accessVolume struct {
	Name       string
	UID        int
	Files      map[string]accessFile
	Persistent bool
}
type accessSpec struct {
	Project, Owner, Digest, ProxyIP string
	Volumes                         map[string]accessVolume
	Services                        map[string]map[string]any
	Compose                         []byte
}

func accessEndpoints(o Options) map[string]string {
	return map[string]string{"identity": fmt.Sprintf("http://auth.localhost:%d", o.IdentityPort), "identity_admin": fmt.Sprintf("http://auth.localhost:%d/admin/platform/console/", o.IdentityPort), "secret_store": fmt.Sprintf("http://vault.localhost:%d", o.SecretStorePort)}
}
func accessReleases() map[string]accessRelease {
	data, _ := sources.ReadFile("access-images.json")
	var releases map[string]accessRelease
	_ = json.Unmarshal(data, &releases)
	return releases
}
func accessPrivateRead(o Options, name string, value any) error {
	p := filepath.Join(o.ControlRoot, name)
	if err := plain(p); err != nil {
		return err
	}
	data, err := os.ReadFile(p)
	if err != nil {
		return err
	}
	if json.Unmarshal(data, value) != nil {
		return codedError("PLATFORM_ACCESS_CONTROL_INVALID")
	}
	return nil
}
func readAccessSeed(o Options) (accessSeed, error) {
	var seed accessSeed
	if err := accessPrivateRead(o, "access-seed.json", &seed); err != nil {
		return seed, err
	}
	if seed.Schema != 1 || seed.Installation != o.InstallationID || seed.Profile != o.Profile || len(seed.Owner) != 32 || !operationPattern.MatchString(seed.Owner) {
		return seed, codedError("PLATFORM_ACCESS_OWNERSHIP_CONFLICT")
	}
	for _, password := range []string{seed.DatabaseAdminPassword, seed.DatabasePassword, seed.MasterPassword, seed.OperatorPassword, seed.OIDCSecret} {
		if !hashPattern.MatchString(password) {
			return seed, codedError("PLATFORM_ACCESS_CREDENTIAL_INVALID")
		}
	}
	return seed, nil
}
func (e *Engine) prepareAccessCredentials(o Options) ([]byte, error) {
	seed, err := readAccessSeed(o)
	if os.IsNotExist(err) {
		owner, err := randomIdentity()
		if err != nil {
			return nil, err
		}
		seed = accessSeed{Schema: 1, Installation: o.InstallationID, Profile: o.Profile, Owner: owner}
		for _, target := range []*string{&seed.DatabaseAdminPassword, &seed.DatabasePassword, &seed.MasterPassword, &seed.OperatorPassword, &seed.OIDCSecret} {
			a, err := randomIdentity()
			if err != nil {
				return nil, err
			}
			b, err := randomIdentity()
			if err != nil {
				return nil, err
			}
			*target = a + b
		}
		if err = atomicFile(filepath.Join(o.ControlRoot, "access-seed.json"), jsonBytes(seed), 0600); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}
	return jsonBytes(map[string]string{"credential_receipt": digest(jsonBytes(seed)), "delivery": "PRIVATE_CONTROL_FILE"}), nil
}
func (e *Engine) accessSpec(o Options, seed accessSeed) accessSpec {
	project := "ai-platform-" + e.shortID(o) + "-access"
	networks := map[string]string{}
	subnets := map[string]string{}
	for _, v := range e.networkViews(o) {
		networks[v.Role] = v.Name
		subnets[v.Role] = v.Subnet
	}
	prefix, _ := netip.ParsePrefix(subnets["services"])
	ip := prefix.Addr().As4()
	n := uint32(ip[0])<<24 | uint32(ip[1])<<16 | uint32(ip[2])<<8 | uint32(ip[3])
	n += (uint32(1) << uint(32-prefix.Bits())) - 2
	proxyIP := netip.AddrFrom4([4]byte{byte(n >> 24), byte(n >> 16), byte(n >> 8), byte(n)}).String()
	urls := accessEndpoints(o)
	realm := map[string]any{"realm": "platform", "enabled": true, "sslRequired": "none", "registrationAllowed": false, "resetPasswordAllowed": false, "bruteForceProtected": true, "eventsEnabled": true, "eventsExpiration": 604800, "adminEventsEnabled": true, "adminEventsDetailsEnabled": false,
		"roles":   map[string]any{"realm": []any{map[string]string{"name": "platform-operator"}, map[string]string{"name": "platform-viewer"}, map[string]string{"name": "platform-security-admin"}}},
		"groups":  []any{map[string]any{"name": "platform-operators", "realmRoles": []string{"platform-operator"}}, map[string]any{"name": "platform-viewers", "realmRoles": []string{"platform-viewer"}}, map[string]any{"name": "platform-security-admins", "realmRoles": []string{"platform-security-admin"}}},
		"users":   []any{map[string]any{"username": "platform-admin", "enabled": true, "emailVerified": true, "firstName": "Platform", "lastName": "Administrator", "groups": []string{"/platform-operators", "/platform-security-admins"}, "clientRoles": map[string][]string{"realm-management": {"realm-admin"}}, "credentials": []any{map[string]any{"type": "password", "value": seed.OperatorPassword, "temporary": false}}}},
		"clients": []any{map[string]any{"clientId": "openbao", "enabled": true, "protocol": "openid-connect", "publicClient": false, "secret": seed.OIDCSecret, "standardFlowEnabled": true, "directAccessGrantsEnabled": false, "serviceAccountsEnabled": false, "redirectUris": []string{urls["secret_store"] + "/ui/vault/auth/oidc/oidc/callback", "http://localhost:8250/oidc/callback"}, "webOrigins": []string{urls["secret_store"]}, "protocolMappers": []any{map[string]any{"name": "groups", "protocol": "openid-connect", "protocolMapper": "oidc-group-membership-mapper", "config": map[string]string{"claim.name": "groups", "full.path": "false", "id.token.claim": "true", "access.token.claim": "true", "userinfo.token.claim": "true"}}}}}}
	file := func(value string) accessFile { return accessFile{[]byte(value), 0400} }
	volumes := map[string]accessVolume{
		"db-config":       {Name: project + "-db-config", UID: 999, Files: map[string]accessFile{"admin.password": file(seed.DatabaseAdminPassword + "\n"), "10-keycloak.sql": file("CREATE ROLE keycloak LOGIN PASSWORD '" + seed.DatabasePassword + "';\nCREATE DATABASE keycloak OWNER keycloak;\nREVOKE ALL ON DATABASE keycloak FROM PUBLIC;\n")}},
		"db-data":         {Name: project + "-db-data", UID: 999, Persistent: true},
		"identity-config": {Name: project + "-identity-config", UID: 1000, Files: map[string]accessFile{"platform-realm.json": {jsonBytes(realm), 0400}, "db.password": file(seed.DatabasePassword + "\n"), "master.password": file(seed.MasterPassword + "\n"), "start.sh": file("#!/bin/bash\nset -eu\nread -r KC_DB_PASSWORD < /bootstrap/db.password\nread -r KC_BOOTSTRAP_ADMIN_PASSWORD < /bootstrap/master.password\nexport KC_DB_PASSWORD KC_BOOTSTRAP_ADMIN_PASSWORD\nexec /opt/keycloak/bin/kc.sh start --import-realm\n")}},
		"bao-config":      {Name: project + "-bao-config", UID: 1000, Files: map[string]accessFile{"server.hcl": file(fmt.Sprintf("ui = true\napi_addr = %q\ncluster_addr = \"http://127.0.0.1:8201\"\nstorage \"raft\" {\n path = \"/openbao/data/raft\"\n node_id = \"platform\"\n}\nlistener \"tcp\" {\n address = \"0.0.0.0:8200\"\n tls_disable = true\n}\n", urls["secret_store"]))}},
		"bao-data":        {Name: project + "-bao-data", UID: 1000, Persistent: true}, "bao-audit": {Name: project + "-bao-audit", UID: 1000, Persistent: true},
		"edge-config": {Name: project + "-edge-config", UID: 1000, Files: map[string]accessFile{"Caddyfile": file(fmt.Sprintf("{\n admin off\n auto_https off\n persist_config off\n}\nhttp://:%d {\n reverse_proxy identity:8080\n}\nhttp://:%d {\n reverse_proxy secret-store:8200\n}\n", o.IdentityPort, o.SecretStorePort))}},
	}
	for key, v := range volumes {
		if v.Files == nil {
			v.Files = map[string]accessFile{}
		}
		v.Files[".platform-owner"] = file(seed.Owner)
		volumes[key] = v
	}
	image := func(product string) string { return accessReleases()[product].Platforms[e.Host.Arch].Reference }
	base := func(product, user string, readOnly bool) map[string]any {
		return map[string]any{"image": image(product), "user": user, "read_only": readOnly, "restart": "unless-stopped", "cap_drop": []string{"ALL"}, "security_opt": []string{"no-new-privileges:true"}, "pids_limit": 128, "mem_limit": "512m", "cpus": 1.0, "tmpfs": []string{"/tmp:rw,nosuid,noexec,uid=" + strings.Split(user, ":")[0] + ",mode=0700,size=67108864"}}
	}
	mount := func(source, target string, readonly bool) map[string]any {
		return map[string]any{"type": "volume", "source": source, "target": target, "read_only": readonly}
	}
	db := base("postgres", "999:999", true)
	db["environment"] = map[string]string{"POSTGRES_USER": "platform_admin", "POSTGRES_DB": "platform", "POSTGRES_PASSWORD_FILE": "/docker-entrypoint-initdb.d/admin.password", "PGDATA": "/var/lib/postgresql/data/db"}
	db["volumes"] = []any{mount("db-config", "/docker-entrypoint-initdb.d", true), mount("db-data", "/var/lib/postgresql/data", false)}
	db["networks"] = map[string]any{"data": map[string]any{}}
	db["tmpfs"] = []string{"/tmp:uid=999,mode=0700,size=67108864", "/var/run/postgresql:uid=999,mode=0770,size=8388608"}
	db["healthcheck"] = map[string]any{"test": []string{"CMD", "pg_isready", "-U", "platform_admin", "-d", "platform"}, "interval": "3s", "timeout": "3s", "retries": 40}
	db["shm_size"] = "128m"
	auth := base("keycloak", "1000:1000", false)
	auth["entrypoint"] = []string{"/bin/bash", "/bootstrap/start.sh"}
	auth["environment"] = map[string]string{"KC_DB": "postgres", "KC_DB_URL": "jdbc:postgresql://identity-db:5432/keycloak", "KC_DB_USERNAME": "keycloak", "KC_BOOTSTRAP_ADMIN_USERNAME": "bootstrap-admin", "KC_HOSTNAME": urls["identity"], "KC_HOSTNAME_STRICT": "true", "KC_HTTP_ENABLED": "true", "KC_PROXY_HEADERS": "xforwarded", "KC_PROXY_TRUSTED_ADDRESSES": proxyIP + "/32", "KC_HEALTH_ENABLED": "true", "KC_METRICS_ENABLED": "true", "JAVA_OPTS_KC_HEAP": "-XX:MaxRAMPercentage=65 -XX:InitialRAMPercentage=30"}
	auth["volumes"] = []any{mount("identity-config", "/bootstrap", true), mount("identity-config", "/opt/keycloak/data/import", true)}
	auth["networks"] = map[string]any{"services": map[string]any{}, "data": map[string]any{}}
	auth["depends_on"] = map[string]any{"identity-db": map[string]string{"condition": "service_healthy"}}
	auth["mem_limit"] = "1536m"
	auth["pids_limit"] = 512
	auth["cpus"] = 2.0
	bao := base("openbao", "1000:1000", true)
	bao["entrypoint"] = []string{"bao"}
	bao["command"] = []string{"server", "-config=/openbao/config/server.hcl"}
	bao["environment"] = map[string]string{"GOMEMLIMIT": "384MiB"}
	bao["volumes"] = []any{mount("bao-config", "/openbao/config", true), mount("bao-data", "/openbao/data", false), mount("bao-audit", "/openbao/audit", false)}
	bao["networks"] = map[string]any{"services": map[string]any{}}
	bao["extra_hosts"] = map[string]string{"auth.localhost": proxyIP}
	edge := base("caddy", "1000:1000", true)
	edge["command"] = []string{"caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"}
	edge["volumes"] = []any{mount("edge-config", "/etc/caddy", true)}
	edge["networks"] = map[string]any{"edge": map[string]any{}, "services": map[string]any{"ipv4_address": proxyIP}}
	edge["ports"] = []any{map[string]any{"target": o.IdentityPort, "published": fmt.Sprint(o.IdentityPort), "host_ip": "127.0.0.1", "protocol": "tcp"}, map[string]any{"target": o.SecretStorePort, "published": fmt.Sprint(o.SecretStorePort), "host_ip": "127.0.0.1", "protocol": "tcp"}}
	edge["tmpfs"] = []string{"/tmp:uid=1000,mode=0700,size=8388608", "/data:uid=1000,mode=0700,size=8388608", "/config:uid=1000,mode=0700,size=8388608"}
	edge["mem_limit"] = "128m"
	edge["cpus"] = 0.5
	services := map[string]map[string]any{"identity-db": db, "identity": auth, "secret-store": bao, "edge": edge}
	for key, service := range services {
		service["container_name"] = project + "-" + key
		service["labels"] = map[string]string{"ai.platform.installation": o.InstallationID, "ai.platform.profile": o.Profile, "ai.platform.owner": seed.Owner, "ai.platform.component": "access", "ai.platform.service": key}
	}
	volumeDefs := map[string]any{}
	for key, v := range volumes {
		volumeDefs[key] = map[string]any{"name": v.Name, "external": true}
	}
	networkDefs := map[string]any{}
	for _, role := range []string{"edge", "services", "data"} {
		networkDefs[role] = map[string]any{"name": networks[role], "external": true}
	}
	digestSpec := digest(jsonBytes(map[string]any{"services": services, "volumes": volumes, "networks": networkDefs}))
	for _, service := range services {
		service["labels"].(map[string]string)["ai.platform.spec"] = digestSpec
	}
	compose := jsonBytes(map[string]any{"name": project, "services": services, "volumes": volumeDefs, "networks": networkDefs})
	return accessSpec{project, seed.Owner, digestSpec, proxyIP, volumes, services, compose}
}
