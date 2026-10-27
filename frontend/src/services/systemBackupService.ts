import api from './api';
export type BackupKind = 'backup' | 'drill' | 'preflight' | 'catalog_scan' | 'catalog_import';
export interface BackupReference { id: string; version: string; sha256: string }
export interface BackupProfile { id: string; kinds: BackupKind[]; ready: boolean; reasons: string[]; acceptance_policy?: BackupReference }
export interface BackupTask {
  id: string;
  request: { kind: BackupKind; profile: string; artifact?: string; record_sha256?: string; purpose: 'functional_test' | 'acceptance'; acceptance_policy?: BackupReference };
  status: string; can_cancel: boolean; row_version: number; created_at: number; deadline: number; failure_code?: string;
}
export interface BackupAvailability { profiles: BackupProfile[]; reasons?: string[]; production_restore: false }
export interface CatalogItem { id: string; type: 'artifact_registered' | 'artifact_deleted'; sha256: string; backup?: string; origin?: string; matrix?: string; attempt?: number; decision_time?: number; deleted_at?: number }
export interface CatalogView { scan_id: string; complete: boolean; count: number; snapshot_sha256: string; items: CatalogItem[]; next?: string }
export interface BackupReport { version: string; task_id: string; kind: BackupKind; status: string; failure_code?: string; created_at: number; record_id?: string; record_sha256?: string; verified: boolean; restore_authorized: false; scan?: CatalogView; acceptance?: { local_acceptance: boolean; registered: boolean } }
const prefix = '/admin/system-backup';
export const systemBackupService = {
  profiles: async (signal?: AbortSignal): Promise<BackupAvailability> => (await api.get(`${prefix}/profiles`, { signal })).data.data,
  list: async (signal?: AbortSignal): Promise<BackupTask[]> => (await api.get(`${prefix}/tasks`, { signal })).data.data.items,
  create: async (request: BackupTask['request'], key: string): Promise<BackupTask> =>
    (await api.post(`${prefix}/tasks`, request, { headers: { 'Idempotency-Key': key } })).data.data,
  cancel: async (task: BackupTask): Promise<BackupTask> =>
    (await api.post(`${prefix}/tasks/${encodeURIComponent(task.id)}/cancel`, {}, { headers: { 'If-Match': String(task.row_version) } })).data.data,
  catalog: async (id: string, cursor: string, signal?: AbortSignal): Promise<CatalogView> =>
    (await api.get(`${prefix}/tasks/${encodeURIComponent(id)}/catalog`, { params: { cursor, limit: 50 }, signal })).data.data,
  catalogRecord: async (id: string, item: CatalogItem, signal?: AbortSignal): Promise<CatalogItem> =>
    (await api.get(`${prefix}/tasks/${encodeURIComponent(id)}/catalog/${encodeURIComponent(item.id)}`, { params: { type: item.type }, signal })).data.data,
  report: async (id: string, signal?: AbortSignal): Promise<BackupReport> =>
    (await api.get(`${prefix}/tasks/${encodeURIComponent(id)}/report`, { signal })).data.data,
};
