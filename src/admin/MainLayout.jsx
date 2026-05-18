// ============================================
// FILE: MainLayout.jsx — Layout wrapper with sidebar for protected pages
// ============================================
import { Outlet } from "react-router-dom";
import { Loader2 } from "lucide-react";
import SideNavbar from "./components/SideNavbar";
import { useAuth } from "../shared/context/AuthContext";

export default function MainLayout() {
  const { theme, roleConfig, adminShellReady } = useAuth();

  if (!adminShellReady) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-100 text-slate-600">
        <Loader2 className="h-9 w-9 animate-spin text-slate-500" aria-hidden />
        <p className="text-sm font-medium">Loading workspace…</p>
        <p className="max-w-xs px-4 text-center text-xs text-slate-500">
          Preparing your line theme and navigation.
        </p>
      </div>
    );
  }

  const palette = theme || roleConfig?.theme || {};
  const layoutThemeVars = {
    "--apoyo-primary": palette.primary || "#008B88",
    "--apoyo-secondary": palette.secondary || "#06C1EC",
    "--apoyo-tertiary": palette.tertiary || "#33BFB8",
    "--apoyo-accent": palette.accent || "#87CE60",
    "--apoyo-ring": palette.ring || "#14B8A6",
  };

  return (
    <div className="flex min-h-screen bg-gray-50" style={layoutThemeVars}>
      {/* Sidebar */}
      <SideNavbar />

      {/* Main content area — offset by sidebar width */}
      <main className="flex-1 ml-52 p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
