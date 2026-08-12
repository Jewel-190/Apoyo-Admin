import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "../shared/components/ProtectedRoute";
import SuperadminLayout from "./SuperadminLayout.jsx";
import { NotificationsPage } from "./modules/notifications/NotificationsPage.jsx";
import { Reports } from "./modules/Reports.jsx";
import { AuditTrail } from "./modules/AuditTrail.jsx";
import { Voters } from "./modules/DataManagement/Voters.jsx";
import { Admins } from "./modules/DataManagement/Admins.jsx";
import { User } from "./modules/DataManagement/User.jsx";
import { SystemSettings } from "./modules/Accesibility/SystemSettings.jsx";
import { ServiceSettings } from "./modules/Accesibility/ServiceSettings.jsx";
import { Services } from "./modules/ContentManagement/Services.jsx";
import { Web } from "./modules/ContentManagement/Web.jsx";
import { DashboardPage } from "./modules/Dashboard.jsx";

export default function SuperadminRoutes() {
  return (
    <Routes>
      <Route
        element={
          <ProtectedRoute required="superadmin">
            <SuperadminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="reports" element={<Reports />} />
        <Route path="content-management" element={<Navigate to="/superadmin/content-management/services" replace />} />
        <Route path="content-management/services" element={<Services />} />
        <Route path="content-management/web" element={<Web />} />
        <Route path="content-management/mobile" element={<Navigate to="/superadmin/content-management/services" replace />} />
        <Route path="content-management/information" element={<Navigate to="/superadmin/content-management/web" replace />} />
        <Route path="data-management" element={<Navigate to="/superadmin/data-management/users" replace />} />
        <Route path="data-management/users" element={<User />} />
        <Route path="data-management/users/:userId" element={<User />} />
        <Route path="data-management/voters" element={<Voters />} />
        <Route path="data-management/admins" element={<Admins />} />
        <Route path="data-management/user" element={<Navigate to="/superadmin/data-management/users" replace />} />
        <Route path="data-management/admin" element={<Navigate to="/superadmin/data-management/admins" replace />} />
        <Route path="profiles/users" element={<Navigate to="/superadmin/data-management/users" replace />} />
        <Route path="profiles/admin" element={<Navigate to="/superadmin/data-management/admins" replace />} />
        <Route path="audit-trail" element={<AuditTrail />} />
        <Route path="global-settings" element={<Navigate to="/superadmin/global-settings/system" replace />} />
        <Route path="global-settings/system" element={<SystemSettings />} />
        <Route path="global-settings/service" element={<ServiceSettings />} />
        <Route path="global-settings/admin" element={<Navigate to="/superadmin/global-settings/service" replace />} />
        <Route path="global-settings/user" element={<Navigate to="/superadmin/global-settings/system" replace />} />
        <Route
          path="*"
          element={
            <div className="flex min-h-[60vh] items-center justify-center rounded-xl border border-dashed border-ocean-200 bg-ocean-50/70 px-6 py-14 text-center">
              <div className="max-w-xl">
                <p className="text-base font-semibold text-ocean-900">Superadmin</p>
                <p className="mt-2 text-sm text-ocean-700">This section will be wired to routes in the next refactor step.</p>
              </div>
            </div>
          }
        />
      </Route>
    </Routes>
  );
}
