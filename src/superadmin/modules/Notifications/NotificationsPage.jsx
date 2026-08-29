import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Bell, CheckCheck, ChevronLeft, ChevronRight, RefreshCcw, Search } from "lucide-react";
import { useSuperadminHeaderTitle } from "../../SuperadminLayout";
import { useSuperAdminNotifications } from "../../../shared/context/SuperAdminNotificationContext";
import {
  NOTIFICATION_EVENT_OPTIONS,
  NOTIFICATION_STATUS_OPTIONS,
  fetchSuperAdminNotification,
  fetchSuperAdminNotificationsPage,
  formatNotificationDateTime,
  markAllSuperAdminNotificationsRead,
  notificationEventLabel,
} from "../../../shared/lib/superAdminNotificationsApi";
import {
  fetchServiceLogDetail,
  formatServiceLogDate,
} from "../../../shared/lib/superAdminServiceLogsApi";
import ReviewApplications from "../../../admin/modules/Applications/ReviewApplications";
import ApprovalReviewDetails from "../../../admin/modules/ForApproval/ApprovalReviewDetails";
import { normalizeStatus } from "../../../shared/domain/status";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

function displayText(value, fallback = "—") {
  if (value == null || value === "") return fallback;
  if (typeof value === "string") return value.trim() || fallback;
  return String(value);
}

function buildApplicationFromLog(log, user) {
  const requestId = log?.id;
  const serviceId = log?.serviceId || null;
  const status = normalizeStatus(log?.statusRaw || log?.status);
  return {
    key: `${serviceId || "unknown"}-${requestId}`,
    id: log?.requestCode || requestId,
    requestId,
    requestCode: log?.requestCode || requestId,
    userId: user?.id || log?.userId || null,
    name: displayText(user?.fullName || log?.applicantName, "Applicant"),
    category: displayText(log?.serviceName, "Request"),
    date: formatServiceLogDate(log?.submittedAt || log?.createdAt),
    submittedAt: log?.submittedAt || null,
    createdAt: log?.createdAt || null,
    updatedAt: log?.updatedAt || null,
    status,
    serviceId,
    caseStudyDate: log?.caseStudyDate ?? null,
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

function eventChipClass(eventType) {
  const key = String(eventType || "").toLowerCase();
  if (key === "approved") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (key === "declined") return "bg-rose-50 text-rose-800 ring-rose-200";
  return "bg-sky-50 text-sky-800 ring-sky-200";
}

function NotificationRequestDetail({ notificationId }) {
  const navigate = useNavigate();
  const { markRead } = useSuperAdminNotifications();
  const [loadState, setLoadState] = useState({
    notificationId,
    status: "loading",
    notification: null,
    detail: null,
    error: "",
  });

  useSuperadminHeaderTitle("Notifications");

  const goBack = useCallback(() => {
    navigate("/superadmin/notifications");
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadState((previous) => ({
        ...previous,
        notificationId,
        status: "loading",
        error: "",
      }));
      try {
        const result = await fetchSuperAdminNotification(notificationId);
        const notification = result?.notification || null;
        if (!notification) throw new Error("Notification not found.");
        await markRead(notification.id);

        let detail = null;
        if (notification.requestId) {
          try {
            detail = await fetchServiceLogDetail(notification.requestId);
          } catch {
            detail = null;
          }
        }

        if (cancelled) return;
        setLoadState({
          notificationId,
          status: "ok",
          notification,
          detail,
          error: "",
        });
      } catch (error) {
        if (cancelled) return;
        setLoadState({
          notificationId,
          status: "error",
          notification: null,
          detail: null,
          error: error?.message || "Failed to open notification.",
        });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [markRead, notificationId]);

  if (loadState.notificationId !== notificationId || loadState.status === "loading") {
    return (
      <div className="rounded-2xl border border-ocean-200 bg-white p-6 text-sm text-ocean-700">
        Loading request…
      </div>
    );
  }

  if (loadState.status === "error" || !loadState.notification) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-white p-6">
        <p className="text-sm font-semibold text-rose-700">
          {loadState.error || "Notification not found."}
        </p>
        <button
          type="button"
          onClick={goBack}
          className="mt-4 inline-flex items-center rounded-lg border border-ocean-200 bg-white px-3 py-1.5 text-xs font-semibold text-ocean-700"
        >
          Back to notifications
        </button>
      </div>
    );
  }

  const notification = loadState.notification;
  const log = loadState.detail?.log || null;
  const user = loadState.detail?.user || null;
  const application = log ? buildApplicationFromLog(log, user) : null;
  const status = application?.status;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-ocean-700 hover:text-ocean-950"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to notifications
        </button>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${eventChipClass(
            notification.eventType
          )}`}
        >
          {notificationEventLabel(notification.eventType)}
        </span>
      </div>

      <div className="rounded-2xl border border-ocean-200 bg-ocean-50/70 px-4 py-3">
        <p className="text-sm font-semibold text-ocean-950">{notification.title}</p>
        <p className="mt-1 text-sm text-ocean-700">{notification.body}</p>
        <p className="mt-2 text-xs text-ocean-600">
          {formatNotificationDateTime(notification.createdAt)}
          {notification.requestCode ? ` · ${notification.requestCode}` : ""}
        </p>
      </div>

      {!application?.serviceId ? (
        <div className="rounded-2xl border border-ocean-200 bg-white p-6">
          <p className="text-sm text-ocean-700">
            This request cannot be opened because it has no current service record. The
            snapshot above is the last known state.
          </p>
        </div>
      ) : shouldUseApprovalReviewDetails(status) ? (
        <ApprovalReviewDetails
          application={application}
          variant={approvalReviewVariantForStatus(status)}
          readOnly
          backLabel="Back to notifications"
          onBack={goBack}
        />
      ) : (
        <ReviewApplications
          application={application}
          onBack={goBack}
          readOnly
          openFinalApprovalOnLoad={status === "Approved"}
        />
      )}
    </div>
  );
}

function NotificationsList() {
  const navigate = useNavigate();
  const {
    inboxVersion,
    unreadCount,
    refreshUnread,
    browserAlertsEnabled,
    browserPermission,
    enableBrowserAlerts,
    disableBrowserAlerts,
  } = useSuperAdminNotifications();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("unread");
  const [eventFilter, setEventFilter] = useState("");
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  useSuperadminHeaderTitle("Notifications");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));

  const loadPage = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const result = await fetchSuperAdminNotificationsPage({
        page,
        pageSize: PAGE_SIZE,
        status: statusFilter,
        eventType: eventFilter,
        search: debouncedSearch,
      });
      setRows(Array.isArray(result.rows) ? result.rows : []);
      setTotal(Number(result.pagination?.total || 0));
      if (typeof result.unreadCount === "number") {
        void refreshUnread();
      }
    } catch (error) {
      setRows([]);
      setTotal(0);
      setLoadError(error?.message || "Unable to load notifications.");
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, eventFilter, page, refreshUnread, statusFilter]);

  useEffect(() => {
    void loadPage();
  }, [inboxVersion, loadPage]);

  const handleMarkAllRead = async () => {
    setIsMarkingAll(true);
    try {
      await markAllSuperAdminNotificationsRead();
      await refreshUnread();
      setPage(1);
      await loadPage();
    } catch (error) {
      setLoadError(error?.message || "Unable to mark notifications as read.");
    } finally {
      setIsMarkingAll(false);
    }
  };

  const alertsUnsupported = browserPermission === "unsupported";

  const emptyLabel = useMemo(() => {
    if (debouncedSearch) return "No notifications match the current search.";
    if (statusFilter === "unread") return "No unread notifications.";
    if (statusFilter === "read") return "No read notifications yet.";
    return "No request notifications yet.";
  }, [debouncedSearch, statusFilter]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-ocean-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-700">
              Superadmin
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-ocean-950">
              Notifications
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-ocean-700">
              New submissions and scheduling decisions. Open Read to see the request as it
              stands now.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-10 items-center rounded-lg border border-ocean-200 bg-ocean-50 px-3 text-sm font-semibold text-ocean-700">
              {unreadCount} unread
            </span>
            <button
              type="button"
              onClick={() => void loadPage()}
              disabled={isLoading}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-ocean-200 bg-white px-3 text-xs font-semibold text-ocean-800 hover:bg-ocean-50 disabled:opacity-60"
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              disabled={isMarkingAll || unreadCount === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-ocean-200 bg-white px-3 text-xs font-semibold text-ocean-800 hover:bg-ocean-50 disabled:opacity-60"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {isMarkingAll ? "Marking…" : "Mark all read"}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-xl flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ocean-700" />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search applicant, request code, or service"
              className="h-10 w-full rounded-lg border border-ocean-200 bg-white pl-8 pr-3 text-sm text-ocean-900 outline-none focus:border-ocean-400"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {alertsUnsupported ? (
              <p className="text-xs text-ocean-600">Desktop alerts are not supported in this browser.</p>
            ) : browserAlertsEnabled ? (
              <button
                type="button"
                onClick={disableBrowserAlerts}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-ocean-200 bg-white px-3 text-xs font-semibold text-ocean-800 hover:bg-ocean-50"
              >
                <Bell className="h-3.5 w-3.5" />
                Desktop alerts on
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void enableBrowserAlerts()}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-ocean-700 px-3 text-xs font-semibold text-white hover:bg-ocean-800"
              >
                <Bell className="h-3.5 w-3.5" />
                Enable desktop alerts
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {NOTIFICATION_STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setStatusFilter(option.value);
                setPage(1);
              }}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                statusFilter === option.value
                  ? "bg-ocean-700 text-white"
                  : "border border-ocean-200 bg-white text-ocean-700 hover:bg-ocean-50"
              }`}
            >
              {option.label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-ocean-200" />
          {NOTIFICATION_EVENT_OPTIONS.map((option) => (
            <button
              key={option.value || "all-events"}
              type="button"
              onClick={() => {
                setEventFilter(option.value);
                setPage(1);
              }}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                eventFilter === option.value
                  ? "bg-ocean-700 text-white"
                  : "border border-ocean-200 bg-white text-ocean-700 hover:bg-ocean-50"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {loadError ? (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {loadError}
          </p>
        ) : null}

        <div className="mt-4 divide-y divide-ocean-100 overflow-hidden rounded-xl border border-ocean-200">
          {isLoading ? (
            <p className="px-4 py-8 text-center text-sm text-ocean-700">Loading notifications…</p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ocean-700">{emptyLabel}</p>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center ${
                  row.isRead ? "bg-white" : "bg-rose-50/40"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {!row.isRead ? (
                      <span className="inline-block h-2 w-2 rounded-full bg-rose-500" aria-hidden />
                    ) : null}
                    <p className="text-sm font-semibold text-ocean-950">{row.title}</p>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${eventChipClass(
                        row.eventType
                      )}`}
                    >
                      {notificationEventLabel(row.eventType)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ocean-700">{row.body}</p>
                  <p className="mt-1 text-xs text-ocean-600">
                    {formatNotificationDateTime(row.createdAt)}
                    {row.requestCode ? ` · ${row.requestCode}` : ""}
                    {row.serviceName ? ` · ${row.serviceName}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/superadmin/notifications/${row.id}`)}
                  className="inline-flex h-9 shrink-0 items-center rounded-lg bg-ocean-700 px-3 text-xs font-semibold text-white hover:bg-ocean-800"
                >
                  Read
                </button>
              </div>
            ))
          )}
        </div>

        {!isLoading && total > 0 ? (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-ocean-700">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ocean-200 bg-white text-ocean-700 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
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

export function NotificationsPage() {
  const { notificationId } = useParams();
  if (notificationId) {
    return <NotificationRequestDetail notificationId={notificationId} />;
  }
  return <NotificationsList />;
}

export default NotificationsPage;
