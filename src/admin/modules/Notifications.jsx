import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, CircleAlert, RefreshCcw } from "lucide-react";
import MiniNotifications from "../components/MiniNotifications";
import { useAuth } from "../../shared/context/AuthContext";
import { collectApplicationQuerySources } from "../../shared/lib/lineServiceScope";
import {
  fetchApplicationsBySources,
  invalidateAdminPipelineCaches,
  toValidDate,
} from "../../shared/lib/requestData";
import { useAdminNotifications } from "../../shared/context/AdminNotificationContext";

const FILTER_OPTIONS = ["All", "Unread", "Read"];

function resolveTimeBucket(dateValue) {
  const date = toValidDate(dateValue);
  if (!date) {
    return "pastMonths";
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = startOfToday.getDay();
  const offsetToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - offsetToMonday);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  if (date >= startOfToday) {
    return "today";
  }

  if (date >= startOfWeek) {
    return "thisWeek";
  }

  if (date >= startOfMonth) {
    return "thisMonth";
  }

  return "pastMonths";
}

function groupRowsIntoTimeSections(rows) {
  const grouped = {
    today: [],
    thisWeek: [],
    thisMonth: [],
    pastMonths: [],
  };

  for (const notification of rows) {
    const bucket = resolveTimeBucket(notification.eventAt || notification.created_at);
    grouped[bucket].push(notification);
  }

  return [
    { key: "today", title: "Today", rows: grouped.today },
    { key: "thisWeek", title: "This week", rows: grouped.thisWeek },
    { key: "thisMonth", title: "This month", rows: grouped.thisMonth },
    { key: "pastMonths", title: "Past Months", rows: grouped.pastMonths },
  ].filter((section) => section.rows.length > 0);
}

export default function Notifications() {
  const { theme, roleConfig, adminShellReady } = useAuth();
  const {
    inboxNotifications,
    isLoadingPreview,
    loadError: inboxLoadError,
    refreshNotifications,
    navigateToNotification,
  } = useAdminNotifications();

  const [applicationsByKey, setApplicationsByKey] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [isLoadingApps, setIsLoadingApps] = useState(true);
  const [appsError, setAppsError] = useState("");
  const [isOpeningRequest, setIsOpeningRequest] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const notificationsCardRef = useRef(null);

  const sourceTables = useMemo(
    () => collectApplicationQuerySources(roleConfig),
    [roleConfig]
  );

  // Applications are only for richer labels — inbox itself is live from context.
  useEffect(() => {
    let isMounted = true;

    const loadApplications = async () => {
      if (!adminShellReady) {
        setIsLoadingApps(true);
        return;
      }

      setIsLoadingApps(true);
      setAppsError("");

      try {
        if (!sourceTables.length) {
          if (isMounted) {
            setApplicationsByKey({});
          }
          return;
        }

        const appRows = await fetchApplicationsBySources(sourceTables, {
          forceRefresh: reloadKey > 0,
        });

        if (!isMounted) {
          return;
        }

        setApplicationsByKey(
          Object.fromEntries(appRows.map((row) => [String(row.requestId), row]))
        );
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setAppsError(error?.message || "Failed to load request details.");
        setApplicationsByKey({});
      } finally {
        if (isMounted) {
          setIsLoadingApps(false);
        }
      }
    };

    void loadApplications();

    return () => {
      isMounted = false;
    };
  }, [adminShellReady, reloadKey, sourceTables]);

  const notifications = useMemo(() => {
    return (inboxNotifications || []).map((notification) => {
      const linked = applicationsByKey[String(notification.request_id)];
      if (!linked) {
        return notification;
      }

      return {
        ...notification,
        displayName: linked.name || notification.displayName,
        requestCode: linked.requestCode || notification.requestCode,
        category: linked.category || notification.category,
        statusLabel: linked.status || notification.statusLabel,
        requestStatus: linked.status || notification.requestStatus,
      };
    });
  }, [applicationsByKey, inboxNotifications]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const visibleNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      if (statusFilter === "Unread" && notification.is_read) {
        return false;
      }

      if (statusFilter === "Read" && !notification.is_read) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        notification.displayName,
        notification.description,
        notification.category,
        notification.assistanceCategoryName,
        notification.requestCode,
        notification.action,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [normalizedSearch, notifications, statusFilter]);

  const categoryTimeSections = useMemo(() => {
    const byCat = new Map();
    for (const notification of visibleNotifications) {
      const label =
        notification.assistanceCategoryName || notification.category || "Other";
      if (!byCat.has(label)) {
        byCat.set(label, []);
      }
      byCat.get(label).push(notification);
    }

    const names = [...byCat.keys()].sort((a, b) => a.localeCompare(b));

    return names.map((categoryName) => ({
      categoryName,
      sections: groupRowsIntoTimeSections(byCat.get(categoryName) || []),
    }));
  }, [visibleNotifications]);

  const hasAnyNotification = visibleNotifications.length > 0;
  const isInitialLoading =
    isLoadingPreview && inboxNotifications.length === 0 && isLoadingApps;
  const loadError = inboxLoadError || appsError;

  const openRequestFromNotification = useCallback(
    (notification) => {
      const requestId = notification?.request_id || notification?.assistance_request_id;
      if (!requestId) {
        return;
      }

      setIsOpeningRequest(true);

      try {
        const linked = applicationsByKey[String(requestId)];
        navigateToNotification(
          linked?.status
            ? {
                ...notification,
                requestStatus: linked.status,
                statusLabel: linked.status,
              }
            : notification
        );
      } finally {
        setIsOpeningRequest(false);
      }
    },
    [applicationsByKey, navigateToNotification]
  );

  const accentColor = theme?.secondary || "var(--apoyo-secondary)";

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="relative w-full max-w-lg">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
            size={17}
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search notifications"
            className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white text-sm text-gray-500 outline-none shadow-md border border-gray-100 focus:ring-2 focus:ring-[color-mix(in_srgb,var(--apoyo-ring)_45%,transparent)] transition-all duration-200 placeholder-gray-400"
          />
        </div>

        <MiniNotifications />
      </div>

      <div
        ref={notificationsCardRef}
        className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h1
            className="text-2xl"
            style={{
              fontFamily: "'Instrument Sans', sans-serif",
              fontWeight: 500,
              color: theme?.primary || "#1F2937",
            }}
          >
            Notifications
          </h1>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                invalidateAdminPipelineCaches();
                setReloadKey((previous) => previous + 1);
                void refreshNotifications({ runCleanup: true, forceCleanup: true });
              }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60"
              disabled={isLoadingPreview || isLoadingApps}
            >
              <RefreshCcw
                size={14}
                className={isLoadingPreview || isLoadingApps ? "animate-spin" : ""}
              />
              {isLoadingPreview || isLoadingApps ? "Reloading..." : "Reload"}
            </button>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--apoyo-ring)_45%,transparent)] text-gray-600"
            >
              {FILTER_OPTIONS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>

        {loadError && (
          <p className="mb-4 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm px-3 py-2">
            {loadError}
          </p>
        )}

        {isInitialLoading && (
          <p className="text-sm text-gray-500">Loading notifications...</p>
        )}

        {!isInitialLoading && !hasAnyNotification && (
          <p className="text-sm text-gray-500">No notifications found.</p>
        )}

        {!isInitialLoading &&
          categoryTimeSections.map((categoryBlock) => (
            <div key={categoryBlock.categoryName} className="mb-10 last:mb-0">
              <h2
                className="text-base font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100"
                style={{ fontFamily: "'Instrument Sans', sans-serif" }}
              >
                {categoryBlock.categoryName}
              </h2>

              {categoryBlock.sections.map((section) => (
                <div
                  key={`${categoryBlock.categoryName}-${section.key}`}
                  className="mb-6 last:mb-0"
                >
                  <h3 className="text-sm font-medium text-gray-600 mb-3">
                    {section.title}
                  </h3>

                  <div className="flex flex-col gap-2">
                    {section.rows.map((notification) => (
                      <div
                        key={`${notification.id}-${notification.audit_log_id || ""}`}
                        className="flex items-center gap-4 p-3 rounded-lg border border-gray-200 hover:shadow-sm transition-all duration-200"
                      >
                        <div className="w-5 flex items-center justify-center">
                          {!notification.is_read && (
                            <CircleAlert size={16} className="text-red-500" />
                          )}
                        </div>

                        <span className="text-sm font-medium text-gray-800 min-w-[150px]">
                          {notification.displayName}
                        </span>

                        <div className="text-sm text-gray-500 flex-1 min-w-0">
                          <p className="truncate">{notification.description}</p>
                          <p className="text-xs text-gray-400 truncate">
                            {notification.category} | Ref: {notification.requestCode}
                          </p>
                        </div>

                        <span className="text-xs text-gray-400 min-w-[140px] text-right">
                          {notification.timeLabel}
                        </span>

                        <button
                          type="button"
                          onClick={() => openRequestFromNotification(notification)}
                          disabled={isOpeningRequest}
                          className="text-xs font-semibold px-3 py-1.5 rounded-md border border-cyan-200 text-cyan-600 hover:bg-cyan-50 disabled:opacity-60"
                          style={{ color: accentColor }}
                        >
                          Read
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
