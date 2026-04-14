// src/applications/Notifications.jsx
import { useState } from "react";
import { Search, Bell, ChevronDown } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const notificationsData = {
  today: [
    {
      id: 1,
      name: "Jose Gomez",
      action: "Apply Hospital Expense",
      time: "3 days ago",
      isRead: false,
    },
  ],
  yesterday: [
    {
      id: 2,
      name: "Jose Gomez",
      action: "Resubmitted Documents",
      time: "3 days ago",
      isRead: true,
    },
    {
      id: 3,
      name: "Jose Gomez",
      action: "Apply Hospital Expense",
      time: "3 days ago",
      isRead: true,
    },
  ],
};

export default function Notifications() {
  const { theme } = useAuth();

  const [notifications, setNotifications] = useState(notificationsData);

  const toggleReadStatus = (id, section) => {
    setNotifications((prev) => ({
      ...prev,
      [section]: prev[section].map((notif) =>
        notif.id === id ? { ...notif, isRead: !notif.isRead } : notif
      ),
    }));
  };

  return (
    <div className="min-h-screen">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="relative w-full max-w-lg">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
            size={17}
          />
          <input
            type="text"
            placeholder="Search"
            className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white text-sm text-gray-500 outline-none shadow-md border border-gray-100 focus:ring-2 focus:ring-teal-300 transition-all duration-200 placeholder-gray-400"
          />
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white shadow-md border border-gray-100 cursor-pointer hover:shadow-lg transition-all duration-200">
          <Bell size={18} className="text-gray-400" />
          <ChevronDown size={14} className="text-gray-400" />
        </div>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        {/* Title */}
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

          {/* Filter Dropdown */}
          <select className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-teal-300 text-gray-600">
            <option>All</option>
            <option>Unread</option>
            <option>Read</option>
          </select>
        </div>

        {/* Today Section */}
        <div className="mb-6">
          <h2 className="text-sm font-medium text-gray-700 mb-3">Today</h2>
          <div className="flex flex-col gap-2">
            {notifications.today.map((notif) => (
              <div
                key={notif.id}
                className="flex items-center gap-4 p-3 rounded-lg border border-gray-200 hover:shadow-sm transition-all duration-200"
              >
                <input
                  type="checkbox"
                  checked={notif.isRead}
                  onChange={() => toggleReadStatus(notif.id, "today")}
                  className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm font-medium text-gray-800 min-w-[120px]">
                  {notif.name}
                </span>
                <span className="text-sm text-gray-400 flex-1">
                  {notif.action}
                </span>
                <span className="text-xs text-gray-400">{notif.time}</span>
                <span
                  className="text-xs font-medium"
                  style={{ color: theme?.secondary || "#06C1EC" }}
                >
                  {notif.isRead ? "Read" : "Unread"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Yesterday Section */}
        <div>
          <h2 className="text-sm font-medium text-gray-700 mb-3">Yesterday</h2>
          <div className="flex flex-col gap-2">
            {notifications.yesterday.map((notif) => (
              <div
                key={notif.id}
                className="flex items-center gap-4 p-3 rounded-lg border border-gray-200 hover:shadow-sm transition-all duration-200"
              >
                <input
                  type="checkbox"
                  checked={notif.isRead}
                  onChange={() => toggleReadStatus(notif.id, "yesterday")}
                  className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm font-medium text-gray-800 min-w-[120px]">
                  {notif.name}
                </span>
                <span className="text-sm text-gray-400 flex-1">
                  {notif.action}
                </span>
                <span className="text-xs text-gray-400">{notif.time}</span>
                <span
                  className="text-xs font-medium"
                  style={{ color: theme?.secondary || "#06C1EC" }}
                >
                  {notif.isRead ? "Read" : "Unread"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
