import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
import apoyoLogo from "../../assets/apoyo2.png"; // adjust filename if needed
import { useAuth } from "../../shared/context/AuthContext";

const subItems = [
  { label: "Overview",        to: "/admin/applications/overview" },
  { label: "Action Required", to: "/admin/applications/action-required" },
  { label: "Resubmissions",   to: "/admin/applications/resubmissions" },
];

const forApprovalSubItems = [
  { label: "Scheduling", to: "/admin/scheduling" },
  { label: "Case Study", to: "/admin/case-study" },
];

const navItems = [
  { label: "Approved", to: "/admin/approved", icon: <Archive size={17} /> },
  { label: "Notifications", to: "/admin/notifications", icon: <Bell size={17} /> },
  { label: "Reports", to: "/admin/reports", icon: <FileText size={17} /> },
  { label: "Activity Logs", to: "/admin/activity-logs", icon: <Activity size={17} /> },
];

function LogoutConfirmModal({
  open,
  onCancel,
  onConfirm,
  isLoggingOut,
  primary,
  secondary,
  sessionLabel,
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const themedBorder = `color-mix(in srgb, ${primary} 30%, #e5e7eb)`;
  const themedChipBorder = `color-mix(in srgb, ${primary} 35%, white)`;
  const themedChipBg = `linear-gradient(to bottom right, color-mix(in srgb, ${primary} 12%, white), color-mix(in srgb, ${secondary} 12%, white))`;
  const themedLabel = `color-mix(in srgb, ${primary} 72%, #374151)`;
  const themedBody = `color-mix(in srgb, ${primary} 45%, #4b5563)`;
  const themedCancelBorder = `color-mix(in srgb, ${primary} 28%, #e5e7eb)`;
  const themedCancelText = `color-mix(in srgb, ${primary} 78%, #374151)`;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-logout-confirm-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border bg-white p-5 shadow-[0_20px_45px_-24px_rgba(15,23,42,0.18)]"
        style={{
          "--logout-primary": primary,
          "--logout-secondary": secondary,
          borderColor: themedBorder,
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border"
            style={{
              borderColor: themedChipBorder,
              backgroundImage: themedChipBg,
              color: primary,
            }}
          >
            <LogOut size={18} aria-hidden />
          </div>
          <div className="min-w-0">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: themedLabel }}
            >
              {sessionLabel}
            </p>
            <h3
              id="admin-logout-confirm-title"
              className="mt-0.5 text-lg font-semibold tracking-tight text-gray-900"
            >
              Log Out
            </h3>
            <p className="mt-1.5 text-sm" style={{ color: themedBody }}>
              Are you sure you want to log out of your admin workspace?
            </p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoggingOut}
            className="inline-flex h-9 items-center rounded-lg border bg-white px-3 text-sm font-semibold transition-colors hover:bg-[color-mix(in_srgb,var(--logout-primary)_8%,white)] disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              borderColor: themedCancelBorder,
              color: themedCancelText,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoggingOut}
            className="inline-flex h-9 items-center rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoggingOut ? "Logging out..." : "Log Out"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function SideNavbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, roleConfig, user } = useAuth();

  const primary = roleConfig?.theme?.primary || "#008B88";
  const secondary = roleConfig?.theme?.secondary || "#06C1EC";
  const tertiary = roleConfig?.theme?.tertiary || secondary;

  const roleTitleRaw = String(roleConfig?.title || "Admin").trim();
  const hasAdminSuffix = / admin$/i.test(roleTitleRaw);
  const assistanceName = hasAdminSuffix
    ? roleTitleRaw.replace(/ admin$/i, "").trim() || "Admin"
    : roleTitleRaw.toLowerCase() === "admin"
      ? "Admin"
      : roleTitleRaw;
  const roleSuffix = roleTitleRaw.toLowerCase() === "admin" ? "" : " Admin";
  const sessionLabel = `${assistanceName}${roleSuffix}`.trim() || "Admin";
  const adminEmail = String(user?.email || "").trim();

  // Auto-open Applications dropdown if we're on an applications route
  const isAppsRoute = location.pathname.startsWith("/admin/applications");
  const [appsOpen, setAppsOpen] = useState(isAppsRoute);

  const isForApprovalRoute =
    location.pathname === "/admin/scheduling" || location.pathname === "/admin/case-study";
  const [forApprovalOpen, setForApprovalOpen] = useState(isForApprovalRoute);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Keep the matching pipeline section expanded when navigating into it
  // (e.g. opening a request from notifications). Never auto-close on leave.
  useEffect(() => {
    if (isAppsRoute) {
      setAppsOpen(true);
    }
  }, [isAppsRoute]);

  useEffect(() => {
    if (isForApprovalRoute) {
      setForApprovalOpen(true);
    }
  }, [isForApprovalRoute]);

  const handleLogoutConfirm = useCallback(async () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    try {
      await signOut();
      navigate("/login", { replace: true });
    } finally {
      setIsLoggingOut(false);
      setLogoutConfirmOpen(false);
    }
  }, [isLoggingOut, navigate, signOut]);

  return (
    <>
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
          {assistanceName}
          {roleSuffix}
        </p>
        {adminEmail ? (
          <p className="mt-0.5 text-[10px] text-gray-400 font-mono break-all">{adminEmail}</p>
        ) : null}
      </div>

      {/* Dashboard */}
      <NavLink
        to="/admin/dashboard"
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
            className={`transform transition-transform duration-500 ease-in-out ${
              appsOpen ? "rotate-180" : "rotate-0"
            }`}
          />
        </button>

        {/* Sub-items (always in DOM so we can animate height/opacity) */}
        <div
          className={`ml-3 mt-1 flex flex-col gap-1 relative overflow-hidden transition-all duration-500 ease-in-out ${
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
            className={`transform transition-transform duration-500 ease-in-out ${
              forApprovalOpen ? "rotate-180" : "rotate-0"
            }`}
          />
        </button>

        <div
          className={`ml-3 mt-1 flex flex-col gap-1 relative overflow-hidden transition-all duration-500 ease-in-out ${
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
        type="button"
        onClick={() => setLogoutConfirmOpen(true)}
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all duration-200"
      >
        <LogOut size={17} />
        Log Out
      </button>
    </aside>

    <LogoutConfirmModal
      open={logoutConfirmOpen}
      onCancel={() => {
        if (!isLoggingOut) {
          setLogoutConfirmOpen(false);
        }
      }}
      onConfirm={handleLogoutConfirm}
      isLoggingOut={isLoggingOut}
      primary={primary}
      secondary={secondary}
      sessionLabel={sessionLabel}
    />
    </>
  );
}