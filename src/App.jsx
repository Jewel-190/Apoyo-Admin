import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import AdminLogin from "./pages/AdminLogin";
import AdminRoutes from "./admin/AdminRoutes";
import SuperadminRoutes from "./superadmin/SuperadminRoutes";
import { AuthProvider, useAuth } from "./shared/context/AuthContext";
import WorkspaceLoadingScreen from "./shared/components/WorkspaceLoadingScreen";

const LAST_PROTECTED_ROUTE_KEY = "apoyo_admin_last_protected_route";

function resolveInitialRoute() {
  try {
    const stored = window.sessionStorage.getItem(LAST_PROTECTED_ROUTE_KEY);
    if (stored && stored !== "/login") {
      return stored;
    }
  } catch {
    // Ignore storage access failures.
  }

  return "/admin/dashboard";
}

function IndexRedirect() {
  const { loading, isAuthorizedAdmin, isAuthorizedSuperadmin } = useAuth();

  if (loading) {
    return <WorkspaceLoadingScreen />;
  }

  if (isAuthorizedSuperadmin) {
    return <Navigate to="/superadmin/dashboard" replace />;
  }

  if (isAuthorizedAdmin) {
    return <Navigate to={resolveInitialRoute()} replace />;
  }

  return <Navigate to="/login" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      {/* 🔓 PUBLIC ROUTE: Login */}
      <Route path="/login" element={<AdminLogin />} />
      <Route path="/admin/login" element={<AdminLogin />} />

      {/* Admin surface */}
      <Route path="/admin/*" element={<AdminRoutes />} />
      {/* Superadmin surface */}
      <Route path="/superadmin/*" element={<SuperadminRoutes />} />

      {/* 🔄 Default redirect */}
      <Route index element={<IndexRedirect />} />

      {/* 🚫 Catch-all: undefined routes go to login */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}
