package provision

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func itoa(i int) string { return fmt.Sprint(i) }
func plain(path string) error {
	if !filepath.IsAbs(path) || filepath.Clean(path) != path {
		return codedError("PLATFORM_PROVISION_PATH_INVALID")
	}
	for p := path; ; p = filepath.Dir(p) {
		s, err := os.Lstat(p)
		if err == nil && s.Mode()&os.ModeSymlink != 0 {
			return codedError("PLATFORM_PROVISION_SYMLINK_REJECTED")
		}
		if err != nil && !os.IsNotExist(err) {
			return err
		}
		if filepath.Dir(p) == p {
			break
		}
	}
	return nil
}
func atomicFile(path string, data []byte, mode os.FileMode) error {
	if err := plain(path); err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".write-*")
	if err != nil {
		return err
	}
	name := f.Name()
	defer os.Remove(name)
	if err = f.Chmod(mode); err == nil {
		_, err = f.Write(data)
	}
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(name, path)
}
func ownedDirectory(path, identity string) error {
	if err := plain(path); err != nil {
		return err
	}
	marker := filepath.Join(path, ".platform-owner")
	if _, err := os.Stat(path); err == nil {
		if err = plain(marker); err != nil {
			return err
		}
		data, err := os.ReadFile(marker)
		if err != nil || string(data) != identity {
			return codedError("PLATFORM_PROVISION_OWNERSHIP_CONFLICT")
		}
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	parent := filepath.Dir(path)
	if err := os.MkdirAll(parent, 0700); err != nil {
		return err
	}
	temp, err := os.MkdirTemp(parent, ".initialize-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(temp)
	if err = os.WriteFile(filepath.Join(temp, ".platform-owner"), []byte(identity), 0600); err != nil {
		return err
	}
	return os.Rename(temp, path)
}
func overlap(a, b string) bool {
	return a == b || strings.HasPrefix(a, b+string(os.PathSeparator)) || strings.HasPrefix(b, a+string(os.PathSeparator))
}
func writeOwned(path string, data []byte) error {
	if err := plain(path); err != nil {
		return err
	}
	previous, err := os.ReadFile(path)
	if err == nil && string(previous) == string(data) {
		return nil
	}
	if err == nil {
		return codedError("PLATFORM_PROVISION_CONFIGURATION_CONFLICT")
	}
	if !os.IsNotExist(err) {
		return err
	}
	if err = os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	return atomicFile(path, data, 0600)
}
