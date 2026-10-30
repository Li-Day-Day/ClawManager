package main
import("go/parser";"go/token";"encoding/json";"os")
func main(){n:=0;for _,p:=range os.Args[1:]{if p=="--"{continue};if _,e:=parser.ParseFile(token.NewFileSet(),p,nil,parser.AllErrors);e!=nil{panic(e)};n++};json.NewEncoder(os.Stdout).Encode(map[string]any{"syntax":"pass","files":n,"typecheck":"not performed; execution package dependency missing"})}
