import { Eye } from "lucide-react";

/**
 * Shared Applications / For Approval / Approved list.
 * Desktop: table. Narrow: stacked cards so columns don't spill.
 */
export default function ApplicationsListTable({
  rows = [],
  isLoading = false,
  loadError = "",
  emptyMessage = "No applications found.",
  loadingMessage = "Loading applications...",
  actionLabel = "Review Application",
  actionColor,
  onAction,
  renderStatus,
}) {
  const accent = actionColor || "var(--apoyo-primary)";

  const emptyState = (
    <p
      className={`py-10 text-center text-sm ${
        !isLoading && loadError ? "text-red-500" : "text-gray-400"
      }`}
    >
      {isLoading ? loadingMessage : loadError ? loadError : emptyMessage}
    </p>
  );

  const showEmpty = isLoading || Boolean(loadError) || rows.length === 0;

  return (
    <div className="min-w-0">
      {/* Narrow screens */}
      <div className="space-y-3 md:hidden">
        {showEmpty ? (
          emptyState
        ) : (
          rows.map((row) => (
            <div
              key={row.key || row.id}
              className="rounded-xl border border-gray-100 bg-gray-50/70 p-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs font-semibold text-gray-800" title={row.id}>
                    {row.id}
                  </p>
                  <p className="mt-0.5 truncate text-sm font-medium text-gray-700" title={row.name}>
                    {row.name}
                  </p>
                </div>
                <div className="shrink-0">{renderStatus?.(row.status)}</div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                <div className="min-w-0">
                  <p className="font-semibold uppercase tracking-wide text-gray-400">Category</p>
                  <p className="mt-0.5 truncate text-gray-600" title={row.category}>
                    {row.category}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold uppercase tracking-wide text-gray-400">Date</p>
                  <p className="mt-0.5 truncate text-gray-600">{row.date}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onAction?.(row)}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                style={{ color: accent }}
              >
                <Eye size={13} />
                {actionLabel}
              </button>
            </div>
          ))
        )}
      </div>

      {/* Wider screens */}
      <div className="hidden min-w-0 overflow-x-auto md:block">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-500">
              <th className="pb-3 pr-4">Application ID</th>
              <th className="pb-3 pr-4">Applicant Name</th>
              <th className="pb-3 pr-4">Service Category</th>
              <th className="pb-3 pr-4">Application Date</th>
              <th className="pb-3 pr-4">Status</th>
              <th className="pb-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-gray-400">
                  {loadingMessage}
                </td>
              </tr>
            ) : null}

            {!isLoading && loadError ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-red-500">
                  {loadError}
                </td>
              </tr>
            ) : null}

            {!isLoading && !loadError && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : null}

            {!isLoading &&
              !loadError &&
              rows.map((row, index) => (
                <tr
                  key={row.key || row.id}
                  className={`text-xs ${index % 2 === 0 ? "bg-gray-50" : "bg-white"}`}
                >
                  <td className="py-2.5 pl-2 pr-4 font-semibold text-gray-700">{row.id}</td>
                  <td className="py-2.5 pr-4 text-gray-600">{row.name}</td>
                  <td className="py-2.5 pr-4 text-gray-600">{row.category}</td>
                  <td className="py-2.5 pr-4 text-gray-500">{row.date}</td>
                  <td className="py-2.5 pr-4">{renderStatus?.(row.status)}</td>
                  <td className="py-2.5">
                    <button
                      type="button"
                      onClick={() => onAction?.(row)}
                      className="flex items-center gap-1 text-xs font-semibold hover:underline"
                      style={{ color: accent }}
                    >
                      <Eye size={13} />
                      {actionLabel}
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
