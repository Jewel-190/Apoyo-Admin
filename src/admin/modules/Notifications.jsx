import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, CircleAlert, RefreshCcw } from "lucide-react";
import { useLocation } from "react-router-dom";
import MiniNotifications from "../components/MiniNotifications";
import { useAuth } from "../../shared/context/AuthContext";
import {
  fetchAdminNotificationsForAdmin,
  markAdminNotificationsReadForAssistanceRequest,
} from "../../shared/lib/adminNotifications";
import { supabase } from "../../shared/lib/supabaseClient";
import {
  buildDisplayName,
  buildNotificationDescription,
  fetchApplicationsBySources,
  formatDate,
  formatRelativeWithTime,
  normalizeStatus,
  toValidDate,
} from "../../shared/lib/requestData";
import ReviewApplications from "./Applications/ReviewApplications";
import { canAutoTransitionToInProgress } from "../../shared/domain/status";

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

function buildApplicationRecord({ row, sourceMeta, userName }) {
  const submittedAt = row.submitted_at || null;
  const createdAt = row.created_at || null;

  return {
    key: `${sourceMeta?.serviceId || row.service_id || "unknown"}-${row.id}`,
    id: row.request_code || row.id,
    requestId: row.id,
    requestCode: row.request_code || row.id,
    userId: row.user_id || null,
    name: userName,
    category: sourceMeta?.category || "Request",
    date: formatDate(submittedAt || createdAt),
    submittedAt,
    createdAt,
    status: normalizeStatus(row.status),
    serviceId: row.service_id || sourceMeta?.serviceId || null,
  };
}

export default function Notifications() {
  const { theme, roleConfig, user, allowedServiceIds, adminShellReady } = useAuth();

  const [notifications, setNotifications] = useState([]);
  const [applicationsByKey, setApplicationsByKey] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [isLoading, setIsLoading] = useState(true);
  const [isOpeningRequest, setIsOpeningRequest] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [showReview, setShowReview] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const notificationsCardRef = useRef(null);
  const location = useLocation();

  const sourceTables = useMemo(
    () => roleConfig?.requestSources || [],
    [roleConfig]
  );

  const sourceServiceLookup = useMemo(() => {
    const map = {};
    for (const source of sourceTables) {
      if (source.serviceId) {
        map[source.serviceId] = source;
      }
    }
    return map;
  }, [sourceTables]);

  const markNotificationsReadForRequest = useCallback(
    async (assistanceRequestId) => {
      if (!assistanceRequestId || !user?.id) {
        return;
      }

      await markAdminNotificationsReadForAssistanceRequest(user.id, assistanceRequestId);
    },
    [user?.id]
  );

  const fetchApplicationByNotification = useCallback(async (notification) => {
    const requestId = notification.request_id;
    if (!requestId) {
      throw new Error("Missing request id.");
    }

    let reqQuery = supabase
      .from("assistance_requests")
      .select(
        "id, request_code, user_id, created_at, submitted_at, status, service_id"
      )
      .eq("id", requestId);
    if (allowedServiceIds.length > 0) {
      reqQuery = reqQuery.in("service_id", allowedServiceIds);
    }
    const { data: requestRow, error: reqErr } = await reqQuery.maybeSingle();

    if (reqErr) {
      throw reqErr;
    }

    if (!requestRow) {
      throw new Error("Request record was not found or is outside your line.");
    }

    const { data: svcRow } = await supabase
      .from("assistance_services")
      .select("id, display_name")
      .eq("id", requestRow.service_id)
      .maybeSingle();

    const sourceMeta = {
      serviceId: requestRow.service_id,
      category: svcRow?.display_name || "Request",
    };

    let applicantName = "Unknown Applicant";
    if (requestRow.user_id) {
      const { data: userRow } = await supabase
        .from("users")
        .select("first_name, middle_name, last_name, suffix")
        .eq("id", requestRow.user_id)
        .maybeSingle();

      applicantName = buildDisplayName(userRow);
    }

    return buildApplicationRecord({
      row: requestRow,
      sourceMeta,
      userName: applicantName,
    });
  }, [allowedServiceIds]);

  const loadNotifications = useCallback(async () => {
    if (!user?.id) {
      setNotifications([]);
      setApplicationsByKey({});
      setIsLoading(false);
      return;
    }

    if (!adminShellReady) {
      setIsLoading(true);
      return;
    }

    setIsLoading(true);
    setLoadError("");

    try {
      const [rpcRows, appRows] = await Promise.all([
        fetchAdminNotificationsForAdmin(user.id),
        sourceTables.length ? fetchApplicationsBySources(sourceTables) : Promise.resolve([]),
      ]);

      const scopedRows =
        allowedServiceIds.length > 0
          ? (rpcRows || []).filter(
              (row) => row.service_id && allowedServiceIds.includes(row.service_id)
            )
          : rpcRows || [];

      const appMap = Object.fromEntries(
        appRows.map((row) => [String(row.requestId), row])
      );

      const baseNotifications = scopedRows.map((row) => {
        const sourceMeta = (row.service_id && sourceServiceLookup[row.service_id]) || {
          serviceId: row.service_id,
          category: "Request",
        };
        const requestKey = `${row.service_id || "request"}-${row.request_id}`;
        const linkedApplication = appMap[String(row.request_id)];
        const category =
          linkedApplication?.category || sourceMeta.category || "Request";
        const displayName =
          linkedApplication?.name || row.applicantName || "Applicant";
        const eventAt = row.changed_at || row.updated_at || row.created_at;

        return {
          ...row,
          requestKey,
          category,
          displayName,
          eventAt,
          requestCode:
            linkedApplication?.requestCode ||
            row.requestCode ||
            (typeof row.request_id === "string"
              ? row.request_id.slice(0, 8)
              : "N/A"),
          description: buildNotificationDescription(row, category),
          timeLabel: formatRelativeWithTime(eventAt),
        };
      });

      const latestByRequestMap = baseNotifications.reduce((acc, row) => {
        const key = String(row.request_id);
        const current = acc[key];

        if (!current) {
          acc[key] = row;
          return acc;
        }

        const currentTime = new Date(current.eventAt || 0).getTime();
        const nextTime = new Date(row.eventAt || 0).getTime();

        if (nextTime >= currentTime) {
          acc[key] = row;
        }

        return acc;
      }, {});

      const dedupedNotifications = Object.values(latestByRequestMap);

      const filteredNotifications = dedupedNotifications
        .filter((notification) => {
          const linkedApplication = appMap[String(notification.request_id)];
          const statusLabel = linkedApplication
            ? linkedApplication.status
            : normalizeStatus(notification.requestStatus);

          if (statusLabel === "Approved") {
            return false;
          }

          if (statusLabel === "Draft") {
            return false;
          }

          return true;
        })
        .map((notification) => {
          const linkedApplication = appMap[String(notification.request_id)];
          if (linkedApplication) {
            return notification;
          }

          return {
            ...notification,
            displayName: notification.applicantName || notification.displayName || "Applicant",
            requestCode:
              notification.requestCode ||
              (typeof notification.request_id === "string"
                ? notification.request_id.slice(0, 8)
                : "N/A"),
            category: notification.assistanceCategoryName || notification.category || "Request",
          };
        })
        .sort((a, b) => {
          const aTime = new Date(a.eventAt || 0).getTime();
          const bTime = new Date(b.eventAt || 0).getTime();
          return bTime - aTime;
        });

      setApplicationsByKey(appMap);
      setNotifications(filteredNotifications);
    } catch (error) {
      setLoadError(error?.message || "Failed to load notifications.");
      setNotifications([]);
      setApplicationsByKey({});
    } finally {
      setIsLoading(false);
    }
  }, [adminShellReady, allowedServiceIds, sourceServiceLookup, sourceTables, user?.id]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications, reloadKey]);

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
      const label = notification.assistanceCategoryName || "Other";
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

  const openReviewFromNotification = useCallback(
    async (notification) => {
      if (!notification?.request_id) {
        return;
      }

      setIsOpeningRequest(true);
      setLoadError("");

      try {
        if (notification.request_id && user?.id) {
          await markNotificationsReadForRequest(notification.request_id);
          setNotifications((previous) =>
            previous.map((item) =>
              String(item.request_id) === String(notification.request_id)
                ? { ...item, is_read: true }
                : item
            )
          );
        }

        let application =
          applicationsByKey[String(notification.request_id)] ||
          (await fetchApplicationByNotification(notification));

        if (application?.serviceId && application?.requestId) {
          if (canAutoTransitionToInProgress(application.status)) {
            const updated = { ...application, status: "In Progress" };
            application = updated;

            setApplicationsByKey((previous) => ({
              ...previous,
              [notification.requestKey]: updated,
            }));

            let upd = supabase
              .from("assistance_requests")
              .update({ status: "in progress" })
              .eq("id", application.requestId);
            if (allowedServiceIds.length > 0) {
              upd = upd.in("service_id", allowedServiceIds);
            }
            const { error } = await upd;

            if (error) {
              throw error;
            }
          }
        }

        setSelectedApplication(application);
        setShowReview(true);
      } catch (error) {
        setLoadError(error?.message || "Unable to open request.");
      } finally {
        setIsOpeningRequest(false);
      }
    },
    [
      applicationsByKey,
      fetchApplicationByNotification,
      markNotificationsReadForRequest,
      user?.id,
      allowedServiceIds,
    ]
  );

  const handleBackToNotifications = () => {
    setShowReview(false);
    setSelectedApplication(null);
    setReloadKey((previous) => previous + 1);
  };

  useEffect(() => {
    try {
      const payload = location?.state?.openNotification;
      if (!payload) return;

      const match = notifications.find(
        (n) =>
          String(n.request_id) === String(payload.request_id)
      );

      if (match) {
        void openReviewFromNotification(match);
        try {
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (replaceStateError) {
          if (import.meta.env.DEV) {
            console.warn("Notifications: unable to clear history state", replaceStateError);
          }
        }
      }
    } catch (openNotificationError) {
      if (import.meta.env.DEV) {
        console.warn(
          "Notifications: unable to auto-open from location state",
          openNotificationError
        );
      }
    }
  }, [location?.state, notifications, openReviewFromNotification]);

  if (showReview && selectedApplication) {
    return (
      <ReviewApplications
        onBack={handleBackToNotifications}
        application={selectedApplication}
      />
    );
  }

  const accentColor = theme?.secondary || "var(--apoyo-secondary, #06C1EC)";

  return (
    <div className="min-h-screen">
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
              onClick={() => setReloadKey((previous) => previous + 1)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60"
              disabled={isLoading}
            >
              <RefreshCcw size={14} className={isLoading ? "animate-spin" : ""} />
              {isLoading ? "Reloading..." : "Reload"}
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

        {isLoading && (
          <p className="text-sm text-gray-500">Loading notifications...</p>
        )}

        {!isLoading && !hasAnyNotification && (
          <p className="text-sm text-gray-500">No notifications found.</p>
        )}

        {!isLoading &&
          categoryTimeSections.map((categoryBlock) => (
            <div key={categoryBlock.categoryName} className="mb-10 last:mb-0">
              <h2
                className="text-base font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100"
                style={{ fontFamily: "'Instrument Sans', sans-serif" }}
              >
                {categoryBlock.categoryName}
              </h2>

              {categoryBlock.sections.map((section) => (
                <div key={`${categoryBlock.categoryName}-${section.key}`} className="mb-6 last:mb-0">
                  <h3 className="text-sm font-medium text-gray-600 mb-3">{section.title}</h3>

                  <div className="flex flex-col gap-2">
                    {section.rows.map((notification) => (
                      <div
                        key={notification.id}
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
                          onClick={() => void openReviewFromNotification(notification)}
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
