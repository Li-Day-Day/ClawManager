"""No live tools, credentials, network, dependencies or persistent test output."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import shutil
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


lab = load("provider_lab", "scripts/system-backup-d-provider-lab.py")
client = load("provider_client", "deployments/k8s/system-backup-provider-lab/client.py")
NS = "sbk-provider-zh-123456789abc"
UID = "12345678-1234-1234-1234-123456789abc"
DIGEST = "example.test/tools@sha256:" + "a" * 64


class ProviderLabTests(unittest.TestCase):
    def test_bootstrap_constrained_wire_values_and_negative_requests(self):
        # Contract regression only: models typed ACL matching, not a real Bao.
        # Run the actual setup until MinIO starts, so both policy creation and
        # encoded request parameters participate in the assertion.
        testcase = self
        class API:
            url = 'https://bao.test.svc:8200'
            def __init__(self):
                self.policies = {}
                self.denials = 0
            def request(self, path, data=None, token=None, allowed=(200, 204)):
                if path == 'sys/init':
                    return {'initialized': False} if data is None else {'root_token': 'root-fixture', 'keys_base64': ['fixture']}
                if path == 'sys/unseal':
                    return {'sealed': False}
                if path == 'sys/audit':
                    return {'data': {'lab/': {'type': 'file', 'options': {'file_path': '/data/audit.json', 'log_raw': 'false'}}}}
                if path.startswith('sys/policies/acl/'):
                    self.policies[path.split('/')[-1]] = json.loads(data['policy'])['path']
                    return {}
                if path == 'auth/token/create':
                    testcase.assertTrue(data['no_default_policy'])
                    return {'auth': {'lease_duration': 28800, 'client_token': data['policies'][0]}}
                if token == 'root-fixture':
                    if path.startswith('transit/keys/') and data is None:
                        return {'data': {'latest_version': 1, 'exportable': False, 'allow_plaintext_backup': False,
                                         'keys': {'1': {'public_key': path}}}}
                    return {}
                rule = self.policies[token].get(path)
                permitted = rule is not None and 'update' in rule['capabilities']
                if permitted:
                    for field in ('bits', 'key_version'):
                        if field in rule.get('allowed_parameters', {}):
                            testcase.assertIsInstance(rule['allowed_parameters'][field][0], str)
                        if field in data:
                            testcase.assertIsInstance(data[field], str)
                    permitted = all(k in data for k in rule.get('required_parameters', []))
                    constraints = rule.get('allowed_parameters', {})
                    if constraints:
                        permitted = permitted and all(k in constraints and (not constraints[k] or v in constraints[k]) for k, v in data.items())
                if not permitted:
                    testcase.assertEqual(allowed, (403,))
                    self.denials += 1
                    return {}
                testcase.assertNotEqual(allowed, (403,), 'negative test would be allowed')
                if path.startswith('transit/datakey/'):
                    return {'data': {'ciphertext': 'vault:v1:fixture', 'plaintext': client.b64(b'x' * 32)}}
                if path.startswith('transit/decrypt/'):
                    return {'data': {'plaintext': client.b64(b'x' * 32)}}
                if path.startswith('transit/sign/'):
                    return {'data': {'signature': 'vault:v1:fixture'}}
                if path.startswith('transit/verify/'):
                    return {'data': {'valid': True}}
                raise AssertionError('unexpected operation')
        api = API()
        with patch.object(client, 'Bao', return_value=api), patch.object(client.tempfile, 'TemporaryDirectory', side_effect=StopIteration), patch.object(client, 'stage'):
            with self.assertRaises(StopIteration):
                client.setup({'namespace': NS})
        self.assertEqual(api.denials, 12)  # KMS three; signing wrong-version three and cross-purpose six.

    def test_declared_audit_is_verified_using_read_only_api(self):
        config = lab.bao_config(NS)
        self.assertIs(config['unsafe_allow_api_audit_creation'], False)
        self.assertIs(config['allow_audit_log_prefixing'], False)
        options = config['audit'][0]['file']['lab']['options']
        self.assertEqual(options['mode'], '0600')
        calls = []
        class API:
            def request(self, path, data=None, token=None):
                calls.append((path, data))
                return {'data': {'lab/': {'type': 'file', 'options': options}}}
        client.verify_audit(API(), 'secret-fixture')
        self.assertEqual(calls, [('sys/audit', None)])

    def test_audit_must_activate_and_must_hash_sensitive_fields(self):
        class API:
            def __init__(self, device):
                self.device = device
            def request(self, path, data=None, token=None):
                if data is not None:
                    raise AssertionError('unexpected write')
                return {'data': {} if self.device is None else {'lab/': self.device}}
        for options in ({'file_path': '/data/audit.json', 'log_raw': 'true'},
                        {'file_path': 'stdout'}, {'file_path': '/data/audit.json', 'hmac_accessor': 'false'},
                        {'file_path': '/data/audit.json', 'prefix': 'unexpected'}):
            with self.assertRaises(client.LabError):
                client.verify_audit(API({'type': 'file', 'options': options}), 'secret-fixture')
        with patch.object(client.time, 'sleep'), self.assertRaises(client.LabError):
            client.verify_audit(API(None), 'secret-fixture')

    def test_mc_command_uses_supported_config_ca_location_without_tls_bypass(self):
        self.assertEqual(client.mc_command('/tmp/private', ('ready', 'lab')),
                         ['mc', '--config-dir', '/tmp/private', '--json', 'ready', 'lab'])

    def test_diagnostics_keep_stage_status_and_discard_raw_or_extra_fields(self):
        records = [b'SECRET', b'D_LAB_DIAG {"phase":"bao-init","code":"provider-http","http_status":403}',
                   b'D_LAB_DIAG {"phase":"SECRET","code":"progress"}',
                   b'D_LAB_DIAG {"phase":"bao-init","code":"progress","token":"SECRET"}',
                   b'D_LAB_DIAG {"phase":[],"code":"progress"}',
                   b'D_LAB_DIAG {"phase":"bao-init","code":"provider-http","http_status":"SECRET"}']
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            lab.print_bootstrap_diagnostics(b'\n'.join(records))
        self.assertNotIn('SECRET', output.getvalue())
        self.assertEqual(len(output.getvalue().splitlines()), 1)
        self.assertIn('403', output.getvalue())

    def test_failed_bootstrap_reports_safe_progress_without_secret_output(self):
        response = subprocess.CompletedProcess([], 1, b'SECRET',
            b'D_LAB_DIAG {"phase":"minio-ready","code":"minio-command"}\nSECRET')
        output = io.StringIO()
        with patch.object(lab.subprocess, 'run', return_value=response), contextlib.redirect_stdout(output):
            with self.assertRaises(lab.SafeError):
                lab.run(['mock'], diagnostics=True)
        self.assertIn('minio-ready', output.getvalue())
        self.assertNotIn('SECRET', output.getvalue())

    def test_client_exception_diagnostic_does_not_include_values(self):
        for error in (KeyError('SECRET'), subprocess.TimeoutExpired(['SECRET'], 60, b'SECRET'), client.LabError('SECRET')):
            self.assertNotIn('SECRET', json.dumps(client.error_diagnostic(error)))
        self.assertEqual(client.error_diagnostic(client.LabError('provider HTTP status 403'))['http_status'], 403)

    def test_tls_verification_error_is_distinguishable_without_exposing_detail(self):
        bao = object.__new__(client.Bao)
        bao.url = 'https://owned.example'
        class Opener:
            def open(self, *args, **kwargs):
                raise client.urllib.error.URLError(client.ssl.SSLCertVerificationError('SECRET'))
        bao.opener = Opener()
        with self.assertRaises(client.LabError) as error:
            bao.request('sys/init')
        self.assertEqual(client.error_diagnostic(error.exception)['code'], 'provider-tls-certificate')
        self.assertNotIn('SECRET', str(error.exception))

    def test_legacy_ca_without_signing_key_usage_fails_strict_verification(self):
        openssl = shutil.which('openssl') or r'C:\Program Files\Git\mingw64\bin\openssl.exe'
        if not Path(openssl).is_file():
            self.skipTest('existing OpenSSL unavailable; no installation')
        real_run = lab.run
        def command(argv, *args, **kwargs):
            argv = list(argv)
            if 'keyUsage=critical,keyCertSign,cRLSign' in argv:
                index = argv.index('keyUsage=critical,keyCertSign,cRLSign')
                del argv[index-1:index+1]
            return real_run([openssl, *argv[1:]], *args, **kwargs)
        with tempfile.TemporaryDirectory(prefix='.tmp-d-provider-tls-', dir=ROOT) as directory:
            with patch.object(lab, 'run', side_effect=command):
                lab.certs(directory, NS)
            result = subprocess.run([openssl, 'verify', '-x509_strict', '-purpose', 'sslserver',
                '-CAfile', str(Path(directory) / 'ca.crt'), str(Path(directory) / 'bao.crt')],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(b'key usage', result.stderr.lower())

    def test_generated_chain_passes_strict_x509_and_wrong_hostname_is_rejected(self):
        openssl = shutil.which('openssl') or r'C:\Program Files\Git\mingw64\bin\openssl.exe'
        if not Path(openssl).is_file():
            self.skipTest('existing OpenSSL unavailable; no installation')
        real_run = lab.run
        def command(argv, *args, **kwargs):
            return real_run([openssl, *argv[1:]], *args, **kwargs)
        # Own scratch only; private test keys removed even if verification fails.
        with tempfile.TemporaryDirectory(prefix='.tmp-d-provider-tls-', dir=ROOT) as directory:
            with patch.object(lab, 'run', side_effect=command):
                lab.certs(directory, NS)
            for name in ('bao', 'minio'):
                args = [openssl, 'verify', '-x509_strict', '-purpose', 'sslserver', '-CAfile', str(Path(directory) / 'ca.crt'),
                        '-verify_hostname', name + '.' + NS + '.svc', str(Path(directory) / (name + '.crt'))]
                result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                self.assertEqual(result.returncode, 0, 'strict TLS verification failed')
                args[-2] = 'incorrect.example'
                self.assertNotEqual(subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE).returncode, 0)

    def test_no_raw_credentials_in_tool_errors(self):
        with patch.object(lab.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, b"SECRET", b"SECRET")):
            with self.assertRaises(lab.SafeError) as error:
                lab.run(["mock"])
            self.assertNotIn("SECRET", str(error.exception))
        with patch.object(lab.subprocess, "run", side_effect=subprocess.TimeoutExpired(["SECRET"], 1, b"SECRET")):
            with self.assertRaises(lab.SafeError) as error:
                lab.run(["mock"])
            self.assertNotIn("SECRET", str(error.exception))

    def test_cleanup_refuses_wrong_uid_or_unowned_namespace(self):
        for metadata in ({"uid": "another", "labels": {lab.LABEL: "true"}}, {"uid": UID, "labels": {}}):
            with patch.object(lab, "get", return_value={"metadata": metadata}), patch.object(lab, "kube") as mutation:
                with self.assertRaises(lab.SafeError):
                    lab.cleanup(NS, UID)
                mutation.assert_not_called()
        with self.assertRaises(lab.SafeError):
            lab.owned(lab.SOURCE, UID)

    def test_cleanup_sends_atomic_uid_precondition(self):
        def get(kind, *args, **kwargs):
            return {"items": []} if kind == "pv" else None
        with patch.object(lab, "owned", return_value=True), patch.object(lab, "get", side_effect=get), patch.object(lab, "kube") as mutation, contextlib.redirect_stdout(io.StringIO()):
            lab.cleanup(NS, UID)
            args, kwargs = mutation.call_args
            self.assertEqual(args, ("delete", "--raw", "/api/v1/namespaces/" + NS, "-f", "-"))
            self.assertEqual(json.loads(kwargs["data"])["preconditions"], {"uid": UID})

    def test_context_mismatch_cannot_reach_namespace_mutation(self):
        with patch.object(lab.shutil, "which", return_value="existing"), patch.object(lab, "kube", side_effect=[b"other", json.dumps({"clusters": [{"cluster": {"server": "https://example"}}]}).encode()]), patch.object(lab, "create") as create:
            with self.assertRaises(lab.SafeError):
                lab.main({"action": "deploy", "image": DIGEST})
            create.assert_not_called()

    def test_deploy_failure_cleans_only_created_namespace(self):
        def get(kind, *args, **kwargs):
            if kind == "storageclass":
                return {"reclaimPolicy": "Delete"}
            return {"status": {"nodeInfo": {"architecture": "amd64"}}}
        with patch.object(lab.os.path, "isdir", return_value=True), patch.object(lab, "get", side_effect=get), patch.object(lab, "source_minio_image", return_value=DIGEST), patch.object(lab.secrets, "token_hex", return_value="123456789abc"), patch.object(lab, "create", side_effect=[{"metadata": {"uid": UID}}, lab.SafeError("failed network policy")]), patch.object(lab, "cleanup") as cleanup, contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(lab.SafeError):
                lab.deploy(DIGEST)
            cleanup.assert_called_once_with(NS, UID)

    def test_mutable_image_rejected_before_any_cluster_call(self):
        with patch.object(lab, "get") as get:
            with self.assertRaises(lab.SafeError):
                lab.deploy("example.test/tools:latest")
            get.assert_not_called()

    def test_evidence_identity_has_one_action_and_exact_object_prefix(self):
        policy = client.evidence_policy("s3:GetObject", "d-provider-evidence", "a-spike/")
        statement = policy["Statement"]
        self.assertEqual(len(statement), 2)
        self.assertEqual(statement[0]["Action"], ["s3:GetObject"])
        self.assertEqual(statement[0]["Resource"], ["arn:aws:s3:::d-provider-evidence/a-spike/*"])
        self.assertEqual(statement[1], {"Effect": "Allow", "Action": ["s3:GetBucketLocation"], "Resource": ["arn:aws:s3:::d-provider-evidence"]})
        self.assertNotIn("s3:*", json.dumps(policy))

    def test_provider_http_error_body_is_never_returned(self):
        bao = object.__new__(client.Bao)
        bao.url = "https://owned.example"
        class Opener:
            def open(self, *args, **kwargs):
                raise client.urllib.error.HTTPError("https://owned.example", 403, "SECRET", {}, io.BytesIO(b"SECRET"))
        bao.opener = Opener()
        self.assertEqual(bao.request("transit/sign/test", {}, token="SECRET", allowed=(403,)), {})
        with self.assertRaises(client.LabError) as error:
            bao.request("transit/sign/test", {}, token="SECRET")
        self.assertNotIn("SECRET", str(error.exception))

    def test_pods_have_no_api_identity_and_private_memory_scratch(self):
        with patch.object(lab, "create", side_effect=lambda *args, **kwargs: kwargs):
            spec = lab.pod(NS, "lab-tools", DIGEST, ["python"], [], [])['spec']
        self.assertFalse(spec["automountServiceAccountToken"])
        self.assertTrue(spec["securityContext"]["runAsNonRoot"])
        self.assertEqual(spec["volumes"][-1]["emptyDir"]["medium"], "Memory")
        self.assertTrue(spec["containers"][0]["securityContext"]["readOnlyRootFilesystem"])


if __name__ == "__main__":
    unittest.main()
