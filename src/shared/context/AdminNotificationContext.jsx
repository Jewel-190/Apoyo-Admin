import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import {
  buildAdminNotificationInbox,
  fetchAdminNotificationById,
  fetchAdminNotificationsForAdmin,
  fetchUnreadNotificationCountForAdmin,
  getBrowserNotificationPermission,
  isBrowserNotificationSupported,
  isVisibleAdminNotification,
  mapAdminNotificationForDisplay,
  markAdminNotificationsReadForAssistanceRequest,
  mergeNotificationIntoInbox,
  requestBrowserNotificationPermission,
  scopeAdminNotifications,
  setBrowserAlertsPreference,
  shouldShowBrowserNotifications,
  showAdminBrowserNotification,
  subscribeAdminNotificationChanges,
  reconcileAdminNotifications,
} from "../lib/adminNotifications";
import {
  buildOpenRequestLocationState,
  resolveAdminModulePathForStatus,
} from "../lib/adminRequestNavigation";

const AdminNotificationContext = createContext(null);

const REALTIME_DEBOUNCE_MS = 200;
const PREVIEW_MAX_ITEMS = 8;

function alertKeyForRow(row) {
  if (!row) return "";
  if (row.audit_log_id) return `audit:${row.audit_log_id}`;
  if (row.id) return `id:${row.id}`;
  return "";
}

function inboxSignature(rows) {
  return (rows || [])
    .map(
      (row) =>
        `${row.id}:${row.audit_log_id || ""}:${row.is_read ? 1 : 0}:${row.eventAt || ""}`
    )
    .join("|");
}

export function AdminNotificationProvider({ children }) {
  const navigate = useNavigate();
  const { user, adminShellReady, allowedServiceIds, roleConfig } = useAuth();

  const [inboxNotifications, setInboxNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [browserPermission, setBrowserPermission] = useState(
    () => getBrowserNotificationPermission()
  );
  const [browserAlertsEnabled, setBrowserAlertsEnabled] = useState(
    () => shouldShowBrowserNotifications()
  );

  const seenAlertKeysRef = useRef(new Set());
  const hasSeededSeenRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const pendingRefreshRef = useRef(null);
  const refreshNotificationsRef = useRef(null);
  const realtimeDebounceRef = useRef(null);
  const allowedServiceIdsRef = useRef(allowedServiceIds);
  const sourceServiceLookupRef = useRef({});
  const inboxNotificationsRef = useRef(inboxNotifications);
  const unreadCountRef = useRef(unreadCount);

  const sourceServiceLookup = useMemo(() => {
    const map = {};
    const rows = [
      ...(roleConfig?.querySources || []),
      ...(roleConfig?.requestSources || []),
    ];
    for (const source of rows) {
      if (source.serviceId) {
        map[source.serviceId] = source;
      }
    }
    return map;
  }, [roleConfig?.querySources, roleConfig?.requestSources]);

  allowedServiceIdsRef.current = allowedServiceIds;
  sourceServiceLookupRef.current = sourceServiceLookup;
  inboxNotificationsRef.current = inboxNotifications;
  unreadCountRef.current = unreadCount;

  const previewNotifications = useMemo(
    () => inboxNotifications.slice(0, PREVIEW_MAX_ITEMS),
    [inboxNotifications]
  );

  const syncBrowserAlertState = useCallback(() => {
    setBrowserPermission(getBrowserNotificationPermission());
    setBrowserAlertsEnabled(shouldShowBrowserNotifications());
  }, []);

  const applyInbox = useCallback((nextInbox, nextUnread = null) => {
    const previous = inboxNotificationsRef.current;
    const changed = inboxSignature(previous) !== inboxSignature(nextInbox);
    if (changed) {
      setInboxNotifications(nextInbox);
    }
    if (typeof nextUnread === "number" && nextUnread !== unreadCountRef.current) {
      setUnreadCount(nextUnread);
    }
    return changed;
  }, []);

  const navigateToNotification = useCallback(
    (notification) => {
      if (!notification) {
        navigate("/admin/notifications");
        return;
      }

      const requestId =
        notification.request_id || notification.assistance_request_id || null;

      if (!requestId) {
        navigate("/admin/notifications");
        return;
      }

      // Optimistic read in shared inbox (bell + Notifications page).
      const markedCount = inboxNotificationsRef.current.filter(
        (row) =>
          !row.is_read &&
          (String(row.request_id) === String(requestId) ||
            String(row.assistance_request_id) === String(requestId))
      ).length;

      setInboxNotifications((previous) =>
        previous.map((row) =>
          String(row.request_id) === String(requestId) ||
          String(row.assistance_request_id) === String(requestId)
            ? { ...row, is_read: true }
            : row
        )
      );
      if (markedCount > 0) {
        setUnreadCount((previous) => Math.max(0, previous - markedCount));
      }

      if (user?.id) {
        void markAdminNotificationsReadForAssistanceRequest(user.id, requestId)
          .then(() => {
            void refreshNotificationsRef.current?.();
          })
          .catch((error) => {
            console.warn("[AdminNotificationContext] mark read failed:", error);
          });
      }

      const status =
        notification.statusLabel ||
        notification.requestStatus ||
        notification.new_status ||
        null;

      navigate(resolveAdminModulePathForStatus(status), {
        state: buildOpenRequestLocationState(requestId),
      });
    },
    [navigate, user?.id]
  );

  const maybeShowBrowserAlert = useCallback(
    (notificationRow) => {
      if (!notificationRow?.id || notificationRow.is_read) {
        return;
      }

      const key = alertKeyForRow(notificationRow);
      if (!key || seenAlertKeysRef.current.has(key)) {
        return;
      }

      seenAlertKeysRef.current.add(key);

      if (!shouldShowBrowserNotifications()) {
        return;
      }

      const mapped = mapAdminNotificationForDisplay(
        notificationRow,
        sourceServiceLookupRef.current
      );
      showAdminBrowserNotification(mapped, {
        onClick: navigateToNotification,
      });
    },
    [navigateToNotification]
  );

  const refreshNotifications = useCallback(
    async ({ runCleanup = false, forceCleanup = false, showAlerts = false } = {}) => {
      if (!user?.id || !adminShellReady) {
        setInboxNotifications([]);
        setUnreadCount(0);
        return;
      }

      if (refreshInFlightRef.current) {
        pendingRefreshRef.current = { runCleanup, forceCleanup, showAlerts };
        return;
      }

      refreshInFlightRef.current = true;
      const shouldShowLoading = inboxNotificationsRef.current.length === 0;
      if (shouldShowLoading) {
        setIsLoadingPreview(true);
      }
      setLoadError("");

      try {
        const [rows, count] = await Promise.all([
          fetchAdminNotificationsForAdmin(user.id),
          fetchUnreadNotificationCountForAdmin(user.id),
        ]);

        const scopedRows = scopeAdminNotifications(rows, allowedServiceIdsRef.current);
        const inbox = buildAdminNotificationInbox(scopedRows, {
          sourceServiceLookup: sourceServiceLookupRef.current,
        });

        if (!hasSeededSeenRef.current) {
          for (const row of inbox) {
            const key = alertKeyForRow(row);
            if (key) seenAlertKeysRef.current.add(key);
          }
          hasSeededSeenRef.current = true;
        } else if (showAlerts) {
          for (const row of inbox) {
            if (!row.is_read) {
              maybeShowBrowserAlert(row);
            }
          }
        }

        applyInbox(inbox, count);
        syncBrowserAlertState();

        // Janitor only — live rows come from the DB trigger + Realtime.
        if (runCleanup) {
          void reconcileAdminNotifications({ force: forceCleanup }).then((result) => {
            if (result?.success && !result?.skipped) {
              void refreshNotificationsRef.current?.({ showAlerts: true });
            }
          });
        }
      } catch (error) {
        setLoadError(error?.message || "Failed to load notifications.");
      } finally {
        setIsLoadingPreview(false);
        refreshInFlightRef.current = false;

        const pending = pendingRefreshRef.current;
        if (pending) {
          pendingRefreshRef.current = null;
          void refreshNotificationsRef.current?.(pending);
        }
      }
    },
    [adminShellReady, applyInbox, maybeShowBrowserAlert, syncBrowserAlertState, user?.id]
  );

  refreshNotificationsRef.current = refreshNotifications;

  const handleRealtimePayload = useCallback(
    async (payload) => {
      if (!user?.id) {
        return;
      }

      const eventType = payload?.eventType;
      const row = payload?.new || payload?.old;
      const previous = payload?.old;

      if (row && (eventType === "INSERT" || eventType === "UPDATE")) {
        try {
          const enriched = await fetchAdminNotificationById(user.id, row.id);
          if (enriched) {
            const scoped =
              scopeAdminNotifications([enriched], allowedServiceIdsRef.current)[0] ||
              null;

            if (scoped && isVisibleAdminNotification(scoped)) {
              const mapped = mapAdminNotificationForDisplay(
                scoped,
                sourceServiceLookupRef.current
              );

              setInboxNotifications((previousInbox) =>
                mergeNotificationIntoInbox(previousInbox, mapped)
              );

              if (eventType === "INSERT" && mapped.is_read === false) {
                setUnreadCount((count) => count + 1);
                await maybeShowBrowserAlert(mapped);
              } else if (
                eventType === "UPDATE" &&
                previous?.is_read === true &&
                mapped.is_read === false
              ) {
                setUnreadCount((count) => count + 1);
                await maybeShowBrowserAlert(mapped);
              } else if (
                eventType === "UPDATE" &&
                previous?.is_read === false &&
                mapped.is_read === true
              ) {
                setUnreadCount((count) => Math.max(0, count - 1));
              } else if (
                eventType === "UPDATE" &&
                previous?.audit_log_id !== mapped.audit_log_id &&
                mapped.is_read === false
              ) {
                await maybeShowBrowserAlert(mapped);
              }
            } else if (eventType === "UPDATE" && row.is_read === true) {
              // Hidden/approved or out-of-scope: drop from inbox immediately.
              setInboxNotifications((previousInbox) =>
                previousInbox.filter((item) => String(item.id) !== String(row.id))
              );
            }
          }
        } catch (error) {
          console.warn(
            "[AdminNotificationContext] Realtime notification lookup failed:",
            error
          );
        }
      }

      // Reconcile with DB shortly after optimistic merge (no edge janitor).
      void refreshNotificationsRef.current?.({ showAlerts: false });
    },
    [maybeShowBrowserAlert, user?.id]
  );

  const enableBrowserAlerts = useCallback(async () => {
    const result = await requestBrowserNotificationPermission();
    syncBrowserAlertState();
    if (result === "granted") {
      setBrowserAlertsPreference(true);
      setBrowserAlertsEnabled(true);
    }
    return result;
  }, [syncBrowserAlertState]);

  const disableBrowserAlerts = useCallback(() => {
    setBrowserAlertsPreference(false);
    setBrowserAlertsEnabled(false);
  }, []);

  useEffect(() => {
    hasSeededSeenRef.current = false;
    seenAlertKeysRef.current = new Set();
  }, [user?.id]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const baseTitle = "Apoyo Admin";
    document.title =
      unreadCount > 0 ? `(${unreadCount}) ${baseTitle}` : baseTitle;

    return () => {
      document.title = baseTitle;
    };
  }, [unreadCount]);

  useEffect(() => {
    if (!user?.id || !adminShellReady) {
      return undefined;
    }

    // One janitor pass on shell ready; live updates are Realtime after that.
    void refreshNotificationsRef.current?.({ runCleanup: true, forceCleanup: true });

    const unsubscribe = subscribeAdminNotificationChanges(user.id, {
      onChange: (payload) => {
        window.clearTimeout(realtimeDebounceRef.current);
        realtimeDebounceRef.current = window.setTimeout(() => {
          void handleRealtimePayload(payload);
        }, REALTIME_DEBOUNCE_MS);
      },
      onStatus: (status) => {
        if (status === "SUBSCRIBED") {
          void refreshNotificationsRef.current?.();
        }
      },
    });

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshNotificationsRef.current?.({ showAlerts: true });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearTimeout(realtimeDebounceRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
      unsubscribe();
    };
  }, [adminShellReady, handleRealtimePayload, user?.id]);

  const value = useMemo(
    () => ({
      inboxNotifications,
      previewNotifications,
      unreadCount,
      hasUnread: unreadCount > 0,
      isLoadingPreview,
      loadError,
      browserPermission,
      browserAlertsSupported: isBrowserNotificationSupported(),
      browserAlertsEnabled,
      refreshNotifications,
      enableBrowserAlerts,
      disableBrowserAlerts,
      navigateToNotification,
    }),
    [
      inboxNotifications,
      previewNotifications,
      unreadCount,
      isLoadingPreview,
      loadError,
      browserPermission,
      browserAlertsEnabled,
      refreshNotifications,
      enableBrowserAlerts,
      disableBrowserAlerts,
      navigateToNotification,
    ]
  );

  return (
    <AdminNotificationContext.Provider value={value}>
      {children}
    </AdminNotificationContext.Provider>
  );
}

export function useAdminNotifications() {
  const context = useContext(AdminNotificationContext);
  if (!context) {
    throw new Error("useAdminNotifications must be used within AdminNotificationProvider");
  }
  return context;
}
