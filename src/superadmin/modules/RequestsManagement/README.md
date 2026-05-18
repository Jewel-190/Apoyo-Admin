# Superadmin · Requests management

This module is the **canonical reference** for any future superadmin
module that needs to manipulate cross-cutting data. It demonstrates:

- Reading the unified `requests_v` view via
  `shared/data/requests.js → listRequestsView`.
- Writing across all eight `*_requests` tables via
  `shared/data/adminRequestOps.js → adminRequest`, which calls the
  `admin_request_op` RPC (SECURITY DEFINER, gated by
  `is_superadmin(auth.uid())`).
- Composing UI with `shared/components/{DataTable, FormShell,
  StatusBadge}`.
- Sourcing service metadata from `shared/domain/services.js`.

## Files

| File | Role |
| --- | --- |
| `RequestsManagementPage.jsx` | List + filter + open-edit-modal. |
| `EditRequestModal.jsx` | Per-request status / fields / delete via the RPC. |
| `index.js` | Barrel. |

## Wiring it into the app

This module ships **unwired** because both `SuperadminRoutes.jsx` and
`components/Sidebar.jsx` have heavy uncommitted edits in this repo and
auto-editing them would conflict. To enable the route:

1. In `src/superadmin/SuperadminRoutes.jsx`:

   ```jsx
   import { RequestsManagementPage } from "./modules/RequestsManagement";

   // inside <Routes> (alongside the other module routes):
   <Route path="requests-management" element={<RequestsManagementPage />} />
   ```

2. In `src/superadmin/components/Sidebar.jsx`, add to `navTree`:

   ```js
   { path: "/superadmin/requests-management", label: "Requests", kind: "leaf" },
   ```

3. Apply migration `supabase/migrations/202605090001_safe_facade.sql`
   to the linked Supabase project. Until that runs, the
   `requests_v` view and `admin_request_op` RPC do not exist and this
   module will error on first load.

## Pre-flight before exposing it to users

- [ ] Confirm the calling user has `admins.role = 'super_admin'` (other
      roles will hit `42501` from the RPC's permission check).
- [ ] Smoke-test each operation type (insert, update, delete,
      transition_status) in a non-prod project first.
- [ ] Verify `audit_logs` rows are written with action codes
      (`INSERT` / `UPDATE` / `DELETE` / `STATUS_CHANGE`) by your
      operations.

## Pattern to copy for new superadmin modules

When you build the next module (e.g. "User profiles management" or
"System-wide attachment audit"):

1. Add a corresponding read view in a new migration if the data
   crosses tables.
2. Add a corresponding `*_op` RPC if writes need to be cross-cutting.
3. Mirror this module's folder structure: `<ModuleName>Page.jsx` for
   the list/filter UI, an edit modal that uses `FormShell`, an
   `index.js` barrel, and a README.
