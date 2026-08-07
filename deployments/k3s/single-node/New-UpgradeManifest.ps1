[CmdletBinding()]
param(
    [string]$Source = (Join-Path $PSScriptRoot "clawmanager.yaml"),
    [string]$Output = (Join-Path $PSScriptRoot "clawmanager-upgrade.yaml")
)

$ErrorActionPreference = "Stop"

$upgradeResources = @(
    "Namespace/clawmanager-system",
    "PersistentVolume/clawmanager-redis-pv",
    "PersistentVolumeClaim/redis-data",
    "PersistentVolume/clawmanager-workspaces-pv",
    "PersistentVolumeClaim/clawmanager-workspaces",
    "Deployment/clawmanager-team-redis",
    "Service/clawmanager-redis",
    "Service/clawmanager-team-redis",
    "ServiceAccount/clawmanager-app",
    "ClusterRole/clawmanager-runtime-manager",
    "ClusterRoleBinding/clawmanager-runtime-manager",
    "ClusterRoleBinding/clawmanager-app-cluster-admin",
    "Role/clawmanager-app-leaderelection",
    "RoleBinding/clawmanager-app-leaderelection",
    "Deployment/skill-scanner",
    "Service/skill-scanner",
    "Deployment/clawmanager-app",
    "Deployment/openclaw-runtime",
    "Deployment/hermes-runtime",
    "Service/clawmanager-frontend",
    "Service/clawmanager-gateway",
    "Service/clawmanager-egress-proxy"
)

$header = @'
# ClawManager single-node in-place upgrade profile.
#
# This manifest is generated from clawmanager.yaml for an EXISTING installation.
# It intentionally excludes:
#   - Secret/clawmanager-secrets (preserves existing database and application credentials)
#   - ConfigMap/clawmanager-mysql-init (existing databases use embedded app migrations)
#   - Existing MySQL and MinIO PV/PVC/Deployment/Service resources
#
# Before applying:
#   1. Back up MySQL.
#   2. Label the single storage node:
#        kubectl label node <node> clawmanager.io/storage-node=true --overwrite
#   3. Merge the three runtime token keys into clawmanager-secrets without replacing
#      any existing key. See README.md, "In-place upgrade".
#   4. Load every referenced image into the node when operating offline.
#   5. Run kubectl apply --dry-run=server and kubectl diff first.
#
# Do not use this file for a fresh installation.
'@

if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
    throw "Source manifest not found: $Source"
}

$raw = Get-Content -LiteralPath $Source -Raw
$documents = [regex]::Split($raw, '(?m)^---\s*\r?\n')
$documentsByResource = @{}

foreach ($document in $documents) {
    $kindMatch = [regex]::Match($document, '(?m)^kind:\s*(\S+)')
    $nameMatch = [regex]::Match(
        $document,
        '(?ms)^metadata:\s*\r?\n(?:^[ \t].*\r?\n)*?^  name:\s*(\S+)'
    )

    if (-not $kindMatch.Success -or -not $nameMatch.Success) {
        continue
    }

    $resource = "$($kindMatch.Groups[1].Value)/$($nameMatch.Groups[1].Value)"
    if ($documentsByResource.ContainsKey($resource)) {
        throw "Duplicate resource in source manifest: $resource"
    }

    $documentsByResource[$resource] = $document.Trim()
}

$missing = @($upgradeResources | Where-Object { -not $documentsByResource.ContainsKey($_) })
if ($missing.Count -gt 0) {
    throw "Source manifest is missing required upgrade resources: $($missing -join ', ')"
}

$selectedDocuments = foreach ($resource in $upgradeResources) {
    $document = $documentsByResource[$resource]

    # The source file header belongs to the install profile; the generated file
    # has its own upgrade-specific safety header.
    if ($resource -eq "Namespace/clawmanager-system") {
        $document = [regex]::Replace(
            $document,
            '\A(?:#.*\r?\n)+(?=apiVersion:)',
            ''
        )
    }

    # The Windows Minikube package is designed to work without registry access.
    if ($resource -eq "Deployment/openclaw-runtime") {
        $document = $document -replace 'imagePullPolicy:\s*Always', 'imagePullPolicy: IfNotPresent'
    }

    $document
}

$content = $header.TrimEnd() + "`n" + ($selectedDocuments -join "`n---`n") + "`n"
$utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($Output, $content, $utf8WithoutBom)

Write-Host "Generated upgrade manifest: $Output"
Write-Host "Included resources: $($upgradeResources.Count)"
