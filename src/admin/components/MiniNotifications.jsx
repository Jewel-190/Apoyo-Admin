import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CircleAlert, ChevronDown } from "lucide-react";
import { useAdminNotifications } from "../../shared/context/AdminNotificationContext";

export default function MiniNotifications({ maxItems = 8 }) {
  const {
    previewNotifications,
    hasUnread,
    unreadCount,
    isLoadingPreview,
    loadError,
    browserPermission,
    browserAlertsSupported,
    browserAlertsEnabled,
    refreshNotifications,
    enableBrowserAlerts,
    disableBrowserAlerts,
    navigateToNotification,
  } = useAdminNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const [isEnablingAlerts, setIsEnablingAlerts] = useState(false);
  const ref = useRef(null);

  const notifications = previewNotifications.slice(0, Math.max(0, maxItems));
  const showEnableAlerts =
    browserAlertsSupported &&
    !browserAlertsEnabled &&
    browserPermission !== "denied";

  const handleToggle = () => {
    setIsOpen((previous) => !previous);
  };

  const handleRefresh = useCallback(async () => {
    await refreshNotifications();
  }, [refreshNotifications]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    void handleRefresh();
  }, [isOpen, handleRefresh]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleOutside = (event) => {
      if (ref.current?.contains(event.target)) {
        return;
      }
      setIsOpen(false);
    };

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [isOpen]);

  const handleViewAll = () => {
    setIsOpen(false);
    navigateToNotification(null);
  };

  const handleItemClick = (notification) => {
    setIsOpen(false);
    navigateToNotification(notification);
  };

  const handleEnableAlerts = async () => {
    setIsEnablingAlerts(true);
    try {
      await enableBrowserAlerts();
    } finally {
      setIsEnablingAlerts(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={handleToggle}
        className="relative flex items-center gap-2 px-4 py-2.5 rounded-full bg-white shadow-md border border-gray-100 hover:shadow-lg transition-all duration-200"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Open latest notifications"
      >
        <span className="relative inline-flex">
          <Bell size={18} className="text-gray-400" />
          {hasUnread ? (
            <span className="absolute -top-1.5 -left-1.5 inline-flex items-center justify-center rounded-full bg-white">
              <CircleAlert size={12} className="text-red-500" />
            </span>
          ) : null}
        </span>
        <ChevronDown size={14} className="text-gray-400" />
      </button>

      {isOpen ? (
        <div className="absolute right-0 mt-2 w-[330px] rounded-xl border border-gray-200 bg-white shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Latest Notifications</p>
            {unreadCount > 0 ? (
              <span className="text-[11px] font-semibold text-red-500">{unreadCount} unread</span>
            ) : null}
          </div>

          {showEnableAlerts ? (
            <div className="px-4 py-2.5 border-b border-gray-100 bg-teal-50/70">
              <p className="text-[11px] text-gray-600 mb-1.5">
                Get a desktop popup when new requests arrive — even if this tab is in the background.
              </p>
              <button
                type="button"
                onClick={handleEnableAlerts}
                disabled={isEnablingAlerts}
                className="text-[11px] font-semibold text-teal-700 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isEnablingAlerts ? "Enabling alerts..." : "Enable browser alerts"}
              </button>
            </div>
          ) : null}

          {browserAlertsSupported && browserPermission === "denied" ? (
            <div className="px-4 py-2 border-b border-gray-100 bg-amber-50/80">
              <p className="text-[11px] text-amber-800">
                Browser alerts are blocked. Allow notifications for this site in your browser settings.
              </p>
            </div>
          ) : null}

          {browserAlertsSupported && browserAlertsEnabled ? (
            <div className="px-4 py-1.5 border-b border-gray-100">
              <button
                type="button"
                onClick={disableBrowserAlerts}
                className="text-[10px] text-gray-500 hover:text-gray-700"
              >
                Turn off browser alerts
              </button>
            </div>
          ) : null}

          <div className="max-h-[320px] overflow-y-auto">
            {isLoadingPreview && notifications.length === 0 ? (
              <p className="px-4 py-4 text-xs text-gray-500">Loading notifications...</p>
            ) : loadError && notifications.length === 0 ? (
              <p className="px-4 py-4 text-xs text-red-500">{loadError}</p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-4 text-xs text-gray-500">No notifications yet.</p>
            ) : (
              notifications.map((notification) => (
                <button
                  key={`mini-${notification.id}-${notification.audit_log_id || ""}`}
                  type="button"
                  onClick={() => handleItemClick(notification)}
                  className="w-full px-4 py-3 border-b border-gray-100 last:border-b-0 text-left cursor-pointer hover:bg-gray-50"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 h-4 w-4 flex items-center justify-center">
                      {!notification.is_read ? (
                        <CircleAlert size={12} className="text-red-500" />
                      ) : null}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-700 truncate">
                        {notification.displayName}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{notification.description}</p>
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">
                        {notification.timeLabel}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/60">
            <button
              type="button"
              onClick={handleViewAll}
              className="text-xs font-semibold text-cyan-600 hover:text-cyan-700"
            >
              View all notifications
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
