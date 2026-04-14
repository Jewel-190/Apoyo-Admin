// ============================================
// FILE: MainLayout.jsx — Layout wrapper with sidebar for protected pages
// ============================================
import { Outlet } from "react-router-dom";
import SideNavbar from "../components/SideNavbar";
import { useAuth } from "../context/AuthContext";

export default function MainLayout() {
  const { theme } = useAuth();

  const layoutThemeVars = {
    "--apoyo-primary": theme?.primary || "#008B88",
    "--apoyo-secondary": theme?.secondary || "#06C1EC",
    "--apoyo-tertiary": theme?.tertiary || "#33BFB8",
    "--apoyo-accent": theme?.accent || "#87CE60",
    "--apoyo-ring": theme?.ring || "#14B8A6",
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
