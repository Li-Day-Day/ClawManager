#!/usr/bin/env bash
set -u
set -o pipefail
umask 077

work="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)" || exit 3
if [[ ! "$work" =~ ^/tmp/cm-promql-[0-9a-f]{32}$ ]]; then
  printf 'Expected a unique /tmp/cm-promql-<32 hex digits> directory.\n' >&2
  exit 3
fi
cd -- "$work" || exit 3
if [[ -e results ]]; then
  printf 'Results already exist. Use a fresh remote directory to preserve them.\n' >&2
  exit 3
fi
mkdir -m 700 results || exit 3
results="$work/results"
tmp="$(mktemp -d "$work/.tool-tmp.XXXXXX")" || exit 3
containers=("cm-promql-${work##*/cm-promql-}-version"
  "cm-promql-${work##*/cm-promql-}-thresholds"
  "cm-promql-${work##*/cm-promql-}-split")
current_container="${containers[0]}"
mode=''
binary=''
image=''
cleanup() {
  local name
  if [[ "$mode" == docker ]]; then
    for name in "${containers[@]}"; do
      docker rm -f "$name" >/dev/null 2>&1 || true
    done
  fi
  case "$tmp" in "$work"/.tool-tmp.*) rm -rf -- "$tmp" ;; esac
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

sha256sum thresholds.yml split.yml run.sh > "$results/payload.sha256" || exit 3
if [[ -n "${PROMTOOL_BIN:-}" ]]; then
  binary="$PROMTOOL_BIN"
elif type -P promtool >/dev/null 2>&1; then
  binary="$(type -P promtool)"
fi
if [[ -n "$binary" && -x "$binary" ]]; then
  mode=binary
  printf 'runtime=binary\npath=%s\n' "$binary" | tee "$results/runtime.txt"
  sha256sum -- "$binary" >> "$results/runtime.txt" || exit 3
elif command -v docker >/dev/null 2>&1; then
  image="${PROMTOOL_IMAGE:-}"
  if [[ -z "$image" ]]; then
    image="$(docker image ls --no-trunc --format '{{.Repository}} {{.ID}}' 2>/dev/null |
      awk '$1 == "prom/prometheus" || $1 == "quay.io/prometheus/prometheus" {print $2; exit}')"
  fi
  if [[ -n "$image" ]]; then
    image="$(docker image inspect --format '{{.Id}}' "$image" 2>/dev/null)" || image=''
  fi
  if [[ "$image" =~ ^sha256:[0-9a-f]{64}$ ]]; then
    mode=docker
    printf 'runtime=existing_docker_image\nimage_id=%s\n' "$image" | tee "$results/runtime.txt"
    docker image inspect --format '{{.Id}} {{json .RepoDigests}} {{.Os}} {{.Architecture}}' "$image" >> "$results/runtime.txt" || exit 3
  fi
fi
if [[ -z "$mode" ]]; then
  printf 'NEED_RUNTIME: no executable promtool or cached official Prometheus image found.\n' | tee "$results/summary.txt"
  printf 'Existing-tool overrides: PROMTOOL_BIN=/existing/path/promtool or PROMTOOL_IMAGE=<cached image ID>.\n'
  printf 'No dependencies were installed, images pulled, or daemons started.\n'
  exit 3
fi

invoke() {
  if [[ "$mode" == binary ]]; then
    TMPDIR="$tmp" "$binary" "$@"
  else
    docker run --rm --pull=never --name "$current_container" --network none --read-only \
      --cap-drop ALL --security-opt no-new-privileges --memory 512m --cpus 1 \
      --tmpfs /tmp:rw,nosuid,nodev,size=256m --user "$(id -u):$(id -g)" \
      --mount "type=bind,src=$work,dst=/work,readonly" --workdir /work \
      --entrypoint /bin/promtool "$image" "$@"
  fi
}

invoke --version 2>&1 | tee "$results/version.log"
statuses=("${PIPESTATUS[@]}")
version_rc=${statuses[0]}
if (( statuses[1] != 0 )); then
  printf 'Could not retain the version log.\n' >&2
  exit 3
fi
if (( version_rc != 0 )); then
  printf 'version_exit=%s\nRESULT=RUNTIME_FAILED\n' "$version_rc" | tee "$results/summary.txt"
  exit "$version_rc"
fi
overall=0
index=1
for file in thresholds.yml split.yml; do
  current_container="${containers[$index]}"
  invoke test rules "$file" 2>&1 | tee "$results/$file.log"
  statuses=("${PIPESTATUS[@]}")
  test_rc=${statuses[0]}
  printf '%s exit=%s\n' "$file" "$test_rc" | tee -a "$results/summary.txt"
  if (( test_rc != 0 || statuses[1] != 0 )); then overall=1; fi
  index=$((index + 1))
done
if (( overall == 0 )); then
  printf 'RESULT=PASS\n' | tee -a "$results/summary.txt"
else
  printf 'RESULT=FAIL\n' | tee -a "$results/summary.txt"
fi
printf 'RESULTS_DIRECTORY=%s\n' "$results"
exit "$overall"
