package domain

import "testing"

func TestWorkBuddyBatchIdentityUsesValidatedLiveRowsOnly(t *testing.T) {
	for _, ids := range [][]string{nil, {"7", "7"}, {"7", "987"}, {"missing"}, {"07"}} {
		s, _, _ := observedWorkBuddyFixture(true)
		before, _ := Digest(s)
		if got, err := WorkBuddyUIDForInstances(s, ids); err == nil || got != nil {
			t.Fatal("missing/duplicate/retired identity returned partial result")
		}
		after, _ := Digest(s)
		if before != after {
			t.Fatal("source snapshot changed")
		}
	}
	s, _, _ := observedWorkBuddyFixture(true)
	got, err := WorkBuddyUIDForInstances(s, []string{"7"})
	if err != nil || len(got) != 1 || got[0].UID != 21000 {
		t.Fatal("live identity unavailable", err)
	}
	single, err := WorkBuddyUIDForInstance(s, "7")
	if err != nil || single != got[0] {
		t.Fatal("scalar API compatibility lost")
	}
	s.Tables[len(s.Tables)-1].Rows[0]["next_uid"] = Text("21000")
	if got, err := WorkBuddyUIDForInstances(s, []string{"7"}); err == nil || got != nil {
		t.Fatal("invalid allocator accepted")
	}
}

func TestWorkBuddyBatchIdentityPreservesRequestedOrder(t *testing.T) {
	s, _, _ := observedWorkBuddyFixture(true)
	row := cloneRow(s.Tables[2].Rows[0])
	row["id"] = Text("8")
	s.Tables[2].Rows = append(s.Tables[2].Rows, row)
	identity := cloneRow(s.Tables[len(s.Tables)-2].Rows[0])
	identity["instance_id"], identity["linux_uid"] = Text("8"), Text("22000")
	s.Tables[len(s.Tables)-2].Rows = append(s.Tables[len(s.Tables)-2].Rows, identity)
	s.Tables[len(s.Tables)-1].Rows[0]["next_uid"] = Text("30000")
	got, err := WorkBuddyUIDForInstances(s, []string{"8", "7"})
	if err != nil || len(got) != 2 || got[0].InstanceID != 8 || got[0].UID != 22000 || got[1].InstanceID != 7 {
		t.Fatal("batch order lost", err)
	}
}
