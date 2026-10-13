import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { backupEntryPoints } from './backupReadModel';
import { createBackupLiveSource } from './backupLiveSource';
import type { BackupLiveData, BackupLiveState } from './backupLiveSource';
import { startBackupLivePolling } from './backupLivePolling';
import { useBackupText } from './useBackupText';
import { systemBackupReadService } from '../../../services/systemBackupReadService';

const liveSource = createBackupLiveSource(systemBackupReadService);
type TaskGroup = 'backups' | 'drills' | 'preflights' | 'verifications';

export default function BackupLiveWorkspace({ fallback }: { fallback: ReactNode }) {
  const { b, label, date, number } = useBackupText();
  const [state, setState] = useState<BackupLiveState | { kind: 'loading' }>({ kind: 'loading' });
  const [revision, setRevision] = useState(0);
  const [paging, setPaging] = useState<{ kind: TaskGroup; error: boolean } | null>(null);
  const pageController = useRef<AbortController | null>(null);

  const refresh = () => {
    pageController.current?.abort();
    pageController.current = null;
    setPaging(null);
    setState({ kind: 'loading' });
    setRevision((value) => value + 1);
  };

  const loadMore = (kind: TaskGroup) => {
    if (state.kind !== 'ready' || (paging?.kind === kind && !paging.error) || state.data[kind].next_cursor === null) return;
    const currentPage = state.data[kind];
    const controller = new AbortController();
    pageController.current?.abort();
    pageController.current = controller;
    setPaging({ kind, error: false });
    liveSource.loadMore(kind, currentPage, state.data.overview, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setState((current) => current.kind === 'ready' && current.data[kind] === currentPage
          ? { kind: 'ready', data: { ...current.data, [kind]: next } as BackupLiveData } : current);
        setPaging(null);
      }).catch(() => {
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

  const { overview, config, backups, drills, preflights, verifications } = state.data;
  const groups = [
    { key: 'backups', title: b('backups'), page: backups },
    { key: 'drills', title: b('drills'), page: drills },
    { key: 'preflights', title: b('preflights'), page: preflights },
    { key: 'verifications', title: b('entry_verification'), page: verifications },
  ] as const;

  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-slate-700">{b('overview')}</h2>
      <button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700" onClick={refresh}>{b('refresh')}</button></div>
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <div><span className="text-slate-500">{b('featureStatus')}</span><div className="mt-1 font-medium">{overview.effective_enabled ? b('enabled') : b('disabled')}</div></div>
        <div><span className="text-slate-500">{b('activeTasks')}</span><div className="mt-1 font-medium">{number(overview.active_task_count)}</div></div>
        <div><span className="text-slate-500">{b('activeOperations')}</span><div className="mt-1 font-medium">{number(overview.active_operation_count)}</div></div>
        <div><span className="text-slate-500">{b('liveObservedAt')}</span><div className="mt-1 font-medium">{date(overview.observed_at)}</div></div>
      </div>
    </section>
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold text-slate-900">{b('config')}</h2>
      <div className="mt-4 flex flex-wrap gap-6 text-sm"><div><span className="text-slate-500">{b('configVersion')}</span><div>v{number(config.version)}</div></div>
        <div><span className="text-slate-500">{b('activation')}</span><div>{config.active ? b('activated') : b('notActivated')}</div></div></div>
    </section>
    {groups.map((group) => <section key={group.key} className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-2"><h2 className="font-semibold text-slate-900">{group.title}</h2><span className="text-sm text-slate-500">{b('itemCount', { count: number(group.page.items.length) })}</span></div>
      {group.page.items.length === 0 && group.page.next_cursor === null ? <p className="mt-4 text-sm text-slate-500">{b('noRecords')}</p>
        : <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-slate-200 text-slate-500"><th scope="col" className="py-2 pr-4 font-medium">ID</th><th scope="col" className="py-2 font-medium">{b('executionStatus')}</th></tr></thead>
          <tbody>{group.page.items.map((item) => <tr key={item.public_id} className="border-b border-slate-100"><td className="py-2 pr-4 font-mono text-xs">{item.public_id}</td><td className="py-2">{label(item.status)}</td></tr>)}</tbody></table></div>}
      {group.page.next_cursor !== null && <div className="mt-4"><button type="button" disabled={paging?.kind === group.key && !paging.error}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-50" onClick={() => loadMore(group.key)}>{paging?.kind === group.key && !paging.error ? b('loadingMore') : b('loadMore')}</button>
        {paging?.kind === group.key && paging.error && <p className="mt-2 text-sm text-red-700" role="alert">{b('readError')}</p>}</div>}
    </section>)}
    <section className="grid gap-3 sm:grid-cols-3">{backupEntryPoints.filter((entry) => ['catalog', 'retention', 'baseline'].includes(entry.tab)).map((entry) =>
      <div key={entry.tab} className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="text-sm font-semibold text-slate-800">{b(entry.label)}</h2><p className="mt-2 text-xs text-slate-500">{b('comingSoon')}</p></div>)}</section>
  </div>;
}
