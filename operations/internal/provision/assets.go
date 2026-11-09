package provision

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
)

//go:embed assets.json security-update.py network-images.json access-images.json observability-images.json middleware-images.json gitlab-images.json
var sources embed.FS

type Asset struct {
	URL     string `json:"url"`
	SHA256  string `json:"sha256"`
	Kind    string `json:"kind"`
	Version string `json:"version"`
}
type Downloader interface {
	Fetch(context.Context, Asset, string) error
}
type httpDownloader struct{}

func assets() map[string]Asset {
	data, _ := sources.ReadFile("assets.json")
	var result map[string]Asset
	_ = json.Unmarshal(data, &result)
	return result
}
func (e *Engine) assets() map[string]Asset {
	if e.assetSet != nil {
		return e.assetSet
	}
	return assets()
}
func (httpDownloader) Fetch(ctx context.Context, a Asset, destination string) error {
	u, err := url.Parse(a.URL)
	if err != nil || u.Scheme != "https" || u.User != nil || u.RawQuery != "" || !hashPattern.MatchString(a.SHA256) {
		return codedError("PLATFORM_ASSET_INVALID")
	}
	req, err := http.NewRequestWithContext(ctx, "GET", a.URL, nil)
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: 15 * time.Minute, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) > 8 || req.URL.Scheme != "https" || req.URL.User != nil {
			return codedError("PLATFORM_ASSET_REDIRECT_REJECTED")
		}
		return nil
	}}
	response, err := client.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return codedError("PLATFORM_ASSET_DOWNLOAD_FAILED")
	}
	f, err := os.CreateTemp(filepath.Dir(destination), ".download-*")
	if err != nil {
		return err
	}
	temporary := f.Name()
	defer os.Remove(temporary)
	size, err := io.Copy(f, io.LimitReader(response.Body, 256<<20))
	if err == nil && size >= 256<<20 {
		err = codedError("PLATFORM_ASSET_TOO_LARGE")
	}
	if err == nil {
		err = f.Sync()
	}
	_ = f.Close()
	if err != nil {
		return err
	}
	data, err := os.ReadFile(temporary)
	if err != nil {
		return err
	}
	if digest(data) != a.SHA256 {
		return codedError("PLATFORM_ASSET_HASH_MISMATCH")
	}
	return os.Rename(temporary, destination)
}
func (e *Engine) asset(ctx context.Context, key, cache string) (string, error) {
	a, ok := e.assets()[key]
	if !ok {
		return "", codedError("PLATFORM_ASSET_UNKNOWN")
	}
	if err := os.MkdirAll(cache, 0700); err != nil {
		return "", err
	}
	file := filepath.Join(cache, a.SHA256)
	if err := plain(file); err != nil {
		return "", err
	}
	if data, err := os.ReadFile(file); err == nil && digest(data) == a.SHA256 {
		return file, nil
	}
	if err := e.Downloader.Fetch(ctx, a, file); err != nil {
		return "", err
	}
	data, err := os.ReadFile(file)
	if err != nil {
		return "", err
	}
	if digest(data) != a.SHA256 {
		return "", codedError("PLATFORM_ASSET_HASH_MISMATCH")
	}
	return file, nil
}

// Extract only vendor runtime files into an owned staging directory. Never create
// archive links or devices; all accepted names are relative and size bounded.
func extractAsset(file, destination, kind string) error {
	f, err := os.Open(file)
	if err != nil {
		return err
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer gz.Close()
	reader := tar.NewReader(gz)
	seen := map[string]bool{}
	var total int64
	dockerFiles := map[string]bool{"docker": true, "dockerd": true, "containerd": true, "ctr": true, "runc": true, "docker-init": true, "docker-proxy": true, "containerd-shim-runc-v2": true}
	for {
		header, err := reader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		name := strings.TrimPrefix(header.Name, "./")
		if name == "" {
			continue
		}
		if path.IsAbs(name) || path.Clean(name) != strings.TrimSuffix(name, "/") || strings.Contains(name, "\\") {
			return codedError("PLATFORM_ASSET_ARCHIVE_PATH_INVALID")
		}
		if header.Typeflag == tar.TypeDir {
			continue
		}
		var relative string
		if kind == "docker" && strings.HasPrefix(name, "docker/") {
			leaf := strings.TrimPrefix(name, "docker/")
			if !dockerFiles[leaf] {
				return codedError("PLATFORM_ASSET_ARCHIVE_PATH_INVALID")
			}
			relative = filepath.Join("bin", leaf)
		} else if kind == "lima" && (name == "bin/limactl" || strings.HasPrefix(name, "share/lima/") || strings.HasPrefix(name, "libexec/lima/")) {
			relative = filepath.FromSlash(name)
		} else {
			continue
		}
		if header.Typeflag != tar.TypeReg || seen[relative] || header.Size < 0 || header.Size > 256<<20 {
			return codedError("PLATFORM_ASSET_ARCHIVE_TYPE_INVALID")
		}
		seen[relative] = true
		total += header.Size
		if total > 768<<20 {
			return codedError("PLATFORM_ASSET_TOO_LARGE")
		}
		target := filepath.Join(destination, relative)
		if err = plain(target); err != nil {
			return err
		}
		if err = os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return err
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0755)
		if err != nil {
			return err
		}
		_, copyErr := io.CopyN(out, reader, header.Size)
		closeErr := out.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	required := filepath.Join("bin", "docker")
	if kind == "lima" {
		required = filepath.Join("bin", "limactl")
	}
	if !seen[required] {
		return fmt.Errorf("%w", codedError("PLATFORM_ASSET_ARCHIVE_INCOMPLETE"))
	}
	return nil
}
