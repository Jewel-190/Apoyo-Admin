import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import WorkspaceLoadingScreen from "./WorkspaceLoadingScreen";

const LAST_PROTECTED_ROUTE_KEY = "apoyo_admin_last_protected_route";

export default function ProtectedRoute({ children, required = "admin" }) {
  const {
    loading,
    workspaceReady,
    isAuthenticated,
    isAuthorizedAdmin,
    isAuthorizedSuperadmin,
  } = useAuth();
  const location = useLocation();

  const isAuthorized =
    required === "superadmin" ? isAuthorizedSuperadmin : isAuthorizedAdmin;
  const shouldHoldWorkspace =
    loading || (isAuthenticated && isAuthorized && !workspaceReady);

  useEffect(() => {
    if (!isAuthenticated || !isAuthorized) {
      return;
    }

    const route = `${location.pathname}${location.search}${location.hash}`;
    if (!route || route === "/login") {
      return;
    }

    try {
      window.sessionStorage.setItem(LAST_PROTECTED_ROUTE_KEY, route);
    } catch {
      // Ignore storage write failures.
    }
  }, [isAuthenticated, isAuthorized, location.hash, location.pathname, location.search]);

  if (shouldHoldWorkspace) {
    return <WorkspaceLoadingScreen />;
  }

  if (!isAuthenticated || !isAuthorized) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
