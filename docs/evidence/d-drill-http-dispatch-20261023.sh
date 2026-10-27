#!/usr/bin/env bash
# Local dispatch regression only. All kubectl/MySQL operations are mocked;
# actual inner shell and its test-binary selection/exit propagation execute.
set -eu
root=$1
owned=$2
cd "$root"
fixture="$owned/fixture"
mkdir "$fixture"
export DISPATCH_FIXTURE="$fixture"
cat > "$fixture/d-provider-registration.test" <<'STUB'
#!/usr/bin/env sh
case "$1" in
 -test.list) case "$2" in *Authority*) echo TestAAdminReadAuthorityMySQL;; *FullSchema*) echo TestDAdminReadFullSchemaMySQL;; *) exit 72;; esac;;
 -test.run) printf 'PROVIDER %s\n' "$2" >> "$DISPATCH_FIXTURE/calls";;
 *) exit 73;;
esac
STUB
cat > "$fixture/d-admin-read-http.test" <<'STUB'
#!/usr/bin/env sh
case "$1" in
 -test.list) if [ "${DISPATCH_MISSING_TEST:-0}" = 0 ]; then echo TestDAdminReadLiveHTTPMySQL; fi;;
 -test.run) printf 'HTTP mode=%s\n' "$D_ADMIN_DRILL_HISTORY_ONLY" >> "$DISPATCH_FIXTURE/calls"; exit "${DISPATCH_HTTP_EXIT:-0}";;
 *) exit 74;;
esac
STUB
chmod 700 "$fixture/"*.test
cp "$fixture/d-provider-registration.test" "$owned/provider.template"
cp "$fixture/d-admin-read-http.test" "$owned/http.template"
printf 'synthetic ddl\n' > "$fixture/d-provider-registration.sql"
cp scripts/system-backup-controller-enabled-fixture.mysql.sql "$fixture/d-admin-read-full-fixture.sql"
export RUN_NAMESPACE=sbk-mig-261023000000-abcd RUN_NAMESPACE_UID=00000000-0000-4000-8000-000000000001
export D_EMBEDDED_MIGRATION_COMPLETED=1 CONTEXT=mock RUN_ID=mock
export D_INVARIANT_BINARY="$fixture/d-provider-registration.test" D_ADMIN_READ_HTTP_BINARY="$fixture/d-admin-read-http.test"
export D_PROVIDER_REGISTRATION_DDL="$fixture/d-provider-registration.sql"
D_INVARIANT_BINARY_SHA256=$(sha256sum "$D_INVARIANT_BINARY" | cut -d' ' -f1)
D_ADMIN_READ_HTTP_BINARY_SHA256=$(sha256sum "$D_ADMIN_READ_HTTP_BINARY" | cut -d' ' -f1)
D_PROVIDER_REGISTRATION_DDL_SHA256=$(sha256sum "$D_PROVIDER_REGISTRATION_DDL" | cut -d' ' -f1)
export D_INVARIANT_BINARY_SHA256 D_ADMIN_READ_HTTP_BINARY_SHA256 D_PROVIDER_REGISTRATION_DDL_SHA256
mysql_query() { return 0; }
kubectl() {
 case " $* " in
  *" get namespace "*) printf '%s' "${DISPATCH_OBSERVED_UID:-$RUN_NAMESPACE_UID}"; return 0;;
  *" exec pod/mysql -- uname -m "*) printf x86_64; return 0;;
  *" exec -i pod/mysql "*) cat >/dev/null; return 0;;
 esac
 local -a args=("$@")
 local i body
 for ((i=0;i<${#args[@]};i++)); do
  if [[ "${args[i]}" == -c ]]; then
   body="${args[i+1]}"
   body="${body//\/tmp\//$fixture/}"
   sh -c "$body" "${args[@]:i+2}"
   return $?
  fi
 done
 printf 'Unexpected mocked kubectl invocation\n' >&2
 return 75
}
for scenario in default drill http_failure config_conflict invalid_mode wrong_uid missing_root; do
 cp "$owned/provider.template" "$fixture/d-provider-registration.test"
 cp "$owned/http.template" "$fixture/d-admin-read-http.test"
 chmod 700 "$fixture/"*.test
 printf 'synthetic ddl\n' > "$fixture/d-provider-registration.sql"
 cp scripts/system-backup-controller-enabled-fixture.mysql.sql "$fixture/d-admin-read-full-fixture.sql"
 mode=1
 export DISPATCH_HTTP_EXIT=0 DISPATCH_MISSING_TEST=0 DISPATCH_OBSERVED_UID="$RUN_NAMESPACE_UID"
 export D_CONFIG_CANDIDATE=0 D_ADMIN_INDEX_CANDIDATE=0
 expected=0
 case "$scenario" in
  default) mode=0;;
  http_failure) export DISPATCH_HTTP_EXIT=37; expected=1;;
  config_conflict) export D_CONFIG_CANDIDATE=1; expected=1;;
  invalid_mode) mode=2; expected=1;;
  wrong_uid) export DISPATCH_OBSERVED_UID=00000000-0000-4000-8000-000000000099; expected=1;;
  missing_root) export DISPATCH_MISSING_TEST=1; expected=1;;
 esac
 : > "$fixture/calls"
 sed "s/^drill_history_only=0$/drill_history_only=$mode/" scripts/system-backup-a-admin-read-phase.sh > "$owned/phase.sh"
 if source "$owned/phase.sh" > "$owned/$scenario.log" 2>&1; then result=0; else result=$?; fi
 if [[ "$expected" == 0 ]]; then
  [[ "$result" == 0 ]] || { cat "$owned/$scenario.log"; exit 1; }
  grep -Fx "HTTP mode=$mode" "$fixture/calls" >/dev/null
  if [[ "$mode" == 1 ]]; then
   [[ $(wc -l < "$fixture/calls") == 1 ]]
   grep '^PASS d-drill-detail-http-mysql synthetic_cases=19 ' "$owned/$scenario.log" >/dev/null
   ! grep '^PASS a-admin-read-mysql ' "$owned/$scenario.log" >/dev/null
  else
   [[ $(wc -l < "$fixture/calls") == 3 ]]
   grep '^PASS a-admin-read-mysql ' "$owned/$scenario.log" >/dev/null
   ! grep '^PASS d-drill-detail-http-mysql ' "$owned/$scenario.log" >/dev/null
  fi
 else
  [[ "$result" != 0 ]]
  ! grep '^PASS d-drill-detail-http-mysql ' "$owned/$scenario.log" >/dev/null
 fi
 printf 'PASS dispatch=%s actual_mysql=no actual_kubectl=no\n' "$scenario"
done
