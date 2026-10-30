#!/usr/bin/env python3
"""Read only non-secret Runtime deployment facts needed for pool/slot migration."""
import json
import subprocess
import sys


CONTEXT = "kubernetes-admin@kubernetes"
NAMESPACE = "clawmanager-zhanghui08-system"
RUNTIMES = ("openclaw-runtime", "hermes-runtime")


def kubectl(*args):
    command = ["kubectl", "--context", CONTEXT, *args, "-o", "json"]
    result = subprocess.run(command, capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def volume(value):
    out = {"name": value["name"]}
    for kind in ("persistentVolumeClaim", "nfs", "hostPath", "emptyDir", "configMap", "secret", "projected"):
        if kind in value:
            source = value[kind]
            out["kind"] = kind
            if kind == "persistentVolumeClaim":
                out["claim"] = source.get("claimName")
            elif kind == "nfs":
                out.update(server=source.get("server"), path=source.get("path"), read_only=source.get("readOnly"))
            elif kind == "hostPath":
                out.update(path=source.get("path"), host_path_type=source.get("type"))
            elif kind in ("configMap", "secret"):
                out["reference_name"] = source.get("name" if kind == "configMap" else "secretName")
            elif kind == "emptyDir":
                out["medium"] = source.get("medium")
            break
    return out


def container(value):
    return {"name": value["name"], "image": value.get("image"),
            "command_present": "command" in value, "args_present": "args" in value,
            "ports": [{"name": p.get("name"), "container_port": p.get("containerPort"), "protocol": p.get("protocol")}
                      for p in value.get("ports", [])],
            "env_names": sorted(e["name"] for e in value.get("env", [])),
            "env_from_kinds": [list(item) for item in value.get("envFrom", [])],
            "mounts": [{"name": m["name"], "path": m["mountPath"], "sub_path": m.get("subPath"),
                        "read_only": m.get("readOnly", False)} for m in value.get("volumeMounts", [])],
            "resources": value.get("resources", {}), "security_context": value.get("securityContext", {})}


def pod_spec(spec):
    return {"service_account": spec.get("serviceAccountName"),
            "automount_service_account_token": spec.get("automountServiceAccountToken"),
            "node_name": spec.get("nodeName"), "node_selector": spec.get("nodeSelector", {}),
            "host_network": spec.get("hostNetwork", False),
            "share_process_namespace": spec.get("shareProcessNamespace", False),
            "pod_security_context": spec.get("securityContext", {}),
            "volumes": [volume(v) for v in spec.get("volumes", [])],
            "containers": [container(c) for c in spec.get("containers", [])],
            "init_containers": [container(c) for c in spec.get("initContainers", [])]}


def main():
    namespace = kubectl("get", "namespace", NAMESPACE)
    deployments = kubectl("-n", NAMESPACE, "get", "deployments", *RUNTIMES)["items"]
    pods = kubectl("-n", NAMESPACE, "get", "pods")["items"]
    services = kubectl("-n", NAMESPACE, "get", "services")["items"]
    if {d["metadata"]["name"] for d in deployments} != set(RUNTIMES):
        raise ValueError("Runtime Deployment set changed")
    selected_pods = [p for p in pods if p["metadata"].get("labels", {}).get("app") in RUNTIMES]
    if {p["metadata"]["labels"]["app"] for p in selected_pods} != set(RUNTIMES):
        raise ValueError("Runtime Pod set incomplete")
    claims = {v["claim"] for d in deployments for v in map(volume, d["spec"]["template"]["spec"].get("volumes", []))
              if v.get("kind") == "persistentVolumeClaim"}
    pvc_items = kubectl("-n", NAMESPACE, "get", "pvc")["items"]
    pvcs = []
    for claim in sorted(claims):
        matches = [p for p in pvc_items if p["metadata"]["name"] == claim]
        if len(matches) != 1:
            raise ValueError("referenced PVC absent: " + claim)
        pvc = matches[0]
        spec = pvc["spec"]
        pvcs.append({"name": claim, "uid": pvc["metadata"]["uid"], "volume_name": spec.get("volumeName"),
                     "storage_class": spec.get("storageClassName"), "access_modes": spec.get("accessModes"),
                     "volume_mode": spec.get("volumeMode"), "phase": pvc.get("status", {}).get("phase")})
    result = {"schema_version": "d-native-deployment-inventory.v1", "context": CONTEXT,
              "namespace": NAMESPACE, "namespace_uid": namespace["metadata"]["uid"],
              "deployments": [{"name": d["metadata"]["name"], "uid": d["metadata"]["uid"],
                               "replicas": d["spec"].get("replicas"), "selector": d["spec"]["selector"],
                               "template": pod_spec(d["spec"]["template"]["spec"])} for d in deployments],
              "pods": [{"name": p["metadata"]["name"], "uid": p["metadata"]["uid"],
                        "app": p["metadata"]["labels"]["app"], "phase": p.get("status", {}).get("phase"),
                        "deleting": bool(p["metadata"].get("deletionTimestamp")),
                        "node": p["spec"].get("nodeName"), "pod_ip": p.get("status", {}).get("podIP"),
                        "image_ids": [{"name": c["name"], "image_id": c.get("imageID"), "ready": c.get("ready")}
                                      for c in p.get("status", {}).get("containerStatuses", [])],
                        "volumes": [volume(v) for v in p["spec"].get("volumes", [])]} for p in selected_pods],
              "services": [{"name": s["metadata"]["name"], "selector": s["spec"].get("selector"),
                            "ports": [{"name": p.get("name"), "port": p.get("port"),
                                       "target_port": p.get("targetPort")} for p in s["spec"].get("ports", [])]}
                           for s in services if s["spec"].get("selector", {}).get("app") in RUNTIMES],
              "pvcs": pvcs}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (KeyError, ValueError, subprocess.CalledProcessError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "incomplete", "error_type": type(exc).__name__}))
        sys.exit(2)
