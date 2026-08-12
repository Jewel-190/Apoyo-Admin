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
import apoyoLogoFallback from "../../assets/apoyo2.png";
import dasmaLogoFallback from "../../assets/Dasma.png";
import { BrandChrome } from "../../shared/components/BrandChrome";
import { useAuth } from "../../shared/context/AuthContext";

const subItems = [
  { label: "Overview", to: "/admin/applications/overview" },
  { label: "Action Required", to: "/admin/applications/action-required" },
  { label: "Resubmissions", to: "/admin/applications/resubmissions" },
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

export default function SideNavbar({ mobileOpen = false, onMobileClose }) {
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
      onMobileClose?.();
      navigate("/login", { replace: true });
    } finally {
      setIsLoggingOut(false);
      setLogoutConfirmOpen(false);
    }
  }, [isLoggingOut, navigate, onMobileClose, signOut]);

  const closeMobileNav = useCallback(() => {
    onMobileClose?.();
  }, [onMobileClose]);

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] transition-opacity duration-200 lg:pointer-events-none lg:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!mobileOpen}
        onClick={closeMobileNav}
      />

      <aside
        id="admin-navigation-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(100%,13rem)] shrink-0 flex-col border-r border-gray-100 bg-white px-3 py-6 font-sans shadow-[8px_0_40px_-12px_rgba(15,23,42,0.18)] transition-transform duration-200 ease-out lg:w-[var(--admin-sidebar-w,13rem)] lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Main navigation"
      >
        <div className="mb-6 flex w-full shrink-0 justify-center px-2">
          <BrandChrome
            variant="admin-nav"
            fallbacks={{
              apoyoLogo: apoyoLogoFallback,
              dasmaLogo: dasmaLogoFallback,
            }}
          />
        </div>

        <div className="mb-3 shrink-0 px-2">
          <p className="text-[10px] uppercase tracking-wide text-gray-400">Signed in as</p>
          <p className="text-xs font-semibold" style={{ color: primary }}>
            {assistanceName}
            {roleSuffix}
          </p>
          {adminEmail ? (
            <p className="mt-0.5 break-all font-mono text-[10px] text-gray-400">{adminEmail}</p>
          ) : null}
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          <NavLink
            to="/admin/dashboard"
            onClick={closeMobileNav}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
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

          <div>
            <button
              type="button"
              onClick={() => setAppsOpen((p) => !p)}
              className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                isAppsRoute ? "text-white shadow-sm" : "text-gray-500 hover:bg-gray-100"
              }`}
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

            <div
              className={`relative ml-3 mt-1 flex flex-col gap-1 overflow-hidden transition-all duration-500 ease-in-out ${
                appsOpen ? "max-h-60 opacity-100" : "max-h-0 opacity-0"
              }`}
              aria-hidden={!appsOpen}
            >
              <div className="absolute bottom-0 left-[7px] top-0 w-px bg-gray-200" />

              {subItems.map((item) => {
                const isActive = location.pathname === item.to;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={closeMobileNav}
                    className={`relative flex items-center gap-3 rounded-xl py-2 pl-6 pr-2 text-sm transition-all duration-200 ${
                      isActive
                        ? "border bg-white font-semibold"
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
                      className={`absolute left-[4px] h-2.5 w-2.5 rounded-full border-2 ${
                        isActive ? "" : "border-gray-300 bg-white"
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

          <div>
            <button
              type="button"
              onClick={() => setForApprovalOpen((p) => !p)}
              className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                isForApprovalRoute ? "text-white shadow-sm" : "text-gray-500 hover:bg-gray-100"
              }`}
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
              className={`relative ml-3 mt-1 flex flex-col gap-1 overflow-hidden transition-all duration-500 ease-in-out ${
                forApprovalOpen ? "max-h-60 opacity-100" : "max-h-0 opacity-0"
              }`}
              aria-hidden={!forApprovalOpen}
            >
              <div className="absolute bottom-0 left-[7px] top-0 w-px bg-gray-200" />

              {forApprovalSubItems.map((item) => {
                const isActive = location.pathname === item.to;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={closeMobileNav}
                    className={`relative flex items-center gap-3 rounded-xl py-2 pl-6 pr-2 text-sm transition-all duration-200 ${
                      isActive
                        ? "border bg-white font-semibold"
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
                      className={`absolute left-[4px] h-2.5 w-2.5 rounded-full border-2 ${
                        isActive ? "" : "border-gray-300 bg-white"
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

          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={closeMobileNav}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive ? "text-white shadow-sm" : "text-gray-500 hover:bg-gray-100"
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
        </nav>

        <button
          type="button"
          onClick={() => setLogoutConfirmOpen(true)}
          className="mt-2 flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-400 transition-all duration-200 hover:bg-red-50 hover:text-red-500"
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
