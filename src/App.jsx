import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import Dashboard from "./Modules/Dashboard";
import Overview from "./Modules/Applications/Overview";
import ActionRequired from "./Modules/Applications/ActionRequired";
import Resubmissions from "./Modules/Applications/Resubmissions";
import Archive from "./Modules/Archive";
import Notifications from "./Modules/Notifications";
import Reports from "./Modules/Reports";
import ActivityLogs from "./Modules/ActivityLogs";
import AdminLogin from "./pages/AdminLogin";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider, useAuth } from "./context/AuthContext";

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

  return "/dashboard";
}

function IndexRedirect() {
  const { loading, isAuthorizedAdmin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
        Restoring session...
      </div>
    );
  }

  if (isAuthorizedAdmin) {
    return <Navigate to={resolveInitialRoute()} replace />;
  }

  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* 🔓 PUBLIC ROUTE: Login */}
          <Route path="/login" element={<AdminLogin />} />

          {/* 🔐 PROTECTED ROUTES: Wrapped with MainLayout (includes SideNavbar) */}
          <Route
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />

            {/* Application sub-routes */}
            <Route
              path="/applications"
              element={<Navigate to="/applications/overview" replace />}
            />
            <Route path="/applications/overview" element={<Overview />} />
            <Route
              path="/applications/action-required"
              element={<ActionRequired />}
            />
            <Route
              path="/applications/resubmissions"
              element={<Resubmissions />}
            />
            <Route
              path="/applications/review"
              element={<Navigate to="/applications/overview" replace />}
            />
            <Route
              path="/applications/finalize-docs"
              element={<Navigate to="/applications/overview" replace />}
            />

            {/* Other dashboard sections */}
            <Route path="/archive" element={<Archive />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/activity-logs" element={<ActivityLogs />} />
          </Route>

          {/* 🔄 Default redirect */}
          <Route index element={<IndexRedirect />} />

          {/* 🚫 Catch-all: undefined routes go to login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
