#!/usr/bin/env bash
# Disposable, read-only preflight of a copy of the observed zhanghui08 test DB.
# Run on the remote Kubernetes control host after transferring the pinned files.
set -Eeuo pipefail

ctx=kubernetes-admin@kubernetes
ns=clawmanager-zhanghui08-system
host_bin=/tmp/sbk-d-legacy-preflight-edd192ea
host_inventory=/tmp/sbk-d-live-inventory-71b22c00.json
pod_bin=/tmp/sbk-d-legacy-preflight-edd192ea
pod_inventory=/tmp/sbk-d-live-inventory-71b22c00.json
pod_dsn=/tmp/sbk-d-legacy-preflight.dsn
expected_bin=edd192ea500f92c9f425b7bb203cb59e1ac0d756e8988ffa8ef6360d833f7dbd
expected_inventory=71b22c009b3ad9bdeef324d2cafd2aa4c1a646110f2080d1b6f42746f8f7013f
expected_server=f1f5f76a-95f5-11f1-b08e-366835b4a029
pod=
pod_uid=
namespace_uid=
copy_db=
cleanup_copy=0

kexec_raw() { kubectl --context "$ctx" -n "$ns" exec "$pod" -c mysql -- "$@"; }
verify_identity() {
  local current_namespace_uid current_pod_uid current_server
  current_namespace_uid=$(kubectl --context "$ctx" get namespace "$ns" -o jsonpath='{.metadata.uid}') || return 1
  current_pod_uid=$(kubectl --context "$ctx" -n "$ns" get pod "$pod" -o jsonpath='{.metadata.uid}') || return 1
  [[ "$current_namespace_uid" == "$namespace_uid" && "$current_pod_uid" == "$pod_uid" ]] || return 1
  current_server=$(kexec_raw sh -c 'export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; mysql -uroot -N -B -e "SELECT @@server_uuid"') || return 1
  [[ "$current_server" == "$expected_server" ]]
}
kexec() { verify_identity || { echo 'POD_OR_DATABASE_IDENTITY_CHANGED' >&2; return 1; }; kexec_raw "$@"; }
kcopy() { verify_identity || { echo 'POD_OR_DATABASE_IDENTITY_CHANGED' >&2; return 1; }; kubectl --context "$ctx" -n "$ns" cp -c mysql "$1" "$pod:$2"; }
cleanup() {
  local result=$?
  trap - EXIT
  if [[ "$cleanup_copy" == 1 ]]; then
    # The name was randomly created and checked absent before CREATE DATABASE.
    if ! verify_identity; then
      echo "CLEANUP_IDENTITY_CHANGED: inspect isolated database $copy_db on original server $expected_server" >&2
      result=1
    elif ! kexec_raw sh -eu -c '
      export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
      actual=$(mysql -uroot -N -B -e "SELECT @@server_uuid")
      [ "$actual" = "$2" ] || exit 3
      mysql -uroot -e "DROP DATABASE IF EXISTS \`$1\`"
    ' sh "$copy_db" "$expected_server" >/dev/null; then
      echo "CLEANUP_FAILED: inspect isolated database $copy_db on server $expected_server" >&2
      result=1
    fi
  fi
  if [[ -n "$pod" ]]; then
    if verify_identity; then
      kexec_raw rm -f "$pod_bin" "$pod_inventory" "$pod_dsn" >/dev/null 2>&1 || true
    fi
  fi
  rm -f "$host_bin" "$host_inventory"
  exit "$result"
}
trap cleanup EXIT

for item in "$host_bin" "$host_inventory"; do
  [[ -f "$item" && ! -L "$item" ]] || { echo "INPUT_MISSING: $item" >&2; exit 1; }
done
[[ "$(sha256sum "$host_bin" | cut -d' ' -f1)" == "$expected_bin" ]] || { echo 'BINARY_HASH_MISMATCH' >&2; exit 1; }
[[ "$(sha256sum "$host_inventory" | cut -d' ' -f1)" == "$expected_inventory" ]] || { echo 'INVENTORY_HASH_MISMATCH' >&2; exit 1; }

mapfile -t pods < <(kubectl --context "$ctx" -n "$ns" get pods -o name | sed -n 's@^pod/\(mysql-[a-z0-9-]*\)$@\1@p')
[[ "${#pods[@]}" == 1 ]] || { echo 'MYSQL_POD_NOT_UNIQUE' >&2; exit 1; }
pod=${pods[0]}
namespace_uid=$(kubectl --context "$ctx" get namespace "$ns" -o jsonpath='{.metadata.uid}')
pod_uid=$(kubectl --context "$ctx" -n "$ns" get pod "$pod" -o jsonpath='{.metadata.uid}')
[[ -n "$namespace_uid" && -n "$pod_uid" ]] || { echo 'POD_IDENTITY_UNAVAILABLE' >&2; exit 1; }
kexec bash -c 'command -v mysqldump >/dev/null && command -v mysql >/dev/null && test -w /tmp'
server=$(kexec sh -c 'export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; mysql -uroot -N -B -e "SELECT @@server_uuid"')
[[ "$server" == "$expected_server" ]] || { echo 'SOURCE_SERVER_MISMATCH' >&2; exit 1; }
source_shape=$(kexec sh -c 'export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; mysql -uroot -N -B -e "SELECT (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=0x636c61776d616e61676572 AND TABLE_TYPE=0x42415345205441424c45 AND ENGINE=0x496e6e6f4442),(SELECT COUNT(DISTINCT TABLE_NAME) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=0x636c61776d616e61676572 AND INDEX_NAME=0x5052494d415259)"')
[[ "$source_shape" == $'99\t99' ]] || { echo 'SOURCE_NOT_ALL_INNODB_WITH_PRIMARY_KEYS' >&2; exit 1; }

# The estimate is advisory; abort before CREATE if free space is too small.
estimated_mib=$(kexec sh -c 'export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; mysql -uroot -N -B -D clawmanager -e "SELECT CEIL(COALESCE(SUM(DATA_LENGTH+INDEX_LENGTH),0)/1024/1024) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()"')
free_mib=$(kexec df -Pm /var/lib/mysql | awk 'NR==2 {print $4}')
[[ "$estimated_mib" =~ ^[0-9]+$ && "$free_mib" =~ ^[0-9]+$ ]] || { echo 'CAPACITY_UNKNOWN' >&2; exit 1; }
(( free_mib >= estimated_mib * 3 + 1024 )) || { echo 'INSUFFICIENT_COPY_CAPACITY' >&2; exit 1; }
echo "CAPACITY_OK: estimated=${estimated_mib}MiB free=${free_mib}MiB"

copy_db="cm_import_$(tr -d - </proc/sys/kernel/random/uuid)"
[[ "$copy_db" =~ ^cm_import_[0-9a-f]{32}$ ]] || { echo 'COPY_NAME_INVALID' >&2; exit 1; }
existing=$(kexec sh -c 'export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; mysql -uroot -N -B -e "SHOW DATABASES"' | grep -Fx "$copy_db" || true)
[[ -z "$existing" ]] || { echo 'COPY_NAME_COLLISION' >&2; exit 1; }
cleanup_copy=1

kcopy "$host_bin" "$pod_bin"
kcopy "$host_inventory" "$pod_inventory"
kexec chmod 700 "$pod_bin"
[[ "$(kexec sha256sum "$pod_bin" | cut -d' ' -f1)" == "$expected_bin" ]] || { echo 'POD_BINARY_HASH_MISMATCH' >&2; exit 1; }
[[ "$(kexec sha256sum "$pod_inventory" | cut -d' ' -f1)" == "$expected_inventory" ]] || { echo 'POD_INVENTORY_HASH_MISMATCH' >&2; exit 1; }

kexec sh -eu -c '
  export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
  actual=$(mysql -uroot -N -B -e "SELECT @@server_uuid")
  [ "$actual" = "$2" ] || exit 3
  mysql -uroot -e "CREATE DATABASE \`$1\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
' sh "$copy_db" "$expected_server"
echo "COPY_CREATED: $copy_db"
kexec bash -euo pipefail -c '
  export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
  actual=$(mysql -uroot -N -B -e "SELECT @@server_uuid")
  [[ "$actual" == "$2" ]] || exit 3
  mysqldump -uroot --no-data --single-transaction --quick --skip-lock-tables --set-gtid-purged=OFF --no-tablespaces clawmanager | mysql -uroot "$1"

  # Stream the source snapshot straight into the copy and a SHA256 reader.
  # No plaintext SQL dump is stored on the host or in the Pod filesystem.
  umask 077
  fifo="/tmp/sbk-d-copy-proof-$1.fifo"
  source_hash_file="/tmp/sbk-d-copy-proof-$1.sha"
  trap '\''rm -f "$fifo" "$source_hash_file"'\'' EXIT
  mkfifo "$fifo"
  sha256sum < "$fifo" > "$source_hash_file" &
  hash_pid=$!
  data_options=(-uroot --single-transaction --quick --skip-lock-tables --skip-add-locks
    --set-gtid-purged=OFF --no-tablespaces --no-create-info --skip-triggers
    --order-by-primary --skip-extended-insert --hex-blob --skip-comments --skip-dump-date)
  if ! mysqldump "${data_options[@]}" clawmanager | tee "$fifo" | mysql -uroot "$1"; then
    kill "$hash_pid" 2>/dev/null || true
    wait "$hash_pid" 2>/dev/null || true
    exit 4
  fi
  wait "$hash_pid"
  source_sha=$(cut -d" " -f1 "$source_hash_file")
  copy_sha=$(mysqldump "${data_options[@]}" "$1" | sha256sum | cut -d" " -f1)
  [[ "$source_sha" =~ ^[0-9a-f]{64}$ && "$source_sha" == "$copy_sha" ]] || exit 5
  printf "DATA_STREAM_ROUNDTRIP_SHA256=%s\n" "$source_sha"
' bash "$copy_db" "$expected_server"
echo 'COPY_LOADED'

kexec sh -c '
  export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
  socket=$(mysql -uroot -N -B -e "SELECT @@socket")
  umask 077
  printf "root:%s@unix(%s)/%s?parseTime=true\n" "$MYSQL_ROOT_PASSWORD" "$socket" "$1" > "$2"
' sh "$copy_db" "$pod_dsn"
kexec "$pod_bin" --dsn-file "$pod_dsn" --source-inventory-file "$pod_inventory" --timeout 5m

# Only counts are emitted. They are a useful smoke check, not row equivalence.
for database in clawmanager "$copy_db"; do
  counts=$(kexec sh -c 'export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; mysql -uroot -N -B -D "$1" -e "SELECT (SELECT COUNT(*) FROM users),(SELECT COUNT(*) FROM instances),(SELECT COUNT(*) FROM runtime_pods),(SELECT COUNT(*) FROM instance_runtime_bindings),(SELECT COUNT(*) FROM schema_migrations)"' sh "$database")
  printf 'CORE_COUNTS %s %s\n' "$database" "$counts"
done
echo 'COPY_PREFLIGHT_FINISHED: cleanup follows automatically'
