package provision

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

func (e *Engine) prepareArtifacts(ctx context.Context, o Options) ([]byte, error) {
	target := e.Host.OS + "-" + e.Host.Arch
	keys := []string{"docker-" + target, "compose-" + target}
	if e.Host.OS == "darwin" {
		keys = append(keys, "colima-"+target, "lima-"+target)
	}
	desired := map[string]string{}
	for _, key := range keys {
		desired[key] = e.assets()[key].SHA256
	}
	manifest := jsonBytes(desired)
	tools := filepath.Join(o.DataRoot, "tools")
	receipt := filepath.Join(tools, "assets.json")
	if err := plain(tools); err != nil {
		return nil, err
	}
	if data, err := os.ReadFile(receipt); err == nil {
		if string(data) != string(manifest) {
			return nil, codedError("PLATFORM_RUNTIME_TOOLS_VERSION_CONFLICT")
		}
		if err = verifyToolFiles(tools); err != nil {
			return nil, err
		}
		if err = e.ensureCompose(o); err != nil {
			return nil, err
		}
		return manifest, nil
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	if _, err := os.Stat(tools); err == nil {
		return nil, codedError("PLATFORM_RUNTIME_FOREIGN_TOOLS")
	}
	stage, err := os.MkdirTemp(o.DataRoot, ".tools-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(stage)
	if err = os.Mkdir(filepath.Join(stage, "bin"), 0755); err != nil {
		return nil, err
	}
	for _, key := range keys {
		a := e.assets()[key]
		file, err := e.asset(ctx, key, filepath.Join(o.ControlRoot, "cache"))
		if err != nil {
			return nil, err
		}
		switch a.Kind {
		case "docker", "lima":
			if err = extractAsset(file, stage, a.Kind); err != nil {
				return nil, err
			}
		case "binary":
			name := "colima"
			if strings.HasPrefix(key, "compose-") {
				name = "docker-compose"
			}
			data, err := os.ReadFile(file)
			if err != nil {
				return nil, err
			}
			if err = os.WriteFile(filepath.Join(stage, "bin", name), data, 0755); err != nil {
				return nil, err
			}
		}
	}
	if err = os.WriteFile(filepath.Join(stage, "assets.json"), manifest, 0600); err != nil {
		return nil, err
	}
	inventory := map[string]string{}
	err = filepath.WalkDir(stage, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(stage, path)
		inventory[rel] = digest(data)
		return nil
	})
	if err != nil {
		return nil, err
	}
	if err = os.WriteFile(filepath.Join(stage, "content.json"), jsonBytes(inventory), 0600); err != nil {
		return nil, err
	}
	if err = os.Rename(stage, tools); err != nil {
		return nil, err
	}
	// Docker discovers Compose under a private DOCKER_CONFIG, never ~/.docker.
	if err = e.ensureCompose(o); err != nil {
		return nil, err
	}
	return manifest, nil
}
func (e *Engine) ensureCompose(o Options) error {
	pluginDir := filepath.Join(o.DataRoot, "client", "cli-plugins")
	if err := plain(pluginDir); err != nil {
		return err
	}
	if err := os.MkdirAll(pluginDir, 0700); err != nil {
		return err
	}
	target := filepath.Join(pluginDir, "docker-compose")
	if err := plain(target); err != nil {
		return err
	}
	compose, err := os.ReadFile(filepath.Join(o.DataRoot, "tools", "bin", "docker-compose"))
	if err != nil {
		return err
	}
	if old, err := os.ReadFile(target); err == nil {
		if digest(old) != digest(compose) {
			return codedError("PLATFORM_COMPOSE_PLUGIN_CHANGED")
		}
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	return atomicFile(target, compose, 0755)
}
func verifyToolFiles(root string) error {
	if err := plain(filepath.Join(root, "content.json")); err != nil {
		return err
	}
	data, err := os.ReadFile(filepath.Join(root, "content.json"))
	if err != nil {
		return err
	}
	var inventory map[string]string
	if json.Unmarshal(data, &inventory) != nil || len(inventory) == 0 {
		return codedError("PLATFORM_RUNTIME_TOOLS_CORRUPT")
	}
	for relative, expected := range inventory {
		if filepath.IsAbs(relative) || filepath.Clean(relative) != relative || strings.HasPrefix(relative, "..") || !hashPattern.MatchString(expected) {
			return codedError("PLATFORM_RUNTIME_TOOLS_CORRUPT")
		}
		path := filepath.Join(root, relative)
		if err = plain(path); err != nil {
			return err
		}
		data, err := os.ReadFile(path)
		if err != nil || digest(data) != expected {
			return codedError("PLATFORM_RUNTIME_TOOLS_CORRUPT")
		}
	}
	return nil
}
