import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, CircleAlert, RefreshCcw } from "lucide-react";
import { useLocation } from "react-router-dom";
import MiniNotifications from "../components/MiniNotifications";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";
import {
  buildDisplayName,
  buildNotificationDescription,
  fetchApplicationsBySources,
  formatDate,
  formatRelativeWithTime,
  normalizeStatus,
  toValidDate,
} from "../lib/requestData";
import ReviewApplications from "./Applications/ReviewApplications";

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

function buildApplicationRecord({ row, sourceMeta, userName }) {
  const submittedAt = row.submitted_at || null;
  const createdAt = row.created_at || null;

  return {
    key: `${sourceMeta?.table || "unknown"}-${row.id}`,
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
    sourceTable: sourceMeta?.table || "",
  };
}

export default function Notifications() {
  const { theme, roleConfig, user } = useAuth();

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

  const sourceTableLookup = useMemo(() => {
    const map = {};
    for (const source of sourceTables) {
      map[source.table] = source;
    }
    return map;
  }, [sourceTables]);

  const markNotificationRead = useCallback(
    async (notification) => {
      if (!notification?.request_table || !notification?.request_id || !user?.id) {
        return;
      }

      const { error } = await supabase.rpc(
        "mark_request_notifications_read_for_admin",
        {
          p_admin_user_id: user.id,
          p_request_table: notification.request_table,
          p_request_id: notification.request_id,
        }
      );

      if (error) {
        throw error;
      }
    },
    [user?.id]
  );

  const fetchApplicationByNotification = useCallback(
    async (notification) => {
      const sourceMeta = sourceTableLookup[notification.request_table] || {
        table: notification.request_table,
        category: "Request",
      };

      const withSubmittedAt = await supabase
        .from(sourceMeta.table)
        .select("id, request_code, user_id, created_at, submitted_at, status")
        .eq("id", notification.request_id)
        .maybeSingle();

      let requestRow = withSubmittedAt.data;
      let requestError = withSubmittedAt.error;

      if (requestError) {
        const fallback = await supabase
          .from(sourceMeta.table)
          .select("id, request_code, user_id, created_at, status")
          .eq("id", notification.request_id)
          .maybeSingle();

        requestRow = fallback.data;
        requestError = fallback.error;
      }

      if (requestError) {
        throw requestError;
      }

      if (!requestRow) {
        throw new Error("Request record was not found.");
      }

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
    },
    [sourceTableLookup]
  );

  const loadNotifications = useCallback(async () => {
    if (!user?.id) {
      setNotifications([]);
      setApplicationsByKey({});
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError("");

    try {
      const [{ data: rpcRows, error: rpcError }, appRows] = await Promise.all([
        supabase.rpc("get_latest_notifications_for_admin", {
          p_admin_user_id: user.id,
        }),
        sourceTables.length ? fetchApplicationsBySources(sourceTables) : Promise.resolve([]),
      ]);

      if (rpcError) {
        throw rpcError;
      }

      const appMap = Object.fromEntries(
        appRows.map((row) => [`${row.sourceTable}-${row.requestId}`, row])
      );

      const baseNotifications = (rpcRows || [])
        .map((row) => {
          const sourceMeta = sourceTableLookup[row.request_table] || {
            table: row.request_table,
            category: "Request",
          };
          const requestKey = `${row.request_table}-${row.request_id}`;
          const linkedApplication = appMap[requestKey];
          const category = linkedApplication?.category || sourceMeta.category || "Request";
          const displayName = linkedApplication?.name || "Unknown Applicant";
          const eventAt = row.changed_at || row.updated_at || row.created_at;

          return {
            ...row,
            requestKey,
            category,
            displayName,
            eventAt,
            requestCode:
              linkedApplication?.requestCode ||
              (typeof row.request_id === "string" ? row.request_id.slice(0, 8) : "N/A"),
            description: buildNotificationDescription(row, category),
            timeLabel: formatRelativeWithTime(eventAt),
          };
        });

      const latestByRequestMap = baseNotifications.reduce((acc, row) => {
        const key = `${row.request_table}-${row.request_id}`;
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
          const linkedApplication = appMap[notification.requestKey];

          if (!linkedApplication) {
            return false;
          }

          if (linkedApplication.name === "Unknown Applicant") {
            return false;
          }

          if (linkedApplication.status === "Approved") {
            return false;
          }

          return true;
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
  }, [sourceTableLookup, sourceTables, user?.id]);

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
        notification.requestCode,
        notification.action,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [normalizedSearch, notifications, statusFilter]);

  const groupedNotifications = useMemo(() => {
    const grouped = {
      today: [],
      thisWeek: [],
      thisMonth: [],
      pastMonths: [],
    };

    for (const notification of visibleNotifications) {
      const bucket = resolveTimeBucket(notification.eventAt || notification.created_at);
      grouped[bucket].push(notification);
    }

    return grouped;
  }, [visibleNotifications]);

  const sections = useMemo(
    () => [
      { key: "today", title: "Today", rows: groupedNotifications.today },
      { key: "thisWeek", title: "This week", rows: groupedNotifications.thisWeek },
      { key: "thisMonth", title: "This month", rows: groupedNotifications.thisMonth },
      {
        key: "pastMonths",
        title: "Past Months",
        rows: groupedNotifications.pastMonths,
      },
    ],
    [groupedNotifications]
  );

  const hasAnyNotification = visibleNotifications.length > 0;

  const openReviewFromNotification = useCallback(
    async (notification) => {
      if (!notification?.request_table || !notification?.request_id) {
        return;
      }

      setIsOpeningRequest(true);
      setLoadError("");

      try {
        if (!notification.is_read) {
          await markNotificationRead(notification);
          setNotifications((previous) =>
            previous.map((item) => {
              if (
                item.request_table === notification.request_table &&
                item.request_id === notification.request_id
              ) {
                return { ...item, is_read: true };
              }
              return item;
            })
          );
        }

        let application =
          applicationsByKey[notification.requestKey] ||
          (await fetchApplicationByNotification(notification));

        if (application?.sourceTable && application?.requestId) {
          const shouldMoveToInProgress =
            application.status !== "In Progress" &&
            application.status !== "Resubmitted" &&
            application.status !== "For Approval" &&
            application.status !== "Scheduled" &&
            application.status !== "Approved" &&
            application.status !== "Case Study";

          if (shouldMoveToInProgress) {
            const updated = { ...application, status: "In Progress" };
            application = updated;

            setApplicationsByKey((previous) => ({
              ...previous,
              [notification.requestKey]: updated,
            }));

            const { error } = await supabase
              .from(application.sourceTable)
              .update({ status: "in progress" })
              .eq("id", application.requestId);

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
      markNotificationRead,
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
          n.request_table === payload.request_table &&
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

  const accentColor = theme?.secondary || "#06C1EC";

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
            className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white text-sm text-gray-500 outline-none shadow-md border border-gray-100 focus:ring-2 focus:ring-teal-300 transition-all duration-200 placeholder-gray-400"
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
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-teal-300 text-gray-600"
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
          sections.map((section) => {
            if (section.rows.length === 0) {
              return null;
            }

            return (
              <div key={section.key} className="mb-6 last:mb-0">
                <h2 className="text-sm font-medium text-gray-700 mb-3">{section.title}</h2>

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
            );
          })}
      </div>
    </div>
  );
}
