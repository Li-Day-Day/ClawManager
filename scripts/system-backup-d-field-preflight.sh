#!/usr/bin/env bash
# Read-only public inventory or an unexecuted DBA account plan. No Secret data,
# SQL credentials, account changes, deployments or backup tasks are produced.
set -euo pipefail
mode="${1:---public}"
[[ $# -le 1 ]] || exit 2
command -v python3 >/dev/null || { echo 'python3 unavailable; do not install for this check' >&2; exit 1; }
case "$mode" in
--public)
  command -v kubectl >/dev/null || { echo 'kubectl unavailable; do not install for this check' >&2; exit 1; }
  context="${KUBE_CONTEXT:-kubernetes-admin@kubernetes}"
  namespace="${SOURCE_NAMESPACE:-clawmanager-zhanghui08-system}"
  kubectl --context="$context" get namespace "$namespace" -o json | python3 -c '
import json,sys
d=json.load(sys.stdin)
print(json.dumps({"schema_version":"d-first-chain-public-inventory.v1","namespace":d["metadata"]["name"],"uid":d["metadata"]["uid"],"kind":"namespace","read_only":True},ensure_ascii=False))'
  kubectl --context="$context" -n "$namespace" get pods,deployments,pvc -o json | python3 -c '
import json,sys
doc=json.load(sys.stdin)
names={"SYSTEM_BACKUP_ENABLED","SYSTEM_BACKUP_READ_LIVE_ENABLED","SYSTEM_BACKUP_READ_SESSIONS_ENABLED","SYSTEM_BACKUP_READ_PINS_PATH","SYSTEM_BACKUP_READ_PINS_SHA256","SYSTEM_BACKUP_REGISTRATION_DSN","SYSTEM_BACKUP_DOWNLOAD_DSN","SYSTEM_BACKUP_OBSERVER_DSN","SBK_OBSERVER_DSN_FILE"}
for d in doc["items"]:
 m=d["metadata"]; kind=d["kind"]; out={"kind":kind,"name":m["name"],"uid":m["uid"]}
 if kind in ("Pod","Deployment"):
  spec=d["spec"] if kind=="Pod" else d["spec"]["template"]["spec"]
  out.update(node=spec.get("nodeName"),service_account=spec.get("serviceAccountName"),phase=d.get("status",{}).get("phase"))
  out["containers"]=[{"name":c["name"],"image":c["image"],"mounts":[{"name":v["name"],"path":v["mountPath"],"read_only":v.get("readOnly",False)} for v in c.get("volumeMounts",[])],"references":[{"name":v["name"],"source":v.get("valueFrom"),"literal_present":"value" in v} for v in c.get("env",[]) if v["name"] in names],"env_from":c.get("envFrom",[])} for c in spec.get("containers",[])]
  out["volumes"]=[{"name":v["name"],"secret_name":v.get("secret",{}).get("secretName"),"config_map":v.get("configMap",{}).get("name"),"pvc":v.get("persistentVolumeClaim",{}).get("claimName")} for v in spec.get("volumes",[])]
  out["images"]=[{"name":v["name"],"image_id":v.get("imageID")} for v in d.get("status",{}).get("containerStatuses",[])]
 elif kind=="PersistentVolumeClaim":
  out.update(volume=d["spec"].get("volumeName"),access_modes=d["spec"].get("accessModes"),phase=d.get("status",{}).get("phase"))
 print(json.dumps(out,ensure_ascii=False))'
  ;;
--sql-pins)
  # DBA metadata preflight only. This is NOT the independent observer and
  # does not create/unlock an account or claim SELECT-only authority.
  command -v kubectl >/dev/null || exit 1
  context="${KUBE_CONTEXT:-kubernetes-admin@kubernetes}"
  namespace="${SOURCE_NAMESPACE:-clawmanager-zhanghui08-system}"
  : "${SBK_EXPECTED_NAMESPACE_UID:?Pin the namespace UID from the public observation}"
  : "${SBK_EXPECTED_MYSQL_POD_UID:?Pin the MySQL Pod UID from the public observation}"
  : "${SBK_MYSQL_POD:?Pin the existing MySQL Pod name}"
  actual_namespace=$(kubectl --context="$context" get namespace "$namespace" -o jsonpath='{.metadata.uid}')
  actual_pod=$(kubectl --context="$context" -n "$namespace" get pod "$SBK_MYSQL_POD" -o jsonpath='{.metadata.uid}')
  [[ "$actual_namespace" == "$SBK_EXPECTED_NAMESPACE_UID" && "$actual_pod" == "$SBK_EXPECTED_MYSQL_POD_UID" ]] || { echo 'Pinned namespace/Pod changed' >&2; exit 1; }
  kubectl --context="$context" -n "$namespace" exec "$SBK_MYSQL_POD" -- sh -c '
set +x
set -eu
command -v mysql >/dev/null || exit 1
[ -n "${MYSQL_ROOT_PASSWORD:-}" ] || { echo "Existing DBA credential environment unavailable" >&2; exit 1; }
db="${MYSQL_DATABASE:-}"
case "$db" in ""|*[!A-Za-z0-9_]*) echo "Existing database mapping unavailable" >&2; exit 1;; esac
export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
present=$(mysql --connect-timeout=5 -uroot --batch --skip-column-names -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=\"$db\" AND table_name=\"system_backup_installation_state\"")
if [ "$present" != 1 ]; then
  mysql --connect-timeout=5 -uroot --batch --raw --skip-column-names -D "$db" -e "SELECT JSON_OBJECT(\"schema_version\",\"d-first-chain-sql-pins.v1\",\"server_uuid\",@@server_uuid,\"server_version\",VERSION(),\"database\",DATABASE(),\"installation_table_present\",false,\"runtime_observer\",false)"
  exit 2
fi
mysql --connect-timeout=5 -uroot --batch --raw --skip-column-names -D "$db" -e "START TRANSACTION READ ONLY; SELECT JSON_OBJECT(\"schema_version\",\"d-first-chain-sql-pins.v1\",\"server_uuid\",@@server_uuid,\"server_version\",VERSION(),\"database\",DATABASE(),\"sql_user\",CURRENT_USER(),\"clock\",UTC_TIMESTAMP(6),\"runtime_observer\",false); SELECT JSON_OBJECT(\"kind\",\"installation_state\",\"installation_id\",origin_installation_id,\"active_config_version\",active_config_version,\"matrix_key\",matrix_key,\"last_effective_enabled\",last_effective_enabled,\"row_version\",row_version) FROM system_backup_installation_state ORDER BY origin_installation_id LIMIT 11; SELECT JSON_OBJECT(\"kind\",\"canonical_table\",\"name\",table_name) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN (\"system_backups\",\"system_backup_preflights\",\"system_backup_events\",\"system_backup_attempts\",\"system_backup_job_observations\",\"system_backup_evidence\",\"system_backup_catalog_imports\",\"system_backup_catalog_records\",\"system_backup_catalog_scan_states\") ORDER BY table_name; ROLLBACK;"
' 
  ;;
--account-plan)
  # No SQL is executed. The DBA provisions credentials through the existing
  # secret process, unlocks the account and attests the pins independently.
  python3 -c '
import os,re,sys
keys=("SBK_OBSERVER_DATABASE","SBK_OBSERVER_USER","SBK_OBSERVER_HOST")
vals=[os.environ.get(k,"") for k in keys]
if not re.fullmatch(r"[A-Za-z0-9_]{1,64}",vals[0]) or not re.fullmatch(r"[A-Za-z0-9_]{1,32}",vals[1]) or not re.fullmatch(r"[A-Za-z0-9.-]{1,253}",vals[2]):
 sys.exit("Set exact database, independent user and concrete client host; wildcard accounts rejected")
db,user,host=vals
account="\x27"+user+"\x27@\x27"+host+"\x27"
print("-- CANDIDATE ONLY; not executed. Dedicated NEW account, no inherited roles.")
print("CREATE USER "+account+" REQUIRE SSL ACCOUNT LOCK;")
for table in ("system_backups","system_backup_preflights","system_backup_events","system_backup_attempts","system_backup_job_observations","system_backup_evidence"):
 print("GRANT SELECT ON `"+db+"`.`"+table+"` TO "+account+";")
print("SHOW GRANTS FOR "+account+";")
print("-- DBA: provision password through the existing controlled secret channel before unlocking.")
print("-- Then connect AS this observer and retain: SELECT @@server_uuid,DATABASE(),CURRENT_USER(),CURRENT_ROLE();")
print("-- Pin installation separately from the trusted A deployment mapping; never infer it from a task request.")'
  ;;
*) echo 'Use --public, --sql-pins or --account-plan' >&2; exit 2 ;;
esac
