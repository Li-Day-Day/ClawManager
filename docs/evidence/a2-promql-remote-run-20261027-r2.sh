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
  printf 'Results already exist. Use a fresh remote directory.\n' >&2
  exit 3
fi
mkdir -m 700 results || exit 3
results="$work/results"
tmp=''
cleanup() {
  if [[ -n "$tmp" ]]; then
    case "$tmp" in "$work"/.tool-tmp.*) rm -rf -- "$tmp" ;; esac
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

sha256sum -c SHA256SUMS 2>&1 | tee "$results/checksums.log"
statuses=("${PIPESTATUS[@]}")
if (( statuses[0] != 0 || statuses[1] != 0 )); then
  printf 'RESULT=CHECKSUM_FAILED\n' | tee "$results/summary.txt"
  exit 3
fi
sha256sum thresholds.yml split.yml run.sh promtool tool-origin.json > "$results/payload.sha256" || exit 3
if [[ ! -f ./promtool || ! -x ./promtool ]]; then
  printf 'RESULT=NEED_RUNTIME\nExpected executable ./promtool; run chmod u+x ./promtool.\n' | tee "$results/summary.txt"
  exit 3
fi
binary="$work/promtool"
{
  printf 'runtime=bundled_binary\npath=%s\n' "$binary"
  uname -srm
  sha256sum -- "$binary"
} > "$results/runtime.txt" || exit 3
cp -- tool-origin.json "$results/tool-origin.json" || exit 3
tmp="$(mktemp -d "$work/.tool-tmp.XXXXXX")" || exit 3

TMPDIR="$tmp" "$binary" --version 2>&1 | tee "$results/version.log"
statuses=("${PIPESTATUS[@]}")
if (( statuses[0] != 0 || statuses[1] != 0 )); then
  printf 'version_exit=%s\nRESULT=RUNTIME_FAILED\n' "${statuses[0]}" | tee "$results/summary.txt"
  exit 3
fi

overall=0
for file in thresholds.yml split.yml; do
  TMPDIR="$tmp" "$binary" test rules "$file" 2>&1 | tee "$results/$file.log"
  statuses=("${PIPESTATUS[@]}")
  printf '%s exit=%s\n' "$file" "${statuses[0]}" | tee -a "$results/summary.txt" || overall=1
  if (( statuses[0] != 0 || statuses[1] != 0 )); then overall=1; fi
done
if (( overall == 0 )); then
  printf 'RESULT=PASS\n' | tee -a "$results/summary.txt" || exit 3
else
  printf 'RESULT=FAIL\n' | tee -a "$results/summary.txt" || exit 3
fi
printf 'RESULTS_DIRECTORY=%s\n' "$results"
exit "$overall"
