import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { createBackupPreview } from './src/pages/admin/backups/backupPreview.ts';

// Loopback-only disposable HTTP fixture for real React components. No proxy,
// production backend, credentials, provider or mutation implementation.
const fixture = createBackupPreview('ready');
fixture.overview.effective_enabled = false;
const values = JSON.parse(fs.readFileSync(new URL('../contracts/system-backup/v12/admin-control-redacted-examples.json', import.meta.url), 'utf8')).config_update_request.config;
const paths = { 'system-backups': 'backups', 'system-restore-drills': 'drills', 'system-backup-preflights': 'preflights', 'system-backup-artifact-verifications': 'verifications' } as const;
let scenario = 'ready';
const metrics = { requests: 0, details: 0, abortedDetails: 0, activeDetails: 0 };

export default defineConfig({
  css: { postcss: { plugins: [tailwindcss({ content: [path.join(path.dirname(fileURLToPath(import.meta.url)), 'src/**/*.{js,ts,jsx,tsx}')] }), autoprefixer()] } },
  plugins: [react(), {
    name: 'd-backups-ui-http-fixture',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        const send = (body: unknown, status = 200) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('X-System-Backup-Data-Source', 'live'); res.end(JSON.stringify(body)); };
        if (url.pathname === '/__backup_ui_lab/control' && req.method === 'POST') {
          const nextScenario = url.searchParams.get('scenario') ?? '';
          if (!['ready','partial','unavailable','permission','delayed','stale','cross-installation','malformed'].includes(nextScenario)) { send({ code: 'invalid_scenario' },400); return; }
          scenario = nextScenario; send({ scenario }); return;
        }
        if (url.pathname === '/__backup_ui_lab/metrics') { send({ ...metrics, scenario }); return; }
        if (!url.pathname.startsWith('/api/v1/')) { next(); return; }
        metrics.requests++;
        if (req.method !== 'GET') { send({ code: 'permission_denied' },403); return; }
        if (scenario === 'permission') { send({ code: 'permission_denied' },403); return; }
        if (scenario === 'unavailable') { send({ code: 'not_ready' },503); return; }
        const resource = url.pathname.slice('/api/v1/admin/'.length).split('/');
        if (resource[0] === 'system-backup-overview') { send(scenario === 'partial' ? { code: 'not_ready' } : fixture.overview, scenario === 'partial' ? 503 : 200); return; }
        if (resource[0] === 'system-backup-config') { send({ schema_version: 'system-backup-config.v1', origin_installation_id: fixture.overview.origin_installation_id, version: fixture.overview.config_version, row_version: 1, active: true, effective_enabled: false, config: values, created_by: '42', change_reason: null, created_at: '2026-10-12T00:00:00Z' }); return; }
        const kind = paths[resource[0] as keyof typeof paths];
        if (kind && resource.length === 1) {
          send({ items: fixture[kind].map(detail => ({ ...detail.task, row_version: scenario === 'stale' ? 2 : detail.task.row_version })), next_cursor: null, consistency: 'stable_cutoff' }); return;
        }
        if (kind && resource.length === 2) {
          const detail = structuredClone(fixture[kind].find(value => value.task.public_id === resource[1]));
          if (!detail) { send({ code: 'not_found' },404); return; }
          metrics.details++;
          if (scenario === 'cross-installation') detail.task.origin_installation_id = 'installation_other';
          if (scenario === 'malformed') { send({ task: detail.task }); return; }
          if (scenario !== 'delayed') { send(detail); return; }
          metrics.activeDetails++;
          let finished = false;
          const timer = setTimeout(() => { finished = true; metrics.activeDetails--; send(detail); }, 2500);
          res.on('close', () => { if (!finished) { clearTimeout(timer); metrics.abortedDetails++; metrics.activeDetails--; } });
          return;
        }
        send({ code: 'not_ready' },503);
      });
    },
  }],
  define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1'), 'import.meta.env.VITE_SYSTEM_BACKUP_EVIDENCE_DOWNLOAD': JSON.stringify('0') },
  cacheDir: process.env.BACKUPS_UI_LAB_CACHE || 'node_modules/.backups-ui-lab-cache',
  server: { host: '127.0.0.1', port: 19034, strictPort: true },
});
