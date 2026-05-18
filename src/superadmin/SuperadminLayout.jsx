import { useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./components/Sidebar.jsx";

const MenuIcon = () => (
  <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
  </svg>
);

function titleCase(s) {
  return String(s || "")
    .split(/[\s/]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" · ");
}

export default function SuperadminLayout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Single source of truth for desktop sidebar width.
  // Update this value when you change the sidebar width.
  const sidebarWidth = "15rem";

  const breadcrumb = useMemo(() => {
    const path = location.pathname.replace(/^\/superadmin\/?/, "");
    return titleCase(path || "dashboard");
  }, [location.pathname]);

  return (
    <div className="flex h-dvh overflow-hidden font-sans" style={{ "--superadmin-sidebar-w": sidebarWidth }}>
      <Sidebar
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col bg-ocean-50 lg:pl-[var(--superadmin-sidebar-w)]">
        <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center gap-3 border-b border-ocean-200/80 bg-white/85 px-4 backdrop-blur-md sm:px-6 lg:px-8 lg:pl-[calc(var(--superadmin-sidebar-w)+2rem)]">
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-xl border border-ocean-200 bg-white text-ocean-800 shadow-sm transition hover:border-ocean-300 hover:bg-ocean-50 lg:hidden"
            aria-expanded={sidebarOpen}
            aria-controls="navigation-sidebar"
            aria-label={sidebarOpen ? "Close menu" : "Open menu"}
            onClick={() => setSidebarOpen((o) => !o)}
          >
            <MenuIcon />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-ocean-600/90">
              {breadcrumb}
            </p>
          </div>
        </header>

        <main className="flex flex-1 flex-col overflow-y-auto p-4 pt-20 sm:p-6 sm:pt-20 lg:p-8 lg:pt-20">
          <div className="flex w-full flex-1 flex-col rounded-2xl border border-ocean-200/90 bg-white p-4 shadow-[0_1px_0_rgba(255,255,255,0.85)_inset,0_14px_40px_-24px_rgba(12,72,120,0.35)] sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

