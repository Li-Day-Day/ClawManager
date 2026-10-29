# Team-source integration harnesses

Source: `5874d7d7`. See `docs/system-backup-d-team-companion-review-20261029.md` for accepted scope and current controller/API differences.

- `backup-integration-pages.test.mjs`: browser/UI with HTTP fixtures; no real backup proof. Run from `e2e` with existing Playwright/browser and frontend dependencies.
- `backup-team-integration/check.py`: explicit disposable MySQL/schema/storage stages; its import profile targets the historical d3c5715a schema, not a 4fe83bcd live installation. Inspect `--help` and ownership requirements before use.
- owner-team, Runtime, presence, workspace and OpenClaw harnesses require their named disposable containers/images and platform fixtures. They are not automatically executed by CI and must never be pointed at a production database.

This supplement checked syntax and reviewed boundaries. It did not run these native/browser acceptance scenarios. The legacy Team backup controller remains disabled in the unified application.