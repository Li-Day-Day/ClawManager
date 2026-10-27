import { useCallback, useEffect, useRef, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import BackupResults from './BackupResults';
import { systemBackupService, type BackupAvailability, type BackupKind, type BackupTask } from '../../services/systemBackupService';

const statuses: Record<string, string> = {
  pending: '等待执行', preparing: '准备中', ready_for_capture: '采集准备完成', acquiring_gate: '等待停写',
  capturing: '采集中', validating: '校验中', publishing: '封存中', finalization_unknown: '封存结果待核对',
  preflighting: '检查恢复条件', provisioning: '准备隔离资源', restoring: '恢复中', normalizing: '处理恢复配置',
  verifying: '校验恢复结果', running: '检查中', canceling: '正在取消并恢复源状态', succeeded: '完成', failed: '失败', canceled: '已取消',
};
const reasons: Record<string, string> = {
  control_database_not_configured: '尚未配置备份控制数据库', controller_unavailable: '备份控制器未就绪',
  not_ready: '当前依赖未就绪，暂不能执行', state_conflict: '任务状态已变化，请刷新后重试',
  writer_inventory_incomplete: '停写范围尚未核对完整', runtime_proof_unavailable: '运行时停止确认未就绪',
  artifact_provider_unavailable: '备份存储未就绪', policy_unavailable: '恢复配置规则未就绪',
  catalog_dependencies_unavailable: '目录存储、信任密钥或导入适配尚未就绪',
};
function message(error: unknown) {
  const code = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return code ? reasons[code] || code : '请求未完成，请刷新状态后重试。';
}
export default function SystemBackupPage() {
  const [availability, setAvailability] = useState<BackupAvailability | null>(null);
  const [tasks, setTasks] = useState<BackupTask[]>([]);
  const [profile, setProfile] = useState('');
  const [kind, setKind] = useState<BackupKind>('backup');
  const [acceptance, setAcceptance] = useState(false);
  const [artifact, setArtifact] = useState('');
  const [recordHash, setRecordHash] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [resultTask, setResultTask] = useState<BackupTask | null>(null);
  // Keep the same idempotency key after a lost response, until success or a new request.
  const attempt = useRef<{ request: string; key: string } | null>(null);
  const alive = useRef(true);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const info = await systemBackupService.profiles(signal);
    if (signal?.aborted || !alive.current) return;
    setAvailability(info);
    if (!info.reasons?.includes('control_database_not_configured')) {
      const list = await systemBackupService.list(signal);
      if (!signal?.aborted && alive.current) setTasks(list);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { await refresh(controller.signal); } catch (e) { if (!controller.signal.aborted) setError(message(e)); }
      if (!controller.signal.aborted) timeout = setTimeout(poll, 5000);
    };
    void poll();
    return () => { alive.current = false; controller.abort(); clearTimeout(timeout); };
  }, [refresh]);
  const chosen = availability?.profiles.find(p => p.id === profile);
  const supported = chosen?.ready && chosen.kinds.includes(kind) && (!acceptance || kind === 'backup' && !!chosen.acceptance_policy);
  const needsArtifact = kind === 'drill' || kind === 'preflight' || kind === 'catalog_import';
  const validHash = kind !== 'catalog_import' || /^[a-f0-9]{64}$/.test(recordHash.trim());
  const create = async () => {
    if (busy || !supported || !validHash || (needsArtifact && !artifact.trim())) return;
    setBusy(true); setError(''); setNotice('');
    const request: BackupTask['request'] = { kind, profile, purpose: acceptance ? 'acceptance' : 'functional_test', ...(acceptance ? { acceptance_policy: chosen?.acceptance_policy } : {}), ...(needsArtifact ? { artifact: artifact.trim() } : {}), ...(kind === 'catalog_import' ? { record_sha256: recordHash.trim() } : {}) };
    const serialized = JSON.stringify(request);
    try {
      if (attempt.current?.request !== serialized) {
        const key = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
        attempt.current = { request: serialized, key };
      }
      const task = await systemBackupService.create(request, attempt.current.key);
      if (alive.current) { setTasks(items => [task, ...items.filter(t => t.id !== task.id)]); setNotice(`任务已提交：${task.id}`); }
      attempt.current = null;
    } catch (e) { if (alive.current) setError(message(e)); }
    finally { if (alive.current) setBusy(false); }
  };
  const cancel = async (task: BackupTask) => {
    if (busy) return;
    setBusy(true); setError('');
    try { const next = await systemBackupService.cancel(task); if (alive.current) setTasks(items => items.map(t => t.id === next.id ? next : t)); }
    catch (e) { if (alive.current) setError(message(e)); }
    finally { if (alive.current) setBusy(false); }
  };
  return <AdminLayout title="用户与实例备份恢复"><div className="mx-auto max-w-6xl space-y-6 py-6">
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h1 className="text-xl font-semibold text-slate-900">用户与实例备份恢复</h1>
      <p className="mt-2 text-sm text-slate-600">备份全部用户与 Linux Lite / Pro 实例。恢复演练写入隔离环境，目标实例保持停止。当前不提供生产迁移执行。</p>
      {availability?.reasons?.map(r => <p key={r} className="mt-3 text-sm text-amber-800">{reasons[r] || r}</p>)}
      {availability && availability.profiles.length === 0 && !availability.reasons?.length && <p className="mt-3 text-sm text-amber-800">尚无可用执行配置，等待备份控制器完成初始化。</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-3 text-sm text-green-700">{notice}</p>}
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <label className="text-sm">执行配置<select aria-label="执行配置" className="mt-1 w-full rounded border p-2" value={profile} onChange={e => { setProfile(e.target.value); setAcceptance(false); }} disabled={busy}>
          <option value="">请选择</option>{availability?.profiles.map(p => <option key={p.id} value={p.id}>{p.id}{p.ready ? '' : '（未就绪）'}</option>)}
        </select></label>
        <label className="text-sm">操作<select aria-label="操作" className="mt-1 w-full rounded border p-2" value={kind} onChange={e => { setKind(e.target.value as BackupKind); setAcceptance(false); }} disabled={busy}>
          <option value="backup">创建备份</option><option value="drill">隔离恢复演练</option><option value="preflight">只读恢复检查</option>
          <option value="catalog_scan">扫描备份目录</option><option value="catalog_import">导入并校验目录记录</option>
        </select></label>
        {needsArtifact && <label className="text-sm">{kind === 'catalog_import' ? '目录注册标识' : '备份标识'}<input aria-label="备份标识" className="mt-1 w-full rounded border p-2" value={artifact} onChange={e => setArtifact(e.target.value)} maxLength={128} disabled={busy} /></label>}
        {kind === 'catalog_import' && <label className="text-sm">注册记录 SHA-256<input aria-label="注册记录 SHA-256" className="mt-1 w-full rounded border p-2 font-mono" value={recordHash} onChange={e => setRecordHash(e.target.value)} maxLength={64} disabled={busy} /></label>}
      </div>
      {kind === 'backup' && chosen?.acceptance_policy && <div className="mt-3 text-sm"><label><input type="checkbox" checked={acceptance} onChange={e => setAcceptance(e.target.checked)} disabled={busy} className="mr-2" />六域验收备份</label><p className="mt-1 text-slate-600">校验六域证据并发布验收结果；符合灾备条件后注册到备份目录。任务完成后请查看验收结果。</p></div>}
      {chosen?.reasons.map(r => <p key={r} className="mt-2 text-sm text-amber-800">{reasons[r] || r}</p>)}
      {kind === 'catalog_import' && <p className="mt-2 text-sm text-slate-600">验证备份内容并登记校验结果，不恢复业务数据或启动实例。</p>}
      <button type="button" onClick={() => void create()} disabled={busy || !supported || !validHash || (needsArtifact && !artifact.trim())} className="mt-5 rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40">{busy ? '处理中…' : '提交任务'}</button>
    </section>
    <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-4 font-semibold">最近任务</h2>
      {tasks.length === 0 ? <p className="text-sm text-slate-500">暂无任务。</p> : <table className="w-full text-left text-sm">
        <thead><tr className="border-b text-slate-500"><th className="pb-3">任务</th><th>类型</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
        <tbody>{tasks.map(t => <tr key={t.id} className="border-b last:border-0"><td className="py-3 font-mono text-xs">{t.id}</td><td>{t.request.purpose === 'acceptance' ? '六域验收备份' : { backup: '备份', drill: '恢复演练', preflight: '只读检查', catalog_scan: '目录扫描', catalog_import: '目录导入校验' }[t.request.kind]}</td><td>{statuses[t.status] || t.status}{t.failure_code && <div className="text-xs text-red-700">{reasons[t.failure_code] || t.failure_code}</div>}</td><td>{new Date(t.created_at).toLocaleString()}</td><td><button type="button" onClick={() => setResultTask(t)} className="mr-3 text-blue-700">结果</button>{t.can_cancel && <button type="button" disabled={busy} onClick={() => void cancel(t)} className="text-red-700 disabled:opacity-40">取消</button>}</td></tr>)}</tbody>
      </table>}
    </section>
    {resultTask && <BackupResults key={resultTask.id} task={resultTask} onClose={() => setResultTask(null)} onSelect={item => { setArtifact(item.id); setRecordHash(item.sha256); setKind('catalog_import'); setAcceptance(false); setProfile(resultTask.request.profile); setNotice('已填入注册记录，请选择支持目录导入的执行配置后提交校验。'); }} />}
  </div></AdminLayout>;
}
