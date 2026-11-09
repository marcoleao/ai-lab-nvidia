package main

import (
	"os"

	"ai-platform/operations/internal/platform"
	"ai-platform/operations/internal/provision"
)

func main() {
	if len(os.Args) > 1 && provision.IsOperation(os.Args[1]) {
		os.Exit(provision.RunOperationCLI(os.Args[1], os.Args[2:], os.Stdout, os.Stderr))
	}
	if len(os.Args) > 1 && os.Args[1] == "setup" {
		os.Exit(provision.RunCLI(os.Args[2:], os.Stdout, os.Stderr))
	}
	os.Exit(platform.Run(os.Args[1:], os.Stdout, os.Stderr))
}
