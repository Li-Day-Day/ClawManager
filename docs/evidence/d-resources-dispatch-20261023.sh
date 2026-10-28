#!/usr/bin/env bash
# Local tests only: kubectl/MySQL are functions, no network is contacted.
set -eu
root=$1
owned=$2
cd "$root"
fixture="$owned/fixture"
mkdir "$fixture"
export RES_DISPATCH_FIXTURE="$fixture"
cat > "$owned/probe.template" <<'STUB'
#!/usr/bin/env sh
case "$1" in
 -test.list) if [ "${RES_MISSING_ROOT:-0}" = 0 ]; then value="${2#^}"; printf '%s\n' "${value%\$}"; fi;;
 -test.run) printf '%s\n' "$2" >> "$RES_DISPATCH_FIXTURE/calls"; exit "${RES_NATIVE_EXIT:-0}";;
 *) exit 72;;
esac
STUB
export RUN_NAMESPACE=sbk-mig-261023000000-abcd RUN_NAMESPACE_UID=00000000-0000-4000-8000-000000000001
export D_EMBEDDED_MIGRATION_COMPLETED=1 CONTEXT=mock
export D_INVARIANT_BINARY="$fixture/d-resources-readback.test" D_PROVIDER_REGISTRATION_DDL="$fixture/d-resources-readback-inputs.json"
mysql_query() { return 0; }
kubectl() {
 case " $* " in
  *" get namespace "*) printf '%s' "${RES_OBSERVED_UID:-$RUN_NAMESPACE_UID}"; return 0;;
  *" exec pod/mysql -- uname -m "*) printf x86_64; return 0;;
  *" exec -i pod/mysql "*) cat >/dev/null; return 0;;
 esac
 local -a args=("$@")
 local i body
 for ((i=0;i<${#args[@]};i++)); do
  if [[ "${args[i]}" == -c ]]; then
   body="${args[i+1]}"; body="${body//\/tmp\//$fixture/}"
   sh -c "$body" "${args[@]:i+2}"
   return $?
  fi
 done
 return 75
}
for scenario in readback writer writer-fk readback_failure writer_failure fk_failure readback_missing writer_missing fk_missing wrong_uid wrong_binary wrong_inputs invalid_suite; do
 cp "$owned/probe.template" "$D_INVARIANT_BINARY"; chmod 700 "$D_INVARIANT_BINARY"
 printf 'synthetic inputs\n' > "$D_PROVIDER_REGISTRATION_DDL"
 D_INVARIANT_BINARY_SHA256=$(sha256sum "$D_INVARIANT_BINARY" | cut -d' ' -f1)
 D_PROVIDER_REGISTRATION_DDL_SHA256=$(sha256sum "$D_PROVIDER_REGISTRATION_DDL" | cut -d' ' -f1)
 export D_INVARIANT_BINARY_SHA256 D_PROVIDER_REGISTRATION_DDL_SHA256
 export RES_MISSING_ROOT=0 RES_NATIVE_EXIT=0 RES_OBSERVED_UID="$RUN_NAMESPACE_UID"
 suite=readback; expected=1
 case "$scenario" in
  readback|writer|writer-fk) suite="$scenario"; expected=0;;
  readback_failure) export RES_NATIVE_EXIT=37;;
  writer_failure) suite=writer; export RES_NATIVE_EXIT=37;;
  fk_failure) suite=writer-fk; export RES_NATIVE_EXIT=37;;
  readback_missing) export RES_MISSING_ROOT=1;;
  writer_missing) suite=writer; export RES_MISSING_ROOT=1;;
  fk_missing) suite=writer-fk; export RES_MISSING_ROOT=1;;
  wrong_uid) export RES_OBSERVED_UID=00000000-0000-4000-8000-000000000099;;
  wrong_binary) export D_INVARIANT_BINARY_SHA256=$(printf '0%.0s' {1..64});;
  wrong_inputs) export D_PROVIDER_REGISTRATION_DDL_SHA256=$(printf '0%.0s' {1..64});;
  invalid_suite) suite=invalid;;
 esac
 : > "$fixture/calls"
 sed "s/^resources_mysql_suite=readback$/resources_mysql_suite=$suite/" scripts/system-backup-d-resources-readback-phase.sh > "$owned/phase.sh"
 if source "$owned/phase.sh" > "$owned/$scenario.log" 2>&1; then result=0; else result=$?; fi
 if [[ "$expected" == 0 ]]; then
  [[ "$result" == 0 && $(wc -l < "$fixture/calls") == 1 ]] || { cat "$owned/$scenario.log"; exit 1; }
  case "$suite" in
   readback) grep -Fx '^TestDResourcesReadbackMySQL$' "$fixture/calls" >/dev/null; marker='PASS d-resources-readback-mysql cases=12 ';;
   writer) grep -Fx '^TestDResourcesWriteMySQL$' "$fixture/calls" >/dev/null; marker='PASS d-resources-write-mysql cases=9 ';;
   writer-fk) grep -Fx '^TestAResourcesWriteFKMySQL$' "$fixture/calls" >/dev/null; marker='PASS a-resources-write-fk-mysql cases=10 ';;
  esac
  grep -F "$marker" "$owned/$scenario.log" >/dev/null
  [[ $(grep -c '^PASS ' "$owned/$scenario.log") == 1 ]]
 else
  [[ "$result" != 0 ]]
  ! grep '^PASS .*resources.*mysql ' "$owned/$scenario.log" >/dev/null
 fi
 printf 'PASS resources-dispatch=%s actual_mysql=no actual_kubectl=no\n' "$scenario"
done
