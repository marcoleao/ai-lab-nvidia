//go:build !windows

package provision

import (
	"os"
	"syscall"
)

func regularSingleLink(f *os.File) error {
	info, err := f.Stat()
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return codedError("PLATFORM_AUDIT_FILE_NOT_REGULAR")
	}
	if raw, ok := info.Sys().(*syscall.Stat_t); !ok || raw.Nlink != 1 {
		return codedError("PLATFORM_AUDIT_LINK_REJECTED")
	}
	return nil
}

func lockFile(path string) (func(), error) {
	if err := plain(path); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	if err = syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		f.Close()
		return nil, codedError("PLATFORM_PROVISION_BUSY")
	}
	return func() { syscall.Flock(int(f.Fd()), syscall.LOCK_UN); f.Close() }, nil
}

func readOperationLock(path string) (func(), error) {
	if err := plain(path); err != nil {
		return nil, err
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	if err = regularSingleLink(f); err != nil {
		f.Close()
		return nil, err
	}
	if err = syscall.Flock(int(f.Fd()), syscall.LOCK_SH|syscall.LOCK_NB); err != nil {
		f.Close()
		return nil, codedError("PLATFORM_PROVISION_BUSY")
	}
	return func() { syscall.Flock(int(f.Fd()), syscall.LOCK_UN); f.Close() }, nil
}
