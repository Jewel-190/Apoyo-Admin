# `src/shared/` — modular refactor surface

Phase 6 / Phase 7 of the cross-repo modular refactor (see
`ApoyoMobile/REFACTOR.md` for the full picture). Adds a domain-and-data
layer to the admin app that:

1. Mirrors `ApoyoMobile/shared/domain/` 1:1 (services registry, status,
   file types, table names) so both apps speak the same vocabulary.
2. Provides `data/requests.js` and `data/adminRequestOps.js` for new
   superadmin code that needs cross-cutting reads / writes via the new
   `requests_v` view and `admin_request_op` RPC.
3. Provides three reusable UI primitives (`DataTable`, `FormShell`,
   `StatusBadge`) for future superadmin modules. These are NOT
   required for the existing admin pipeline screens.

## Folder layout

```
src/shared/
├── components/            ProtectedRoute (existing) + new primitives
│   ├── DataTable.jsx
│   ├── FormShell.jsx
│   └── StatusBadge.jsx
├── config/                Existing roleConfig.js. Untouched.
├── context/               Existing AuthContext.jsx. Untouched.
├── data/                  NEW
│   ├── requests.js
│   ├── adminRequestOps.js
│   └── index.js
├── domain/                NEW — synced from mobile
│   ├── requestTables.js
│   ├── status.js
│   ├── fileTypes.js
│   ├── services.js
│   └── README.md
├── lib/                   Existing helpers (requestData, requestDbStatus,
│                          supabaseClient, etc.). Untouched.
└── README.md              ← you are here
```

## Important: existing admin pipeline screens

`admin/modules/Applications/*` and `admin/modules/ForApproval/*` use
`shared/lib/requestData.js` which iterates over the per-role table
list from `shared/config/roleConfig.js`. **They are not migrated to the
new `shared/data/requests.js` API in this pass** because:

- The role-scoped iteration is the entire point of the admin
  experience (a medical admin only sees medical tables, etc.).
- The new `requests_v` view is more useful for cross-cutting
  superadmin reads than for role-scoped admin reads.

When a regular admin screen genuinely needs a cross-cutting read,
prefer `listRequestsView` from `shared/data/requests.js`. For now,
keep using `fetchApplicationsBySources` from `shared/lib/requestData.js`.

## Cross-cutting writes: which API to use

| Caller | API | Notes |
| ---- | ---- | ---- |
| Regular admin pipeline screen | `supabase.from(application.sourceTable).update(...)` (existing pattern) | Per-table RLS applies. |
| Superadmin "manipulate any request" UI | `adminRequest.update(serviceType, requestId, patch)` from `shared/data/adminRequestOps.js` | Backed by `admin_request_op` RPC; SECURITY DEFINER, gated by `is_superadmin(auth.uid())`. Always writes `audit_logs`. |

## Sync

Run `scripts/sync-shared.ps1` from the **mobile** repo to refresh
`src/shared/domain/` from the canonical source. The script refuses to
overwrite if you have uncommitted changes in that path.
