// ============================================
// FILE: MainLayout.jsx — Layout wrapper with sidebar for protected pages
// ============================================
import { Outlet } from "react-router-dom";
import SideNavbar from "./components/SideNavbar";
import { useAuth } from "../shared/context/AuthContext";
import { AdminNotificationProvider } from "../shared/context/AdminNotificationContext";

export default function MainLayout() {
  const { theme, roleConfig } = useAuth();

  const palette = theme || roleConfig?.theme || {};
  const layoutThemeVars = {
    "--apoyo-primary": palette.primary || "#008B88",
    "--apoyo-secondary": palette.secondary || "#06C1EC",
    "--apoyo-tertiary": palette.tertiary || "#33BFB8",
    "--apoyo-accent": palette.accent || "#87CE60",
    "--apoyo-ring": palette.ring || "#14B8A6",
  };

  return (
    <AdminNotificationProvider>
      <div className="flex min-h-screen bg-gray-50" style={layoutThemeVars}>
        <SideNavbar />

        <main className="flex-1 ml-52 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </AdminNotificationProvider>
  );
}
