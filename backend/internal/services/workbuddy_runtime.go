package services

import (
	"os"
	"strings"

	"clawreef/internal/models"
)

const (
	WorkbuddyRuntimeLinux   = "linux"
	WorkbuddyRuntimeWindows = "windows"

	defaultLinuxWorkbuddyImage = "ghcr.io/yuan-lab-llm/agentsruntime/workbuddy-linux:latest"
)

func normalizeWorkbuddyRuntimeVariant(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case WorkbuddyRuntimeLinux:
		return WorkbuddyRuntimeLinux
	case WorkbuddyRuntimeWindows:
		return WorkbuddyRuntimeWindows
	default:
		return ""
	}
}

func inferWorkbuddyVariantFromImage(image string) string {
	normalized := strings.ToLower(strings.TrimSpace(image))
	switch {
	case strings.Contains(normalized, "workbuddy-linux"):
		return WorkbuddyRuntimeLinux
	case strings.Contains(normalized, "windows-vm-workbuddy"), strings.Contains(normalized, "dockur/windows"):
		return WorkbuddyRuntimeWindows
	default:
		return ""
	}
}

func resolveWorkbuddyRuntimeVariantForRequest(req CreateInstanceRequest) string {
	if !strings.EqualFold(strings.TrimSpace(req.Type), "workbuddy") {
		return ""
	}
	if variant := normalizeWorkbuddyRuntimeVariant(req.RuntimeVariant); variant != "" {
		return variant
	}
	if req.ImageRegistry != nil {
		if variant := inferWorkbuddyVariantFromImage(*req.ImageRegistry); variant != "" {
			return variant
		}
	}
	if selection, ok := runtimeImageOverride(req.Type); ok {
		if variant := inferWorkbuddyVariantFromImage(selection.Image); variant != "" {
			return variant
		}
	}
	return WorkbuddyRuntimeWindows
}

func workbuddyRuntimeVariantForInstance(instance *models.Instance) string {
	if instance == nil || !strings.EqualFold(strings.TrimSpace(instance.Type), "workbuddy") {
		return ""
	}
	if variant := normalizeWorkbuddyRuntimeVariant(instance.RuntimeVariant); variant != "" {
		return variant
	}
	if strings.EqualFold(strings.TrimSpace(instance.MountPath), "/config") {
		return WorkbuddyRuntimeLinux
	}
	if strings.EqualFold(strings.TrimSpace(instance.MountPath), "/storage") {
		return WorkbuddyRuntimeWindows
	}
	if instance.ImageRegistry != nil {
		if variant := inferWorkbuddyVariantFromImage(*instance.ImageRegistry); variant != "" {
			return variant
		}
	}
	if instance.PVCName != nil && strings.TrimSpace(*instance.PVCName) != "" {
		return WorkbuddyRuntimeWindows
	}
	return WorkbuddyRuntimeWindows
}

func isWindowsWorkbuddyInstance(instance *models.Instance) bool {
	return workbuddyRuntimeVariantForInstance(instance) == WorkbuddyRuntimeWindows
}

func isLinuxWorkbuddyInstance(instance *models.Instance) bool {
	return workbuddyRuntimeVariantForInstance(instance) == WorkbuddyRuntimeLinux
}

func buildRuntimeConfigForInstance(instance *models.Instance) InstanceRuntimeConfig {
	if instance == nil {
		return InstanceRuntimeConfig{Port: 3001, MountPath: "/config", Env: map[string]string{}}
	}
	config := buildRuntimeConfig(instance.Type, instance.OSType, instance.OSVersion, instance.ImageRegistry, instance.ImageTag)
	return applyWorkbuddyRuntimeVariant(config, workbuddyRuntimeVariantForInstance(instance), instance.ImageRegistry == nil)
}

func applyWorkbuddyRuntimeVariant(config InstanceRuntimeConfig, variant string, useVariantDefaultImage bool) InstanceRuntimeConfig {
	switch normalizeWorkbuddyRuntimeVariant(variant) {
	case WorkbuddyRuntimeLinux:
		config.Port = 3001
		config.MountPath = "/config"
		config.Env = defaultWebtopDesktopEnv("Workbuddy")
		if useVariantDefaultImage {
			config.Image = strings.TrimSpace(os.Getenv("CLAWMANAGER_WORKBUDDY_LINUX_IMAGE"))
			if config.Image == "" {
				config.Image = defaultLinuxWorkbuddyImage
			}
		}
	case WorkbuddyRuntimeWindows:
		config.Port = 8006
		config.MountPath = "/storage"
		config.Env = defaultWindowsWorkbuddyEnv()
	}
	return config
}

func isWebtopRuntimeInstance(instance *models.Instance) bool {
	return instance != nil && (usesWebtopImage(instance.Type) || isLinuxWorkbuddyInstance(instance))
}

func supportsManagedRuntimeIntegrationForInstance(instance *models.Instance) bool {
	return instance != nil && (supportsManagedRuntimeIntegration(instance.Type) || isLinuxWorkbuddyInstance(instance))
}

func supportsRuntimeConfigInjectionForInstance(instance *models.Instance) bool {
	return instance != nil && (supportsRuntimeConfigInjection(instance.Type) || isLinuxWorkbuddyInstance(instance))
}
