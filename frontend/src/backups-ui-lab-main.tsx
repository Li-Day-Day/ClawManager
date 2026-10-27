import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from './contexts/I18nContext';
import BackupLiveWorkspace from './pages/admin/backups/BackupLiveWorkspace.tsx';
import { EvidenceDownloadForm } from './pages/admin/backups/BackupEvidenceDownload.tsx';
import { EvidenceDownloadError } from './pages/admin/backups/backupEvidenceDownload';
import type { EvidenceDownloadRequest } from './pages/admin/backups/backupEvidenceDownload';
import './index.css';

const evidenceID = 'sev_00000000-0000-4000-8000-000000000001';
const button = 'rounded border border-slate-300 bg-white px-3 py-2 text-sm';
function Lab() {
  const [epoch, setEpoch] = useState(0);
  const [scenario, setScenario] = useState('ready');
  const [remountOnChange, setRemountOnChange] = useState(true);
  const [metrics, setMetrics] = useState('');
  const [downloadMode, setDownloadMode] = useState('success');
  const [downloadEpoch, setDownloadEpoch] = useState(0);
  const [downloadMounted, setDownloadMounted] = useState(true);
  const [downloads, setDownloads] = useState(0);
  const [aborts, setAborts] = useState(0);
  useEffect(() => { localStorage.setItem('access_token','d-ui-lab-synthetic-session'); return () => localStorage.removeItem('access_token'); }, []);
  const change = async (next: string) => {
    const response = await fetch(`/__backup_ui_lab/control?scenario=${encodeURIComponent(next)}`, { method: 'POST' });
    if (!response.ok) throw new Error('fixture control failed');
    setScenario(next); if (remountOnChange) setEpoch(value => value + 1);
  };
  const download = async (_request: EvidenceDownloadRequest, signal: AbortSignal) => {
    signal.throwIfAborted(); setDownloads(value => value + 1);
    if (downloadMode === 'permission') throw new EvidenceDownloadError('permission');
    if (downloadMode === 'delayed') await new Promise<void>((resolve,reject) => {
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); },2500);
      const abort = () => { clearTimeout(timer); setAborts(value => value + 1); reject(new DOMException('Aborted','AbortError')); };
      signal.addEventListener('abort',abort,{ once: true });
    });
    signal.throwIfAborted();
    const bytes = new TextEncoder().encode('{"synthetic":true}\n');
    const digest = await crypto.subtle.digest('SHA-256',bytes); signal.throwIfAborted();
    return { evidenceId: evidenceID, operationId: null, sha256: [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2,'0')).join(''), filename:'d-ui-lab-synthetic.json', blob:new Blob([bytes],{ type:'application/json' }) };
  };
  return <main className="mx-auto max-w-6xl space-y-6 p-6">
    <h1 className="text-xl font-semibold">D 备份页面交互验收</h1>
    <p role="note">仅本机固定 HTTP 数据；复用正式 React 组件。这里的读取、会话和报告均为合成测试，不连接业务后端。</p>
    <section className="space-y-3 rounded border p-4"><label>接口场景 <select aria-label="接口场景" className={button} value={scenario} onChange={event => void change(event.target.value)}>
      {['ready','partial','unavailable','permission','delayed','stale','cross-installation','malformed'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="block"><input type="checkbox" checked={remountOnChange} onChange={event => setRemountOnChange(event.target.checked)} />切换场景时重建页面</label>
      <button className={button} onClick={() => void fetch('/__backup_ui_lab/metrics').then(response => response.json()).then(value => setMetrics(JSON.stringify(value)))}>读取请求统计</button>
      <output aria-label="请求统计" className="block break-all font-mono text-xs">{metrics}</output>
    </section>
    <BackupLiveWorkspace key={epoch} fallback={<p role="status">测试接口尚未就绪</p>} />
    <section className="space-y-3 rounded border p-4"><h2>下载组件测试</h2>
      <label>下载场景 <select aria-label="下载场景" value={downloadMode} className={button} onChange={event => { setDownloadMode(event.target.value); setDownloadEpoch(value => value + 1); }}>{['success','delayed','permission'].map(value => <option key={value}>{value}</option>)}</select></label>
      <button className={button} onClick={() => setDownloadMounted(value => !value)}>{downloadMounted ? '卸载下载组件' : '挂载下载组件'}</button>
      <button className={button} onClick={() => localStorage.setItem('access_token','d-ui-lab-changed-session')}>切换测试会话</button>
      <output aria-label="下载统计">请求 {downloads}；取消 {aborts}</output>
      {downloadMounted && <EvidenceDownloadForm key={downloadEpoch} installation="installation_preview" evidenceId={evidenceID} download={download} localTest />}
    </section>
  </main>;
}
if (!import.meta.env.DEV) throw new Error('The UI lab is development-only');
createRoot(document.getElementById('root')!).render(<I18nProvider><Lab /></I18nProvider>);
