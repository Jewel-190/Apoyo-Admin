// src/applications/Reports.jsx
import { Search, Download } from "lucide-react";
import MiniNotifications from "../components/MiniNotifications";
import { useAuth } from "../context/AuthContext";

export default function Reports() {
  const { theme } = useAuth();

  const handleExport = (reportId) => {
    void reportId;
    // Add your export logic here
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
        <MiniNotifications />
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
          Reports
        </h1>

        {/* Reports Grid - 4 Empty Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((report) => (
            <div
              key={report}
              className="bg-white rounded-xl border border-gray-200 h-48 relative hover:shadow-md transition-all duration-200"
            >
              {/* Export Button */}
              <button
                onClick={() => handleExport(report)}
                className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all duration-200"
              >
                <Download size={14} />
                Export
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
