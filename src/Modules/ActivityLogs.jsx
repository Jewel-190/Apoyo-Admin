// src/applications/ActivityLogs.jsx
import { useState } from "react";
import { Search, Bell, ChevronDown } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const activityLogsData = {
  today: [
    {
      id: 1,
      date: "July 25, 2025",
      time: "10:30 AM",
      name: "Jose Gomez",
      category: "Hospitalization Expense",
      applicationId: "MAHE-2026-003",
      action: "Apply",
      color: "border-purple-500",
    },
    {
      id: 2,
      date: "July 25, 2025",
      time: "11:15 AM",
      name: "Jose Gomez",
      category: "Hospitalization Expense",
      applicationId: "MAHE-2026-003",
      action: "Moved to In progress",
      color: "border-cyan-500",
    },
    {
      id: 3,
      date: "July 25, 2025",
      time: "2:45 PM",
      name: "Jose Gomez",
      category: "Hospitalization Expense",
      applicationId: "MAHE-2026-003",
      action: "Moved to Action Required",
      color: "border-orange-500",
    },
    {
      id: 4,
      date: "July 25, 2025",
      time: "3:20 PM",
      name: "Jose Gomez",
      category: "Hospitalization Expense",
      applicationId: "MAHE-2026-003",
      action: "Resubmitted Documents",
      color: "border-yellow-500",
    },
    {
      id: 5,
      date: "July 25, 2025",
      time: "4:00 PM",
      name: "Jose Gomez",
      category: "Hospitalization Expense",
      applicationId: "MAHE-2026-003",
      action: "Approved",
      color: "border-green-500",
    },
  ],
};

export default function ActivityLogs() {
  const { theme } = useAuth();
  const [logs] = useState(activityLogsData);

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
        <h1
          className="text-2xl mb-6"
          style={{
            fontFamily: "'Instrument Sans', sans-serif",
            fontWeight: 500,
            color: theme?.primary || "#1F2937",
          }}
        >
          Activity Logs
        </h1>

        {/* Today Section */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Today</h2>
          <div className="flex flex-col gap-3">
            {logs.today.map((log) => (
              <div
                key={log.id}
                className={`flex items-center gap-4 p-4 rounded-lg border-l-4 ${log.color} bg-white shadow-sm hover:shadow-md transition-all duration-200`}
              >
                <div className="flex-1 grid grid-cols-12 gap-4 items-center">
                  {/* Date & Time */}
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500">{log.date}</p>
                    <p className="text-xs text-gray-400">{log.time}</p>
                  </div>

                  {/* Name */}
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-gray-800">
                      {log.name}
                    </p>
                  </div>

                  {/* Category */}
                  <div className="col-span-2">
                    <p className="text-sm text-gray-600">{log.category}</p>
                  </div>

                  {/* Application ID */}
                  <div className="col-span-3">
                    <p className="text-sm text-gray-500">
                      Application ID: {log.applicationId}
                    </p>
                  </div>

                  {/* Action */}
                  <div className="col-span-3 text-right">
                    <span className="text-sm text-gray-600 font-medium">
                      {log.action}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
