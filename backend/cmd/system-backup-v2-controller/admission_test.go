package main

import (
	"strings"
	"testing"
)

func TestVersionedControlDoesNotInheritLegacyActivation(t *testing.T) {
	for _, protocol := range []string{"", "legacy", "metadata", "false"} {
		env := map[string]string{"SYSTEM_BACKUP_V2_CONTROL_PLANE_ENABLED": "true", "SYSTEM_BACKUP_EXECUTION_PROTOCOL": protocol}
		if versionedControlAdmission(func(k string) string { return env[k] }) == nil {
			t.Fatal("second controller mode admitted", protocol)
		}
	}
	env := map[string]string{
		"SYSTEM_BACKUP_V2_CONTROL_PLANE_ENABLED": "true",
		"SYSTEM_BACKUP_EXECUTION_PROTOCOL":       "public-v1",
		"SYSTEM_BACKUP_PUBLIC_CONFIG_FILE":       "/mounted/public.json",
		"SYSTEM_BACKUP_PUBLIC_CONFIG_SHA256":     strings.Repeat("a", 64),
		"SYSTEM_BACKUP_FORWARD_GRANT_SHA256":     strings.Repeat("b", 64),
		"SYSTEM_BACKUP_RECOVERY_GRANT_SHA256":    strings.Repeat("c", 64),
		"SYSTEM_BACKUP_ENABLED":                  "false",
	}
	if err := versionedControlAdmission(func(k string) string { return env[k] }); err != nil {
		t.Fatal(err)
	}
	delete(env, "SYSTEM_BACKUP_RECOVERY_GRANT_SHA256")
	if versionedControlAdmission(func(k string) string { return env[k] }) == nil {
		t.Fatal("missing independent recovery pin admitted")
	}
}
