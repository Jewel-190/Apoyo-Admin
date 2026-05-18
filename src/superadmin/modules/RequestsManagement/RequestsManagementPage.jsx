/**
 * Superadmin "manipulate any request" reference module.
 *
 * Lists every request across the eight per-service tables via the
 * unified `requests_v` view, and allows status transitions / edits /
 * deletes via the `admin_request_op` RPC. Mirrors the UI feel of
 * `superadmin/modules/ContentManagement/` (ocean theme, cards, modal
 * forms) but with a real Supabase data layer so it serves as the
 * canonical pattern for any future cross-cutting superadmin module.
 *
 * To wire it into routes (Phase 8 of the modular refactor):
 *
 * 1. Add the import to `src/superadmin/SuperadminRoutes.jsx`:
 *      import { RequestsManagementPage } from "./modules/RequestsManagement";
 *
 * 2. Add the <Route>:
 *      <Route path="requests-management" element={<RequestsManagementPage />} />
 *
 * 3. Add the sidebar entry in `src/superadmin/components/Sidebar.jsx`:
 *      { path: "/superadmin/requests-management", label: "Requests", kind: "leaf" }
 *
 * The wiring is left to a follow-up commit because `SuperadminRoutes.jsx`
 * and `Sidebar.jsx` currently have uncommitted edits in this repo and
 * automated edits would conflict.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  listRequestsView,
  adminRequest,
} from "../../../shared/data";
import { catalogServiceDisplayName } from "../../../shared/domain/services";
import { useAuth } from "../../../shared/context/AuthContext";
import {
  REQUEST_STATUS_DB_VALUES,
  normalizeStatus,
} from "../../../shared/domain/status";
import DataTable from "../../../shared/components/DataTable.jsx";
import StatusBadge from "../../../shared/components/StatusBadge.jsx";
import { EditRequestModal } from "./EditRequestModal.jsx";

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function RequestsManagementPage() {
  const { roleConfig } = useAuth();
  const catalogServices = roleConfig?.catalogServices ?? [];
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [serviceFilter, setServiceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const [editing, setEditing] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listRequestsView({
        serviceIds: serviceFilter ? [serviceFilter] : undefined,
        statuses: statusFilter ? [statusFilter] : undefined,
        limit: 200,
      });
      setRows(data);
    } catch (err) {
      setError(err.message || "Failed to load requests.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [serviceFilter, statusFilter]);

  useEffect(() => {
    reload();
  }, [reload]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const code = String(r.request_code || "").toLowerCase();
      const id = String(r.id || "").toLowerCase();
      return code.includes(needle) || id.includes(needle);
    });
  }, [rows, search]);

  const columns = useMemo(
    () => [
      {
        key: "request_code",
        label: "Code",
        render: (r) => r.request_code || "-",
        width: "140px",
      },
      {
        key: "service_type",
        label: "Service",
        render: (r) => {
          return catalogServiceDisplayName(
            catalogServices,
            r.service_type || r.service_id
          );
        },
      },
      {
        key: "status",
        label: "Status",
        render: (r) => <StatusBadge status={r.status} />,
        width: "140px",
      },
      {
        key: "submitted_at",
        label: "Submitted",
        render: (r) => formatDate(r.submitted_at),
        width: "160px",
      },
      {
        key: "updated_at",
        label: "Updated",
        render: (r) => formatDate(r.updated_at),
        width: "160px",
      },
      {
        key: "actions",
        label: "",
        render: (r) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(r);
            }}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Edit
          </button>
        ),
        width: "80px",
      },
    ],
    [catalogServices]
  );

  const onSaveEdit = useCallback(
    async (patch) => {
      if (!editing) return;
      await adminRequest.update(editing.id, patch);
      setEditing(null);
      await reload();
    },
    [editing, reload]
  );

  const onDelete = useCallback(async () => {
    if (!editing) return;
    const confirmed = window.confirm(
      `Permanently delete request ${editing.request_code || editing.id}?\nThis cannot be undone.`
    );
    if (!confirmed) return;
    await adminRequest.delete(editing.id);
    setEditing(null);
    await reload();
  }, [editing, reload]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Requests management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            View and manipulate any service request across the eight assistance
            lines. Backed by the <code>requests_v</code> view and the{" "}
            <code>admin_request_op</code> RPC.
          </p>
        </div>
      </header>

      <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Search
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="request code or id"
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Service
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-500"
          >
            <option value="">All services</option>
            {catalogServices.map((s) => (
              <option key={s.serviceId} value={s.serviceId}>
                {s.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-500"
          >
            <option value="">All statuses</option>
            {REQUEST_STATUS_DB_VALUES.map((s) => (
              <option key={s} value={s}>
                {normalizeStatus(s)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end justify-end">
          <button
            type="button"
            onClick={reload}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={filteredRows}
        loading={loading}
        emptyMessage="No requests match the current filters."
        getRowKey={(r) => `${r.service_type || r.service_id}:${r.id}`}
        onRowClick={(r) => setEditing(r)}
      />

      <EditRequestModal
        request={editing}
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSave={onSaveEdit}
        onDelete={onDelete}
      />
    </div>
  );
}

export default RequestsManagementPage;
