import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCcw,
  Search,
  ShieldBan,
  ShieldCheck,
  Pencil,
} from "lucide-react";
import {
  TIME_PRESET_OPTIONS,
  buildDefaultCustomRange,
  downloadUsersXlsx,
  exportUsersRows,
  fetchUserDetail,
  fetchUsersPage,
  formatUserRegisteredDate,
  setUserAccountDisabled,
  updateUserProfile,
  usersExportFileStamp,
} from "../../../shared/lib/superAdminUsersApi";
import { useSuperadminHeaderTitle } from "../../SuperadminLayout";
import AdminStatusBadge from "../../../admin/components/AdminStatusBadge";
import ReviewApplications from "../../../admin/modules/Applications/ReviewApplications";
import ApprovalReviewDetails from "../../../admin/modules/ForApproval/ApprovalReviewDetails";
import { normalizeStatus } from "../../../shared/domain/status";
import { getAdminRequestStatusBadgeStyle } from "../../../shared/lib/adminLineStatusStyles";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

function formatCount(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function displayText(value, fallback = "—") {
  if (value == null || value === "") return fallback;
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    if (value.name != null) return displayText(value.name, fallback);
    if (value.label != null) return displayText(value.label, fallback);
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }
  return String(value);
}

function emptyProfileForm(user) {
  return {
    firstName: displayText(user?.firstName, ""),
    middleName: displayText(user?.middleName, ""),
    lastName: displayText(user?.lastName, ""),
    suffix: displayText(user?.suffix, ""),
    sex: displayText(user?.sex, ""),
    birthDate: displayText(user?.birthDate, "").slice(0, 10),
    email: displayText(user?.email, ""),
    contactNo: displayText(user?.contactNo, ""),
    address: displayText(user?.address, ""),
    barangay: displayText(user?.barangay, ""),
    voterId: displayText(user?.voterId, ""),
  };
}

function AccountStatusBadge({ disabled }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        disabled
          ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
          : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
      }`}
    >
      {disabled ? "Disabled" : "Active"}
    </span>
  );
}

function buildApplicationFromUserRequest(request, user) {
  const requestId = request?.id;
  const serviceId = request?.serviceId || null;
  const status = normalizeStatus(request?.statusRaw || request?.status);
  return {
    key: `${serviceId || "unknown"}-${requestId}`,
    id: request?.requestCode || requestId,
    requestId,
    requestCode: request?.requestCode || requestId,
    userId: user?.id || null,
    name: displayText(user?.fullName, "Applicant"),
    category: displayText(request?.serviceName, "Request"),
    date: formatUserRegisteredDate(request?.submittedAt || request?.createdAt),
    submittedAt: request?.submittedAt || null,
    createdAt: request?.createdAt || null,
    updatedAt: request?.updatedAt || null,
    status,
    serviceId,
    caseStudyDate: request?.caseStudyDate ?? null,
  };
}

function shouldUseApprovalReviewDetails(status) {
  const label = normalizeStatus(status);
  return label === "For Approval" || label === "Scheduled" || label === "Case Study";
}

function approvalReviewVariantForStatus(status) {
  const label = normalizeStatus(status);
  if (label === "Scheduled" || label === "Case Study") return "disbursement";
  return "schedule";
}

function UsersListView() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [rangeLabel, setRangeLabel] = useState("All Time");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterSex, setFilterSex] = useState("");
  const [filterAccountStatus, setFilterAccountStatus] = useState("");
  const [timePreset, setTimePreset] = useState("all_time");
  const [customRangeDraft, setCustomRangeDraft] = useState(buildDefaultCustomRange);
  const [customRangeApplied, setCustomRangeApplied] = useState(null);
  const [customRangeError, setCustomRangeError] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

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
    async (page = 1) => {
      if (!canFetch) {
        setUsers([]);
        setTotal(0);
        setIsLoading(false);
        setRangeLabel("");
        return;
      }

      setIsLoading(true);
      setLoadError("");
      try {
        const result = await fetchUsersPage({
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch,
          sex: filterSex,
          accountStatus: filterAccountStatus,
          preset: timePreset,
          from: customRangeApplied?.from ?? null,
          to: customRangeApplied?.to ?? null,
        });
        setUsers(result.users || []);
        setTotal(result.total || 0);
        setCurrentPage(result.page || 1);
        setRangeLabel(result.range?.label || "");
      } catch (error) {
        setLoadError(error?.message || "Failed to load users.");
        setUsers([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    [
      canFetch,
      debouncedSearch,
      filterSex,
      filterAccountStatus,
      timePreset,
      customRangeApplied,
    ]
  );

  useEffect(() => {
    void loadPage(1);
  }, [loadPage]);

  const handlePresetChange = (nextPreset) => {
    setTimePreset(nextPreset);
    setCustomRangeError("");
    setCurrentPage(1);
    if (nextPreset !== "custom") {
      setCustomRangeApplied(null);
    } else {
      setUsers([]);
      setTotal(0);
      setRangeLabel("");
    }
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
    setFilterSex("");
    setFilterAccountStatus("");
    setTimePreset("all_time");
    setCustomRangeApplied(null);
    setCustomRangeError("");
    setCurrentPage(1);
  };

  const handleExport = async () => {
    if (!canFetch || exportBusy) return;
    setExportBusy(true);
    setActionMessage("");
    try {
      const result = await exportUsersRows({
        search: debouncedSearch,
        sex: filterSex,
        accountStatus: filterAccountStatus,
        preset: timePreset,
        from: customRangeApplied?.from ?? null,
        to: customRangeApplied?.to ?? null,
      });
      const userCount = (result.users || []).length;
      const requestCount = (result.requests || []).length;
      await downloadUsersXlsx(result.users || [], result.requests || [], usersExportFileStamp());
      setActionMessage(
        `Exported ${formatCount(userCount)} user(s) and ${formatCount(requestCount)} request(s) to Excel.`
      );
    } catch (error) {
      setLoadError(error?.message || "Export failed.");
    } finally {
      setExportBusy(false);
    }
  };

  const handlePageChange = (page) => {
    if (isLoading || page < 1 || page > totalPages || page === currentPage) return;
    void loadPage(page);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(10,70,111,0.7)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-600">Users</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-ocean-950">
              Applicant users
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={!canFetch || isLoading || exportBusy || total === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-ocean-200 bg-white px-3 text-xs font-semibold text-ocean-800 transition hover:bg-ocean-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" />
              {exportBusy ? "Exporting…" : "Export Excel"}
            </button>
            <span className="inline-flex h-10 items-center rounded-lg border border-ocean-200 bg-ocean-50 px-3 text-sm font-semibold text-ocean-700">
              {isLoading ? "…" : `${formatCount(total)} records`}
            </span>
            <button
              type="button"
              onClick={() => void loadPage(currentPage)}
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
        {actionMessage ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {actionMessage}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {TIME_PRESET_OPTIONS.map((option) => {
              const isActive = timePreset === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handlePresetChange(option.value)}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                    isActive
                      ? "bg-ocean-600 text-white shadow-sm"
                      : "border border-ocean-200 bg-white text-ocean-700 hover:bg-ocean-50"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {rangeLabel ? (
            <p className="text-[11px] font-medium text-ocean-600">Viewing: {rangeLabel}</p>
          ) : null}
          {timePreset === "custom" ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-[11px] text-ocean-600">
                From
                <input
                  type="date"
                  value={customRangeDraft.from}
                  onChange={(event) =>
                    setCustomRangeDraft((previous) => ({
                      ...previous,
                      from: event.target.value,
                    }))
                  }
                  className="mt-1 block rounded-lg border border-ocean-200 px-2 py-1.5 text-xs text-ocean-800 outline-none"
                />
              </label>
              <label className="text-[11px] text-ocean-600">
                To
                <input
                  type="date"
                  value={customRangeDraft.to}
                  onChange={(event) =>
                    setCustomRangeDraft((previous) => ({
                      ...previous,
                      to: event.target.value,
                    }))
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
          {customRangeError ? (
            <p className="text-xs text-rose-600">{customRangeError}</p>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 rounded-xl border border-ocean-200 bg-ocean-50/60 p-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2 md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ocean-700">Search</p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ocean-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Name, email, contact, VIN, or user UUID…"
                className="h-9 w-full rounded-lg border border-ocean-200 bg-white pl-8 pr-2 text-xs font-semibold text-ocean-800 outline-none placeholder:text-ocean-500"
              />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ocean-700">Sex</p>
            <select
              value={filterSex}
              onChange={(event) => {
                setCurrentPage(1);
                setFilterSex(event.target.value);
              }}
              className="h-9 w-full rounded-lg border border-ocean-200 bg-white px-2 text-xs font-semibold text-ocean-800 outline-none"
            >
              <option value="">All Sex</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ocean-700">
              Account status
            </p>
            <div className="flex gap-2">
              <select
                value={filterAccountStatus}
                onChange={(event) => {
                  setCurrentPage(1);
                  setFilterAccountStatus(event.target.value);
                }}
                className="h-9 w-full rounded-lg border border-ocean-200 bg-white px-2 text-xs font-semibold text-ocean-800 outline-none"
              >
                <option value="">All accounts</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-9 shrink-0 items-center rounded-lg border border-ocean-200 bg-ocean-50 px-3 text-xs font-semibold text-ocean-700 transition hover:bg-ocean-100"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-ocean-200">
          <table className="min-w-full divide-y divide-ocean-200">
            <thead className="bg-ocean-50/80">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">
                  First name
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">
                  Middle name
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">
                  Last name
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">
                  Suffix
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">Email</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">VIN</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">
                  Registered
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ocean-100 bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-ocean-600">
                    Loading users…
                  </td>
                </tr>
              ) : !canFetch ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-ocean-600">
                    Select a custom date range to load users.
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-ocean-600">
                    No users match the current filters.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="transition hover:bg-ocean-50/60">
                    <td className="px-4 py-3 text-sm font-medium text-ocean-900">
                      {displayText(user.firstName)}
                    </td>
                    <td className="px-4 py-3 text-sm text-ocean-700">
                      {displayText(user.middleName)}
                    </td>
                    <td className="px-4 py-3 text-sm text-ocean-700">
                      {displayText(user.lastName)}
                    </td>
                    <td className="px-4 py-3 text-sm text-ocean-700">
                      {displayText(user.suffix)}
                    </td>
                    <td className="px-4 py-3 text-sm text-ocean-700">
                      {displayText(user.email)}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-ocean-700">
                      {displayText(user.voterId)}
                    </td>
                    <td className="px-4 py-3 text-sm text-ocean-700">
                      {formatUserRegisteredDate(user.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <AccountStatusBadge disabled={user.disabled} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/superadmin/data-management/users/${user.id}`)
                        }
                        className="inline-flex items-center rounded-lg border border-ocean-200 bg-white px-3 py-1.5 text-xs font-semibold text-ocean-700 transition hover:bg-ocean-50"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && total > 0 ? (
          <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <p className="text-xs text-ocean-600">
              Page {formatCount(currentPage)} of {formatCount(totalPages)}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1 || isLoading}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ocean-200 bg-white text-ocean-700 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handlePageChange(currentPage + 1)}
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

function UserDetailView({ userId }) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [profileForm, setProfileForm] = useState(emptyProfileForm());
  const [saveBusy, setSaveBusy] = useState(false);
  const [disableBusy, setDisableBusy] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [viewingRequest, setViewingRequest] = useState(null);

  const loadDetail = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const result = await fetchUserDetail(userId);
      setDetail(result);
      setProfileForm(emptyProfileForm(result.user));
    } catch (error) {
      setLoadError(error?.message || "Failed to load user.");
      setDetail(null);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setViewingRequest(null);
    void loadDetail();
  }, [loadDetail]);

  const user = detail?.user;
  const requests = detail?.requests || [];
  const statusCounts = detail?.statusCounts || {};

  const headerTitle = viewingRequest
    ? `Data Management · Users · ${displayText(user?.fullName, "User")} · ${displayText(
        viewingRequest.requestCode || viewingRequest.id,
        "Request"
      )}`
    : user
      ? `Data Management · Users · ${displayText(user.fullName, "User")}`
      : "Data Management · Users";
  useSuperadminHeaderTitle(headerTitle);

  if (viewingRequest && user) {
    const application = buildApplicationFromUserRequest(viewingRequest, user);
    const status = application.status;
    const useApprovalDetails = shouldUseApprovalReviewDetails(status);

    if (useApprovalDetails) {
      return (
        <ApprovalReviewDetails
          application={application}
          variant={approvalReviewVariantForStatus(status)}
          readOnly
          backLabel="Back to user"
          onBack={() => setViewingRequest(null)}
        />
      );
    }

    return (
      <ReviewApplications
        application={application}
        onBack={() => setViewingRequest(null)}
        readOnly
        openFinalApprovalOnLoad={status === "Approved"}
      />
    );
  }

  const handleSaveProfile = async () => {
    if (!user?.id || saveBusy) return;
    setSaveBusy(true);
    setActionError("");
    setActionMessage("");
    try {
      const result = await updateUserProfile(user.id, {
        firstName: displayText(profileForm.firstName, ""),
        middleName: displayText(profileForm.middleName, ""),
        lastName: displayText(profileForm.lastName, ""),
        suffix: displayText(profileForm.suffix, ""),
        sex: displayText(profileForm.sex, ""),
        birthDate: displayText(profileForm.birthDate, "").slice(0, 10),
        email: displayText(profileForm.email, ""),
        contactNo: displayText(profileForm.contactNo, ""),
        address: displayText(profileForm.address, ""),
        barangay: displayText(profileForm.barangay, ""),
        voterId: displayText(profileForm.voterId, ""),
      });
      setDetail((previous) =>
        previous
          ? {
              ...previous,
              user: result.user,
            }
          : previous
      );
      setProfileForm(emptyProfileForm(result.user));
      setEditOpen(false);
      setActionMessage("Profile updated.");
    } catch (error) {
      setActionError(displayText(error?.message, "Failed to update profile."));
    } finally {
      setSaveBusy(false);
    }
  };

  const handleToggleDisabled = async () => {
    if (!user?.id || disableBusy) return;
    setDisableBusy(true);
    setActionError("");
    setActionMessage("");
    try {
      const nextDisabled = !user.disabled;
      const result = await setUserAccountDisabled(user.id, nextDisabled);
      setDetail((previous) =>
        previous
          ? {
              ...previous,
              user: {
                ...previous.user,
                disabled: Boolean(result.disabled),
                bannedUntil: result.bannedUntil ?? null,
                email: result.email || previous.user.email,
              },
            }
          : previous
      );
      setConfirmDisable(false);
      setActionMessage(
        nextDisabled ? "Account login disabled." : "Account login enabled."
      );
    } catch (error) {
      setActionError(displayText(error?.message, "Failed to update account status."));
    } finally {
      setDisableBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-ocean-200 bg-white p-8 text-center text-sm text-ocean-600 shadow-sm">
        Loading user profile…
      </div>
    );
  }

  if (loadError || !user) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate("/superadmin/data-management/users")}
          className="inline-flex items-center gap-1 text-sm font-semibold text-ocean-700 hover:text-ocean-900"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Users
        </button>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
          {loadError || "User not found."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate("/superadmin/data-management/users")}
          className="inline-flex items-center gap-1 text-sm font-semibold text-ocean-700 hover:text-ocean-900"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Users
        </button>
        <button
          type="button"
          onClick={() => void loadDetail()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ocean-200 bg-white px-3 text-xs font-semibold text-ocean-800 hover:bg-ocean-50"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {actionMessage ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {actionMessage}
        </p>
      ) : null}
      {actionError ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {actionError}
        </p>
      ) : null}

      <section className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(10,70,111,0.7)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-600">
              User profile
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ocean-950">
              {displayText(user.fullName)}
            </h2>
            <p className="mt-1 font-mono text-sm font-semibold text-ocean-700">
              VIN: {displayText(user.voterId)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AccountStatusBadge disabled={user.disabled} />
            <button
              type="button"
              onClick={() => {
                setProfileForm(emptyProfileForm(user));
                setEditOpen(true);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ocean-600 px-3 text-xs font-semibold text-white hover:bg-ocean-700"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit profile
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["First name", displayText(user.firstName)],
            ["Middle name", displayText(user.middleName)],
            ["Last name", displayText(user.lastName)],
            ["Suffix", displayText(user.suffix)],
            ["Email", displayText(user.email)],
            ["Sex", displayText(user.sex)],
            [
              "Birth date",
              user.birthDate ? displayText(user.birthDate).slice(0, 10) : "—",
            ],
            ["Contact", displayText(user.contactNo)],
            ["Barangay", displayText(user.barangay)],
            ["VIN", displayText(user.voterId)],
            ["Registered", formatUserRegisteredDate(user.createdAt)],
            ["Updated", formatUserRegisteredDate(user.updatedAt)],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-ocean-100 bg-ocean-50/50 px-3 py-2.5"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ocean-500">
                {label}
              </p>
              <p className="mt-1 break-words text-sm font-medium text-ocean-900">{value}</p>
            </div>
          ))}
          <div className="rounded-xl border border-ocean-100 bg-ocean-50/50 px-3 py-2.5 sm:col-span-2 lg:col-span-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ocean-500">
              Address
            </p>
            <p className="mt-1 break-words text-sm font-medium text-ocean-900">
              {displayText(user.address)}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(10,70,111,0.7)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-600">
              Account
            </p>
            <h3 className="mt-1 text-lg font-semibold text-ocean-950">Login access</h3>
            <p className="mt-1 text-xs text-ocean-600">
              Disable blocks sign-in via Auth without deleting profile or request history.
            </p>
          </div>
          {user.hasAuthAccount ? (
            <button
              type="button"
              onClick={() => setConfirmDisable(true)}
              disabled={disableBusy}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-60 ${
                user.disabled
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-rose-600 hover:bg-rose-700"
              }`}
            >
              {user.disabled ? (
                <>
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Enable login
                </>
              ) : (
                <>
                  <ShieldBan className="h-3.5 w-3.5" />
                  Disable login
                </>
              )}
            </button>
          ) : (
            <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
              No Auth account linked
            </span>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(10,70,111,0.7)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-600">
              Service pipeline
            </p>
            <h3 className="mt-1 text-lg font-semibold text-ocean-950">
              Assistance requests
            </h3>
          </div>
          <span className="text-sm font-semibold text-ocean-700">
            {formatCount(detail.requestTotal || 0)} total
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {Object.keys(statusCounts).length === 0 ? (
            <span className="text-xs text-ocean-500">No status breakdown yet.</span>
          ) : (
            Object.entries(statusCounts).map(([status, count]) => {
              const label = normalizeStatus(status);
              const style = getAdminRequestStatusBadgeStyle(label);
              return (
                <span
                  key={status}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={style}
                >
                  {label}
                  <span className="opacity-80">· {formatCount(count)}</span>
                </span>
              );
            })
          )}
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-ocean-200">
          <table className="min-w-full divide-y divide-ocean-200">
            <thead className="bg-ocean-50/80">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">
                  Request ID
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">
                  Assistance
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">
                  Service
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">
                  Submitted
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">
                  Case study
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ocean-100 bg-white">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-ocean-600">
                    No assistance requests for this user.
                  </td>
                </tr>
              ) : (
                requests.map((request) => (
                  <tr key={request.id} className="hover:bg-ocean-50/60">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-ocean-900">
                      {displayText(request.requestCode)}
                    </td>
                    <td className="px-4 py-3 text-sm text-ocean-700">
                      {displayText(request.assistanceName)}
                    </td>
                    <td className="px-4 py-3 text-sm text-ocean-700">
                      {displayText(request.serviceName)}
                    </td>
                    <td className="px-4 py-3">
                      <AdminStatusBadge status={request.statusRaw || request.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-ocean-700">
                      {formatUserRegisteredDate(request.submittedAt || request.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-sm text-ocean-700">
                      {formatUserRegisteredDate(request.caseStudyDate)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setViewingRequest(request)}
                        disabled={!request.id || !request.serviceId}
                        className="inline-flex items-center rounded-lg border border-ocean-200 bg-white px-3 py-1.5 text-xs font-semibold text-ocean-700 transition hover:bg-ocean-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editOpen ? (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-ocean-950/45 p-4 backdrop-blur-[2px]">
          <div className="flex min-h-full items-center justify-center">
            <div className="w-full max-w-2xl rounded-2xl border border-ocean-200 bg-white p-5 shadow-xl">
              <h3 className="text-lg font-semibold text-ocean-950">Edit profile</h3>
              <p className="mt-1 text-xs text-ocean-600">
                Updates `public.users` fields only. Login disable is managed separately.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ["firstName", "First name"],
                  ["middleName", "Middle name"],
                  ["lastName", "Last name"],
                  ["suffix", "Suffix"],
                  ["email", "Email"],
                  ["contactNo", "Contact"],
                  ["barangay", "Barangay"],
                  ["voterId", "VIN"],
                ].map(([key, label]) => (
                  <label key={key} className="text-[11px] font-semibold text-ocean-700">
                    {label}
                    <input
                      type="text"
                      value={displayText(profileForm[key], "")}
                      onChange={(event) =>
                        setProfileForm((previous) => ({
                          ...previous,
                          [key]: event.target.value,
                        }))
                      }
                      className="mt-1 h-9 w-full rounded-lg border border-ocean-200 px-2 text-xs font-medium text-ocean-900 outline-none"
                    />
                  </label>
                ))}
                <label className="text-[11px] font-semibold text-ocean-700">
                  Sex
                  <select
                    value={displayText(profileForm.sex, "")}
                    onChange={(event) =>
                      setProfileForm((previous) => ({
                        ...previous,
                        sex: event.target.value,
                      }))
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-ocean-200 px-2 text-xs font-medium text-ocean-900 outline-none"
                  >
                    <option value="">—</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </label>
                <label className="text-[11px] font-semibold text-ocean-700">
                  Birth date
                  <input
                    type="date"
                    value={displayText(profileForm.birthDate, "").slice(0, 10)}
                    onChange={(event) =>
                      setProfileForm((previous) => ({
                        ...previous,
                        birthDate: event.target.value,
                      }))
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-ocean-200 px-2 text-xs font-medium text-ocean-900 outline-none"
                  />
                </label>
                <label className="text-[11px] font-semibold text-ocean-700 sm:col-span-2">
                  Address
                  <textarea
                    value={displayText(profileForm.address, "")}
                    onChange={(event) =>
                      setProfileForm((previous) => ({
                        ...previous,
                        address: event.target.value,
                      }))
                    }
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-ocean-200 px-2 py-2 text-xs font-medium text-ocean-900 outline-none"
                  />
                </label>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  disabled={saveBusy}
                  className="h-9 rounded-lg border border-ocean-200 px-3 text-xs font-semibold text-ocean-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveProfile()}
                  disabled={saveBusy}
                  className="h-9 rounded-lg bg-ocean-600 px-3 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {saveBusy ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDisable ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-ocean-950/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl border border-ocean-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-ocean-950">
              {user.disabled ? "Enable login?" : "Disable login?"}
            </h3>
            <p className="mt-2 text-sm text-ocean-700">
              {user.disabled
                ? "This will allow the applicant to sign in again."
                : "This will block the applicant from signing in. Their profile and assistance requests remain intact."}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDisable(false)}
                disabled={disableBusy}
                className="h-9 rounded-lg border border-ocean-200 px-3 text-xs font-semibold text-ocean-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleToggleDisabled()}
                disabled={disableBusy}
                className={`h-9 rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-60 ${
                  user.disabled ? "bg-emerald-600" : "bg-rose-600"
                }`}
              >
                {disableBusy ? "Updating…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function User() {
  const { userId } = useParams();
  if (userId) {
    return <UserDetailView userId={userId} />;
  }
  return <UsersListView />;
}

export default User;
