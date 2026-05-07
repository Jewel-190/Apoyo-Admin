import { useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Archive,
  Bell,
  FileText,
  Activity,
  Check,
  LogOut,
  ChevronDown,
} from "lucide-react";
import apoyoLogo from "../assets/apoyo2.png"; // adjust filename if needed
import { useAuth } from "../context/AuthContext";

const subItems = [
  { label: "Overview",        to: "/applications/overview" },
  { label: "Action Required", to: "/applications/action-required" },
  { label: "Resubmissions",   to: "/applications/resubmissions" },
];

const forApprovalSubItems = [
  { label: "Scheduling", to: "/scheduling" },
  { label: "Case Study", to: "/case-study" },
];

const navItems = [
  { label: "Archive", to: "/archive", icon: <Archive size={17} /> },
  { label: "Notifications", to: "/notifications", icon: <Bell size={17} /> },
  { label: "Reports", to: "/reports", icon: <FileText size={17} /> },
  { label: "Activity Logs", to: "/activity-logs", icon: <Activity size={17} /> },
];

export default function SideNavbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, roleConfig, adminRole } = useAuth();

  const primary = roleConfig?.theme?.primary || "#008B88";
  const secondary = roleConfig?.theme?.secondary || "#06C1EC";
  const tertiary = roleConfig?.theme?.tertiary || secondary;
  const roleTitle = roleConfig?.title || "Admin";

  // Auto-open Applications dropdown if we're on an applications route
  const isAppsRoute = location.pathname.startsWith("/applications");
  const [appsOpen, setAppsOpen] = useState(isAppsRoute);

  const isForApprovalRoute =
    location.pathname === "/scheduling" || location.pathname === "/case-study";
  const [forApprovalOpen, setForApprovalOpen] = useState(isForApprovalRoute);

  return (
    <aside className="fixed top-0 left-0 h-full w-52 bg-white border-r border-gray-100 flex flex-col py-6 px-3 gap-1 z-50">
      {/* Logo — centered, constrained width for narrow sidebar */}
      <div className="mb-6 flex w-full shrink-0 justify-center px-2">
        <img
          src={apoyoLogo}
          alt="Apoyo"
          className="block h-10 max-h-10 w-auto max-w-full object-contain object-center"
        />
      </div>

      <div className="px-2 mb-3">
        <p className="text-[10px] uppercase tracking-wide text-gray-400">Signed in as</p>
        <p className="text-xs font-semibold" style={{ color: primary }}>
          {roleTitle}
        </p>
        {adminRole ? (
          <p className="text-[10px] text-gray-400 font-mono">{adminRole}</p>
        ) : null}
      </div>

      {/* Dashboard */}
      <NavLink
        to="/dashboard"
        className={({ isActive }) =>
          `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
            isActive ? "text-white shadow-sm" : "text-gray-500 hover:bg-gray-100"
          }`
        }
        style={({ isActive }) =>
          isActive
            ? {
                backgroundImage: `linear-gradient(to right, ${primary}, ${secondary})`,
              }
            : undefined
        }
      >
        <LayoutDashboard size={17} />
        Dashboard
      </NavLink>

      {/* Applications (collapsible) */}
      <div>
        <button
          onClick={() => setAppsOpen((p) => !p)}
          className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${isAppsRoute ? "text-white shadow-sm" : "text-gray-500 hover:bg-gray-100"}`}
          style={
            isAppsRoute
              ? {
                  backgroundImage: `linear-gradient(to right, ${primary}, ${secondary})`,
                }
              : undefined
          }
        >
          <div className="flex items-center gap-3">
            <Users size={17} />
            Applications
          </div>
          <ChevronDown
            size={14}
            className={`transform transition-transform duration-200 ${
              appsOpen ? "rotate-180" : "rotate-0"
            }`}
          />
        </button>

        {/* Sub-items (always in DOM so we can animate height/opacity) */}
        <div
          className={`ml-3 mt-1 flex flex-col gap-1 relative overflow-hidden transition-all duration-300 ease-out ${
            appsOpen ? "max-h-60 opacity-100" : "max-h-0 opacity-0"
          }`}
          aria-hidden={!appsOpen}
        >
          {/* vertical connecting line */}
          <div className="absolute left-[7px] top-0 bottom-0 w-px bg-gray-200" />

          {subItems.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`relative flex items-center gap-3 pl-6 pr-2 py-2 rounded-xl text-sm transition-all duration-200 ${
                  isActive
                    ? "font-semibold border bg-white"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                style={
                  isActive
                    ? {
                        color: secondary,
                        borderColor: secondary,
                      }
                    : undefined
                }
              >
                {/* dot on the line */}
                <span
                  className={`absolute left-[4px] w-2.5 h-2.5 rounded-full border-2 ${
                    isActive
                      ? ""
                      : "bg-white border-gray-300"
                  }`}
                  style={
                    isActive
                      ? {
                          backgroundColor: secondary,
                          borderColor: secondary,
                        }
                      : undefined
                  }
                />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      </div>

      {/* For Approval (collapsible) */}
      <div>
        <button
          type="button"
          onClick={() => setForApprovalOpen((p) => !p)}
          className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${isForApprovalRoute ? "text-white shadow-sm" : "text-gray-500 hover:bg-gray-100"}`}
          style={
            isForApprovalRoute
              ? {
                  backgroundImage: `linear-gradient(to right, ${primary}, ${secondary})`,
                }
              : undefined
          }
        >
          <div className="flex items-center gap-3">
            <Check size={17} strokeWidth={2.5} />
            For Approval
          </div>
          <ChevronDown
            size={14}
            className={`transform transition-transform duration-200 ${
              forApprovalOpen ? "rotate-180" : "rotate-0"
            }`}
          />
        </button>

        <div
          className={`ml-3 mt-1 flex flex-col gap-1 relative overflow-hidden transition-all duration-300 ease-out ${
            forApprovalOpen ? "max-h-60 opacity-100" : "max-h-0 opacity-0"
          }`}
          aria-hidden={!forApprovalOpen}
        >
          <div className="absolute left-[7px] top-0 bottom-0 w-px bg-gray-200" />

          {forApprovalSubItems.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`relative flex items-center gap-3 pl-6 pr-2 py-2 rounded-xl text-sm transition-all duration-200 ${
                  isActive
                    ? "font-semibold border bg-white"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                style={
                  isActive
                    ? {
                        color: secondary,
                        borderColor: secondary,
                      }
                    : undefined
                }
              >
                <span
                  className={`absolute left-[4px] w-2.5 h-2.5 rounded-full border-2 ${
                    isActive ? "" : "bg-white border-gray-300"
                  }`}
                  style={
                    isActive
                      ? {
                          backgroundColor: secondary,
                          borderColor: secondary,
                        }
                      : undefined
                  }
                />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      </div>

      {/* Other nav items */}
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              isActive
                ? "text-white shadow-sm"
                : "text-gray-500 hover:bg-gray-100"
            }`
          }
          style={({ isActive }) =>
            isActive
              ? {
                  backgroundImage: `linear-gradient(to right, ${primary}, ${tertiary})`,
                }
              : undefined
          }
        >
          {item.icon}
          {item.label}
        </NavLink>
      ))}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Log Out */}
      <button
        onClick={async () => {
          await signOut();
          navigate("/login", { replace: true });
        }}
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all duration-200"
      >
        <LogOut size={17} />
        Log Out
      </button>
    </aside>
  );
}