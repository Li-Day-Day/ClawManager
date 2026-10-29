"""Prepare a public, exact RSA JWT trust configuration; no network or secrets."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit


def require(ok):
    if not ok:
        raise ValueError("invalid public JWT trust")


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()


def der(tag, content):
    length = len(content)
    encoded = length.to_bytes((length.bit_length() + 7) // 8, "big")
    return bytes([tag]) + (bytes([length]) if length < 128 else bytes([128 + len(encoded)]) + encoded) + content


def integer(value):
    require(isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]+", value))
    raw = base64.urlsafe_b64decode(value + "=" * ((4 - len(value) % 4) % 4))
    require(raw and raw[0] != 0 and base64.urlsafe_b64encode(raw).decode().rstrip("=") == value)
    return raw, der(2, (b"\0" if raw[0] & 128 else b"") + raw)


def prepare(evidence):
    require(evidence["schema_version"] == "system-backup-site-jwt-trust-observation.v1")
    discovery = evidence["discovery"]
    issuer = urlsplit(discovery["issuer"])
    require(issuer.scheme == "https" and issuer.hostname and not issuer.username and not issuer.password and not issuer.query and not issuer.fragment)
    require(discovery["id_token_signing_alg_values_supported"] == ["RS256"])
    keys = evidence["jwks"]["keys"]
    require(isinstance(keys, list) and 0 < len(keys) <= 8)
    public, identities = [], []
    for key in keys:
        require(set(key) == {"use", "kty", "kid", "alg", "n", "e"} and key["use"] == "sig" and key["kty"] == "RSA" and key["alg"] == "RS256")
        require(isinstance(key["kid"], str) and 0 < len(key["kid"]) <= 256)
        modulus, n = integer(key["n"])
        exponent, e = integer(key["e"])
        require(2048 <= int.from_bytes(modulus, "big").bit_length() <= 8192 and int.from_bytes(exponent, "big") == 65537)
        # SubjectPublicKeyInfo: rsaEncryption OID + NULL, then the RSA key bits.
        spki = der(0x30, bytes.fromhex("300d06092a864886f70d0101010500") + der(3, b"\0" + der(0x30, n + e)))
        encoded = base64.b64encode(spki).decode()
        pem = "-----BEGIN PUBLIC KEY-----\n" + "\n".join(encoded[i:i+64] for i in range(0, len(encoded), 64)) + "\n-----END PUBLIC KEY-----\n"
        require(key["kid"] not in [x["kid"] for x in identities] and pem not in public)
        public.append(pem)
        identities.append({"kid": key["kid"], "spki_sha256": hashlib.sha256(spki).hexdigest()})
    config = {"bound_issuer": discovery["issuer"], "jwt_supported_algs": ["RS256"], "jwt_validation_pubkeys": public, "default_role": ""}
    digest = hashlib.sha256(canonical(config)).hexdigest()
    return {"status": "review_only_not_applied", "mount": "sbk-kek-jwt-" + digest, "config": config, "config_request_sha256": digest, "keys": identities,
            "limits": ["No remote JWKS fetching or TOFU; only the operator-supplied public keys are trusted.", "This config grants no role or task execution permission.", "The role must bind exact audience, namespace, Pod UID and SA UID; live TokenReview/Job revocation remains required."]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", required=True)
    parser.add_argument("--evidence-sha256", required=True)
    args = parser.parse_args()
    try:
        raw = Path(args.evidence).read_bytes()
        require(len(raw) <= 65536 and hashlib.sha256(raw).hexdigest() == args.evidence_sha256)
        print(json.dumps(prepare(json.loads(raw)), ensure_ascii=False, indent=2))
        return 0
    except Exception:
        print('{"status":"public_trust_material_rejected"}')
        return 1


if __name__ == "__main__":
    sys.exit(main())
