#!/usr/bin/env python3
"""Read existing production facts. No grants, DDL, writes, deployment or installs.

The plan contains public references, never credentials. SQL connections use
existing mounted DSNs or connection references inside UID-pinned containers.
An administrative observer is recorded separately from runtime connections.
"""
import argparse
import datetime
import hashlib
import json
import re
import subprocess
import sys

VERSION = 'a-field-evidence.v1'
ROLES = ('registration', 'download', 'collector')
VOLUMES = ('data', 'report', 'journal')
UUID = r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}'
NAME = r'[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?'
IDENT = r'[A-Za-z0-9_]{1,64}'


def require(ok, code='input_rejected'):
    if not ok:
        raise ValueError(code)


def strict_json(raw, limit=1048576):
    require(len(raw.encode('utf-8')) <= limit)
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'duplicate_json_key')
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=pairs,
                      parse_constant=lambda _: require(False))


def closed(value, keys):
    require(type(value) is dict and set(value) == set(keys))


def matches(value, pattern):
    require(type(value) is str and len(value) <= 253 and re.fullmatch(pattern, value) is not None)


def safe_path(value):
    require(type(value) is str and value.startswith('/run/') and
            re.fullmatch(r'/[A-Za-z0-9_./-]+', value) is not None and
            not any(p in ('', '.', '..') for p in value[1:].split('/')))


def target(value):
    require(type(value) is dict)
    base = ('pod', 'pod_uid', 'container', 'expected_user', 'tables')
    if 'dsn_env' in value:
        closed(value, base + ('dsn_env', 'inspector_sha256'))
        require(value['dsn_env'] in ('SYSTEM_BACKUP_REGISTRATION_DSN_FILE','SYSTEM_BACKUP_DOWNLOAD_DSN_FILE','SYSTEM_BACKUP_GC_DSN_FILE'))
        matches(value['inspector_sha256'], r'[a-f0-9]{64}')
    elif 'socket_path' in value:
        closed(value, base + ('socket_path', 'password_env'))
        require(type(value['socket_path']) is str and
                re.fullmatch(r'/[A-Za-z0-9_./-]+', value['socket_path']) is not None and
                not any(p in ('', '.', '..') for p in value['socket_path'][1:].split('/')))
        matches(value['password_env'], r'[A-Z][A-Z0-9_]{0,127}')
    else:
        closed(value, base + ('credential_env', 'ssl_ca_file'))
        closed(value['credential_env'], ('user', 'password', 'host', 'port'))
        for name in value['credential_env'].values():
            matches(name, r'[A-Z][A-Z0-9_]{0,127}')
        require(len(set(value['credential_env'].values())) == 4)
        safe_path(value['ssl_ca_file'])
    for key in ('pod', 'container'):
        matches(value[key], NAME)
    matches(value['pod_uid'], UUID)
    matches(value['expected_user'], IDENT)
    require(type(value['tables']) is list and 0 < len(value['tables']) <= 256 and
            len(set(value['tables'])) == len(value['tables']))
    for table in value['tables']:
        matches(table, IDENT)


def validate_plan(plan, complete=True):
    closed(plan, ('version', 'context', 'namespace', 'namespace_uid', 'server_uuid',
                  'database', 'observer', 'profiles', 'materials', 'volumes', 'capacity_input'))
    require(plan['version'] == VERSION)
    matches(plan['context'], r'[A-Za-z0-9][A-Za-z0-9_.@:/-]{0,252}')
    matches(plan['namespace'], r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?')
    matches(plan['namespace_uid'], UUID)
    matches(plan['server_uuid'], UUID)
    matches(plan['database'], IDENT)
    if plan['observer'] is not None:
        target(plan['observer'])
    require(type(plan['profiles']) is dict and set(plan['profiles']) <= {'registration', 'download', 'gc', 'collector'})
    for role, value in plan['profiles'].items():
        target(value)
        require(value['expected_user'].lower() != 'root', 'runtime_root_rejected')
        require('socket_path' not in value, 'local_socket_is_observer_only')
        if 'dsn_env' in value:
            expected = {'registration':'SYSTEM_BACKUP_REGISTRATION_DSN_FILE','download':'SYSTEM_BACKUP_DOWNLOAD_DSN_FILE','collector':'SYSTEM_BACKUP_REGISTRATION_DSN_FILE','gc':'SYSTEM_BACKUP_GC_DSN_FILE'}
            require(value['dsn_env'] == expected[role], 'runtime_dsn_reference_mismatch')
    users = [value['expected_user'] for value in plan['profiles'].values()]
    require(len(users) == len(set(users)), 'distinct_runtime_users_required')
    require(type(plan['materials']) is list and len(plan['materials']) <= 128)
    material_keys = []
    for value in plan['materials']:
        closed(value, ('name', 'configmap', 'configmap_uid', 'key', 'sha256', 'kind'))
        for key in ('name', 'configmap'):
            matches(value[key], NAME)
        matches(value['configmap_uid'], UUID)
        matches(value['key'], r'[A-Za-z0-9_.-]+')
        require(value['key'] not in ('.', '..'))
        matches(value['sha256'], r'[a-f0-9]{64}')
        require(value['kind'] in ('ca_pem', 'public_json'))
        material_keys.append(value['name'])
    require(len(material_keys) == len(set(material_keys)))
    require(type(plan['volumes']) is dict and set(plan['volumes']) <= set(VOLUMES))
    for role, value in plan['volumes'].items():
        closed(value, ('pod', 'pod_uid', 'container', 'mount_path', 'file_path',
                       'pvc', 'pvc_uid', 'pv_uid', 'sub_path', 'minimum_available_bytes'))
        for key in ('pod', 'container', 'pvc'):
            matches(value[key], NAME)
        for key in ('pod_uid', 'pvc_uid', 'pv_uid'):
            matches(value[key], UUID)
        require(type(value['mount_path']) is str and
                re.fullmatch(r'/[A-Za-z0-9_/-]+', value['mount_path']) is not None and
                not any(p in ('', '.', '..') for p in value['mount_path'][1:].split('/')))
        require(type(value['file_path']) is str and value['file_path'].startswith(value['mount_path'] + '/') and
                re.fullmatch(r'/[A-Za-z0-9_./-]+', value['file_path']) is not None and
                not any(p in ('', '.', '..') for p in value['file_path'][1:].split('/')))
        require(value['sub_path'] == '' or (role == 'data' and type(value['sub_path']) is str and
                re.fullmatch(r'[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*',value['sub_path']) is not None))
        require(type(value['minimum_available_bytes']) is int and
                0 < value['minimum_available_bytes'] <= 9223372036854775807)
    missing = []
    require(plan['capacity_input'] is None or type(plan['capacity_input']) is dict)
    if plan['capacity_input'] is None:
        missing.append('existing_capacity_public_input')
    if plan['observer'] is None:
        missing.append('existing_observer_connection')
    missing += ['existing_' + role + '_connection' for role in ROLES if role not in plan['profiles']]
    missing += ['existing_' + role + '_volume' for role in VOLUMES if role not in plan['volumes']]
    if not any(m['kind'] == 'ca_pem' for m in plan['materials']):
        missing.append('pinned_public_provider_ca')
    if not any(m['kind'] == 'public_json' for m in plan['materials']):
        missing.append('pinned_original_public_materials')
    if complete:
        require(not missing, 'plan_incomplete')
        required_tables = set().union(*(set(v['tables']) for v in plan['profiles'].values()))
        require(required_tables <= set(plan['observer']['tables']), 'observer_table_scope_incomplete')
    return missing


def fingerprint(pod, container):
    status = next((c for c in pod.get('status', {}).get('containerStatuses', []) if c['name'] == container), {})
    require(pod.get('status', {}).get('phase') == 'Running' and status.get('containerID') and status.get('imageID') and
            status.get('state', {}).get('running'), 'pod_not_running')
    return [pod['metadata']['uid'], pod['spec']['nodeName'], status['containerID'], status.get('restartCount'), status.get('imageID')]


def metadata_sql(tables):
    # Names and counts only; hash CHECK/trigger/program bodies to avoid defaults
    # and application literals. Privileged and runtime views use identical SQL.
    names = ','.join("'%s'" % t for t in sorted(tables))
    queries = [
        "SELECT JSON_OBJECT('kind','table','table',TABLE_NAME,'engine',ENGINE,'collation',TABLE_COLLATION) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (%s) ORDER BY TABLE_NAME" % names,
        "SELECT JSON_OBJECT('kind','column','table',TABLE_NAME,'name',COLUMN_NAME,'ordinal',ORDINAL_POSITION,'type',COLUMN_TYPE,'nullable',IS_NULLABLE,'extra',EXTRA,'default_sha256',IF(COLUMN_DEFAULT IS NULL,NULL,SHA2(COLUMN_DEFAULT,256))) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (%s) ORDER BY TABLE_NAME,ORDINAL_POSITION" % names,
        "SELECT JSON_OBJECT('kind','index','table',TABLE_NAME,'name',INDEX_NAME,'ordinal',SEQ_IN_INDEX,'column',COLUMN_NAME,'unique',NON_UNIQUE,'prefix',SUB_PART,'type',INDEX_TYPE,'expression_sha256',IF(EXPRESSION IS NULL,NULL,SHA2(EXPRESSION,256))) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (%s) ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX" % names,
        "SELECT JSON_OBJECT('kind','foreign_key','schema',TABLE_SCHEMA,'table',TABLE_NAME,'name',CONSTRAINT_NAME,'column',COLUMN_NAME,'ordinal',ORDINAL_POSITION,'referenced_schema',REFERENCED_TABLE_SCHEMA,'referenced_table',REFERENCED_TABLE_NAME,'referenced_column',REFERENCED_COLUMN_NAME) FROM information_schema.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_NAME IS NOT NULL AND ((TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (%s)) OR (REFERENCED_TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IN (%s))) ORDER BY TABLE_SCHEMA,TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION" % (names, names),
        "SELECT JSON_OBJECT('kind','constraint','table',t.TABLE_NAME,'name',t.CONSTRAINT_NAME,'type',t.CONSTRAINT_TYPE,'enforced',t.ENFORCED,'check_sha256',IF(c.CHECK_CLAUSE IS NULL,NULL,SHA2(c.CHECK_CLAUSE,256))) FROM information_schema.TABLE_CONSTRAINTS t LEFT JOIN information_schema.CHECK_CONSTRAINTS c ON c.CONSTRAINT_SCHEMA=t.CONSTRAINT_SCHEMA AND c.CONSTRAINT_NAME=t.CONSTRAINT_NAME WHERE t.TABLE_SCHEMA=DATABASE() AND t.TABLE_NAME IN (%s) ORDER BY t.TABLE_NAME,t.CONSTRAINT_NAME" % names,
        "SELECT JSON_OBJECT('kind','referential_rule','schema',CONSTRAINT_SCHEMA,'table',TABLE_NAME,'name',CONSTRAINT_NAME,'update',UPDATE_RULE,'delete',DELETE_RULE,'referenced_schema',UNIQUE_CONSTRAINT_SCHEMA,'referenced_table',REFERENCED_TABLE_NAME) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE (CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME IN (%s)) OR (UNIQUE_CONSTRAINT_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IN (%s)) ORDER BY CONSTRAINT_SCHEMA,TABLE_NAME,CONSTRAINT_NAME" % (names, names),
        "SELECT JSON_OBJECT('kind','trigger','table',EVENT_OBJECT_TABLE,'name',TRIGGER_NAME,'timing',ACTION_TIMING,'event',EVENT_MANIPULATION,'body_sha256',SHA2(ACTION_STATEMENT,256)) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE IN (%s) ORDER BY EVENT_OBJECT_TABLE,TRIGGER_NAME" % names,
        "SELECT JSON_OBJECT('kind','routine','table','','name',ROUTINE_NAME,'type',ROUTINE_TYPE,'security',SECURITY_TYPE,'body_sha256',IF(ROUTINE_DEFINITION IS NULL,NULL,SHA2(ROUTINE_DEFINITION,256))) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE() ORDER BY ROUTINE_TYPE,ROUTINE_NAME",
    ]
    return ';\n'.join(queries) + ';\n'


class Probe:
    def __init__(self, plan, run=subprocess.run):
        validate_plan(plan)
        self.plan, self.run = plan, run
        self.prefix = ['kubectl', '--context=' + plan['context'], '--request-timeout=20s']

    def command(self, args, body=None):
        try:
            p = self.run(self.prefix + args, input=body, capture_output=True, text=True,
                         encoding='utf-8', timeout=45, check=False)
        except (OSError, subprocess.TimeoutExpired):
            raise ValueError('existing_command_unavailable_or_timeout') from None
        require(p.returncode == 0, 'existing_command_failed')
        require(len(p.stdout.encode('utf-8')) <= 4 * 1024 * 1024, 'observation_too_large')
        return p.stdout

    def get(self, kind, name=None, cluster=False):
        args = ([] if cluster else ['-n', self.plan['namespace']]) + ['get', kind]
        return strict_json(self.command(args + ([name] if name else []) + ['-o', 'json']), 4*1024*1024)

    def ns(self):
        require(self.get('namespace', self.plan['namespace'], True)['metadata']['uid'] == self.plan['namespace_uid'], 'namespace_identity_changed')

    def exec(self, target, args, body=None):
        self.ns()
        before = self.get('pod', target['pod'])
        require(before['metadata']['uid'] == target['pod_uid'], 'pod_identity_changed')
        require(any(c['name'] == target['container'] for c in before['spec']['containers']), 'container_missing')
        fp = fingerprint(before, target['container'])
        output = self.command(['-n', self.plan['namespace'], 'exec', '-i', target['pod'],
                               '-c', target['container'], '--'] + args, body)
        require(fp == fingerprint(self.get('pod', target['pod']), target['container']), 'container_changed_during_observation')
        self.ns()
        return output

    def mysql(self, target, sql):
        # No option files, login-path commands or credential values cross the
        # kubectl boundary. Existing env values expand only inside this process.
        require('dsn_env' not in target, 'native_dsn_mode_requires_closed_request')
        if 'socket_path' in target:
            script = 'set -eu; test -S "$1"; p=$(printenv "$2"); test -n "$p"; MYSQL_PWD="$p" exec mysql --no-defaults --no-login-paths --batch --raw --skip-column-names --default-character-set=utf8mb4 --connect-timeout=10 --protocol=SOCKET --socket="$1" --user="$3" --database="$4"'
            return self.exec(target, ['sh','-c',script,'a-field-socket',target['socket_path'],target['password_env'],target['expected_user'],self.plan['database']], sql)
        env = target['credential_env']
        script = 'set -eu; u=$(printenv "$1"); p=$(printenv "$2"); h=$(printenv "$3"); n=$(printenv "$4"); test -n "$u"; test -n "$p"; test -n "$h"; case "$n" in ""|*[!0-9]*) exit 2;; esac; test "$n" -gt 0; test "$n" -le 65535; MYSQL_PWD="$p" exec mysql --no-defaults --no-login-paths --batch --raw --skip-column-names --default-character-set=utf8mb4 --connect-timeout=10 --protocol=TCP --ssl-mode=VERIFY_IDENTITY --ssl-ca="$5" --user="$u" --host="$h" --port="$n" --database="$6"'
        return self.exec(target, ['sh', '-c', script, 'a-field-sql', env['user'], env['password'],
                                 env['host'], env['port'], target['ssl_ca_file'], self.plan['database']], sql)

    def native_dsn(self, target, mode):
        binary = '/usr/local/bin/clawreef-system-backup-registration'
        observed = self.exec(target, ['sha256sum',binary]).strip().split()
        require(len(observed) == 2 and observed == [target['inspector_sha256'],binary], 'native_inspector_binary_digest_mismatch')
        request = dict(schema_version='system-backup-sql-field-request.v1',mode=mode,
                       dsn_env=target['dsn_env'],server_uuid=self.plan['server_uuid'],database=self.plan['database'],
                       expected_user=target['expected_user'],tables=target['tables'] if mode=='metadata' else [])
        body = json.dumps(request,separators=(',',':'))+'\n'
        raw = self.exec(target,[binary,'--inspect-sql-evidence'],body)
        value = strict_json(raw,4*1024*1024)
        closed(value,('schema_version','mode','request_sha256','identity','after_identity','grants','metadata','capacity_identity','readonly','rolled_back'))
        require(value['schema_version']=='system-backup-sql-field-result.v1' and value['mode']==mode and
                value['request_sha256']==hashlib.sha256(body.encode()).hexdigest() and
                value['readonly'] is True and value['rolled_back'] is True,'native_inspector_result_binding')
        for identity in (value['identity'],value['after_identity']):
            closed(identity,('server_uuid','database','current_user','current_role','sql_time'))
            require(identity['server_uuid']==self.plan['server_uuid'] and identity['database']==self.plan['database'] and
                    identity['current_user'].split('@')[0]==target['expected_user'],'native_sql_identity_mismatch')
        require({k:v for k,v in value['identity'].items() if k!='sql_time'} ==
                {k:v for k,v in value['after_identity'].items() if k!='sql_time'},'native_sql_session_identity_changed')
        require(self.exec(target,['sha256sum',binary]).strip().split()==observed,'native_inspector_changed_during_probe')
        return value

    def profile(self, role, target):
        identity_sql = "SELECT JSON_OBJECT('server_uuid',@@server_uuid,'database',DATABASE(),'current_user',CURRENT_USER(),'current_role',CURRENT_ROLE(),'sql_time',DATE_FORMAT(UTC_TIMESTAMP(6),'%Y-%m-%dT%H:%i:%s.%fZ'));\n"
        sql = "SET SESSION max_execution_time=10000; START TRANSACTION READ ONLY;\n" + identity_sql + "SELECT 'A_FIELD_GRANTS';\nSHOW GRANTS;\nSELECT 'A_FIELD_METADATA';\n" + metadata_sql(target['tables']) + "SELECT 'A_FIELD_AFTER';\n" + identity_sql + 'ROLLBACK;\n'
        native = None
        if 'dsn_env' in target:
            native = self.native_dsn(target,'metadata')
            require(native['capacity_identity'] is None, 'native_mode_mismatch')
            identity, after, grants, records = native['identity'],native['after_identity'],native['grants'],native['metadata']
        else:
            lines = self.mysql(target, sql).strip().splitlines()
            require(len(lines) > 5 and lines[1] == 'A_FIELD_GRANTS' and lines.count('A_FIELD_GRANTS') == 1 and
                    lines.count('A_FIELD_METADATA') == 1 and lines.count('A_FIELD_AFTER') == 1, 'sql_observation_boundaries')
            meta_at, after_at = lines.index('A_FIELD_METADATA'), lines.index('A_FIELD_AFTER')
            require(1 < meta_at < after_at and after_at == len(lines)-2, 'sql_observation_boundaries')
            identity, after = strict_json(lines[0]), strict_json(lines[-1])
            grants,records = lines[2:meta_at],[strict_json(line) for line in lines[meta_at+1:after_at]]
        closed(identity, ('server_uuid', 'database', 'current_user', 'current_role', 'sql_time'))
        closed(after, identity.keys())
        require({k:v for k,v in identity.items() if k != 'sql_time'} == {k:v for k,v in after.items() if k != 'sql_time'}, 'sql_session_identity_changed')
        require(identity['server_uuid'] == self.plan['server_uuid'] and identity['database'] == self.plan['database'], 'database_identity_mismatch')
        require(identity['current_user'].split('@')[0] == target['expected_user'], 'sql_user_mismatch')
        require(type(grants) is list and 0 < len(grants) <= 256 and all(type(g) is str and re.fullmatch(r'GRANT [^\r\n\x00]{1,4096}', g) for g in grants), 'unexpected_grant_output')
        require(type(records) is list and len(records)<=16384,'metadata_record_limit')
        for record in records:
            if record.get('kind')=='index' and 'unique' in record:
                require('non_unique' not in record,'ambiguous_index_uniqueness_metadata')
                # Inspector v1's SQL alias is "unique", but its selected
                # database column is NON_UNIQUE. Preserve the numeric value.
                record['non_unique']=record.pop('unique')
        seen_tables = [r['table'] for r in records if r.get('kind') == 'table']
        require(set(seen_tables) == set(target['tables']) and len(seen_tables) == len(target['tables']), 'required_tables_not_visible')
        return dict(role=role, identity=identity, direct_grants=grants,
                    direct_grants_sha256=hashlib.sha256(('\n'.join(sorted(grants))+'\n').encode()).hexdigest(),
                    metadata=records, active_role_none=identity['current_role'] == 'NONE', one_readonly_connection=True,
                    sql_connection_kind='mounted_dsn_native' if native else 'local_socket_observer' if 'socket_path' in target else 'existing_environment_mysql',
                    native_inspector_sha256=target.get('inspector_sha256'),
                    revocation_tested=False, permissions_approved=False)

    def material(self, item):
        cm = self.get('configmap', item['configmap'])
        require(cm['metadata']['uid'] == item['configmap_uid'], 'material_configmap_replaced')
        raw = cm.get('data', {}).get(item['key'])
        require(type(raw) is str and 0 < len(raw.encode()) <= 1048576, 'public_material_missing')
        digest = hashlib.sha256(raw.encode()).hexdigest()
        require(digest == item['sha256'], 'public_material_digest_mismatch')
        result = dict(name=item['name'], kind=item['kind'], configmap_uid=item['configmap_uid'], sha256=digest, bytes=len(raw.encode()))
        if item['kind'] == 'ca_pem':
            certs=re.findall(r'-----BEGIN CERTIFICATE-----\s+[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----',raw)
            require(certs and len(certs)==raw.count('-----BEGIN CERTIFICATE-----')==raw.count('-----END CERTIFICATE-----') and 'PRIVATE KEY' not in raw,'public_ca_bundle_required')
            described=[]
            for cert in certs:
                try:
                    metadata=self.run(['openssl','x509','-noout','-subject','-issuer','-dates','-fingerprint','-sha256'],input=cert+'\n',capture_output=True,text=True,timeout=10,check=False)
                    p=self.run(['openssl','x509','-checkend','0','-noout'],input=cert+'\n',capture_output=True,text=True,timeout=10,check=False)
                except (OSError,subprocess.TimeoutExpired):
                    raise ValueError('openssl_unavailable') from None
                require(metadata.returncode==0 and len(metadata.stdout.encode())<=65536 and p.returncode in (0,1),'invalid_public_ca')
                fields={}
                for line in metadata.stdout.splitlines():
                    key,sep,value=line.partition('=');key=key.strip().lower()
                    if key in ('subject','issuer','notbefore','notafter','sha256 fingerprint'):
                        require(sep and key not in fields,'invalid_certificate_metadata');fields[key]=value.strip()
                require(set(fields)=={'subject','issuer','notbefore','notafter','sha256 fingerprint'},'complete_certificate_metadata_required')
                der_digest=fields['sha256 fingerprint'].replace(':','').lower()
                matches(der_digest,r'[a-f0-9]{64}')
                described.append(dict(subject=fields['subject'],issuer=fields['issuer'],not_before_text=fields['notbefore'],not_after_text=fields['notafter'],der_sha256=der_digest,not_expired_at_probe=p.returncode==0))
            result['certificate_count']=len(described);result['certificates']=described
            result['not_expired_at_probe']=all(c['not_expired_at_probe'] for c in described)
            result['chain_hostname_and_provider_acl_verified'] = False
        else:
            strict_json(raw)  # output hashes only, never an arbitrary document
            result['original_deadlines_and_authority_verified'] = False
        again = self.get('configmap', item['configmap'])
        require(again['metadata']['uid'] == cm['metadata']['uid'] and
                again['metadata']['resourceVersion'] == cm['metadata']['resourceVersion'], 'public_material_changed')
        return result

    def volume(self, role, item):
        pod = self.get('pod', item['pod'])
        require(pod['metadata']['uid'] == item['pod_uid'], 'pod_identity_changed')
        c = next(c for c in pod['spec']['containers'] if c['name'] == item['container'])
        mounts = [m for m in c.get('volumeMounts', []) if m['mountPath'] == item['mount_path']]
        require(len(mounts) == 1 and not mounts[0].get('subPathExpr') and mounts[0].get('subPath','') == item['sub_path'], 'exact_mount_path_and_subpath_required')
        mount = mounts[0]
        volume = next(v for v in pod['spec']['volumes'] if v['name'] == mount['name'])
        require(volume.get('persistentVolumeClaim', {}).get('claimName') == item['pvc'], 'mounted_pvc_mismatch')
        if role == 'data':
            require(mount.get('readOnly') is True, 'collector_data_mount_must_be_readonly')
        else:
            require(not mount.get('readOnly', False), 'writer_mount_declared_readonly')
        pvc = self.get('pvc', item['pvc'])
        require(pvc['metadata']['uid'] == item['pvc_uid'] and pvc['status']['phase'] == 'Bound', 'pvc_identity_or_binding_changed')
        require(pvc['spec'].get('volumeMode', 'Filesystem') == 'Filesystem', 'filesystem_volume_required')
        if role == 'report':
            require('ReadWriteMany' in pvc['spec']['accessModes'], 'shared_report_filesystem_required')
        pv = self.get('pv', pvc['spec']['volumeName'], True)
        require(pv['metadata']['uid'] == item['pv_uid'], 'pv_identity_changed')
        ref = pv['spec']['claimRef']
        require([ref['namespace'], ref['name'], ref['uid']] == [self.plan['namespace'], item['pvc'], item['pvc_uid']], 'pv_claim_binding_mismatch')
        if 'csi' in pv['spec']:
            backing = ['csi', pv['spec']['csi']['driver'], pv['spec']['csi']['volumeHandle']]
        elif 'nfs' in pv['spec']:
            backing = ['nfs', pv['spec']['nfs']['server'], pv['spec']['nfs']['path']]
        else:
            raise ValueError('storage_backing_not_supported')
        script = 'set -eu; export LC_ALL=C; test "$(readlink -f "$1")" = "$1"; test "$(readlink -f "$2")" = "$2"; test -r "$2"; '
        if role == 'journal':
            script += 'test -w "$1"; test -w "$2"; '
        script += 'id -u; id -g; stat -c "%u:%g:%a:%F" "$1"; stat -c "%u:%g:%a:%F" "$2"; stat -f -c "%S:%b:%a:%f:%t:%i" "$1"; awk -v p="$1" \'$2==p {print $4; n++} END {exit (n!=1)}\' /proc/mounts'
        lines = self.exec(item, ['sh', '-c', script, 'a-field-volume', item['mount_path'], item['file_path']]).strip().splitlines()
        require(len(lines) == 6 and lines[0].isdigit() and lines[1].isdigit(), 'invalid_volume_observation')
        mount_options=lines[5].split(',')
        require(sum(option in ('ro','rw') for option in mount_options)==1,'unambiguous_actual_mount_flags_required')
        actual_readonly='ro' in mount_options
        require(actual_readonly == (role=='data'),'actual_mount_access_mismatch')
        directory, file = lines[2].split(':', 3), lines[3].split(':', 3)
        require(directory[3] == 'directory' and file[3] == 'regular file', 'regular_file_and_directory_required')
        require(all(re.fullmatch(r'[0-9]+', x) for x in directory[:3]+file[:3]), 'invalid_unix_permissions')
        if role == 'journal':
            require(int(file[0]) == int(lines[0]) > 0 and file[2] in ('600', '640'), 'journal_private_owner_mode_required')
            require('ReadWriteOncePod' in pvc['spec']['accessModes'], 'journal_single_pod_access_required')
        if role == 'report':
            require(directory[1:3] == ['65532', '2770'] and file[1:3] == ['65532', '640'], 'report_group_permissions_required')
        statfs = lines[4].split(':')
        require(len(statfs) == 6 and all(re.fullmatch(r'[0-9]+', n) for n in statfs[:4]), 'invalid_statfs')
        block, blocks, available, free = map(int, statfs[:4])
        require(block > 0 and 0 <= available <= free <= blocks and block*blocks <= 9223372036854775807, 'invalid_statfs_range')
        require(block*available >= item['minimum_available_bytes'], 'insufficient_observed_available_space')
        require(self.get('pvc', item['pvc'])['metadata']['resourceVersion'] == pvc['metadata']['resourceVersion'] and
                self.get('pv', pv['metadata']['name'], True)['metadata']['resourceVersion'] == pv['metadata']['resourceVersion'], 'volume_binding_changed')
        return dict(role=role, pod_uid=item['pod_uid'], pvc_uid=item['pvc_uid'], pv_uid=item['pv_uid'],
                    backing_sha256=hashlib.sha256(json.dumps(backing, separators=(',', ':')).encode()).hexdigest(),
                    access_modes=pvc['spec']['accessModes'], mount_read_only=mount.get('readOnly', False), actual_mount_read_only=actual_readonly, sub_path=item['sub_path'], process_uid=int(lines[0]), process_gid=int(lines[1]),
                    directory_owner_mode=':'.join(directory[:3]), file_owner_mode=':'.join(file[:3]),
                    available_bytes=str(block*available), filesystem_bytes=str(block*blocks),
                    minimum_available_bytes=str(item['minimum_available_bytes']), physical_reservation_proven=False,
                    physical_backend_isolation_proven=False, atomic_replace_and_cross_pod_visibility_tested=False, single_writer_fencing_verified=False)

    def capacity(self):
        config = self.plan['capacity_input']
        target = self.plan['profiles']['collector']
        for role in ('data', 'report'):
            volume = self.plan['volumes'][role]
            require([volume[k] for k in ('pod','pod_uid','container')] ==
                    [target[k] for k in ('pod','pod_uid','container')], 'capacity_collector_volume_target_mismatch')
        pod = self.get('pod', target['pod'])
        container = next(c for c in pod['spec']['containers'] if c['name'] == target['container'])
        image_id = fingerprint(pod,target['container'])[-1]
        require(container['image'] == config['image'], 'capacity_collector_image_mismatch')
        require(pod['spec']['nodeName'] == config['mysql_node'], 'capacity_collector_node_mismatch')
        # Existing check mode computes under the collector's own DSN/UID; it
        # does not write report.json or open a journal. No binary is uploaded.
        check_raw = self.exec(target, ['/usr/local/bin/clawreef-system-backup-registration',
                                      '--capacity-config', '/run/system-backup/capacity-config/source.json',
                                      '--check-capacity-source'])
        checked = strict_json(check_raw)
        closed(checked, ('server_uuid','database','observed_at','allocated_bytes','available_bytes'))
        require(checked['server_uuid'] == self.plan['server_uuid'] and checked['database'] == self.plan['database'], 'collector_check_identity_mismatch')
        script = 'set -eu; head -c 65537 /run/system-backup/capacity-config/source.json; printf "\\nA_FIELD_CAPACITY_REPORT\\n"; head -c 4097 /run/system-backup/capacity/report.json'
        captured = self.exec(target, ['sh','-c',script,'a-field-capacity'])
        require(captured.count('\nA_FIELD_CAPACITY_REPORT\n') == 1, 'capacity_material_boundaries')
        source_raw,report_raw = captured.split('\nA_FIELD_CAPACITY_REPORT\n')
        require(len(source_raw.encode()) <= 65536 and len(report_raw.encode()) <= 4096, 'capacity_material_size')
        source,report = strict_json(source_raw),strict_json(report_raw)
        closed(source, ('server_uuid','database','user','data_directory','tables'))
        closed(report, ('server_uuid','database','observed_at','allocated_bytes','available_bytes'))
        for value in (source,report):
            require(value['server_uuid'] == self.plan['server_uuid'] and value['database'] == self.plan['database'], 'capacity_material_identity_mismatch')
        require(source['user'] == target['expected_user'], 'capacity_collector_user_mismatch')
        require(type(source['tables']) is list and set(source['tables']) <= set(target['tables']), 'collector_metadata_scope_incomplete')
        for value in (checked,report):
            require(all(type(value[k]) is int and 0 <= value[k] <= 9223372036854775807 for k in ('allocated_bytes','available_bytes')), 'capacity_integer_bytes_required')
        if 'dsn_env' in self.plan['observer']:
            native = self.native_dsn(self.plan['observer'],'identity')
            require(native['grants']==[] and native['metadata']==[],'native_identity_mode_widened')
            identity_raw = json.dumps(native['capacity_identity'],separators=(',',':'))+'\n'
        else:
            identity_raw = self.mysql(self.plan['observer'], "START TRANSACTION READ ONLY; SELECT JSON_OBJECT('server_uuid',@@server_uuid,'database',DATABASE(),'data_directory',@@datadir,'now',DATE_FORMAT(UTC_TIMESTAMP(6),'%Y-%m-%dT%H:%i:%s.%fZ')); ROLLBACK;\n")
        identity = strict_json(identity_raw)
        closed(identity, ('server_uuid','database','data_directory','now'))
        require(identity['server_uuid'] == self.plan['server_uuid'] and identity['database'] == self.plan['database'], 'capacity_observer_identity_mismatch')
        return dict(source_raw=source_raw,report_raw=report_raw,identity_raw=identity_raw,
                    declared_image=container['image'],observed_image_id=image_id,
                    collector_check_report=checked,collector_check_ran=True,report_written_by_probe=False,
                    original_source_bytes_preserved=True,source_sha256=hashlib.sha256(source_raw.encode()).hexdigest(),
                    report_sha256=hashlib.sha256(report_raw.encode()).hexdigest(),physical_reservation_proven=False)

    def collect(self):
        result = dict(kind=VERSION, status='BLOCKED', observed_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                      namespace=self.plan['namespace'], namespace_uid=self.plan['namespace_uid'], server_uuid=self.plan['server_uuid'],
                      database=self.plan['database'], profiles=[], materials=[], volumes=[], capacity=None, blockers=[],
                      cluster_mutated=False, database_mutated=False, dependencies_installed=False,
                      credentials_exported=False, production_approved=False, complete_field_acceptance=False)
        try:
            self.ns()
        except (ValueError, KeyError, StopIteration):
            result['blockers'].append('namespace_identity_unverified')
            return result
        observer = None
        try:
            observer = self.profile('observer', self.plan['observer'])
            result['profiles'].append(observer)
        except (ValueError, KeyError, StopIteration):
            result['blockers'].append('observer_sql_identity_grants_or_metadata_unverified')
        for role, target in self.plan['profiles'].items():
            try:
                item = self.profile(role, target)
                expected = [] if observer is None else [r for r in observer['metadata'] if r.get('kind') == 'routine' or r['table'] in target['tables'] or
                            (r.get('kind') in ('foreign_key', 'referential_rule') and r.get('referenced_table') in target['tables'])]
                item['metadata_matches_observer'] = observer is not None and item['metadata'] == expected
                # Keep completed public observations for diagnosis; a mismatch
                # remains BLOCKED and is never converted to an approved role.
                result['profiles'].append(item)
                require(item['active_role_none'], 'runtime_active_role_rejected')
                require(item['metadata_matches_observer'], 'runtime_metadata_differs_from_observer')
            except (ValueError, KeyError, StopIteration):
                result['blockers'].append(role + '_actual_connection_grants_or_metadata_unverified')
        for item in self.plan['materials']:
            try:
                observed=self.material(item)
                result['materials'].append(observed)
                require(observed['kind']!='ca_pem' or observed['not_expired_at_probe'],'public_ca_expired')
            except (ValueError, KeyError, StopIteration):
                result['blockers'].append('material_' + item['name'] + '_unverified')
        for role, item in self.plan['volumes'].items():
            try:
                result['volumes'].append(self.volume(role, item))
            except (ValueError, KeyError, StopIteration):
                result['blockers'].append(role + '_volume_identity_permissions_or_space_unverified')
        backings = [v['backing_sha256'] for v in result['volumes']]
        if len(backings) != 3 or len(set(backings)) != 3:
            result['blockers'].append('three_distinct_storage_backings_unverified')
        try:
            result['capacity'] = self.capacity()
        except (ValueError, KeyError, StopIteration):
            result['blockers'].append('capacity_collector_or_original_materials_unverified')
        try:
            final_observer = self.profile('observer', self.plan['observer'])
            require(observer is not None and observer['metadata'] == final_observer['metadata'] and
                    observer['direct_grants'] == final_observer['direct_grants'], 'observer_changed_during_collection')
        except (ValueError, KeyError, StopIteration):
            result['blockers'].append('final_observer_metadata_stability_unverified')
        try:
            self.ns()
        except (ValueError, KeyError):
            result['blockers'].append('final_namespace_identity_unverified')
        if not result['blockers']:
            result['status'] = 'READ_ONLY_FACTS_COLLECTED_REVIEW_REQUIRED'
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan')
    parser.add_argument('--check-plan', action='store_true')
    parser.add_argument('--stdin-plan', action='store_true')
    parser.add_argument('--embedded-plan', action='store_true')
    args = parser.parse_args()
    require(sum((bool(args.plan), args.stdin_plan, args.embedded_plan)) == 1)
    if args.embedded_plan:
        raw = globals().pop('A_FIELD_PLAN_JSON')
    else:
        raw = sys.stdin.read(1048577) if args.stdin_plan else open(args.plan, encoding='utf-8').read(1048577)
    plan = strict_json(raw)
    if args.check_plan:
        missing = validate_plan(plan, complete=False)
        if not missing:
            validate_plan(plan)
        print(json.dumps(dict(kind=VERSION, status='PLAN_INCOMPLETE' if missing else 'PLAN_READY', missing=missing,
                              cluster_contacted=False, database_contacted=False, production_approved=False)))
        return 2 if missing else 0
    validate_plan(plan)
    result = Probe(plan).collect()
    result['plan_sha256'] = hashlib.sha256(raw.encode('utf-8')).hexdigest()
    print(json.dumps(result, separators=(',', ':')))
    return 0 if not result['blockers'] else 2


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, KeyError, OSError, UnicodeError, RecursionError):
        print(json.dumps(dict(kind=VERSION, status='REJECTED', error='input_or_existing_tool_rejected',
                              production_approved=False)), file=sys.stderr)
        sys.exit(1)
