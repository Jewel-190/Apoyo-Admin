/**
 * Minimal table primitive for superadmin modules.
 *
 * Headless-ish: takes columns + rows, renders a Tailwind ocean-themed
 * table with empty/loading states. Built specifically for the planned
 * superadmin RequestsManagement / DataManagement modules. Existing
 * admin pipeline screens (Applications/* / ForApproval/*) are NOT
 * required to migrate to this — they have richer per-table UIs.
 *
 * Columns:
 *   { key, label, render?, width? }
 *
 *   - `key`     accessor on the row (string).
 *   - `label`   header text.
 *   - `render`  optional cell renderer: (row) => ReactNode.
 *   - `width`   optional CSS width string (e.g. "120px", "20%").
 *
 * Rows must each have a stable `id` (or supply `getRowKey`).
 */

import React from "react";

export default function DataTable({
  columns = [],
  rows = [],
  loading = false,
  emptyMessage = "No data.",
  getRowKey,
  onRowClick,
  className = "",
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {loading && (
              <tr>
                <td
                  className="px-4 py-12 text-center text-sm text-slate-400"
                  colSpan={columns.length}
                >
                  Loading...
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td
                  className="px-4 py-12 text-center text-sm text-slate-400"
                  colSpan={columns.length}
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => {
                const key = getRowKey ? getRowKey(row) : row.id;
                return (
                  <tr
                    key={key}
                    className={
                      onRowClick
                        ? "cursor-pointer transition hover:bg-slate-50"
                        : ""
                    }
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className="whitespace-nowrap px-4 py-3 text-sm text-slate-700"
                      >
                        {col.render ? col.render(row) : row[col.key] ?? "-"}
                      </td>
                    ))}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
