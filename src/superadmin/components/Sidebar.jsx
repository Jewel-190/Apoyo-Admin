import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import appLogoFallback from "../../assets/apoyo1.png";
import dasmaLogoFallback from "../../assets/Dasma.png";
import { BrandChrome } from "../../shared/components/BrandChrome";
import { useAuth } from "../../shared/context/AuthContext";

const Chevron = ({ open }) => (
  <svg
    className={`size-4 shrink-0 text-ocean-200/70 transition-transform duration-200 ease-out ${
      open ? "rotate-90" : ""
    }`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const navTree = [
  { path: "/superadmin/dashboard", label: "Dashboard", kind: "leaf" },
  {
    id: "content-management",
    label: "Content management",
    kind: "branch",
    children: [
      { path: "/superadmin/content-management/services", label: "Services" },
      { path: "/superadmin/content-management/web", label: "Web" },
    ],
  },
  {
    id: "data-management",
    label: "Data management",
    kind: "branch",
    children: [
      { path: "/superadmin/data-management/voters", label: "Voters" },
      { path: "/superadmin/data-management/users", label: "Users" },
      { path: "/superadmin/data-management/admins", label: "Admins" },
    ],
  },
  {
    id: "global-settings",
    label: "Settings",
    kind: "branch",
    children: [
      { path: "/superadmin/global-settings/service", label: "Service Settings" },
      { path: "/superadmin/global-settings/system", label: "System Settings" },
    ],
  },
  { path: "/superadmin/audit-trail", label: "Audit trail", kind: "leaf" },
  { path: "/superadmin/reports", label: "Reports", kind: "leaf" },
  { path: "/superadmin/notifications", label: "Notifications", kind: "leaf" },
];

function startsWithPath(currentPath, targetPath) {
  const cur = String(currentPath || "");
  const tgt = String(targetPath || "");
  if (tgt === "/") return true;
  return cur === tgt || cur.startsWith(`${tgt}/`);
}

const LogoutIcon = () => (
  <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" />
    <path d="M16 17l5-5-5-5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21 12H9" strokeLinecap="round" />
  </svg>
);

function LogoutConfirmModal({ open, onCancel, onConfirm, isLoggingOut }) {
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

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="superadmin-logout-confirm-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_20px_45px_-24px_rgba(10,70,111,0.6)]">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-ocean-200 bg-ocean-50 text-ocean-700">
            <LogoutIcon />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ocean-700/80">
              Superadmin
            </p>
            <h3
              id="superadmin-logout-confirm-title"
              className="mt-0.5 text-lg font-semibold tracking-tight text-ocean-950"
            >
              Log Out
            </h3>
            <p className="mt-1.5 text-sm text-ocean-700">
              Are you sure you want to log out of the superadmin workspace?
            </p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoggingOut}
            className="inline-flex h-9 items-center rounded-lg border border-ocean-200 bg-white px-3 text-sm font-semibold text-ocean-700 transition-colors hover:bg-ocean-50 disabled:cursor-not-allowed disabled:opacity-60"
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

export function Sidebar({ mobileOpen, onMobileClose }) {
  const location = useLocation();
  const pathname = location.pathname;
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const defaultOpen = useMemo(() => {
    const initial = new Set();
    navTree.forEach((item) => {
      if (item.kind === "branch" && item.children?.some((c) => startsWithPath(pathname, c.path))) {
        initial.add(item.id);
      }
    });
    return initial;
  }, [pathname]);

  const [openBranches, setOpenBranches] = useState(defaultOpen);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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

  const toggleBranch = useCallback((id) => {
    setOpenBranches((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const sidebarInner = (
    <>
      <div className="relative shrink-0 border-b border-white/10 px-5 pb-5 pt-7">
        <div
          className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-ocean-300/20 blur-3xl"
          aria-hidden
        />
        <div className="flex w-full items-center justify-center gap-3">
          <BrandChrome
            variant="superadmin-nav"
            fallbacks={{
              apoyoLogo: appLogoFallback,
              dasmaLogo: dasmaLogoFallback,
            }}
          />
        </div>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-hidden px-3 pb-6 pt-1">
        <p className="mb-1 px-3 text-center text-[11px] font-semibold uppercase tracking-wider text-ocean-300/80">
          Navigation
        </p>
        <ul className="space-y-0.5">
          {navTree.map((item) => {
            if (item.kind === "leaf") {
              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    onClick={onMobileClose}
                    className={({ isActive }) =>
                      `flex w-full items-center rounded-xl px-3 py-2.5 text-left text-[14px] transition-colors duration-150 ${
                        isActive
                          ? "bg-white/[0.14] font-semibold text-white ring-1 ring-white/20"
                          : "font-medium text-ocean-100/90 hover:bg-white/[0.06] hover:text-white"
                      }`
                    }
                    end
                  >
                    {item.label}
                  </NavLink>
                </li>
              );
            }

            const open = openBranches.has(item.id);
            const branchHasActive = item.children?.some((c) => startsWithPath(pathname, c.path));

            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => toggleBranch(item.id)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[14px] transition-colors duration-150 ${
                    branchHasActive
                      ? "bg-white/[0.08] font-semibold text-white ring-1 ring-white/10"
                      : "font-medium text-ocean-100/90 hover:bg-white/[0.06] hover:text-white"
                  }`}
                  aria-expanded={open}
                >
                  <span>{item.label}</span>
                  <Chevron open={open} />
                </button>
                {open ? (
                  <ul className="mt-1 ml-3 space-y-0.5 border-l border-white/15 py-0.5 pl-3">
                    {item.children.map((child) => (
                      <li key={child.path}>
                        <NavLink
                          to={child.path}
                          onClick={onMobileClose}
                          className={({ isActive }) =>
                            `flex w-full rounded-lg px-3 py-2 text-left text-[13px] transition-colors duration-150 ${
                              isActive
                                ? "bg-ocean-400/25 font-semibold text-white ring-1 ring-ocean-300/35"
                                : "font-medium text-ocean-200/85 hover:bg-white/[0.06] hover:text-white"
                            }`
                          }
                        >
                          {child.label}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-white/10 px-3 py-4">
        <button
          type="button"
          onClick={() => setLogoutConfirmOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ocean-200/80 transition-all duration-200 hover:bg-rose-500/10 hover:text-rose-200"
        >
          <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" />
            <path d="M16 17l5-5-5-5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 12H9" strokeLinecap="round" />
          </svg>
          Log Out
        </button>
      </div>
    </>
  );

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-ocean-950/45 backdrop-blur-[2px] transition-opacity duration-200 lg:pointer-events-none lg:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!mobileOpen}
        onClick={onMobileClose}
      />

      <aside
        id="navigation-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(100%,18rem)] shrink-0 flex-col border-r border-white/10 bg-gradient-to-b from-ocean-900 via-ocean-950 to-[#021918] font-sans shadow-[8px_0_40px_-12px_rgba(4,43,42,0.55)] transition-transform duration-200 ease-out lg:w-[var(--superadmin-sidebar-w)] lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Main navigation"
      >
        {sidebarInner}
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
      />
    </>
  );
}

