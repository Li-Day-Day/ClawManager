"""Read the provider audit file in its existing Pod; emit only closed projections."""
import datetime
import json
import re
import sys


def project(lines, o):
    paths, ids, identities = set(o["paths"]), set(o["request_ids"]), o["identities"]
    start = datetime.datetime.fromisoformat(o["started_at"].replace("Z", "+00:00")).timestamp() - 5
    out = []
    size = 0
    for line in lines:
        size += len(line)
        if size > 128 * 1024 * 1024 or len(line) > 1024 * 1024:
            raise ValueError("bounded audit read exceeded")
        v = json.loads(line)
        req = v.get("request", {})
        path, rid = req.get("path"), req.get("id")
        if path not in paths and rid not in ids:
            continue
        when = v["time"]
        if datetime.datetime.fromisoformat(when.replace("Z", "+00:00")).timestamp() < start:
            continue
        if not re.fullmatch(r"[a-f0-9-]{36}", rid or "") or v["type"] not in ("request", "response"):
            raise ValueError("audit shape")
        operation = req["operation"]
        if operation not in ("read", "update", "create", "delete", "list"):
            raise ValueError("audit operation")
        accessor = (req.get("data") or {}).get("accessor") if path == "auth/token/revoke-accessor" else (v.get("auth") or {}).get("accessor")
        out.append({"request_id": rid, "type": v["type"], "time": when, "path": path, "operation": operation,
                    "identity": identities.get(accessor, "control-or-unresolved"), "error": bool(v.get("error"))})
        if len(out) > 4096:
            raise ValueError("audit projection bound")
    return out


if __name__ == "__main__":
    try:
        o = json.load(sys.stdin)
        with open("/data/audit.json", "rb") as source:
            print(json.dumps({"status": "ok", "rows": project(source, o)}))
    except Exception:
        print('{"status":"failed","error_code":"audit_projection_failed"}')
        sys.exit(1)
