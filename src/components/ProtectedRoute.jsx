import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const LAST_PROTECTED_ROUTE_KEY = "apoyo_admin_last_protected_route";

export default function ProtectedRoute({ children }) {
  const { loading, isAuthenticated, isAuthorizedAdmin } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!isAuthenticated || !isAuthorizedAdmin) {
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
  }, [isAuthenticated, isAuthorizedAdmin, location.hash, location.pathname, location.search]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
        Restoring session...
      </div>
    );
  }

  if (!isAuthenticated || !isAuthorizedAdmin) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
