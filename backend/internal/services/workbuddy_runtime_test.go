package services

import (
	"testing"

	"clawreef/internal/models"
)

func TestBuildRuntimeConfigForInstancePreservesLinuxWorkbuddy(t *testing.T) {
	image := "10.130.14.23:5000/workbuddy-linux:2026.8.1"
	instance := &models.Instance{
		Type:           "workbuddy",
		RuntimeVariant: WorkbuddyRuntimeLinux,
		ImageRegistry:  &image,
		MountPath:      "/config",
	}

	config := buildRuntimeConfigForInstance(instance)
	if config.Image != image || config.Port != 3001 || config.MountPath != "/config" {
		t.Fatalf("unexpected Linux Workbuddy config: %#v", config)
	}
	if config.Env["TITLE"] != "Workbuddy" || config.Env["SUBFOLDER"] != "/" {
		t.Fatalf("expected Webtop environment, got %#v", config.Env)
	}
	if !isWebtopRuntimeInstance(instance) || isWindowsWorkbuddyInstance(instance) {
		t.Fatal("Linux Workbuddy runtime classification is incorrect")
	}
}

func TestBuildRuntimeConfigForInstanceKeepsWindowsWorkbuddy(t *testing.T) {
	instance := &models.Instance{Type: "workbuddy", RuntimeVariant: WorkbuddyRuntimeWindows}
	config := buildRuntimeConfigForInstance(instance)
	if config.Port != 8006 || config.MountPath != "/storage" {
		t.Fatalf("unexpected Windows Workbuddy config: %#v", config)
	}
	if !isWindowsWorkbuddyInstance(instance) || isWebtopRuntimeInstance(instance) {
		t.Fatal("Windows Workbuddy runtime classification is incorrect")
	}
}

func TestLegacyWorkbuddyVariantInference(t *testing.T) {
	linuxImage := "registry.example/workbuddy-linux:old"
	linux := &models.Instance{Type: "workbuddy", MountPath: "/config", ImageRegistry: &linuxImage}
	if got := workbuddyRuntimeVariantForInstance(linux); got != WorkbuddyRuntimeLinux {
		t.Fatalf("expected legacy Linux inference, got %q", got)
	}

	windows := &models.Instance{Type: "workbuddy", MountPath: "/storage"}
	if got := workbuddyRuntimeVariantForInstance(windows); got != WorkbuddyRuntimeWindows {
		t.Fatalf("expected Windows inference, got %q", got)
	}
}

func TestLinuxWorkbuddyDoesNotRequireWindowsResources(t *testing.T) {
	req := CreateInstanceRequest{
		Type:           "workbuddy",
		RuntimeVariant: WorkbuddyRuntimeLinux,
		Mode:           InstanceModePro,
		CPUCores:       2,
		MemoryGB:       4,
		DiskGB:         50,
	}
	if err := validateWindowsWorkbuddyRequest(req); err != nil {
		t.Fatalf("Linux Workbuddy request rejected by Windows constraints: %v", err)
	}
}

func TestLinuxWorkbuddyProxyBehavior(t *testing.T) {
	if !usesWebtopRuntime("workbuddy", 3001) || !usesHTTPSUpstream("workbuddy", 3001) {
		t.Fatal("Linux Workbuddy must retain Webtop HTTPS proxy behavior")
	}
	if usesWebtopRuntime("workbuddy", 8006) || usesHTTPSUpstream("workbuddy", 8006) {
		t.Fatal("Windows Workbuddy must retain noVNC HTTP proxy behavior")
	}
}

func TestLinuxWorkbuddyRetainsManagedRuntimeIntegration(t *testing.T) {
	linux := &models.Instance{Type: "workbuddy", RuntimeVariant: WorkbuddyRuntimeLinux}
	windows := &models.Instance{Type: "workbuddy", RuntimeVariant: WorkbuddyRuntimeWindows}
	if !supportsManagedRuntimeIntegrationForInstance(linux) || !supportsRuntimeConfigInjectionForInstance(linux) {
		t.Fatal("Linux Workbuddy must retain managed runtime integration")
	}
	if supportsManagedRuntimeIntegrationForInstance(windows) || supportsRuntimeConfigInjectionForInstance(windows) {
		t.Fatal("Windows Workbuddy must not receive guest-only runtime integration")
	}
}
