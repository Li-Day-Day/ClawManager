#!/usr/bin/env bash
# Public scheduling observations only. No workload, namespace or SQL changes.
read_node_pod_capacity() {
  local capacity_context="$1" capacity_node="$2" capacity_limit capacity_rows capacity_line capacity_phase
  local capacity_bound=0 capacity_pending=0 capacity_running=0 capacity_terminal=0 capacity_unknown=0
  [[ "$capacity_context" =~ ^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,252}$ && "$capacity_node" =~ ^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$ ]] || {
    echo 'NODE_POD_CAPACITY_UNAVAILABLE stage=invalid_target' >&2; return 2;
  }
  if ! capacity_limit="$(kubectl --context="$capacity_context" --request-timeout=10s get node "$capacity_node" -o jsonpath='{.status.allocatable.pods}' 2>/dev/null)"; then
    echo 'NODE_POD_CAPACITY_UNAVAILABLE stage=node_allocatable' >&2; return 1
  fi
  [[ "$capacity_limit" =~ ^(0|[1-9][0-9]{0,8})$ ]] || {
    echo 'NODE_POD_CAPACITY_UNAVAILABLE stage=invalid_allocatable' >&2; return 1;
  }
  if ! capacity_rows="$(kubectl --context="$capacity_context" --request-timeout=10s get pods --all-namespaces --field-selector="spec.nodeName=$capacity_node" -o jsonpath='{range .items[*]}{"P|"}{.status.phase}{"\n"}{end}' 2>/dev/null)"; then
    echo 'NODE_POD_CAPACITY_UNAVAILABLE stage=pod_phases' >&2; return 1
  fi
  # The prefix preserves a pod whose phase is not yet set, including the last
  # row after command substitution removes trailing newlines. Print no names,
  # labels, manifests, environment values, Secret references or pod bodies.
  while IFS= read -r capacity_line; do
    [[ -n "$capacity_line" ]] || continue
    [[ "$capacity_line" == 'P|'* ]] || {
      echo 'NODE_POD_CAPACITY_UNAVAILABLE stage=invalid_pod_row' >&2; return 1;
    }
    capacity_phase="${capacity_line#P|}"
    case "$capacity_phase" in
      Pending) capacity_pending=$((capacity_pending+1)) ;;
      Running) capacity_running=$((capacity_running+1)) ;;
      Succeeded|Failed) capacity_terminal=$((capacity_terminal+1)) ;;
      Unknown|'') capacity_unknown=$((capacity_unknown+1)) ;;
      *) echo 'NODE_POD_CAPACITY_UNAVAILABLE stage=invalid_phase' >&2; return 1 ;;
    esac
    capacity_bound=$((capacity_bound+1))
    [[ "$capacity_bound" -le 1000000 ]] || {
      echo 'NODE_POD_CAPACITY_UNAVAILABLE stage=observation_limit' >&2; return 1;
    }
  done <<< "$capacity_rows"
  printf 'NODE_POD_CAPACITY context=%s node=%s allocatable=%s bound=%s nonterminal=%s pending=%s running=%s terminal=%s unknown_or_unreported=%s read_only=yes scheduler_fit=not_verified\n' \
    "$capacity_context" "$capacity_node" "$capacity_limit" "$capacity_bound" "$((capacity_bound-capacity_terminal))" "$capacity_pending" "$capacity_running" "$capacity_terminal" "$capacity_unknown"
}

if [[ "${BASH_SOURCE[0]:-$0}" == "$0" ]]; then
  set -euo pipefail
  [[ "$#" == 2 ]] || { echo 'usage: node-pod-capacity CONTEXT NODE' >&2; exit 2; }
  read_node_pod_capacity "$1" "$2"
fi
