#!/usr/bin/env python3
"""Remove one unused disposable image manifest after checking all registry tags."""
import json
import subprocess
import sys
import urllib.error
import urllib.request


BASE = "http://10.130.14.23:5000/v2/openclaw-lite"
TAG = "d-native-52f47fc-20261030"
DIGEST = "sha256:d57b751e4790ed8e9af5efca4f230de32762982d7e04fd65819c6b603377d34f"
ACCEPT = ", ".join(("application/vnd.oci.image.index.v1+json",
                    "application/vnd.docker.distribution.manifest.list.v2+json",
                    "application/vnd.docker.distribution.manifest.v2+json"))


def manifest_digest(tag):
    request = urllib.request.Request(BASE + "/manifests/" + tag, method="HEAD",
                                     headers={"Accept": ACCEPT})
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.headers.get("Docker-Content-Digest", "")


def main():
    with urllib.request.urlopen(BASE + "/tags/list", timeout=10) as response:
        tags = json.load(response)["tags"]
    if TAG not in tags or len(tags) != len(set(tags)):
        raise ValueError("test tag missing or duplicate registry tags")
    aliases = [tag for tag in tags if manifest_digest(tag) == DIGEST]
    if aliases != [TAG] or manifest_digest(TAG) != DIGEST:
        raise ValueError("test digest shared or drifted: " + repr(aliases))
    command = ["kubectl", "--context", "kubernetes-admin@kubernetes", "get", "pods", "-A", "-o", "json"]
    pods = json.loads(subprocess.run(command, check=True, capture_output=True, text=True).stdout)["items"]
    in_use = []
    for pod in pods:
        for container in pod.get("spec", {}).get("containers", []):
            if TAG in container.get("image", "") or DIGEST in container.get("image", ""):
                in_use.append(pod["metadata"]["name"])
        for container in pod.get("status", {}).get("containerStatuses", []):
            if DIGEST in container.get("imageID", ""):
                in_use.append(pod["metadata"]["name"])
    if in_use:
        raise ValueError("test image still used by Pods: " + repr(sorted(set(in_use))))
    request = urllib.request.Request(BASE + "/manifests/" + DIGEST, method="DELETE")
    with urllib.request.urlopen(request, timeout=15) as response:
        if response.status != 202:
            raise ValueError("registry DELETE status " + str(response.status))
    try:
        manifest_digest(TAG)
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            raise
    else:
        raise ValueError("test tag still resolves after DELETE")
    print(json.dumps({"status": "deleted", "digest": DIGEST, "delete_http": 202,
                      "postcheck_http": 404, "tag_count_before": len(tags), "pod_references": 0}))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (KeyError, ValueError, urllib.error.URLError, subprocess.CalledProcessError) as exc:
        print(json.dumps({"status": "incomplete", "error": str(exc)}))
        sys.exit(2)
