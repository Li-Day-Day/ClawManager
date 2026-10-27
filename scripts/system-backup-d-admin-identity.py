"""Read-only admin identity/config inventory. SQL returns no credential columns.

Uses the existing application MySQL Pod/account. Creates no cluster resources,
accounts, sessions or files; the local caller may write a candidate public RBAC.
"""
import json
import re
import subprocess
import sys

CONTEXT = "kubernetes-admin@kubernetes"
NAMESPACE = "clawmanager-zhanghui08-system"
NAMESPACE_UID = "337cfe30-2c17-4b8e-b32a-760778b8098e"
stage = "context_guard"


def require(ok):
    if not ok:
        raise ValueError("admin identity preflight failed")


def kube(*args, data=None):
    result = subprocess.run(["kubectl", "--context=" + CONTEXT, "--request-timeout=30s", *args],
                            input=data, capture_output=True, timeout=60, check=False)
    require(result.returncode == 0 and len(result.stdout) <= 1048576)
    return result.stdout.decode("utf-8")


def guard(h):
    require(kube("config", "current-context").strip() == CONTEXT)
    require(kube("config", "view", "--minify", "-o", "jsonpath={.clusters[0].cluster.insecure-skip-tls-verify}") in ("", "false"))
    require(kube("config", "view", "--minify", "-o", "jsonpath={.clusters[0].cluster.server}").startswith("https://"))
    require(kube("get", "namespace", NAMESPACE, "-o", "jsonpath={.metadata.uid}") == NAMESPACE_UID)
    require(kube("get", "namespace", h["namespace"], "-o", "jsonpath={.metadata.uid}") == h["namespace_uid"])


def identity_sql(username, installation):
    require(re.fullmatch(r"[A-Za-z0-9_.@-]{1,64}", username))
    require(re.fullmatch(r"installation_[A-Za-z0-9._:-]{1,115}", installation))
    # Hex literals avoid quoting/interpolation of operator-controlled strings.
    user_hex, installation_hex = username.encode().hex(), installation.encode().hex()
    return f"""START TRANSACTION READ ONLY;
SELECT JSON_OBJECT(
 'database',DATABASE(), 'server_uuid',@@server_uuid,
 'observed_at',DATE_FORMAT(UTC_TIMESTAMP(6),'%Y-%m-%dT%H:%i:%s.%fZ'),
 'users',COALESCE((SELECT JSON_ARRAYAGG(JSON_OBJECT('id',id,'username',username,
   'role',role,'is_active',is_active,'auth_provider',auth_provider))
   FROM users WHERE BINARY username=0x{user_hex} AND BINARY auth_provider='local'),JSON_ARRAY()),
 'config_rows',(SELECT COUNT(*) FROM system_backup_configs),
 'active_installations',(SELECT COUNT(*) FROM system_backup_installation_state WHERE active_config_version IS NOT NULL),
 'target_installations',(SELECT COUNT(*) FROM system_backup_installation_state WHERE BINARY origin_installation_id=0x{installation_hex}),
 'target_active_config_version',(SELECT MAX(active_config_version) FROM system_backup_installation_state WHERE BINARY origin_installation_id=0x{installation_hex}),
 'runtime_table_count',(SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()
   AND TABLE_NAME IN ('system_backup_admin_revocations','system_backup_admin_sessions','system_backup_totp_credentials','system_backup_metadata_reservations'))
);
ROLLBACK;
"""


def validate_snapshot(v, username):
    require(isinstance(v, dict) and set(v) == {"database", "server_uuid", "observed_at", "users", "config_rows", "active_installations", "target_installations", "target_active_config_version", "runtime_table_count"})
    require(v["database"] == "clawmanager" and re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", v["server_uuid"]))
    require(re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z", v["observed_at"]))
    require(isinstance(v["users"], list) and len(v["users"]) == 1)
    u = v["users"][0]
    require(isinstance(u, dict) and set(u) == {"id", "username", "role", "is_active", "auth_provider"})
    require(type(u["id"]) is int and 1 <= u["id"] <= 2147483647 and u["username"] == username
            and u["role"] == "admin" and type(u["is_active"]) is int and u["is_active"] == 1 and u["auth_provider"] == "local")
    for k in ("config_rows", "active_installations", "target_installations", "runtime_table_count"):
        require(type(v[k]) is int and v[k] >= 0)
    require(v["runtime_table_count"] <= 4 and v["target_installations"] in (0, 1))
    require(v["target_installations"] <= v["active_installations"])
    version = v["target_active_config_version"]
    require((version is None and v["target_installations"] == 0) or
            (type(version) is int and version >= 1 and v["target_installations"] == 1))
    return v


def mysql_pod():
    deployment = json.loads(kube("-n", NAMESPACE, "get", "deployment", "mysql", "-o", "json"))
    selector = deployment["spec"]["selector"]
    require(not selector.get("matchExpressions") and selector.get("matchLabels"))
    labels = selector["matchLabels"]
    for k, v in labels.items():
        require(re.fullmatch(r"[A-Za-z0-9./_-]+", k) and re.fullmatch(r"[A-Za-z0-9._-]+", v))
    items = json.loads(kube("-n", NAMESPACE, "get", "pods", "-l", ",".join(k + "=" + v for k, v in sorted(labels.items())), "-o", "json"))["items"]
    ready = [p for p in items if not p["metadata"].get("deletionTimestamp") and
             p.get("status", {}).get("phase") == "Running" and
             any(c.get("type") == "Ready" and c.get("status") == "True" for c in p["status"].get("conditions", []))]
    require(len(ready) == 1)
    pod = ready[0]
    owners = [r for r in pod["metadata"].get("ownerReferences", []) if r.get("controller") is True and r.get("kind") == "ReplicaSet"]
    require(len(owners) == 1)
    replica = json.loads(kube("-n", NAMESPACE, "get", "replicaset", owners[0]["name"], "-o", "json"))
    require(replica["metadata"]["uid"] == owners[0]["uid"])
    require(any(r.get("controller") is True and r.get("kind") == "Deployment" and r.get("uid") == deployment["metadata"]["uid"]
                for r in replica["metadata"].get("ownerReferences", [])))
    require(len(pod["spec"]["containers"]) == 1)
    return {"name": pod["metadata"]["name"], "uid": pod["metadata"]["uid"],
            "container": pod["spec"]["containers"][0]["name"], "deployment_uid": deployment["metadata"]["uid"]}


def execute(o, h, binding):
    global stage
    require(re.fullmatch(r"d-admin-[a-f0-9]{24}", o["run_id"]))
    sql = identity_sql(o["username"], o["installation_id"])
    guard(h)
    stage = "mysql_identity"
    pod = mysql_pod()
    stage = "readonly_query"
    # Password expands only inside the existing database container. stdin is SQL;
    # neither password_hash nor credential/config bodies are selected or emitted.
    raw = kube("-n", NAMESPACE, "exec", "-i", pod["name"], "-c", pod["container"], "--", "sh", "-c",
               'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql --user="$MYSQL_USER" --database=clawmanager --batch --raw --skip-column-names',
               data=sql.encode())
    stage = "admin_validation"
    snapshot = validate_snapshot(json.loads(raw), o["username"])
    stage = "final_identity_check"
    guard(h)
    require(mysql_pod() == pod)
    return {"kind": "d_admin_identity_readonly_v1", "run_id": o["run_id"], "runner_sha256": binding,
            "namespace": NAMESPACE, "namespace_uid": NAMESPACE_UID,
            "target_installation_id": o["installation_id"], "provider_namespace_uid": h["namespace_uid"],
            "mysql_pod": pod, "snapshot": snapshot, "remote_mutations": False,
            "credentials_exported": False, "active_config_updated": False}


if __name__ == "__main__":
    try:
        print(json.dumps(execute(OPTIONS, HANDOFF, RUNNER_SHA256), sort_keys=True))
    except Exception:
        print(json.dumps({"error": "admin_identity_preflight_failed", "stage": stage}))
        sys.exit(1)
