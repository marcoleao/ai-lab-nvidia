package blueprints

import (
	"bytes"
	"testing"
)

func TestCanonicalBlueprintLineEndings(t *testing.T) {
	lf := []byte("{\n  \"name\": \"foundation\"\n}\n")
	crlf := bytes.ReplaceAll(lf, []byte("\n"), []byte("\r\n"))
	if !bytes.Equal(canonicalText(lf), canonicalText(crlf)) {
		t.Fatal("blueprint identity depends on checkout line endings")
	}
}
