// Standalone local validation utility; not linked into the application.
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

func must(err error) {
	if err != nil {
		panic(err)
	}
}

func selected(path string) bool {
	parts := strings.Split(path, "/")
	if len(parts) < 2 || parts[0] != "backend" && parts[0] != "contracts" && parts[0] != "scripts" && parts[0] != "docs" {
		return false
	}
	for _, p := range parts {
		switch p {
		case ".git", "node_modules", "vendor", "uploads", "cache", "dist", "build", "__pycache__":
			return false
		}
	}
	if parts[0] == "docs" {
		allowed := len(parts) == 2 && strings.HasSuffix(path, ".sql")
		for _, p := range []string{"docs/system-backup-restore-schema-inventory.json", "docs/evidence/a-config-canonical-request-vectors-20261014.json", "docs/evidence/a-config-canonical-maintenance-digest-vectors-20261015.json", "docs/evidence/system-backup-provider-issuer-d-issuer-d7f0a14ec84d78927620d25f.registry.json"} {
			allowed = allowed || path == p
		}
		if !allowed {
			return false
		}
	}
	switch filepath.Ext(path) {
	case ".go", ".mod", ".sum", ".sql", ".json", ".md", ".txt", ".sh", ".ps1", ".mjs", ".yaml", ".yml", ".tmpl", ".html", ".pem":
		return true
	}
	return false
}

func main() {
	if len(os.Args) != 3 {
		panic("source root and manifest required")
	}
	root, err := filepath.Abs(os.Args[1])
	must(err)
	raw, err := os.ReadFile(os.Args[2])
	must(err)
	var manifest struct {
		Source string `json:"source_sha256"`
		Files  []struct {
			Path string `json:"path"`
			Size int64  `json:"size"`
			SHA  string `json:"sha256"`
		} `json:"files"`
	}
	must(json.Unmarshal(raw, &manifest))
	seen := map[string]bool{}
	digest := sha256.New()
	for _, pin := range manifest.Files {
		if !selected(pin.Path) || seen[pin.Path] || filepath.IsAbs(pin.Path) || filepath.ToSlash(filepath.Clean(pin.Path)) != pin.Path || strings.HasPrefix(pin.Path, "../") {
			panic("invalid or duplicate source pin")
		}
		seen[pin.Path] = true
		path := filepath.Join(root, filepath.FromSlash(pin.Path))
		for cursor := path; cursor != root; cursor = filepath.Dir(cursor) {
			info, err := os.Lstat(cursor)
			must(err)
			if info.Mode()&os.ModeSymlink != 0 {
				panic("redirected source pin")
			}
		}
		body, err := os.ReadFile(path)
		must(err)
		got := sha256.Sum256(body)
		if int64(len(body)) != pin.Size || hex.EncodeToString(got[:]) != pin.SHA {
			panic("source content changed: " + pin.Path)
		}
		fmt.Fprintf(digest, "%s\x00%s\x00%d\n", pin.Path, pin.SHA, pin.Size)
	}
	if hex.EncodeToString(digest.Sum(nil)) != manifest.Source {
		panic("manifest digest differs")
	}
	count := 0
	must(filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		if selected(rel) {
			if !seen[rel] {
				return fmt.Errorf("unexpected source input: %s", rel)
			}
			count++
		}
		return nil
	}))
	if count != len(seen) {
		panic("source file set differs")
	}
	fmt.Printf("LOCAL_PASS ldap-native-source-postcheck=yes files=%d source_sha256=%s\n", count, manifest.Source)
}
