import EmployeeAttendance from "./pages/EmployeeAttendance";

import AdminReports from "./pages/AdminReports";

import AdminLeaves from "./pages/AdminLeaves";

import AdminAttendance from "./pages/AdminAttendance";

import AdminTasks from "./pages/AdminTasks";

import AdminManagement from "./pages/AdminManagement";

import AdminEmployees from "./pages/AdminEmployees";

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useState } from "react";

import { useAuth } from "./hooks/useAuth";

import Layout from "./components/Layout";

import Login from "./pages/Login";

import EmployeeDashboard from "./pages/EmployeeDashboard";

import Profile from "./pages/Profile";

import EmployeeTasks from "./pages/EmployeeTasks";

import TimeTracking from "./pages/TimeTracking";

import Leaves from "./pages/Leaves";

import Notifications from "./pages/Notifications";

import Settings from "./pages/Settings";

import AdminDashboard from "./pages/AdminDashboard";
import ManagerAttendance from "./pages/ManagerAttendance";
import ManagerTasks from "./pages/ManagerTasks";
import ManagerLeaves from "./pages/ManagerLeaves";
import ManagerReports from "./pages/ManagerReports";

import { TablePage } from "./pages/BasicPage";
import ManagerDashboard from "./pages/ManagerDashboard";
import ManagerTeam from "./pages/ManagerTeam";
import ManagerTimeManagement from "./pages/ManagerTimeManagement";

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10000,

      retry: 1,
    },
  },
});

function Protected({
  children,

  role,
}: {
  children: React.ReactNode;

  role?: string;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div style={{ padding: 30 }}>Loading…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (role && user.role !== role) {
    return <Navigate to={`/${user.role.toLowerCase()}/dashboard`} replace />;
  }

  return <Layout user={user}>{children}</Layout>;
}

export default function App() {
  const [u, setU] = useState<any>(null);

  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          {/* =====================================================

              LOGIN

          ====================================================== */}

          <Route path="/login" element={<Login onLogin={setU} />} />

          {/* =====================================================

              EMPLOYEE

          ====================================================== */}

          <Route
            path="/employee/dashboard"
            element={
              <Protected role="EMPLOYEE">
                <EmployeeDashboard />
              </Protected>
            }
          />
          <Route
            path="/employee/profile"
            element={
              <Protected role="EMPLOYEE">
                <Profile />
              </Protected>
            }
          />

          <Route
            path="/employee/attendance"
            element={
              <Protected role="EMPLOYEE">
                <EmployeeAttendance />
              </Protected>
            }
          />

          <Route
            path="/employee/tasks"
            element={
              <Protected role="EMPLOYEE">
                <EmployeeTasks />
              </Protected>
            }
          />

          <Route
            path="/employee/time-tracking"
            element={
              <Protected role="EMPLOYEE">
                <TimeTracking />
              </Protected>
            }
          />

          <Route
            path="/employee/leaves"
            element={
              <Protected role="EMPLOYEE">
                <Leaves />
              </Protected>
            }
          />

          <Route
            path="/employee/notifications"
            element={
              <Protected role="EMPLOYEE">
                <Notifications />
              </Protected>
            }
          />

          {/* =====================================================

              MANAGER

          ====================================================== */}

          <Route
            path="/manager/dashboard"
            element={
              <Protected role="MANAGER">
                <ManagerDashboard />
              </Protected>
            }
          />

          <Route
            path="/manager/profile"
            element={
              <Protected role="MANAGER">
                <Profile />
              </Protected>
            }
          />

          <Route
            path="/manager/team"
            element={
              <Protected role="MANAGER">
                <ManagerTeam />
              </Protected>
            }
          />

          <Route
            path="/manager/attendance"
            element={
              <Protected role="MANAGER">
                <ManagerAttendance />
              </Protected>
            }
          />

          <Route
            path="/manager/time-management"
            element={
              <Protected role="MANAGER">
                <ManagerTimeManagement />
              </Protected>
            }
          />

          <Route
            path="/manager/tasks"
            element={
              <Protected role="MANAGER">
                <ManagerTasks />
              </Protected>
            }
          />

          <Route
            path="/manager/leaves"
            element={
              <Protected role="MANAGER">
                <ManagerLeaves />
              </Protected>
            }
          />

          <Route
            path="/manager/reports"
            element={
              <Protected role="MANAGER">
                <ManagerReports />
              </Protected>
            }
          />

          <Route
            path="/manager/notifications"
            element={
              <Protected role="MANAGER">
                <Notifications />
              </Protected>
            }
          />

          {/* =====================================================

              ADMIN

          ====================================================== */}

          <Route
            path="/admin/dashboard"
            element={
              <Protected role="ADMIN">
                <AdminDashboard />
              </Protected>
            }
          />

          <Route
            path="/admin/employees"
            element={
              <Protected role="ADMIN">
                <AdminEmployees />
              </Protected>
            }
          />

          <Route
            path="/admin/attendance"
            element={
              <Protected role="ADMIN">
                <AdminAttendance />
              </Protected>
            }
          />

          <Route
            path="/admin/tasks"
            element={
              <Protected role="ADMIN">
                <AdminTasks />
              </Protected>
            }
          />

          <Route
            path="/admin/projects"
            element={
              <Protected role="ADMIN">
                <TablePage
                  title="Projects"
                  url="/projects"
                  columns={["name", "status", "manager", "department"]}
                />
              </Protected>
            }
          />

          <Route
            path="/admin/leaves"
            element={
              <Protected role="ADMIN">
                <AdminLeaves />
              </Protected>
            }
          />

          <Route
            path="/admin/holidays"
            element={
              <Protected role="ADMIN">
                <TablePage
                  title="Holidays"
                  url="/holidays"
                  columns={["name", "date", "description"]}
                />
              </Protected>
            }
          />

          <Route
            path="/admin/reports"
            element={
              <Protected role="ADMIN">
                <AdminReports />
              </Protected>
            }
          />

          <Route
            path="/admin/management"
            element={
              <Protected role="ADMIN">
                <AdminManagement />
              </Protected>
            }
          />

          <Route
            path="/admin/profile"
            element={
              <Protected role="ADMIN">
                <Profile allowEdit />
              </Protected>
            }
          />

          <Route
            path="/admin/settings"
            element={
              <Protected role="ADMIN">
                <Settings />
              </Protected>
            }
          />

          <Route
            path="/admin/audit-logs"
            element={
              <Protected role="ADMIN">
                <TablePage
                  title="Audit Logs"
                  url="/audit-logs"
                  columns={[
                    "timestamp",

                    "actor",

                    "action",

                    "entity",

                    "entityId",
                  ]}
                />
              </Protected>
            }
          />

          <Route
            path="/admin/notifications"
            element={
              <Protected role="ADMIN">
                <Notifications />
              </Protected>
            }
          />

          {/* =====================================================

              FALLBACK

          ====================================================== */}

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
