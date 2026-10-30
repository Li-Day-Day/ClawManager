package main

import (
	"encoding/json"
	"go/parser"
	"go/token"
	"os"
)

func main() {
	n := 0
	for _, p := range os.Args[1:] {
		if p == "--" {
			continue
		}
		if _, e := parser.ParseFile(token.NewFileSet(), p, nil, parser.AllErrors); e != nil {
			panic(e)
		}
		n++
	}
	json.NewEncoder(os.Stdout).Encode(map[string]any{"files": n, "syntax": "pass", "worker_typecheck": "not performed: exact dependency unavailable"})
}
