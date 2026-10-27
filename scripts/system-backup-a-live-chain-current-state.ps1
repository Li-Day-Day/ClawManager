# Pinned to the operator's successful 2026-10-21 16:40 environment receipt.
# Any replaced namespace, MySQL server/Pod or app Pod is rejected.
$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'system-backup-a-live-chain-inventory.ps1') `
  -StateOnly -InspectDatabase `
  -Namespace 'clawmanager-zhanghui08-system' `
  -ExpectedNamespaceUid '337cfe30-2c17-4b8e-b32a-760778b8098e' `
  -MySqlPod 'mysql-66496b8965-d6tsl' `
  -ExpectedMySqlPodUid 'dab1cbf6-ca49-4e16-bd2d-27e70da52004' `
  -ExpectedServerUuid 'f1f5f76a-95f5-11f1-b08e-366835b4a029' `
  -AppPod 'clawmanager-app-788b97b78f-l8k5f' `
  -ExpectedAppPodUid 'aabba383-5db9-48a7-a3b7-2b92624c2f3a'
