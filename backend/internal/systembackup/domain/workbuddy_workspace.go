package domain

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"strconv"
)

// WorkBuddyUIDIdentity matches the schema=1 marker observed at the instance
// root. Obtain it from the authenticated database snapshot, never infer a UID
// from instance ID or read expected values from the marker being verified.
type WorkBuddyUIDIdentity struct {
	Schema     int `json:"schema"`
	InstanceID int `json:"instanceId"`
	UserID     int `json:"userId"`
	UID        int `json:"uid"`
	GID        int `json:"gid"`
}

func WorkBuddyUIDForInstance(s Snapshot, id string) (WorkBuddyUIDIdentity, error) {
	identities, err := WorkBuddyUIDForInstances(s, []string{id})
	if err != nil {
		return WorkBuddyUIDIdentity{}, err
	}
	return identities[0], nil
}

// WorkBuddyUIDForInstances validates the original snapshot once, then returns
// requested LIVE identities in input order. Historical reservations remain in
// the snapshot but are never attached to an active workspace. No SQL or IO.
func WorkBuddyUIDForInstances(s Snapshot, ids []string) ([]WorkBuddyUIDIdentity, error) {
	if len(ids) == 0 || len(ids) > 9998 {
		return nil, ErrData
	}
	if e := validateSnapshot(s); e != nil {
		return nil, e
	}
	if e := validateWorkBuddyUID(s, WorkBuddyUIDSchema()); e != nil {
		return nil, e
	}
	if e := validateRelationshipsWithHistory(s, true); e != nil {
		return nil, e
	}
	instances, _ := workBuddyTable(s, "instances")
	live := map[string]bool{}
	for _, r := range instances.Rows {
		if r["type"].String() == "workbuddy" {
			live[r["id"].String()] = true
		}
	}
	t, _ := workBuddyTable(s, workBuddyIdentities)
	byID := map[string]WorkBuddyUIDIdentity{}
	for _, r := range t.Rows {
		id := r["instance_id"].String()
		if live[id] {
			instance, _ := strconv.Atoi(id)
			user, _ := strconv.Atoi(r["user_id"].String())
			uid, _ := strconv.Atoi(r["linux_uid"].String())
			byID[id] = WorkBuddyUIDIdentity{Schema: 1, InstanceID: instance, UserID: user, UID: uid, GID: uid}
		}
	}
	out := make([]WorkBuddyUIDIdentity, 0, len(ids))
	seen := map[string]bool{}
	for _, id := range ids {
		identity, ok := byID[id]
		if !ok || seen[id] {
			return nil, ErrData
		}
		seen[id] = true
		out = append(out, identity)
	}
	return out, nil
}

// VerifyWorkBuddyUIDWorkspace reads only the registered INSTANCE root, which
// must include both .workbuddy-identity.json and home/. No ownership is repaired
// silently. Whole-tree metadata preservation remains the workspace transport's
// responsibility. The caller keeps its writer fence through this check.
func VerifyWorkBuddyUIDWorkspace(root *os.Root, want WorkBuddyUIDIdentity) error {
	if root == nil || want.Schema != 1 || want.InstanceID < 1 || want.InstanceID > 2147483647 || want.UserID < 1 || want.UserID > 2147483647 || want.UID < 10000 || want.UID > 65533 || want.GID != want.UID {
		return ErrData
	}
	info, e := root.Lstat(".workbuddy-identity.json")
	if e != nil || !info.Mode().IsRegular() || info.Size() > 4096 {
		return ErrData
	}
	f, e := root.Open(".workbuddy-identity.json")
	if e != nil {
		return ErrData
	}
	defer f.Close()
	actual, e := f.Stat()
	if e != nil || !os.SameFile(info, actual) {
		return ErrData
	}
	raw, e := io.ReadAll(io.LimitReader(f, 4097))
	if e != nil || len(raw) > 4096 || strictJSON(raw) != nil {
		return ErrData
	}
	defer clear(raw)
	var got WorkBuddyUIDIdentity
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&got) != nil || got != want {
		return ErrData
	}
	home, e := root.Lstat("home")
	if e != nil || !home.IsDir() || home.Mode()&os.ModeSymlink != 0 {
		return ErrData
	}
	return verifyWorkBuddyHomeOwner(home, want)
}
