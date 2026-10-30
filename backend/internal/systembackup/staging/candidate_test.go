package staging

import (
	"context"
	"errors"
	"io"
	"os"
	"testing"
)

func TestUnpublishedCandidatePreservesOldFilesAndCleansOwnedPartial(t *testing.T) {
	root, e := os.OpenRoot(t.TempDir())
	if e != nil {
		t.Fatal(e)
	}
	defer root.Close()
	r, e := WriteUnpublishedFile(context.Background(), root, "envelope.json", func(w io.Writer) error { _, e := io.WriteString(w, `{"public":"metadata"}`); return e })
	if e != nil || r.Size == 0 {
		t.Fatal(e)
	}
	if _, e = WriteUnpublishedFile(context.Background(), root, "envelope.json", func(w io.Writer) error { _, e := io.WriteString(w, "replacement"); return e }); e == nil {
		t.Fatal("overwritten candidate")
	}
	raw, _ := root.ReadFile("envelope.json")
	if string(raw) != `{"public":"metadata"}` {
		t.Fatal("old bytes changed")
	}
	if _, e = WriteUnpublishedFile(context.Background(), root, "failed.json", func(w io.Writer) error { io.WriteString(w, "partial"); return errors.New("source failed") }); e == nil {
		t.Fatal("partial accepted")
	}
	for _, name := range []string{"failed.json", ".failed.json.partial"} {
		if _, e = root.Stat(name); !os.IsNotExist(e) {
			t.Fatal("owned failure residue")
		}
	}
}
