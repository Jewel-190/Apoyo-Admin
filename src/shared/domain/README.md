# src/shared/domain

This folder is **synced from `ApoyoMobile/shared/domain/`**. Do not
edit any of the files here directly — make changes in the mobile repo
and run `scripts/sync-shared.ps1` from there to refresh.

The folder must stay platform-agnostic — no `react-native`,
no `expo-*`, no DOM, no Vite-specific imports. Pure data + functions
only.

| File | Purpose |
| ---- | ------- |
| `requestTables.js` | Eight `*_requests` table names. |
| `status.js` | DB ↔ UI status mapping; `normalizeStatus`, labels. |
| `fileTypes.js` | UI slot ↔ DB `file_type` map per table. |
| `services.js` | Canonical service registry. |
| `index.js` | Barrel. |
