import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { backupEntryPoints } from './backupReadModel';
import { createBackupLiveSource } from './backupLiveSource';
import type { BackupLiveData, BackupLiveState } from './backupLiveSource';
import { startBackupLivePolling } from './backupLivePolling';
import { useBackupText } from './useBackupText';
import { systemBackupReadService } from '../../../services/systemBackupReadService';
import BackupLiveDetail from './BackupLiveDetail';
import type { BackupDetailSelection } from './backupLiveDetail';
import BackupLiveConfigHistory from './BackupLiveConfigHistory';
import BackupOverviewReadout from './BackupOverviewReadout';

const liveSource = createBackupLiveSource(systemBackupReadService);
type TaskGroup = 'backups' | 'drills' | 'preflights' | 'verifications';

export default function BackupLiveWorkspace({ fallback }: { fallback: ReactNode }) {
  const { b, label, number } = useBackupText();
  const [state, setState] = useState<BackupLiveState | { kind: 'loading' }>({ kind: 'loading' });
  const [revision, setRevision] = useState(0);
  const [paging, setPaging] = useState<{ kind: TaskGroup; error: boolean } | null>(null);
  const [selected, setSelected] = useState<BackupDetailSelection | null>(null);
  const [configHistoryOpen, setConfigHistoryOpen] = useState(false);
  const pageController = useRef<AbortController | null>(null);

  const refresh = () => {
    pageController.current?.abort();
    pageController.current = null;
    setPaging(null);
    setSelected(null);
    setState({ kind: 'loading' });
    setRevision((value) => value + 1);
  };

  const loadMore = (kind: TaskGroup) => {
    if ((state.kind !== 'ready' && state.kind !== 'records') || (paging?.kind === kind && !paging.error)) return;
    const baseline = state;
    const resource = baseline.kind === 'records' ? baseline.data[kind] : null;
    const currentPage = baseline.kind === 'ready' ? baseline.data[kind] : resource?.kind === 'ready' ? resource.value : null;
    if (currentPage === null || currentPage.next_cursor === null) return;
    const controller = new AbortController();
    pageController.current?.abort();
    pageController.current = controller;
    setPaging({ kind, error: false });
    const operation = baseline.kind === 'ready'
      ? liveSource.loadMore(kind, currentPage, baseline.data.overview, controller.signal).then((next) => {
        if (controller.signal.aborted) return;
        setState((current) => current.kind === 'ready' && current.data[kind] === currentPage
          ? { kind: 'ready', data: { ...current.data, [kind]: next } as BackupLiveData } : current);
      })
      : liveSource.loadMoreRecords(kind, baseline.data, controller.signal).then((next) => {
        if (controller.signal.aborted) return;
        setState((current) => current.kind === 'records' && current.data === baseline.data ? { kind: 'records', data: next } : current);
      });
    operation.then(() => { if (!controller.signal.aborted) setPaging(null); }).catch(() => {
        if (!controller.signal.aborted) setPaging({ kind, error: true });
      });
  };

  useEffect(() => {
    const polling = startBackupLivePolling(liveSource, setState, () => {
      pageController.current?.abort();
      pageController.current = null;
      setPaging(null);
    }, () => !document.hidden);
    const resume = () => polling.wake();
    document.addEventListener('visibilitychange', resume);
    return () => {
      polling.stop();
      document.removeEventListener('visibilitychange', resume);
      pageController.current?.abort();
    };
  }, [revision]);

  if (state.kind === 'unavailable') return <>{fallback}</>;
  if (state.kind === 'loading') return <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500" role="status" aria-busy="true">{b('loading')}</div>;
  if (state.kind === 'error') return <div className="rounded-xl border border-red-200 bg-red-50 p-6" role="alert">
    <h2 className="font-medium text-red-800">{b('loadFailed')}</h2>
    <p className="mt-2 text-sm text-red-700">{b('readError')}</p>
    <button type="button" className="mt-4 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-800" onClick={refresh}>{b('retry')}</button>
  </div>;

  const dataState = state;
  const overview = dataState.kind === 'ready' ? dataState.data.overview : null;
  const config = dataState.kind === 'ready' ? dataState.data.config : dataState.data.config.kind === 'ready' ? dataState.data.config.value : null;
  const installation = dataState.kind === 'ready' ? dataState.data.overview.origin_installation_id : dataState.data.origin_installation_id;
  const pageOf = (kind: TaskGroup) => {
    if (dataState.kind === 'ready') return dataState.data[kind];
    const resource = dataState.data[kind];
    return resource.kind === 'ready' ? resource.value : null;
  };
  const selectedPage = selected === null ? null : pageOf(selected.kind);
  const selectedTask = selectedPage?.items.find((item) =>
    selected !== null &&
    item.public_id === selected.public_id && item.origin_installation_id === selected.origin_installation_id);
  const detailSelection = selected === null || selectedPage === null ? null : {
    ...selected, row_version: Math.max(selected.row_version, selectedTask?.row_version ?? selected.row_version),
  };
  const groups = [
    { key: 'backups', title: b('backups'), page: pageOf('backups') },
    { key: 'drills', title: b('drills'), page: pageOf('drills') },
    { key: 'preflights', title: b('preflights'), page: pageOf('preflights') },
    { key: 'verifications', title: b('entry_verification'), page: pageOf('verifications') },
  ] as const;

  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-slate-700">{overview === null ? b('recordReads') : b('overview')}</h2>
      <button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700" onClick={refresh}>{b('refresh')}</button></div>
    {overview === null ? <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{b('recordsOverviewUnavailable')}</p>
      : <BackupOverviewReadout overview={overview} />}
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold text-slate-900">{b('config')}</h2>
      {config === null ? <p role="status" className="mt-4 text-sm text-slate-500">{b('readResourceUnavailable')}</p> : <><div className="mt-4 flex flex-wrap gap-6 text-sm"><div><span className="text-slate-500">{b('configVersion')}</span><div>v{number(config.version)}</div></div>
        <div><span className="text-slate-500">{b('activation')}</span><div>{config.active ? b('activated') : b('notActivated')}</div></div></div>
      <button type="button" className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
        aria-expanded={configHistoryOpen} onClick={() => setConfigHistoryOpen((value) => !value)}>{configHistoryOpen ? b('configHistoryClose') : b('configHistoryOpen')}</button>
      {configHistoryOpen && <BackupLiveConfigHistory key={`${config.origin_installation_id}:${config.version}:${config.row_version}:${config.effective_enabled}`} baseline={config} />}</>}
    </section>
    {detailSelection !== null && detailSelection.origin_installation_id === installation && <BackupLiveDetail
      key={`${detailSelection.kind}:${detailSelection.public_id}:${detailSelection.origin_installation_id}:${detailSelection.row_version}`} selection={detailSelection} close={() => setSelected(null)} />}
    {groups.map((group) => { const page = group.page; return <section key={group.key} className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-2"><h2 className="font-semibold text-slate-900">{group.title}</h2>{page !== null && <span className="text-sm text-slate-500">{b('itemCount', { count: number(page.items.length) })}</span>}</div>
      {page === null ? <p role="status" className="mt-4 text-sm text-slate-500">{b('readResourceUnavailable')}</p> : <>
      {page.items.length === 0 && page.next_cursor === null ? <p className="mt-4 text-sm text-slate-500">{b('noRecords')}</p>
        : <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-slate-200 text-slate-500"><th scope="col" className="py-2 pr-4 font-medium">ID</th><th scope="col" className="py-2 font-medium">{b('executionStatus')}</th></tr></thead>
          <tbody>{page.items.map((item) => <tr key={item.public_id} className="border-b border-slate-100"><td className="py-2 pr-4 font-mono text-xs"><button
            type="button" className="break-all text-left text-rose-700 underline decoration-rose-200 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
            aria-label={`${b('detailOpen')} ${item.public_id}`} aria-expanded={selected?.kind === group.key && selected.public_id === item.public_id}
            aria-controls={selected?.kind === group.key && selected.public_id === item.public_id ? 'system-backup-live-detail' : undefined}
            onClick={() => setSelected({ kind: group.key, public_id: item.public_id, origin_installation_id: item.origin_installation_id, row_version: item.row_version })}>{item.public_id}</button></td><td className="py-2">{label(item.status)}</td></tr>)}</tbody></table></div>}
      {page.next_cursor !== null && <div className="mt-4"><button type="button" disabled={paging?.kind === group.key && !paging.error}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-50" onClick={() => loadMore(group.key)}>{paging?.kind === group.key && !paging.error ? b('loadingMore') : b('loadMore')}</button>
        {paging?.kind === group.key && paging.error && <p className="mt-2 text-sm text-red-700" role="alert">{b('readError')}</p>}</div>}</>}
    </section>; })}
    <section className="grid gap-3 sm:grid-cols-3">{backupEntryPoints.filter((entry) => ['catalog', 'retention', 'baseline'].includes(entry.tab)).map((entry) =>
      <div key={entry.tab} className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="text-sm font-semibold text-slate-800">{b(entry.label)}</h2><p className="mt-2 text-xs text-slate-500">{b('comingSoon')}</p></div>)}</section>
  </div>;
}
