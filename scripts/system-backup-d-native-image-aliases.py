#!/usr/bin/env python3
"""Read-only registry check before removing the disposable Agent test image."""
import json
import sys
import urllib.error
import urllib.request


BASE = "http://10.130.14.23:5000/v2/openclaw-lite"
TAG = "d-native-52f47fc-20261030"
DIGEST = "sha256:d57b751e4790ed8e9af5efca4f230de32762982d7e04fd65819c6b603377d34f"
ACCEPT = ", ".join(("application/vnd.oci.image.index.v1+json",
                    "application/vnd.docker.distribution.manifest.list.v2+json",
                    "application/vnd.docker.distribution.manifest.v2+json"))


def main():
    with urllib.request.urlopen(BASE + "/tags/list", timeout=10) as response:
        tags = json.load(response)["tags"]
    if TAG not in tags or len(tags) != len(set(tags)):
        raise ValueError("test tag missing or duplicate tags")
    aliases = []
    for tag in tags:
        request = urllib.request.Request(BASE + "/manifests/" + tag, method="HEAD",
                                         headers={"Accept": ACCEPT})
        with urllib.request.urlopen(request, timeout=10) as response:
            found = response.headers.get("Docker-Content-Digest", "")
            if not found.startswith("sha256:") or len(found) != 71:
                raise ValueError("manifest digest missing for " + tag)
            if found == DIGEST:
                aliases.append(tag)
    result = {"target_tag": TAG, "target_digest": DIGEST, "tag_count": len(tags),
              "digest_tags": aliases, "safe_to_delete_manifest": aliases == [TAG]}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["safe_to_delete_manifest"] else 2


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (KeyError, ValueError, urllib.error.URLError) as exc:
        print(json.dumps({"status": "incomplete", "error": str(exc)}))
        sys.exit(2)
