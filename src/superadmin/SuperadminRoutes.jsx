import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "../shared/components/ProtectedRoute";
import SuperadminLayout from "./SuperadminLayout.jsx";
import { NotificationsPage } from "./modules/notifications/NotificationsPage.jsx";
import { Reports } from "./modules/Reports/Reports.jsx";
import { AuditTrail } from "./modules/AuditTrail.jsx";
import { User } from "./modules/DataManagement/User.jsx";
import { Admin } from "./modules/DataManagement/Admin.jsx";
import { SystemSettingsPage } from "./modules/Accesibility/SystemSettingsPage.jsx";
import { AdminSettingsPage } from "./modules/Accesibility/AdminSettingsPage.jsx";
import { UserSettingsPage } from "./modules/Accesibility/UserSettingsPage.jsx";
import { Services } from "./modules/ContentManagement/Services.jsx";
import { InformationPage } from "./modules/ContentManagement/Information.jsx";
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
        <Route
          path="content-management/information"
          element={<InformationPage />}
        />
        <Route path="content-management/mobile" element={<Navigate to="/superadmin/content-management/services" replace />} />
        <Route path="content-management/web" element={<Navigate to="/superadmin/content-management/information" replace />} />
        <Route path="data-management" element={<Navigate to="/superadmin/data-management/user" replace />} />
        <Route path="data-management/user" element={<User />} />
        <Route path="data-management/admin" element={<Admin />} />
        <Route path="profiles/users" element={<Navigate to="/superadmin/data-management/user" replace />} />
        <Route path="profiles/admin" element={<Navigate to="/superadmin/data-management/admin" replace />} />
        <Route path="audit-trail" element={<AuditTrail />} />
        <Route path="global-settings/system" element={<SystemSettingsPage />} />
        <Route path="global-settings/admin" element={<AdminSettingsPage />} />
        <Route path="global-settings/user" element={<UserSettingsPage />} />
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

