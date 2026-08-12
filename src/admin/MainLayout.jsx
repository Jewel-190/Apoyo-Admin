// ============================================
// FILE: MainLayout.jsx — Layout wrapper with sidebar for protected pages
// ============================================
import { useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import SideNavbar from "./components/SideNavbar";
import { useAuth } from "../shared/context/AuthContext";
import { AdminNotificationProvider } from "../shared/context/AdminNotificationContext";

const MenuIcon = () => (
  <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
  </svg>
);

function titleCase(s) {
  return String(s || "")
    .split(/[\s/_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" · ");
}

export default function MainLayout() {
  const { theme, roleConfig } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Keep in sync with SideNavbar width (w-52 = 13rem).
  const sidebarWidth = "13rem";

  const palette = theme || roleConfig?.theme || {};
  const primary = palette.primary || "#008B88";
  const layoutThemeVars = {
    "--apoyo-primary": primary,
    "--apoyo-secondary": palette.secondary || "#06C1EC",
    "--apoyo-tertiary": palette.tertiary || "#33BFB8",
    "--apoyo-accent": palette.accent || "#87CE60",
    "--apoyo-ring": palette.ring || "#14B8A6",
    "--admin-sidebar-w": sidebarWidth,
  };

  const breadcrumb = useMemo(() => {
    const path = location.pathname.replace(/^\/admin\/?/, "");
    return titleCase(path || "dashboard");
  }, [location.pathname]);

  return (
    <AdminNotificationProvider>
      <div
        className="flex h-dvh overflow-hidden bg-gray-50 font-sans"
        style={layoutThemeVars}
      >
        <SideNavbar
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col lg:pl-[var(--admin-sidebar-w)]">
          <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-200/90 bg-white/90 px-4 backdrop-blur-md sm:px-5 lg:hidden">
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:border-gray-300 hover:bg-gray-50"
              style={{ color: primary }}
              aria-expanded={sidebarOpen}
              aria-controls="admin-navigation-sidebar"
              aria-label={sidebarOpen ? "Close menu" : "Open menu"}
              onClick={() => setSidebarOpen((open) => !open)}
            >
              <MenuIcon />
            </button>
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: primary }}
              >
                {breadcrumb}
              </p>
            </div>
          </header>

          <main className="flex min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-4 pt-[4.25rem] sm:p-6 sm:pt-[4.25rem] lg:p-6 lg:pt-6">
            <Outlet />
          </main>
        </div>
      </div>
    </AdminNotificationProvider>
  );
}
