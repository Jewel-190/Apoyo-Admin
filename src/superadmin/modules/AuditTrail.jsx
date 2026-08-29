import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCcw, Search, X } from "lucide-react";
import {
  AUDIT_ACTION_OPTIONS,
  AUDIT_MODULE_OPTIONS,
  TIME_PRESET_OPTIONS,
  auditActionLabel,
  auditModuleLabel,
  buildDefaultCustomRange,
  fetchAuditTrailPage,
  formatAuditDate,
  formatAuditLocation,
  formatAuditTime,
} from "../../shared/lib/superAdminAuditTrailApi";
import { useSuperadminHeaderTitle } from "../SuperadminLayout";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

function formatCount(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function FacetChip({ active, label, count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
        active
          ? "bg-ocean-600 text-white shadow-sm"
          : "border border-ocean-200 bg-white text-ocean-700 hover:bg-ocean-50"
      }`}
    >
      <span className="truncate">{label}</span>
      {count != null ? (
        <span className={active ? "opacity-80" : "text-ocean-500"}>{formatCount(count)}</span>
      ) : null}
    </button>
  );
}

function RemovableChip({ label, onRemove }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-ocean-200 bg-ocean-50 px-2.5 py-1 text-[11px] font-semibold text-ocean-800">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 text-ocean-600 transition hover:bg-ocean-100 hover:text-ocean-900"
        aria-label={`Remove ${label}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export function AuditTrail() {
  useSuperadminHeaderTitle("Audit trail");

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [rangeLabel, setRangeLabel] = useState("All Time");
  const [facets, setFacets] = useState({ modules: {}, actions: {} });
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterModule, setFilterModule] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [timePreset, setTimePreset] = useState("all_time");
  const [customRangeDraft, setCustomRangeDraft] = useState(buildDefaultCustomRange);
  const [customRangeApplied, setCustomRangeApplied] = useState(null);
  const [customRangeError, setCustomRangeError] = useState("");

  const canFetch = timePreset !== "custom" || Boolean(customRangeApplied);
  const totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setCurrentPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadPage = useCallback(
    async ({ page = currentPage, includeFacets = true } = {}) => {
      if (!canFetch) return;
      setIsLoading(true);
      setLoadError("");
      try {
        const data = await fetchAuditTrailPage({
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch,
          module: filterModule,
          auditAction: filterAction,
          preset: timePreset,
          from: timePreset === "custom" ? customRangeApplied?.from : null,
          to: timePreset === "custom" ? customRangeApplied?.to : null,
          includeFacets,
        });
        setRows(Array.isArray(data.rows) ? data.rows : []);
        setTotal(Number(data.pagination?.total || 0));
        if (data.range?.label) setRangeLabel(data.range.label);
        if (includeFacets && data.facets) {
          setFacets({
            modules: data.facets.modules || {},
            actions: data.facets.actions || {},
          });
        }
      } catch (error) {
        setRows([]);
        setTotal(0);
        setLoadError(error?.message || "Unable to load audit trail.");
      } finally {
        setIsLoading(false);
      }
    },
    [canFetch, currentPage, customRangeApplied, debouncedSearch, filterAction, filterModule, timePreset]
  );

  useEffect(() => {
    void loadPage({ page: currentPage, includeFacets: currentPage === 1 });
  }, [currentPage, loadPage]);

  const handlePresetChange = (preset) => {
    setCustomRangeError("");
    setCurrentPage(1);
    setTimePreset(preset);
    if (preset !== "custom") setCustomRangeApplied(null);
  };

  const handleApplyCustomRange = () => {
    const from = String(customRangeDraft.from || "").trim();
    const to = String(customRangeDraft.to || "").trim();
    if (!from || !to) {
      setCustomRangeError("Select both a start and end date.");
      return;
    }
    if (from > to) {
      setCustomRangeError("Start date must be on or before end date.");
      return;
    }
    setCustomRangeError("");
    setCustomRangeApplied({ from, to });
    setTimePreset("custom");
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setFilterModule("");
    setFilterAction("");
    setTimePreset("all_time");
    setCustomRangeApplied(null);
    setCustomRangeError("");
    setCurrentPage(1);
  };

  const moduleAllCount = useMemo(
    () => Object.values(facets.modules || {}).reduce((sum, count) => sum + Number(count || 0), 0),
    [facets.modules]
  );
  const actionAllCount = useMemo(
    () => Object.values(facets.actions || {}).reduce((sum, count) => sum + Number(count || 0), 0),
    [facets.actions]
  );

  const activeFilters = useMemo(() => {
    const chips = [];
    if (debouncedSearch) {
      chips.push({
        id: "search",
        label: `Search: ${debouncedSearch}`,
        onRemove: () => {
          setSearchInput("");
          setDebouncedSearch("");
          setCurrentPage(1);
        },
      });
    }
    if (filterModule) {
      chips.push({
        id: "module",
        label: auditModuleLabel(filterModule),
        onRemove: () => {
          setFilterModule("");
          setCurrentPage(1);
        },
      });
    }
    if (filterAction) {
      chips.push({
        id: "action",
        label: auditActionLabel(filterAction),
        onRemove: () => {
          setFilterAction("");
          setCurrentPage(1);
        },
      });
    }
    if (timePreset !== "all_time") {
      chips.push({
        id: "time",
        label: rangeLabel || "Date range",
        onRemove: () => {
          setTimePreset("all_time");
          setCustomRangeApplied(null);
          setCurrentPage(1);
        },
      });
    }
    return chips;
  }, [debouncedSearch, filterAction, filterModule, rangeLabel, timePreset]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-ocean-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-700">
              Superadmin
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-ocean-950">Audit trail</h2>
            <p className="mt-1 max-w-2xl text-xs text-ocean-700">
              Changes made in this CMS — who did what, when, and from where. The table is paged on
              the server and never loads the full history at once.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-10 items-center rounded-lg border border-ocean-200 bg-ocean-50 px-3 text-sm font-semibold text-ocean-700">
              {isLoading ? "…" : `${formatCount(total)} records`}
            </span>
            <button
              type="button"
              onClick={() => void loadPage({ page: currentPage, includeFacets: true })}
              disabled={isLoading || !canFetch}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-ocean-200 bg-white px-3 text-xs font-semibold text-ocean-800 transition hover:bg-ocean-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {loadError ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {loadError}
          </p>
        ) : null}

        <div className="mt-4 space-y-3 rounded-xl border border-ocean-200 bg-ocean-50/50 p-3">
          <div className="relative max-w-xl">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ocean-700" />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Summary, email, IP, or record id…"
              className="h-9 w-full rounded-lg border border-ocean-200 bg-white pl-8 pr-2 text-xs font-semibold text-ocean-800 outline-none placeholder:text-ocean-500"
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ocean-700">
              Date
            </p>
            <div className="flex flex-wrap gap-1.5">
              {TIME_PRESET_OPTIONS.map((option) => (
                <FacetChip
                  key={option.value}
                  active={timePreset === option.value}
                  label={option.label}
                  onClick={() => handlePresetChange(option.value)}
                />
              ))}
            </div>
            {rangeLabel ? (
              <p className="text-[11px] font-medium text-ocean-700">Viewing: {rangeLabel}</p>
            ) : null}
            {timePreset === "custom" ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-[11px] text-ocean-700">
                  From
                  <input
                    type="date"
                    value={customRangeDraft.from}
                    onChange={(event) =>
                      setCustomRangeDraft((previous) => ({ ...previous, from: event.target.value }))
                    }
                    className="mt-1 block rounded-lg border border-ocean-200 px-2 py-1.5 text-xs text-ocean-800 outline-none"
                  />
                </label>
                <label className="text-[11px] text-ocean-700">
                  To
                  <input
                    type="date"
                    value={customRangeDraft.to}
                    onChange={(event) =>
                      setCustomRangeDraft((previous) => ({ ...previous, to: event.target.value }))
                    }
                    className="mt-1 block rounded-lg border border-ocean-200 px-2 py-1.5 text-xs text-ocean-800 outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleApplyCustomRange}
                  className="rounded-lg bg-ocean-600 px-3 py-1.5 text-[11px] font-semibold text-white"
                >
                  Apply Range
                </button>
              </div>
            ) : null}
            {customRangeError ? <p className="text-xs text-rose-600">{customRangeError}</p> : null}
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ocean-700">
              Area
            </p>
            <div className="flex flex-wrap gap-1.5">
              <FacetChip
                active={!filterModule}
                label="All"
                count={moduleAllCount}
                onClick={() => {
                  setFilterModule("");
                  setCurrentPage(1);
                }}
              />
              {AUDIT_MODULE_OPTIONS.map((option) => (
                <FacetChip
                  key={option.value}
                  active={filterModule === option.value}
                  label={option.label}
                  count={facets.modules?.[option.value] ?? 0}
                  onClick={() => {
                    setFilterModule((previous) => (previous === option.value ? "" : option.value));
                    setCurrentPage(1);
                  }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ocean-700">
              Action
            </p>
            <div className="flex flex-wrap gap-1.5">
              <FacetChip
                active={!filterAction}
                label="All"
                count={actionAllCount}
                onClick={() => {
                  setFilterAction("");
                  setCurrentPage(1);
                }}
              />
              {AUDIT_ACTION_OPTIONS.map((option) => (
                <FacetChip
                  key={option.value}
                  active={filterAction === option.value}
                  label={option.label}
                  count={facets.actions?.[option.value] ?? 0}
                  onClick={() => {
                    setFilterAction((previous) => (previous === option.value ? "" : option.value));
                    setCurrentPage(1);
                  }}
                />
              ))}
            </div>
          </div>

          {activeFilters.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-ocean-200 pt-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ocean-700">
                Active
              </span>
              {activeFilters.map((chip) => (
                <RemovableChip key={chip.id} label={chip.label} onRemove={chip.onRemove} />
              ))}
              <button
                type="button"
                onClick={clearFilters}
                className="ml-1 text-[11px] font-semibold text-ocean-700 underline-offset-2 hover:underline"
              >
                Clear all
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-ocean-200">
          <table className="min-w-full divide-y divide-ocean-200">
            <thead className="bg-ocean-50/80">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">When</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">Actor</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">Action</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">Area</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">Summary</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ocean-100 bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-ocean-700">
                    Loading audit trail…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-ocean-700">
                    No audit events match the current filters. CMS changes, exports, and sign-in
                    events will appear here.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-ocean-50/60">
                    <td className="whitespace-nowrap px-4 py-3">
                      <p className="text-sm font-semibold text-ocean-900">
                        {formatAuditDate(row.createdAt)}
                      </p>
                      <p className="text-[11px] text-ocean-600">{formatAuditTime(row.createdAt)}</p>
                    </td>
                    <td className="max-w-[16rem] px-4 py-3 text-sm text-ocean-800">
                      <span className="block truncate" title={row.actorEmail || row.actorId || ""}>
                        {row.actorEmail || "Superadmin"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full border border-ocean-200 bg-ocean-50 px-2 py-0.5 text-[11px] font-semibold text-ocean-800">
                        {auditActionLabel(row.action)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-ocean-800">
                      {auditModuleLabel(row.module)}
                    </td>
                    <td className="min-w-[16rem] max-w-xl px-4 py-3 text-sm text-ocean-800">
                      <span className="line-clamp-2" title={row.summary}>
                        {row.summary || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-ocean-700">
                      <span className="block truncate" title={formatAuditLocation(row)}>
                        {formatAuditLocation(row)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && total > 0 ? (
          <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <p className="text-xs text-ocean-700">
              Page {formatCount(currentPage)} of {formatCount(totalPages)}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage <= 1 || isLoading}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ocean-200 bg-white text-ocean-700 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage >= totalPages || isLoading}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ocean-200 bg-white text-ocean-700 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
