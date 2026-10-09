#!/usr/bin/env bash
# Sourced after current-catalog CLI replay, verification that no temporary app
# exists, namespace identity checks, and the disposable MySQL run marker.
[[ "$history_cli_mode" == 1 && "$history_review_mode" == 1 ]] || return 1
[[ "$(kubectl --context="$CONTEXT" get namespace "$RUN_NAMESPACE" -o jsonpath='{.metadata.uid}')" == "$RUN_NAMESPACE_UID" ]] || return 1
[[ "$(kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" get pod mysql -o jsonpath='{.metadata.labels.clawmanager\.io/test-run}')" == "$RUN_ID" ]] || return 1
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec -i pod/mysql -- sh -c \
  'umask 077; cat > /tmp/d-history-migrate; chmod 700 /tmp/d-history-migrate' < "$D_HISTORY_CLI_BINARY"
kubectl --context="$CONTEXT" --namespace="$RUN_NAMESPACE" exec pod/mysql -- sh -c '
  set -eu
  umask 077
  scratch=$(mktemp -d /tmp/d-history-cli.XXXXXXXX)
  trap '\''rm -f /tmp/d-invariants.test /tmp/d-history-migrate; rmdir "$scratch"'\'' EXIT
  actual=$(sha256sum /tmp/d-invariants.test)
  [ "${actual%% *}" = "$3" ] || exit 1
  actual=$(sha256sum /tmp/d-history-migrate)
  [ "${actual%% *}" = "$4" ] || exit 1
  [ "$(/tmp/d-invariants.test -test.list "^TestDReviewedHistoryCLI$")" = TestDReviewedHistoryCLI ] || { echo "required CLI integration test absent" >&2; exit 1; }
  TMPDIR="$scratch" D_HISTORY_REVIEW_SMOKE=1 D_INVARIANT_RUN="$1" D_INVARIANT_NAMESPACE_UID="$2" D_HISTORY_CLI_BINARY=/tmp/d-history-migrate D_HISTORY_CLI_SHA256="$4" /tmp/d-invariants.test -test.run "^TestDReviewedHistoryCLI$" -test.v -test.count=1 -test.timeout=270s
' probe "$RUN_NAMESPACE" "$RUN_NAMESPACE_UID" "$D_INVARIANT_BINARY_SHA256" "$D_HISTORY_CLI_SHA256"
printf 'PASS d-reviewed-history-cli runner_sha256=%s probe_sha256=%s catalog=%s source=synthetic-isolated-mysql production-upgrade=false\n' "$D_HISTORY_CLI_SHA256" "$D_INVARIANT_BINARY_SHA256" "$EXPECTED_CATALOG_HASH"
