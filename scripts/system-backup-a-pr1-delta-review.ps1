$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Push-Location $taskRoot
try {
    $taskHead='0a4bdc19a1ab8b979523d4c2161c9b08074a4f26'
    function Read-TaskGit([string[]]$arguments) {
        $lines=@(& git @arguments)
        if($LASTEXITCODE -ne 0){throw 'Git source review failed'}
        return $lines
    }
    $taskPrior=Get-Content -LiteralPath 'docs/evidence/a-b-pr1-security-mapping-20261028.json' -Raw|ConvertFrom-Json
    $taskRows=@(foreach($inputPin in $taskPrior.inputs){
        # Preserve one native output line as an array before indexing.
        $blob=@(Read-TaskGit @('rev-parse',($taskHead+':'+$inputPin.path)))[0]
        [ordered]@{path=$inputPin.path;prior_blob=$inputPin.git_blob;current_blob=$blob;unchanged=($blob -ceq $inputPin.git_blob)}
    })
    $taskGatePath='backend/internal/middleware/system_backup_gate.go'
    $taskGate=@(Read-TaskGit @('show',($taskHead+':'+$taskGatePath))) -join "`n"
    # Read only this pinned source's explicit method switch. These are source
    # comparison facts, never a generated production policy or authorization.
    $taskRoutes=@(foreach($method in @('Get','Post')){
        $block=[regex]::Match($taskGate,('if method == http.Method'+$method+' \{(?<body>[\s\S]*?)\n\t\}'))
        if(-not $block.Success){throw 'Pinned gate parser no longer matches'}
        foreach($route in [regex]::Matches($block.Groups['body'].Value,'"(?<route>/[^"\r\n]+)"')){
            [ordered]@{method=$method.ToUpperInvariant();path=$route.Groups['route'].Value}
        }
    })
    $taskPolicyPath='contracts/system-backup/v12/admin-operation-policy.json'
    $taskPolicy=Get-Content -LiteralPath $taskPolicyPath -Raw|ConvertFrom-Json
    $taskRouteSet=@{};foreach($r in $taskRoutes){$taskRouteSet[$r.method+' '+$r.path]=$true}
    $taskPolicyRows=@(foreach($operation in $taskPolicy.operations){
        $route='/api/v1'+[regex]::Replace($operation.path,'\{([^}]+)\}',':$1')
        [ordered]@{operation_id=$operation.operation_id;method=$operation.method;path=$route;kill_switch=$operation.kill_switch;candidate_business_gate_bypass=$taskRouteSet.ContainsKey($operation.method+' '+$route)}
    })
    $taskHeadTree=@(Read-TaskGit @('ls-tree','-r','--name-only',$taskHead,'--','backend/internal/systembackup/publicadapter'))
    $taskPublic=@(Read-TaskGit @('rev-parse','HEAD'))[0]
    $taskRelayPath='docs/evidence/a-dispatch-relay-validation-20261028.json'
    $taskRelay=Get-Content -LiteralPath $taskRelayPath -Raw|ConvertFrom-Json
    $taskRelayPins=@(foreach($pin in $taskRelay.A_sources){
        $sha=(Get-FileHash -LiteralPath $pin.path -Algorithm SHA256).Hash.ToLowerInvariant()
        if($sha -cne $pin.sha256){throw 'A relay changed; prior tests cannot be reused'}
        [ordered]@{path=$pin.path;sha256=$sha}
    })
    $taskReport=[ordered]@{
        kind='a_b_pr1_security_delta_review.v1';date='2026-10-28';commit=$taskHead;workspace_head=$taskPublic
        prior_mapping_commit=$taskPrior.commit;inputs=$taskRows
        gate_source=@{path=$taskGatePath;git_blob=@(Read-TaskGit @('rev-parse',($taskHead+':'+$taskGatePath)))[0];routes=$taskRoutes}
        public_policy=@{path=$taskPolicyPath;sha256=(Get-FileHash -LiteralPath $taskPolicyPath -Algorithm SHA256).Hash.ToLowerInvariant();status=$taskPolicy.status;operations=$taskPolicyRows}
        # Kill switch and capture business gate have separate semantics. A
        # mismatch is a review item, not permission to auto-add an exemption.
        allowed_when_disabled_without_candidate_bypass=@($taskPolicyRows|Where-Object {$_.kill_switch -eq 'allowed_when_disabled' -and -not $_.candidate_business_gate_bypass}|ForEach-Object operation_id)
        requires_effective_enabled_with_candidate_bypass=@($taskPolicyRows|Where-Object {$_.kill_switch -eq 'requires_effective_enabled' -and $_.candidate_business_gate_bypass}|ForEach-Object operation_id)
        public_runner_source_present=($taskHeadTree.Count -gt 0)
        relay_test_receipt=$taskRelayPath;relay_source_matches_prior_tested_bytes=$true;relay_sources=$taskRelayPins
        source_review_only=$true;tests_rerun=$false;dependencies_installed=$false;checkout_or_merge=$false;production_approved=$false;field_slots_closed=0
    }
    $taskReport|ConvertTo-Json -Depth 10|Set-Content -LiteralPath 'docs/evidence/a-b-pr1-security-delta-20261028.json' -Encoding utf8
    [ordered]@{commit=$taskHead;unchanged_prior_inputs=@($taskRows|Where-Object unchanged).Count;changed_prior_inputs=@($taskRows|Where-Object {-not $_.unchanged}).Count;candidate_routes=$taskRoutes.Count;public_runner_source_present=$taskReport.public_runner_source_present;review_operations=$taskReport.allowed_when_disabled_without_candidate_bypass}|ConvertTo-Json -Depth 4
} finally {Pop-Location}
