import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CircleAlert, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";
import {
  buildNotificationDescription,
  fetchApplicationsBySources,
  formatRelativeWithTime,
} from "../lib/requestData";

export default function MiniNotifications({ maxItems = 8 }) {
  const { roleConfig, user } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const ref = useRef(null);

  const sourceTables = useMemo(() => roleConfig?.requestSources || [], [roleConfig]);

  const sourceTableLookup = useMemo(() => {
    const m = {};
    for (const s of sourceTables) m[s.table] = s;
    return m;
  }, [sourceTables]);

  const hasUnread = useMemo(() => notifications.some((n) => !n.is_read), [notifications]);

  const load = useCallback(async () => {
    if (!user?.id) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError("");

    try {
      const { data: rpcRows, error: rpcError } = await supabase.rpc(
        "get_latest_notifications_for_admin",
        { p_admin_user_id: user.id }
      );

      if (rpcError) throw rpcError;

      const appRows = sourceTables.length ? await fetchApplicationsBySources(sourceTables) : [];
      const appMap = Object.fromEntries(appRows.map((r) => [`${r.sourceTable}-${r.requestId}`, r]));

      const mapped = (rpcRows || []).map((row) => {
        const sourceMeta = sourceTableLookup[row.request_table] || { table: row.request_table, category: "Request" };
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
          requestCode: linkedApplication?.requestCode || (typeof row.request_id === "string" ? row.request_id.slice(0, 8) : "N/A"),
          description: buildNotificationDescription(row, category),
          timeLabel: formatRelativeWithTime(eventAt),
        };
      });

      const filtered = mapped
        .filter((n) => {
          const linked = appMap[n.requestKey];
          if (!linked) return false;
          if (linked.name === "Unknown Applicant") return false;
          if (linked.status === "Approved") return false;
          return true;
        })
        .sort((a, b) => new Date(b.eventAt || 0).getTime() - new Date(a.eventAt || 0).getTime());

      setNotifications(filtered.slice(0, Math.max(0, maxItems)));
    } catch (err) {
      setLoadError(err?.message || "Failed to load");
      setNotifications([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, sourceTables, sourceTableLookup, maxItems]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutside = (e) => {
      if (ref.current?.contains(e.target)) return;
      setIsOpen(false);
    };

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [isOpen]);

  const handleViewAll = () => {
    setIsOpen(false);
    navigate("/notifications");
  };

  const handleItemClick = (notification) => {
    setIsOpen(false);
    navigate("/notifications", {
      state: { openNotification: { request_table: notification.request_table, request_id: notification.request_id } },
    });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen((p) => !p)}
        className="relative flex items-center gap-2 px-4 py-2.5 rounded-full bg-white shadow-md border border-gray-100 hover:shadow-lg transition-all duration-200"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Open latest notifications"
      >
        <span className="relative inline-flex">
          <Bell size={18} className="text-gray-400" />
          {hasUnread && (
            <span className="absolute -top-1.5 -left-1.5 inline-flex items-center justify-center rounded-full bg-white">
              <CircleAlert size={12} className="text-red-500" />
            </span>
          )}
        </span>
        <ChevronDown size={14} className="text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-[330px] rounded-xl border border-gray-200 bg-white shadow-xl z-30 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Latest Notifications</p>
          </div>

          <div className="max-h-[320px] overflow-y-auto">
            {isLoading ? (
              <p className="px-4 py-4 text-xs text-gray-500">Loading notifications...</p>
            ) : loadError ? (
              <p className="px-4 py-4 text-xs text-red-500">{loadError}</p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-4 text-xs text-gray-500">No notifications yet.</p>
            ) : (
              notifications.map((notification) => (
                <div
                  key={`mini-${notification.id}`}
                  onClick={() => handleItemClick(notification)}
                  className="px-4 py-3 border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-gray-50"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 h-4 w-4 flex items-center justify-center">
                      {!notification.is_read && (
                        <CircleAlert size={12} className="text-red-500" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-700 truncate">
                        {notification.displayName}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{notification.description}</p>
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">{notification.timeLabel}</p>
                    </div>
                  </div>
                </div>
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
      )}
    </div>
  );
}
