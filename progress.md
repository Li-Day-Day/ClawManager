# ClawManager Progress

## 2026-08-11 — Workbuddy/Codex dual runtime variants

- Added `runtime_variant` (`linux` or `windows`) to system image settings, with a forward-compatible migration and legacy image backfill.
- Kept one configuration and creation entry for each agent while allowing administrators to select the runtime variant explicitly.
- Linux Workbuddy and Codex use Webtop on port `3001`, mount persistent storage at `/config`, and expose the workspace browser.
- Windows Workbuddy and Codex use the VM runtime on port `8006`, mount the VM disk at `/storage`, and keep the Linux workspace browser disabled.
- Creation now sends the configured variant instead of hardcoding Codex as Windows; legacy rows still infer a safe variant from their image and mount path.
- Added backend and frontend contract coverage for variant selection, orchestration, proxy behavior, and workspace eligibility.
- Fixed Linux Workbuddy/Codex type selection so the Medium resource preset no longer overwrites the user-entered instance name and description.
