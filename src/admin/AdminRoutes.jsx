import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "../shared/components/ProtectedRoute";
import MainLayout from "./MainLayout";
import Dashboard from "./modules/Dashboard";
import Overview from "./modules/Applications/Overview";
import ActionRequired from "./modules/Applications/ActionRequired";
import Resubmissions from "./modules/Applications/Resubmissions";
import Scheduling from "./modules/ForApproval/Scheduling";
import CaseStudy from "./modules/ForApproval/CaseStudy";
import Approved from "./modules/Approved";
import Notifications from "./modules/Notifications";
import Reports from "./modules/Reports";
import ActivityLogs from "./modules/ActivityLogs";

export default function AdminRoutes() {
  return (
    <Routes>
      <Route
        element={
          <ProtectedRoute required="admin">
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<Dashboard />} />

        <Route path="applications" element={<Navigate to="overview" replace />} />
        <Route path="applications/overview" element={<Overview />} />
        <Route path="applications/action-required" element={<ActionRequired />} />
        <Route path="applications/resubmissions" element={<Resubmissions />} />
        <Route path="applications/review" element={<Navigate to="/admin/applications/overview" replace />} />
        <Route path="applications/finalize-docs" element={<Navigate to="/admin/applications/overview" replace />} />

        <Route path="scheduling" element={<Scheduling />} />
        <Route path="case-study" element={<CaseStudy />} />

        <Route path="approved" element={<Approved />} />
        <Route path="archive" element={<Navigate to="/admin/approved" replace />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="reports" element={<Reports />} />
        <Route path="activity-logs" element={<ActivityLogs />} />
      </Route>
    </Routes>
  );
}

