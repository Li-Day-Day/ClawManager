"""In-pod S3 spike client. Credentials never leave their mounted role pod."""
import base64
import datetime
import hashlib
import hmac
import http.client
import json
from pathlib import Path
import re
import socket
import ssl
import sys
import xml.etree.ElementTree as ET
from urllib.parse import quote, urlsplit

RUN = re.compile(r"a-ev-[a-f0-9]{24}\Z")
CODES = {"AccessDenied", "NoSuchKey", "BadDigest", "PreconditionFailed", "SignatureDoesNotMatch", "InvalidAccessKeyId", "NotImplemented",
         "XAmzContentChecksumMismatch", "XAmzContentSHA256Mismatch", "InvalidRequest", "InvalidArgument", "InvalidDigest", "InternalError", "SlowDown"}


def safe_failure(error):
    # Never emit exception messages, provider XML, signed headers or credentials.
    if isinstance(error, ssl.SSLCertVerificationError):
        code = "tls_verification_failed"
    elif isinstance(error, (TimeoutError, socket.timeout)):
        code = "provider_timeout"
    elif isinstance(error, (ConnectionError, OSError, http.client.HTTPException)):
        code = "provider_transport_failed"
    else:
        code = "client_failed"
    return {"status": "failed", "error_code": code}


def payload(run_id):
    return ("A synthetic evidence probe " + run_id + "\n").encode() * 4


def sign(method, path, query, host, body, extra, access, secret, timestamp):
    headers = {"host": host, "x-amz-date": timestamp, "x-amz-content-sha256": hashlib.sha256(body).hexdigest(), **extra}
    canonical = "".join(k + ":" + " ".join(v.split()) + "\n" for k, v in sorted(headers.items()))
    names = ";".join(sorted(headers))
    request = "\n".join([method, path, query, canonical, names, headers["x-amz-content-sha256"]])
    scope = timestamp[:8] + "/us-east-1/s3/aws4_request"
    to_sign = "AWS4-HMAC-SHA256\n" + timestamp + "\n" + scope + "\n" + hashlib.sha256(request.encode()).hexdigest()
    key = ("AWS4" + secret).encode()
    for part in (timestamp[:8], "us-east-1", "s3", "aws4_request"):
        key = hmac.new(key, part.encode(), hashlib.sha256).digest()
    signature = hmac.new(key, to_sign.encode(), hashlib.sha256).hexdigest()
    headers["authorization"] = "AWS4-HMAC-SHA256 Credential=" + access + "/" + scope + ",SignedHeaders=" + names + ",Signature=" + signature
    return headers


def request_plan(action, run_id):
    if not RUN.fullmatch(run_id):
        raise ValueError("invalid run")
    body, headers, query = b"", {}, ""
    key = "a-spike/" + run_id + "/payload"
    methods = {"put": "PUT", "put-conflict": "PUT", "put-bad-checksum": "PUT", "get": "GET", "range": "GET", "head": "HEAD", "delete": "DELETE", "outside-get": "GET", "list": "GET"}
    method = methods[action]
    if action.startswith("put"):
        body = payload(run_id)
        headers = {"if-none-match": "*", "x-amz-meta-a-run": run_id,
                   "x-amz-checksum-sha256": base64.b64encode(hashlib.sha256(body).digest()).decode()}
        if action == "put-conflict":
            body += b"conflicting bytes"
            headers["x-amz-checksum-sha256"] = base64.b64encode(hashlib.sha256(body).digest()).decode()
        if action == "put-bad-checksum":
            key = "a-spike/" + run_id + "/bad-checksum"
            headers["x-amz-checksum-sha256"] = base64.b64encode(bytes(32)).decode()
    if action == "range":
        headers["range"] = "bytes=0-15"
    if action == "outside-get":
        key = "a-outside/" + run_id + "/never-written"
    if action == "list":
        key, query = "", "list-type=2"
    return method, key, query, body, headers


def tls_denials(endpoint, context):
    url = urlsplit(endpoint)
    result = {}
    for name, ctx, hostname in [("untrusted_ca_rejected", ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT), url.hostname),
                                ("wrong_hostname_rejected", context, "a-probe-invalid.invalid")]:
        try:
            with socket.create_connection((url.hostname, url.port), timeout=10) as raw:
                with ctx.wrap_socket(raw, server_hostname=hostname):
                    result[name] = False
        except ssl.SSLCertVerificationError:
            result[name] = True
    return result


def probe(options):
    h, action, run_id = options["handoff"], options["action"], options["run_id"]
    endpoint = h["evidence"]["endpoint"]
    if endpoint != "https://minio." + h["namespace"] + ".svc:9000" or h["evidence"]["bucket"] != "d-provider-evidence" or h["evidence"]["prefix"] != "a-spike/":
        raise ValueError("target mismatch")
    ca = Path("/trust/ca.crt").read_bytes()
    if hashlib.sha256(ca).hexdigest() != h["ca_sha256"]:
        raise ValueError("CA mismatch")
    context = ssl.create_default_context(cadata=ca.decode("ascii"))
    if action == "tls-negative":
        return {"status": "ok", **tls_denials(endpoint, context)}
    method, key, query, body, extra = request_plan(action, run_id)
    # Cleanup may address the bad-checksum intent too, but never a caller path.
    if options.get("object") == "bad-checksum":
        if action not in ("head", "get", "delete"):
            raise ValueError("invalid cleanup operation")
        key = "a-spike/" + run_id + "/bad-checksum"
    access = Path("/identity/access_key").read_text().strip()
    secret = Path("/identity/secret_key").read_text().strip()
    if not access or not secret:
        raise ValueError("empty credential")
    url = urlsplit(endpoint)
    path = quote("/d-provider-evidence/" + key, safe="/-_.~")
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    headers = sign(method, path, query, url.netloc, body, extra, access, secret, timestamp)
    connection = http.client.HTTPSConnection(url.hostname, url.port, context=context, timeout=15)
    try:
        connection.request(method, path + ("?" + query if query else ""), body=body, headers=headers)
        response = connection.getresponse()
        data = response.read(65537)
        if len(data) > 65536:
            raise ValueError("response limit")
        code = "none"
        if response.status >= 400 and method != "HEAD":
            try:
                raw_code = ET.fromstring(data).findtext("./{*}Code")
                code = raw_code if raw_code in CODES else "other"
            except ET.ParseError:
                code = "other"
        owner = response.getheader("x-amz-meta-a-run", "")
        checksum = response.getheader("x-amz-checksum-sha256", "")
        content_range = response.getheader("Content-Range", "")
        return {"status": "ok", "http_status": response.status, "error_code": code,
                "body_sha256": hashlib.sha256(data).hexdigest(), "body_length": len(data),
                "owner_matches": owner == run_id, "versioned": response.getheader("x-amz-version-id", "null") != "null",
                "checksum_matches": checksum == base64.b64encode(hashlib.sha256(payload(run_id)).digest()).decode(),
                "range_matches": content_range == "bytes 0-15/" + str(len(payload(run_id)))}
    finally:
        connection.close()


if __name__ == "__main__":
    try:
        print(json.dumps(probe(json.loads(sys.stdin.read(32768)))))
    except Exception as error:
        print(json.dumps(safe_failure(error)))
        sys.exit(1)
