# `src/shared/` — shared admin surface

Cross-cutting code used by both the line-admin and superadmin apps.

1. Mirrors `ApoyoMobile/shared/domain/` 1:1 (services registry, status,
   file types, table names) so both apps speak the same vocabulary.
2. Loads the live assistance catalog via `data/adminCatalog.js` for
   AuthContext role/theme scoping.
3. Provides shared route guards and loading UI
   (`ProtectedRoute`, `WorkspaceLoadingScreen`).

## Folder layout

```
src/shared/
├── components/            ProtectedRoute, WorkspaceLoadingScreen
├── config/                roleConfig.js
├── context/               AuthContext.jsx
├── data/
│   └── adminCatalog.js    Catalog snapshot for auth / line scope
├── domain/                Synced from mobile
│   ├── requestTables.js
│   ├── status.js
│   ├── fileTypes.js
│   ├── services.js
│   └── README.md
├── lib/                   Helpers (requestData, supabaseClient, etc.)
└── README.md              ← you are here
```

## Sync

Run `scripts/sync-shared.ps1` from the **mobile** repo to refresh
`src/shared/domain/` from the canonical source. The script refuses to
overwrite if you have uncommitted changes in that path.
