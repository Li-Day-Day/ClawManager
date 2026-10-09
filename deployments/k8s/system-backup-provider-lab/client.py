"""Isolated provider bootstrap, not an application adapter or a P0 attestation.

bootstrap returns confidential JSON ONLY to the parent provisioner pipe. Never
run that mode interactively. Normal operations print no plaintext/key/token.
The tools pod has no service account token and no persisted admin credentials.
"""
import base64
import hashlib
import json
import os
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import ssl

PURPOSES = ("capture_certificate", "acceptance_record", "catalog_record")
CA = "/trust/ca.crt"
STAGE = "start"
# ACL matching is type-sensitive and precedes Transit's TypeInt conversion.
# Use decimal strings in both policy and wire JSON, never JSON numeric literals.
DATA_KEY_BITS = "256"
SIGNING_VERSION = "1"


def stage(name):
    global STAGE
    STAGE = name
    print("D_LAB_DIAG " + json.dumps({"phase": STAGE, "code": "progress"}), file=sys.stderr, flush=True)


def error_diagnostic(error):
    # Only fixed codes leave the private pipe. Never return str/repr/args of an
    # arbitrary exception (HTTP bodies and subprocess argv can contain secrets).
    code, status = "unexpected-response", None
    if isinstance(error, LabError):
        message = str(error)
        if message.startswith("provider HTTP status "):
            value = message.removeprefix("provider HTTP status ")
            if value.isascii() and value.isdigit() and 100 <= int(value) <= 599:
                code, status = "provider-http", int(value)
        elif message == "provider transport failure; response withheld":
            code = "provider-transport"
        elif message == "provider TLS certificate verification failed":
            code = "provider-tls-certificate"
        elif message == "MinIO administration command failed; raw output withheld":
            code = "minio-command"
        else:
            code = "contract-check"
    elif isinstance(error, (TimeoutError, subprocess.TimeoutExpired)):
        code = "timeout"
    result = {"phase": STAGE, "code": code}
    if status is not None:
        result["http_status"] = status
    return result


def mc_command(directory, args):
    # This release uses <config-dir>/certs/CAs; it has no --certs-dir flag.
    return ["mc", "--config-dir", directory, "--json", *args]


class LabError(Exception):
    pass


class Bao:
    def __init__(self, url):
        if not url.startswith("https://"):
            raise LabError("HTTPS required")
        self.url = url
        self.ssl = ssl.create_default_context(cafile=CA)
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=self.ssl))

    def request(self, path, data=None, token=None, allowed=(200, 204)):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["X-Vault-Token"] = token
        req = urllib.request.Request(self.url + "/v1/" + path, headers=headers,
                                     data=None if data is None else json.dumps(data).encode())
        try:
            with self.opener.open(req, timeout=20) as response:
                status, raw = response.status, response.read(1024 * 1024)
        except urllib.error.HTTPError as error:
            status, raw = error.code, b""
        except urllib.error.URLError as error:
            if isinstance(error.reason, ssl.SSLCertVerificationError):
                raise LabError("provider TLS certificate verification failed") from None
            raise LabError("provider transport failure; response withheld") from None
        except ssl.SSLCertVerificationError:
            raise LabError("provider TLS certificate verification failed") from None
        except Exception:
            raise LabError("provider transport failure; response withheld") from None
        if status not in allowed:
            raise LabError("provider HTTP status " + str(status))
        return json.loads(raw) if raw else {}


def b64(value):
    return base64.b64encode(value).decode()


def acl(path, capabilities, required=None, allowed=None):
    rule = {"capabilities": capabilities}
    if required:
        rule["required_parameters"] = required
    if allowed:
        rule["allowed_parameters"] = allowed
    return {path: rule}


def token(bao, root, alias, paths):
    bao.request("sys/policies/acl/" + alias, {"policy": json.dumps({"path": paths})}, root)
    auth = bao.request("auth/token/create", {"policies": [alias], "no_default_policy": True,
        "ttl": "8h", "explicit_max_ttl": "8h", "renewable": False, "display_name": alias,
        "meta": {"purpose": alias, "scope": "isolated-provider-lab"}}, root)["auth"]
    if auth["lease_duration"] <= 0 or auth["lease_duration"] > 28800:
        raise LabError("unexpected token TTL")
    return auth["client_token"]


def evidence_policy(action, bucket, prefix):
    # No bucket-wide listing/admin and no access outside this exact object prefix.
    return {"Version": "2012-10-17", "Statement": [{"Effect": "Allow",
        "Action": [action], "Resource": ["arn:aws:s3:::" + bucket + "/" + prefix + "*"]},
        {"Effect": "Allow", "Action": ["s3:GetBucketLocation"], "Resource": ["arn:aws:s3:::" + bucket]}]}


def verify_audit(bao, root):
    # v2.6 disables API audit creation by default. The operator's immutable
    # server config declares this device; here we only verify its activation.
    for attempt in range(20):
        device = bao.request("sys/audit", token=root).get("data", {}).get("lab/")
        if device is not None:
            options = device.get("options", {})
            if (device.get("type") != "file" or options.get("file_path") != "/data/audit.json"
                    or options.get("log_raw", "false") != "false" or options.get("prefix", "")
                    or options.get("hmac_accessor", "true") != "true"):
                raise LabError("declarative audit configuration mismatch")
            return
        if attempt < 19:
            time.sleep(0.25)
    raise LabError("declarative audit device did not activate")


def setup(request):
    ns = request["namespace"]
    stage("bao-init")
    bao = Bao("https://bao." + ns + ".svc:8200")
    if bao.request("sys/init")["initialized"]:
        raise LabError("refusing to reinitialize an existing provider")
    init = bao.request("sys/init", {"secret_shares": 1, "secret_threshold": 1})
    root = init["root_token"]
    unseal = init["keys_base64"][0]
    stage("bao-unseal")
    if bao.request("sys/unseal", {"key": unseal})["sealed"]:
        raise LabError("unseal failed")
    stage("bao-audit")
    verify_audit(bao, root)
    stage("bao-transit")
    bao.request("sys/mounts/transit", {"type": "transit"}, root)
    stage("bao-kms-key")
    bao.request("transit/keys/d-kek-v1", {"type": "aes256-gcm96", "derived": True,
        "exportable": False, "allow_plaintext_backup": False}, root)
    context = b64((ns + "/capability-spike/attempt-1/capture").encode())
    generation = acl("transit/datakey/plaintext/d-kek-v1", ["update"], ["context", "bits"],
                     {"context": [context], "bits": [DATA_KEY_BITS]})
    unwrap = acl("transit/decrypt/d-kek-v1", ["update"], ["context", "ciphertext"],
                 {"context": [context], "ciphertext": []})
    stage("bao-kms-identities")
    sessions = {
        "d-kms-generate": token(bao, root, "d-kms-generate", generation),
        "d-kms-unwrap": token(bao, root, "d-kms-unwrap", unwrap),
    }
    refs = {}
    public_keys = []
    stage("bao-signing-keys")
    for purpose in PURPOSES:
        key = "d-" + purpose.replace("_", "-") + "-v1"
        bao.request("transit/keys/" + key, {"type": "ed25519", "exportable": False,
                                          "allow_plaintext_backup": False}, root)
        info = bao.request("transit/keys/" + key, token=root)["data"]
        if info["latest_version"] != 1 or info["exportable"] or info["allow_plaintext_backup"]:
            raise LabError("signing key metadata mismatch")
        public_key = info["keys"]["1"]["public_key"]
        public_keys.append(public_key)
        alias = "d-sign-" + purpose.replace("_", "-")
        paths = acl("transit/sign/" + key, ["update"], ["key_version", "input"],
                    {"key_version": [SIGNING_VERSION], "input": []})
        paths.update(acl("transit/verify/" + key, ["update"]))
        paths.update(acl("transit/keys/" + key, ["read"]))
        sessions[alias] = token(bao, root, alias, paths)
        refs[purpose] = {"key_path": "transit/keys/" + key, "key_version": 1,
            "identity_alias": alias, "public_key_base64": public_key}
    if len(set(public_keys)) != 3:
        raise LabError("signing keys are not distinct")

    # Bootstrap sanity checks are deliberately narrower than A's capability matrix.
    stage("bao-kms-generate")
    generated = bao.request("transit/datakey/plaintext/d-kek-v1", {"context": context, "bits": DATA_KEY_BITS}, sessions["d-kms-generate"])["data"]
    if not generated["ciphertext"].startswith("vault:v1:") or len(base64.b64decode(generated["plaintext"])) != 32:
        raise LabError("unexpected generated key/version")
    stage("bao-kms-decrypt")
    decrypted = bao.request("transit/decrypt/d-kek-v1", {"context": context, "ciphertext": generated["ciphertext"]}, sessions["d-kms-unwrap"])["data"]
    if decrypted["plaintext"] != generated["plaintext"]:
        raise LabError("KMS roundtrip failed")
    stage("bao-kms-denials")
    bao.request("transit/decrypt/d-kek-v1", {"context": context, "ciphertext": generated["ciphertext"]}, sessions["d-kms-generate"], allowed=(403,))
    bao.request("transit/datakey/plaintext/d-kek-v1", {"context": b64(b"wrong-context"), "bits": DATA_KEY_BITS}, sessions["d-kms-generate"], allowed=(403,))
    bao.request("transit/datakey/plaintext/d-kek-v1", {"context": context, "bits": "128"}, sessions["d-kms-generate"], allowed=(403,))
    del generated, decrypted
    stage("bao-signing-roundtrips")
    for purpose, ref in refs.items():
        key = ref["key_path"].split("/")[-1]
        signing_input = b64(("D-provider-bootstrap-only/" + purpose).encode())
        signature = bao.request("transit/sign/" + key, {"input": signing_input, "key_version": SIGNING_VERSION}, sessions[ref["identity_alias"]])["data"]["signature"]
        if not signature.startswith("vault:v1:"):
            raise LabError("signing version mismatch")
        verified = bao.request("transit/verify/" + key, {"input": signing_input, "signature": signature}, sessions[ref["identity_alias"]])["data"]["valid"]
        if not verified:
            raise LabError("signing roundtrip failed")
        bao.request("transit/sign/" + key, {"input": signing_input, "key_version": "2"}, sessions[ref["identity_alias"]], allowed=(403,))
        for other in refs.values():
            if other is not ref:
                bao.request("transit/sign/" + other["key_path"].split("/")[-1],
                    {"input": signing_input, "key_version": SIGNING_VERSION}, sessions[ref["identity_alias"]], allowed=(403,))

    bucket, prefix = "d-provider-evidence", "a-spike/"
    credentials = {}
    with tempfile.TemporaryDirectory(prefix="d-mc-") as directory:
        os.mkdir(directory + "/certs")
        os.mkdir(directory + "/certs/CAs")
        with open(CA, "rb") as source, open(directory + "/certs/CAs/lab.crt", "wb") as dest:
            dest.write(source.read())
        env = dict(os.environ)
        env["MC_HOST_lab"] = "https://" + urllib.parse.quote(request["minio_user"], safe="") + ":" + urllib.parse.quote(request["minio_password"], safe="") + "@minio." + ns + ".svc:9000"
        def mc(*args, data=None):
            response = subprocess.run(mc_command(directory, args), env=env, input=data,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
            if response.returncode:
                # mc's raw error/output can contain credentials: never propagate it.
                raise LabError("MinIO administration command failed; raw output withheld")
        stage("minio-ready")
        for attempt in range(20):
            try:
                mc("ready", "lab")
                break
            except LabError:
                if attempt == 19:
                    raise
                time.sleep(2)
        stage("minio-bucket")
        mc("mb", "lab/" + bucket)
        for role, action in (("read", "s3:GetObject"), ("write", "s3:PutObject"), ("delete", "s3:DeleteObject")):
            stage("minio-" + role)
            alias = "d-evidence-" + role
            password = secrets.token_urlsafe(36)
            # mc's admin protocol is provider-native. Arguments exist only within
            # this isolated tools container; no shell/logs or kube exec argv contain them.
            mc("admin", "user", "add", "lab", alias, password)
            mc("admin", "policy", "create", "lab", alias, "/dev/stdin",
               data=json.dumps(evidence_policy(action, bucket, prefix)).encode())
            mc("admin", "policy", "attach", "lab", alias, "--user", alias)
            credentials[alias] = {"access_key": alias, "secret_key": password}
        del env["MC_HOST_lab"]
    stage("complete")
    return {"recovery": {"root_token": root, "unseal_key": unseal}, "tokens": sessions,
        "evidence_credentials": credentials, "handoff": {
            "status": "isolated_provider_bootstrap_passed", "provider_capability_approved": False,
            "disaster_recovery_eligible": False, "kms": {"provider": "openbao-transit",
                "endpoint": bao.url, "key_path": "transit/keys/d-kek-v1", "key_version": 1,
                "context_base64": context, "generate_identity": "d-kms-generate", "unwrap_identity": "d-kms-unwrap",
                "rotation_rule": "new named key/ref; never silently use latest"},
            "provider_wire_parameters": {"bits": DATA_KEY_BITS, "signing_key_version": SIGNING_VERSION},
            "signing": refs, "evidence": {"provider": "minio-s3", "endpoint": "https://minio." + ns + ".svc:9000",
                "bucket": bucket, "prefix": prefix, "identity_aliases": list(credentials),
                "credential_lifetime": "test-only static; delete with lab; not task-scoped production grants"},
            "signing_and_kms_token_ttl_seconds": 28800,
            "tools": ["bao", "mc", "python3-stdlib-HTTPS"],
            "application_adapter": "not_implemented_by_this_lab",
            "checks": ["declarative-file-audit-active", "kms-roundtrip-v1", "generate-identity-decrypt-denied", "three-distinct-signing-public-keys",
                       "kms-wrong-context-denied", "kms-wrong-bits-denied", "signing-wrong-version-denied",
                       "three-sign-verify-roundtrips", "six-cross-purpose-sign-denials"],
            "pending": ["A capability matrix", "token revocation/expiry probes", "rotation/history probes",
                        "evidence read/write/delete/Range/checksum/denial probes", "provider-proof adapter",
                        "source-independent recovery", "runtime task-scoped identities"]}}


if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["bootstrap"]:
            if sys.stdin.isatty() or sys.stdout.isatty():
                raise LabError("bootstrap requires private parent pipes")
            result = setup(json.load(sys.stdin))
            sys.stdout.write(json.dumps(result))
        else:
            print("D isolated provider lab tools: bao, mc, Python HTTPS. Use the provisioner; never print bootstrap credentials.")
    except Exception as error:
        # Tracebacks, repr and provider bodies must never escape this process.
        print("D_LAB_DIAG " + json.dumps(error_diagnostic(error)), file=sys.stderr, flush=True)
        sys.exit(1)
