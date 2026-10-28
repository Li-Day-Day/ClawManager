#!/usr/bin/env python3
"""Render disposable kind install fixtures. No cluster access or production edits.

Requires only Python stdlib and the runner's existing OpenSSL. The resulting
manifest contains a short-lived PRIVATE key: never log or upload it.
"""

import argparse
import base64
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[2]
NAMESPACE = "clawmanager-system"
BROKER_DNS = f"clawmanager-secret-broker.{NAMESPACE}.svc.cluster.local"


def validate_minio_image(image):
    # The operator supplies a versioned image for a MANUAL run, not a repository
    # variable for every PR. A release tag is enough; a digest is optional.
    repository = (r"[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[0-9]+)?/"
                  r"[a-z0-9]+(?:[._-][a-z0-9]+)*"
                  r"(?:/[a-z0-9]+(?:[._-][a-z0-9]+)*)*")
    match = re.fullmatch(repository + r"(?::(?P<tag>[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})|@sha256:[0-9a-f]{64})", image)
    moving_tags = {"latest", "stable", "edge", "nightly", "main", "master", "dev", "canary"}
    if not match or (match.group("tag") or "").lower() in moving_tags:
        raise ValueError("Choose an accessible MinIO image with an explicit release tag "
                         "or sha256 digest via --minio-image (or K8S_SMOKE_MINIO_IMAGE). "
                         "No image source is assumed available and no fallback is selected.")
    return image


def replace_exact(text, old, new, count=1):
    actual = text.count(old)
    if actual != count:
        raise ValueError(f"CI manifest source drift: expected {count} matches, got {actual}: {old!r}")
    return text.replace(old, new)


def render_manifest(source, minio_image):
    """Keep TLS/auth intact; fail on source drift rather than silently mispatch."""
    validate_minio_image(minio_image)
    text = replace_exact(source, "image: ghcr.io/yuan-lab-llm/clawmanager:latest",
                         "image: clawmanager:ci", count=3)
    text = replace_exact(text, "image: minio/minio:latest", f"image: {minio_image}")
    # Only these CI volumes use emptyDir. This is an install smoke, not PV/NFS proof.
    for volume, claim, count in (("mysql-data", "mysql-data", 1),
                                 ("workspaces", "clawmanager-workspaces", 5)):
        text = replace_exact(text,
                             f"        - name: {volume}\n          persistentVolumeClaim:\n            claimName: {claim}",
                             f"        - name: {volume}\n          emptyDir: {{}}", count=count)
    app = "kind: Deployment\nmetadata:\n  name: clawmanager-app\n  namespace: clawmanager-system\nspec:\n  replicas: 1"
    text = replace_exact(text, app, app.replace("replicas: 1", "replicas: 0"))
    service = "kind: Service\nmetadata:\n  name: clawmanager-frontend\n  namespace: clawmanager-system\nspec:\n  type: NodePort"
    text = replace_exact(text, service, service.replace("NodePort", "ClusterIP"))
    text, count = re.subn(r"\n      nodePort: \d+", "", text)
    if count != 1:
        raise ValueError("CI manifest source drift: expected one frontend nodePort")
    return text


def tls_resources():
    """Fresh two-day CA and server cert, used only by this disposable kind run."""
    with tempfile.TemporaryDirectory(prefix="clawmanager-ci-tls-") as work:
        directory = Path(work)
        def openssl(*args):
            result = subprocess.run(["openssl", *args], cwd=work, capture_output=True, text=True)
            if result.returncode:
                # OpenSSL errors are diagnostics; never print the manifest or keys.
                raise RuntimeError(f"OpenSSL {args[0]} failed: {result.stderr.strip()}")
            return result.stdout

        openssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "2",
                "-subj", "/CN=ClawManager disposable CI CA", "-keyout", "ca.key", "-out", "ca.crt",
                "-addext", "basicConstraints=critical,CA:TRUE,pathlen:0",
                "-addext", "keyUsage=critical,keyCertSign,cRLSign")
        openssl("req", "-new", "-newkey", "rsa:2048", "-nodes", "-sha256",
                "-subj", f"/CN={BROKER_DNS}", "-keyout", "tls.key", "-out", "tls.csr")
        (directory / "server.ext").write_text(
            "basicConstraints=critical,CA:FALSE\n"
            "keyUsage=critical,digitalSignature,keyEncipherment\n"
            "extendedKeyUsage=serverAuth\n"
            f"subjectAltName=DNS:{BROKER_DNS},DNS:clawmanager-secret-broker.{NAMESPACE}.svc\n",
            encoding="ascii")
        openssl("x509", "-req", "-in", "tls.csr", "-CA", "ca.crt", "-CAkey", "ca.key",
                "-CAcreateserial", "-days", "2", "-sha256", "-extfile", "server.ext", "-out", "tls.crt")
        openssl("verify", "-CAfile", "ca.crt", "-purpose", "sslserver",
                "-verify_hostname", BROKER_DNS, "tls.crt")
        metadata = {"namespace": NAMESPACE, "labels": {"clawmanager.io/fixture": "disposable-ci"}}
        ca = {"apiVersion": "v1", "kind": "ConfigMap",
              "metadata": {**metadata, "name": "clawmanager-secret-broker-ca"},
              "data": {"ca.crt": (directory / "ca.crt").read_text(encoding="ascii")}}
        secret = {"apiVersion": "v1", "kind": "Secret", "type": "kubernetes.io/tls",
                  "metadata": {**metadata, "name": "clawmanager-secret-broker-tls"},
                  "data": {name: base64.b64encode((directory / name).read_bytes()).decode("ascii")
                           for name in ("tls.crt", "tls.key")}}
        return ca, secret


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--minio-image", default=os.getenv("K8S_SMOKE_MINIO_IMAGE", ""))
    parser.add_argument("--validate-inputs", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    try:
        validate_minio_image(args.minio_image)
    except ValueError as error:
        parser.error(str(error))
    if args.validate_inputs:
        print("MinIO reference format accepted; actual pull and rollout are still required.")
        return
    if args.output is None:
        parser.error("--output is required unless --validate-inputs is set")
    text = render_manifest((ROOT / "deployments/k8s/single-node/clawmanager.yaml").read_text(encoding="utf-8"),
                           args.minio_image)
    ca, secret = tls_resources()
    text = text.rstrip() + "\n---\n" + json.dumps(ca) + "\n---\n" + json.dumps(secret) + "\n"
    # Exclusive creation avoids overwriting an operator manifest; keep key private.
    fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as output:
        output.write(text)
    print("Prepared disposable kind manifest and two-day Secret Broker TLS fixtures (not production trust).")


if __name__ == "__main__":
    main()
