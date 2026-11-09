// Package blueprints carries native tool configuration, independent of SDLC.
// Middleware installation and observability policy remain separate sources.
package blueprints

import (
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"io/fs"
	"sort"
)

//go:embed middleware observability hub
var Files embed.FS

func Digest() string {
	value, _ := DigestOf(".")
	return value
}

// DigestOf keeps unrelated tools from changing an installed policy's identity.
// Paths remain part of the hash, sorted exactly as in the original tree walk.
func DigestOf(roots ...string) (string, error) {
	files := map[string][]byte{}
	for _, root := range roots {
		if err := fs.WalkDir(Files, root, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() {
				return nil
			}
			data, err := Files.ReadFile(path)
			if err == nil {
				files[path] = data
			}
			return err
		}); err != nil {
			return "", err
		}
	}
	names := []string{}
	for name := range files {
		names = append(names, name)
	}
	sort.Strings(names)
	h := sha256.New()
	for _, path := range names {
		h.Write([]byte(path + "\n"))
		h.Write(files[path])
		h.Write([]byte("\n"))
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
