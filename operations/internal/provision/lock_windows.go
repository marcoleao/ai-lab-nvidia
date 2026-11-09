//go:build windows

package provision

import (
	"os"
	"syscall"
)

func regularSingleLink(f *os.File) error {
	var info syscall.ByHandleFileInformation
	if err := syscall.GetFileInformationByHandle(syscall.Handle(f.Fd()), &info); err != nil {
		return err
	}
	stat, err := f.Stat()
	if err != nil {
		return err
	}
	if !stat.Mode().IsRegular() || info.NumberOfLinks != 1 {
		return codedError("PLATFORM_AUDIT_LINK_REJECTED")
	}
	return nil
}

// Provisioning is not executed natively on Windows. This lock supports isolated
// provider tests; Windows production coordination remains in the PS bootstrap.
func lockFile(path string) (func(), error) {
	if err := plain(path); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_RDWR, 0600)
	if err != nil {
		return nil, codedError("PLATFORM_PROVISION_BUSY")
	}
	return func() { f.Close(); os.Remove(path) }, nil
}

func readOperationLock(path string) (func(), error) {
	if err := plain(path); err != nil {
		return nil, err
	}
	if _, err := os.Stat(path); err == nil {
		return nil, codedError("PLATFORM_PROVISION_BUSY")
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	return func() {}, nil
}
