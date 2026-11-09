package provision

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
)

type restoredError struct {
	cause error
	after string
}

func (e *restoredError) Error() string { return e.cause.Error() }
func (e *restoredError) Unwrap() error { return e.cause }

type fileSnapshot struct {
	exists bool
	data   []byte
}
type configIntent struct {
	Before  map[string]string `json:"before"`
	Desired map[string]string `json:"desired"`
}

// Configuration CAS/journal. The journal contains hashes, never backups of host
// data. Ordinary compensation uses in-memory bytes and confirms restored files.
func (e *Engine) configureRuntime(ctx context.Context, o Options, files map[string][]byte, start func() error, restoreService func() error) error {
	manifestPath := filepath.Join(o.DataRoot, "runtime.resources.json")
	intentPath := filepath.Join(o.DataRoot, "runtime.intent.json")
	for _, path := range []string{manifestPath, intentPath} {
		if err := plain(path); err != nil {
			return err
		}
	}
	known := map[string]string{}
	if data, err := os.ReadFile(manifestPath); err == nil {
		if json.Unmarshal(data, &known) != nil {
			return codedError("PLATFORM_RUNTIME_MANIFEST_INVALID")
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	intent := configIntent{Before: map[string]string{}, Desired: map[string]string{}}
	snapshots := map[string]fileSnapshot{}
	paths := []string{}
	for path, data := range files {
		if err := plain(path); err != nil {
			return err
		}
		paths = append(paths, path)
		intent.Desired[path] = digest(data)
		current, err := os.ReadFile(path)
		if err == nil {
			snapshots[path] = fileSnapshot{true, current}
			intent.Before[path] = digest(current)
		} else if os.IsNotExist(err) {
			snapshots[path] = fileSnapshot{}
			intent.Before[path] = "ABSENT"
		} else {
			return err
		}
	}
	sort.Strings(paths)
	pending := configIntent{}
	if data, err := os.ReadFile(intentPath); err == nil {
		if json.Unmarshal(data, &pending) != nil || string(jsonBytes(pending.Desired)) != string(jsonBytes(intent.Desired)) {
			return codedError("PLATFORM_RUNTIME_PENDING_CONFIGURATION")
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	for _, path := range paths {
		current := intent.Before[path]
		if current == "ABSENT" {
			continue
		}
		allowed := known[path]
		if current != allowed && (pending.Desired == nil || current != pending.Desired[path] && current != pending.Before[path]) {
			return codedError("PLATFORM_RUNTIME_FOREIGN_CONFIGURATION")
		}
	}
	if err := atomicFile(intentPath, jsonBytes(intent), 0600); err != nil {
		return err
	}
	applyErr := func() error {
		for _, path := range paths {
			if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
				return err
			}
			if err := atomicFile(path, files[path], 0644); err != nil {
				return err
			}
		}
		return start()
	}()
	if applyErr == nil {
		if err := atomicFile(manifestPath, jsonBytes(intent.Desired), 0600); err != nil {
			return err
		}
		return os.Remove(intentPath)
	}
	audit := recorder{o.ControlRoot, o, e.Host, e.Now}
	before := digest(jsonBytes(intent.Desired))
	after := digest(jsonBytes(intent.Before))
	request := Step{"PLATFORM_RUNTIME_CONFIGURATION_RESTORED", "ACCEPTED", "REQUESTED", before, "NOT_OBSERVED", "COMPENSATION_REQUESTED"}
	if err := audit.append(request); err != nil {
		return err
	}
	rollbackErr := func() error {
		for _, path := range paths {
			current, err := os.ReadFile(path)
			if err != nil && !os.IsNotExist(err) {
				return err
			}
			if err == nil && digest(current) != intent.Desired[path] && digest(current) != intent.Before[path] {
				return codedError("PLATFORM_RUNTIME_ROLLBACK_CONFLICT")
			}
			old := snapshots[path]
			if old.exists {
				if err = atomicFile(path, old.data, 0644); err != nil {
					return err
				}
			} else if err = os.Remove(path); err != nil && !os.IsNotExist(err) {
				return err
			}
		}
		if err := restoreService(); err != nil {
			return err
		}
		for _, path := range paths {
			data, err := os.ReadFile(path)
			old := snapshots[path]
			if old.exists && (err != nil || string(data) != string(old.data)) || !old.exists && !os.IsNotExist(err) {
				return codedError("PLATFORM_RUNTIME_ROLLBACK_UNCONFIRMED")
			}
		}
		return os.Remove(intentPath)
	}()
	if rollbackErr != nil {
		request.Outcome, request.Phase, request.After, request.Reason = "UNKNOWN", "OBSERVED", "NOT_CONFIRMED", code(rollbackErr)
		_ = audit.append(request)
		return rollbackErr
	}
	request.Outcome, request.Phase, request.After, request.Reason = "SUCCEEDED", "COMPLETED", after, "COMPENSATION_VERIFIED"
	if err := audit.append(request); err != nil {
		return err
	}
	return &restoredError{cause: applyErr}
}
func knownRestored(err error) bool { var restored *restoredError; return errors.As(err, &restored) }
func restoredFingerprint(err error, previous string) string {
	var restored *restoredError
	if errors.As(err, &restored) && restored.after != "" {
		return restored.after
	}
	return previous
}
