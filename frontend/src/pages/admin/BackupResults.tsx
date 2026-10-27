import { useEffect, useState } from 'react';
import { systemBackupService, type BackupTask, type BackupReport, type CatalogView, type CatalogItem } from '../../services/systemBackupService';

export default function BackupResults({ task, onSelect, onClose }: { task: BackupTask; onSelect: (item: CatalogItem) => void; onClose: () => void }) {
  const [report, setReport] = useState<BackupReport | null>(null);
  const [page, setPage] = useState<CatalogView | null>(null);
  const [detail, setDetail] = useState<CatalogItem | null>(null);
  const [cursors, setCursors] = useState(['']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      try {
        const result = await systemBackupService.report(task.id, abort.signal);
        if (abort.signal.aborted) return;
        setReport(result);
        if (result.scan?.complete) {
          const data = await systemBackupService.catalog(task.id, cursors[cursors.length - 1], abort.signal);
          if (!abort.signal.aborted) setPage(data);
        }
      } catch { if (!abort.signal.aborted) setError('结果尚未就绪或读取失败，请关闭后重试。'); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    })();
    return () => abort.abort();
  }, [task.id, cursors]);
  useEffect(() => {
    if (!selected) return;
    const abort = new AbortController();
    void systemBackupService.catalogRecord(task.id, selected, abort.signal).then(data => {
      if (!abort.signal.aborted) setDetail(data);
    }).catch(() => { if (!abort.signal.aborted) setError('记录详情读取失败。'); });
    return () => abort.abort();
  }, [selected, task.id]);
  const changePage = (next: string[]) => {
    setLoading(true); setError(''); setPage(null); setDetail(null); setSelected(null);
    setCursors(next);
  };
  const selectRecord = (item: CatalogItem) => {
    setError(''); setDetail(null); setSelected({ ...item });
  };
  const download = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `backup-report-${task.id}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="rounded-xl border border-slate-200 bg-white p-6" aria-label="备份任务结果">
    <div className="flex items-center justify-between"><h2 className="font-semibold">任务结果</h2><button type="button" onClick={onClose}>关闭</button></div>
    <p className="mt-2 break-all font-mono text-xs">{task.id}</p>
    <p className="mt-2 text-sm text-slate-600">这里显示本次任务的历史结果。恢复前仍须重新校验备份完整性和删除状态。</p>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    {loading && <p role="status" className="mt-2 text-sm">正在读取…</p>}
    {report && <div className="mt-3 space-y-2 text-sm">
      {report.kind === 'catalog_import' && <p>内容校验：{report.verified ? '本次任务已通过' : '尚未通过'}；记录：{report.record_id}</p>}
      {report.acceptance && <p>六域验收：{report.acceptance.local_acceptance ? '符合灾备条件' : '未达到灾备条件'}；目录：{report.acceptance.registered ? `已注册 ${report.record_id}` : '未注册'}。</p>}
      {report.failure_code && <p>失败代码：{report.failure_code}</p>}
      {report.scan && <p>目录扫描：{report.scan.complete ? '完整扫描已完成' : '尚未完整完成'}，已记录 {report.scan.count} 条事件。</p>}
      <button type="button" onClick={download} disabled={loading} className="text-blue-700 disabled:opacity-40">下载脱敏报告</button>
    </div>}
    {page && <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-sm"><thead><tr><th>记录</th><th>类型</th><th>源备份</th><th>操作</th></tr></thead>
        <tbody>{page.items.map(item => <tr key={`${item.type}/${item.id}`} className="border-t"><td className="py-2 font-mono text-xs">{item.id}</td><td>{item.type === 'artifact_registered' ? '注册记录' : '删除记录'}</td><td>{item.backup || '—'}</td><td><button type="button" onClick={() => selectRecord(item)} className="text-blue-700">查看详情</button></td></tr>)}</tbody>
      </table>
      {page.items.length === 0 && <p className="py-3 text-sm">目录中没有记录。</p>}
      <div className="mt-3 flex gap-4"><button type="button" disabled={loading || cursors.length < 2} onClick={() => changePage(cursors.slice(0, -1))} className="disabled:opacity-40">上一页</button><button type="button" disabled={loading || !page.next} onClick={() => changePage([...cursors, page.next!])} className="disabled:opacity-40">下一页</button></div>
    </div>}
    {detail && <div className="mt-4 space-y-2 rounded bg-slate-50 p-4 text-sm">
      <p className="break-all">记录：{detail.id}</p><p className="break-all font-mono text-xs">SHA-256：{detail.sha256}</p>
      {detail.origin && <p>来源：{detail.origin}；部署类型：{detail.matrix}；尝试次数：{detail.attempt}</p>}
      {(detail.decision_time || detail.deleted_at) && <p>记录时间：{new Date(detail.decision_time || detail.deleted_at || 0).toLocaleString()}</p>}
      {detail.type === 'artifact_registered' && <button type="button" onClick={() => onSelect(detail)} className="text-blue-700">填入导入校验表单</button>}
    </div>}
  </section>;
}
