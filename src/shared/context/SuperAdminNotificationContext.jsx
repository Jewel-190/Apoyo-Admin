/* eslint-disable react-refresh/only-export-components */
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
  fetchSuperAdminUnreadCount,
  getBrowserNotificationPermission,
  markSuperAdminNotificationRead,
  requestBrowserNotificationPermission,
  setBrowserAlertsPreference,
  shouldShowBrowserNotifications,
  showSuperAdminBrowserNotification,
  subscribeSuperAdminNotifications,
} from "../lib/superAdminNotificationsApi";

const SuperAdminNotificationContext = createContext(null);

const TITLE_BASE = "Apoyo Superadmin";
const REFRESH_DEBOUNCE_MS = 250;

function mapRealtimeInsert(row) {
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    requestId: row.request_id,
    eventType: row.event_type,
    status: row.status,
    title: row.title,
    body: row.body,
    requestCode: row.request_code,
    applicantName: row.applicant_name,
    applicantUserId: row.applicant_user_id,
    serviceName: row.service_name,
    assistanceName: row.assistance_name,
    isRead: false,
    readAt: null,
  };
}

export function SuperAdminNotificationProvider({ children }) {
  const navigate = useNavigate();
  const { user, isAuthorizedSuperadmin } = useAuth();
  const userId = user?.id || null;

  const [unreadCount, setUnreadCount] = useState(0);
  const [inboxVersion, setInboxVersion] = useState(0);
  const [browserPermission, setBrowserPermission] = useState(() =>
    getBrowserNotificationPermission()
  );
  const [browserAlertsEnabled, setBrowserAlertsEnabled] = useState(() =>
    shouldShowBrowserNotifications()
  );

  const seenIdsRef = useRef(new Set());
  const seededRef = useRef(false);
  const refreshTimerRef = useRef(null);

  const bumpInbox = useCallback(() => {
    setInboxVersion((value) => value + 1);
  }, []);

  const refreshUnread = useCallback(async () => {
    if (!userId || !isAuthorizedSuperadmin) {
      return 0;
    }
    try {
      const count = await fetchSuperAdminUnreadCount();
      setUnreadCount(count);
      return count;
    } catch (error) {
      console.warn("[SuperAdminNotificationProvider] unread count failed:", error);
      return 0;
    }
  }, [isAuthorizedSuperadmin, userId]);

  const scheduleRefresh = useCallback(() => {
    window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      void refreshUnread();
      bumpInbox();
    }, REFRESH_DEBOUNCE_MS);
  }, [bumpInbox, refreshUnread]);

  const openNotification = useCallback(
    (notification) => {
      const id = notification?.id;
      if (!id) {
        navigate("/superadmin/notifications");
        return;
      }
      navigate(`/superadmin/notifications/${id}`);
    },
    [navigate]
  );

  const maybeShowBrowserAlert = useCallback(
    (notification) => {
      if (!notification?.id || notification.isRead) return;
      if (seenIdsRef.current.has(notification.id)) return;
      seenIdsRef.current.add(notification.id);

      if (!shouldShowBrowserNotifications()) return;
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        const path = String(window.location?.pathname || "");
        if (path.startsWith("/superadmin/notifications")) return;
      }

      showSuperAdminBrowserNotification(notification, { onClick: openNotification });
    },
    [openNotification]
  );

  const enableBrowserAlerts = useCallback(async () => {
    const result = await requestBrowserNotificationPermission();
    setBrowserPermission(getBrowserNotificationPermission());
    const enabled = result === "granted";
    setBrowserAlertsPreference(enabled);
    setBrowserAlertsEnabled(enabled && shouldShowBrowserNotifications());
    return result;
  }, []);

  const disableBrowserAlerts = useCallback(() => {
    setBrowserAlertsPreference(false);
    setBrowserAlertsEnabled(false);
  }, []);

  const markRead = useCallback(
    async (notificationId) => {
      if (!notificationId) return null;
      const result = await markSuperAdminNotificationRead(notificationId);
      if (typeof result?.unreadCount === "number") {
        setUnreadCount(result.unreadCount);
      } else {
        await refreshUnread();
      }
      bumpInbox();
      return result;
    },
    [bumpInbox, refreshUnread]
  );

  useEffect(() => {
    seededRef.current = false;
    seenIdsRef.current = new Set();
  }, [userId]);

  useEffect(() => {
    if (!userId || !isAuthorizedSuperadmin) {
      return undefined;
    }

    scheduleRefresh();

    const unsubscribe = subscribeSuperAdminNotifications(userId, {
      onInsert: (row) => {
        const mapped = mapRealtimeInsert(row);
        if (!mapped) return;
        if (!seededRef.current) {
          seenIdsRef.current.add(mapped.id);
        } else {
          maybeShowBrowserAlert(mapped);
        }
        scheduleRefresh();
      },
      onReadChange: () => {
        scheduleRefresh();
      },
      onStatus: (status) => {
        if (status === "SUBSCRIBED") {
          seededRef.current = true;
          void refreshUnread();
        }
      },
    });

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshUnread();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearTimeout(refreshTimerRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
      unsubscribe();
    };
  }, [isAuthorizedSuperadmin, maybeShowBrowserAlert, refreshUnread, scheduleRefresh, userId]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const nextTitle = unreadCount > 0 ? `(${unreadCount}) ${TITLE_BASE}` : TITLE_BASE;
    document.title = nextTitle;
    return () => {
      document.title = TITLE_BASE;
    };
  }, [unreadCount]);

  const value = useMemo(
    () => ({
      unreadCount,
      hasUnread: unreadCount > 0,
      inboxVersion,
      browserPermission,
      browserAlertsEnabled,
      refreshUnread,
      markRead,
      openNotification,
      enableBrowserAlerts,
      disableBrowserAlerts,
    }),
    [
      browserAlertsEnabled,
      browserPermission,
      disableBrowserAlerts,
      enableBrowserAlerts,
      inboxVersion,
      markRead,
      openNotification,
      refreshUnread,
      unreadCount,
    ]
  );

  return (
    <SuperAdminNotificationContext.Provider value={value}>
      {children}
    </SuperAdminNotificationContext.Provider>
  );
}

export function useSuperAdminNotifications() {
  const context = useContext(SuperAdminNotificationContext);
  if (!context) {
    throw new Error("useSuperAdminNotifications must be used within SuperAdminNotificationProvider");
  }
  return context;
}
