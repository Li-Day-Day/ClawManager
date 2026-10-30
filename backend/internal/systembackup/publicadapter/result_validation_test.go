package publicadapter

import (
	"context"
	"encoding/json"
	"testing"
)

func TestPartResultValidationBindsOriginalReport(t *testing.T) {
	for _, fault := range []string{"", "part", "category", "unknown", "duplicate", "missing", "job", "attempt", "inventory", "oversize"} {
		t.Run(fault, func(t *testing.T) {
			f, _, plan := setup(t)
			if _, err := f.ObserveJob(context.Background(), f.in.Authority, f.binding); err != nil {
				t.Fatal(err)
			}
			raw := append([]byte(nil), f.raw...)
			var body map[string]json.RawMessage
			if err := json.Unmarshal(raw, &body); err != nil {
				t.Fatal(err)
			}
			switch fault {
			case "part":
				body["part"] = json.RawMessage(`"other"`)
			case "category":
				body["category"] = json.RawMessage(`"other"`)
			case "unknown":
				body["secret"] = json.RawMessage(`"hidden"`)
			case "missing":
				delete(body, "statistics")
			case "job":
				f.binding.UID = "33333333-3333-4333-8333-333333333333"
			case "attempt", "inventory":
				var cp Checkpoint
				json.Unmarshal(body["checkpoint"], &cp)
				if fault == "attempt" {
					cp.AttemptNo++
				} else {
					cp.InventorySHA256 = "wrong"
				}
				body["checkpoint"], _ = json.Marshal(cp)
			}
			raw, _ = json.Marshal(body)
			if fault == "duplicate" {
				raw = append([]byte(`{"part":"users",`), raw[1:]...)
			}
			if fault == "oversize" {
				raw = make([]byte, (1<<20)+1)
			}
			if err := ValidatePartResult(f.in, plan, f.binding, raw); (err == nil) != (fault == "") {
				t.Fatalf("fault=%s: %v", fault, err)
			}
		})
	}
}
