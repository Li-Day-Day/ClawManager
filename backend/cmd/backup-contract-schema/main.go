package main

import (
	"fmt"
	"os"

	"clawreef/internal/systembackup/recovery"
)

func main() {
	b, e := recovery.SchemaBytes()
	if e != nil {
		os.Exit(1)
	}
	fmt.Println(string(b))
}
