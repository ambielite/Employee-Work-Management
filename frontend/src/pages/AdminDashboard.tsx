import "../admin-dashboard.css";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FolderKanban,
  RefreshCw,
  Users,
  UserCheck,
  Wifi,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { get } from "../api/client";
import StatusBadge from "../components/StatusBadge";
import type {
  Attendance,
  Employee,
  LeaveRequest,
  Project,
  Task,
} from "../types";

function list<T>(data: any): T[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function minutes(value: number | undefined | null) {
  const m = Math.max(0, Number(value || 0));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

function dateOnly(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function timeOnly(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(value: string) {
  return String(value || "—")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AdminDashboard() {
  const employeesQ = useQuery({
    queryKey: ["admin-dashboard", "employees"],
    queryFn: () => get("/employees"),
    refetchInterval: 30000,
  });
  const attendanceQ = useQuery({
    queryKey: ["admin-dashboard", "attendance"],
    queryFn: () => get("/attendance/company"),
    refetchInterval: 30000,
  });
  const leavesQ = useQuery({
    queryKey: ["admin-dashboard", "leaves"],
    queryFn: () => get("/leaves"),
    refetchInterval: 30000,
  });
  const projectsQ = useQuery({
    queryKey: ["admin-dashboard", "projects"],
    queryFn: () => get("/projects"),
    refetchInterval: 30000,
  });
  const tasksQ = useQuery({
    queryKey: ["admin-dashboard", "tasks"],
    queryFn: () => get("/tasks"),
    refetchInterval: 30000,
  });

  const employees = list<Employee>(employeesQ.data);
  const attendance = list<Attendance>(attendanceQ.data);
  const leaves = list<LeaveRequest>(leavesQ.data);
  const projects = list<Project>(projectsQ.data);
  const tasks = list<Task>(tasksQ.data);

  const loading = [employeesQ, attendanceQ, leavesQ, projectsQ, tasksQ].some(
    (q) => q.isLoading,
  );
  const refreshing = [employeesQ, attendanceQ, leavesQ, projectsQ, tasksQ].some(
    (q) => q.isFetching,
  );
  const refresh = () =>
    Promise.all([
      employeesQ.refetch(),
      attendanceQ.refetch(),
      leavesQ.refetch(),
      projectsQ.refetch(),
      tasksQ.refetch(),
    ]);

  const todayKey = new Date().toDateString();
  const todayAttendance = useMemo(
    () =>
      attendance.filter(
        (a) => a.date && new Date(a.date).toDateString() === todayKey,
      ),
    [attendance, todayKey],
  );
  const activeEmployees = employees.filter(
    (e) => String(e.employmentStatus || "").toUpperCase() === "ACTIVE",
  );
  const pendingLeaves = leaves.filter(
    (l) => String(l.status).toUpperCase() === "PENDING",
  );
  const activeProjects = projects.filter(
    (p) => String(p.status).toUpperCase() === "ACTIVE",
  );
  const openTasks = tasks.filter(
    (t) => !["COMPLETED", "CANCELLED"].includes(String(t.status).toUpperCase()),
  );
  const lateAttendance = todayAttendance.filter(
    (a) => String(a.status).toUpperCase() === "LATE",
  );
  const insufficientAttendance = todayAttendance.filter(
    (a) => String(a.status).toUpperCase() === "PRESENT_WITH_INSUFFICIENT_HOURS",
  );
  const wfhAttendance = todayAttendance.filter(
    (a) => String(a.workMode).toUpperCase() === "WFH",
  );
  const presentAttendance = todayAttendance.filter((a) =>
    [
      "PRESENT",
      "LATE",
      "PRESENT_WITH_INSUFFICIENT_HOURS",
      "EARLY_LOGOUT",
    ].includes(String(a.status).toUpperCase()),
  );
  const late = lateAttendance.length;
  const insufficient = insufficientAttendance.length;
  const wfh = wfhAttendance.length;
  const present = presentAttendance.length;
  const completedTasks = tasks.filter(
    (t) => String(t.status).toUpperCase() === "COMPLETED",
  ).length;

  const statusData = useMemo(() => {
    const map = new Map<string, number>();
    todayAttendance.forEach((a) =>
      map.set(String(a.status), (map.get(String(a.status)) || 0) + 1),
    );
    return [...map.entries()].map(([name, value]) => ({
      name: statusLabel(name),
      value,
    }));
  }, [todayAttendance]);

  const modeData = [
    {
      name: "WFO",
      value: todayAttendance.filter((a) => a.workMode === "WFO").length,
    },
    { name: "WFH", value: wfh },
  ].filter((x) => x.value > 0);

  const departmentData = useMemo(() => {
    const map = new Map<
      string,
      { department: string; active: number; present: number }
    >();
    const departmentByEmployeeId = new Map(
      employees.map((e) => [e.id, e.department?.name || "Unassigned"]),
    );
    activeEmployees.forEach((e) => {
      const department = e.department?.name || "Unassigned";
      const current = map.get(department) || {
        department,
        active: 0,
        present: 0,
      };
      current.active++;
      map.set(department, current);
    });
    todayAttendance.forEach((a) => {
      const department =
        departmentByEmployeeId.get(a.employee?.id || "") ||
        a.employee?.department?.name ||
        "Unassigned";
      const current = map.get(department) || {
        department,
        active: 0,
        present: 0,
      };
      current.present++;
      map.set(department, current);
    });
    return [...map.values()];
  }, [employees, activeEmployees, todayAttendance]);

  const recent = [...todayAttendance]
    .sort(
      (a, b) =>
        new Date(b.loginTime || b.date || 0).getTime() -
        new Date(a.loginTime || a.date || 0).getTime(),
    )
    .slice(0, 8);

  const [selectedAttendance, setSelectedAttendance] =
    useState<Attendance | null>(null);

  const selectedEmployee = useMemo<
    | (Employee & {
        user?: { role?: string; accountStatus?: string; email?: string };
      })
    | null
  >(() => {
    if (!selectedAttendance) return null;

    return (
      employees.find(
        (employee) =>
          employee.id === selectedAttendance.employee?.id ||
          employee.employeeId === selectedAttendance.employee?.employeeId,
      ) || null
    );
  }, [employees, selectedAttendance]);

  const cards = [
    { key: "employees", label: "Active Employees", value: activeEmployees.length, sub: `${employees.length} total employee records`, icon: Users },
    { key: "present", label: "Present Today", value: present, sub: `${todayAttendance.length} attendance records today`, icon: CheckCircle2 },
    { key: "wfh", label: "Work From Home", value: wfh, sub: "Today's WFH attendance", icon: Wifi },
    { key: "leaves", label: "Pending Leaves", value: pendingLeaves.length, sub: "Requests awaiting action", icon: CalendarClock },
    { key: "projects", label: "Active Projects", value: activeProjects.length, sub: `${projects.length} total projects`, icon: FolderKanban },
    { key: "tasks", label: "Open Tasks", value: openTasks.length, sub: `${completedTasks} completed`, icon: CheckCircle2 },
    { key: "late", label: "Late Today", value: late, sub: "Attendance marked late", icon: Clock3 },
    { key: "insufficient", label: "Insufficient Hours", value: insufficient, sub: "Needs attention", icon: Activity },
  ] as const;

  type DashboardCardKey = (typeof cards)[number]["key"];
  const [selectedCard, setSelectedCard] = useState<DashboardCardKey | null>(null);

  const cardDetails = useMemo(() => {
    const attendanceRows = (records: Attendance[]) =>
      records.map((record) => [
        record.employee?.fullName || "—",
        record.employee?.employeeId || "—",
        record.employee?.department?.name || "Unassigned",
        statusLabel(record.workMode),
        statusLabel(record.status),
        timeOnly(record.loginTime),
        minutes(record.activeMinutes),
      ]);
    const employeeRows = (records: Employee[]) =>
      records.map((employee) => [
        employee.fullName || "—",
        employee.employeeId || "—",
        employee.department?.name || "Unassigned",
        employee.designation || "—",
        employee.employmentStatus || "—",
      ]);

    return {
      employees: {
        title: "Team Members",
        columns: ["Employee", "Employee ID", "Department", "Designation", "Status"],
        rows: employeeRows(activeEmployees),
        empty: "No active employees found.",
      },
      present: {
        title: "Present Today",
        columns: ["Employee", "Employee ID", "Department", "Work Mode", "Attendance Status", "Login", "Active Time"],
        rows: attendanceRows(presentAttendance),
        empty: "No employees are marked present today.",
      },
      wfh: {
        title: "Working From Home",
        columns: ["Employee", "Employee ID", "Department", "Work Mode", "Attendance Status", "Login", "Active Time"],
        rows: attendanceRows(wfhAttendance),
        empty: "No employees are working from home today.",
      },
      leaves: {
        title: "Employees With Pending Leave Requests",
        columns: ["Employee", "Employee ID", "Leave Type", "From", "To", "Reason", "Status"],
        rows: pendingLeaves.map((leave) => [
          leave.employee?.fullName || "—",
          leave.employee?.employeeId || "—",
          leave.leaveType?.name || "—",
          dateOnly(leave.fromDate),
          dateOnly(leave.toDate),
          leave.reason || "—",
          statusLabel(leave.status),
        ]),
        empty: "No pending leave requests.",
      },
      projects: {
        title: "Active Projects",
        columns: ["Project", "Department", "Manager", "Status", "Start Date", "End Date"],
        rows: activeProjects.map((project) => [
          project.name || "—",
          project.department?.name || "Unassigned",
          project.manager?.fullName || "—",
          statusLabel(project.status),
          dateOnly(project.startDate),
          dateOnly(project.endDate),
        ]),
        empty: "No active projects found.",
      },
      tasks: {
        title: "Open Tasks",
        columns: ["Task", "Assigned Employee", "Project", "Priority", "Status", "Due Date"],
        rows: openTasks.map((task) => [
          task.title || "—",
          task.assignedTo?.fullName || "Unassigned",
          task.project?.name || "—",
          statusLabel(task.priority),
          statusLabel(task.status),
          dateOnly(task.dueDate),
        ]),
        empty: "No open tasks found.",
      },
      late: {
        title: "Employees Late Today",
        columns: ["Employee", "Employee ID", "Department", "Work Mode", "Attendance Status", "Login", "Active Time"],
        rows: attendanceRows(lateAttendance),
        empty: "No employees were marked late today.",
      },
      insufficient: {
        title: "Employees With Insufficient Hours",
        columns: ["Employee", "Employee ID", "Department", "Work Mode", "Attendance Status", "Login", "Active Time"],
        rows: attendanceRows(insufficientAttendance),
        empty: "No employees have insufficient hours today.",
      },
    } satisfies Record<DashboardCardKey, { title: string; columns: string[]; rows: string[][]; empty: string }>;
  }, [activeEmployees, presentAttendance, wfhAttendance, pendingLeaves, activeProjects, openTasks, lateAttendance, insufficientAttendance]);

  const error = [employeesQ, attendanceQ, leavesQ, projectsQ, tasksQ].find(
    (q) => q.isError,
  );
  const selectedCardDetails = selectedCard ? cardDetails[selectedCard] : null;
  const SelectedCardIcon = selectedCard
    ? cards.find((card) => card.key === selectedCard)?.icon || Users
    : Users;

  return (
    <div className="adminDashboard">
      <div className="title dashboardTitle">
        <div>
          <h1>Admin Dashboard</h1>
          <p className="muted">
            Company overview based on live attendance, employees, tasks, leaves
            and projects.
          </p>
        </div>
        <button
          className="btn primary refreshBtn"
          onClick={refresh}
          disabled={refreshing}
        >
          <RefreshCw size={15} className={refreshing ? "spin" : ""} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="alert dashboardError">
          Some dashboard data could not be loaded. Click Refresh to try again.
        </div>
      )}

      <div className="dashboardStats">
        {cards.map(({ key, label, value, sub, icon: Icon }) => (
          <button
            type="button"
            className="card dashboardStat"
            key={key}
            onClick={() => setSelectedCard(key)}
            aria-haspopup="dialog"
            aria-label={`Show ${label.toLowerCase()} details`}
          >
            <div className="statIcon">
              <Icon size={18} />
            </div>
            <span>{label}</span>
            <strong>{loading ? "—" : value}</strong>
            <small>{sub}</small>
          </button>
        ))}
      </div>

      {selectedCardDetails && (
        <div
          className="modalBackdrop adminDashboardCardModalBackdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedCard(null);
          }}
        >
          <div
            className="modal modalLarge adminDashboardListModal adminDashboardCompactCardModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-list-title"
          >
            <div className="dashboardListModalHeader">
              <span className="adminDashboardEmployeesIcon"><SelectedCardIcon size={19} /></span>
              <div>
                <h2 id="dashboard-list-title">{selectedCardDetails.title}</h2>
                <p>
                  {selectedCard === "employees" ? "Active employees in your team · " : ""}
                  {selectedCardDetails.rows.length} record
                  {selectedCardDetails.rows.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                className="adminEmployeeDetailsClose"
                onClick={() => setSelectedCard(null)}
                aria-label="Close list"
              >
                <X size={20} />
              </button>
            </div>
            <div className="dashboardListModalBody">
              {selectedCardDetails.rows.length ? (
                <div className="dashboardListTableWrap">
                  <table className={`table dashboardListTable adminDashboardCompactCardTable ${selectedCard === "employees" ? "adminDashboardEmployeesTable" : ""}`}>
                    <thead>
                      <tr>
                        {selectedCardDetails.columns.map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCardDetails.rows.map((row, index) => (
                        <tr key={`${selectedCard}-${index}`}>
                          {row.map((value, cellIndex) => (
                            <td key={`${selectedCard}-${index}-${cellIndex}`}>
                              {value}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="dashboardListEmpty">
                  {selectedCardDetails.empty}
                </div>
              )}
            </div>
            <div className="dashboardListModalFooter">
              <button
                type="button"
                className="btn adminDashboardEmployeesCloseButton"
                onClick={() => setSelectedCard(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="dashboardCharts">
        <section className="card dashboardPanel attendanceChartPanel">
          <div className="panelHeading">
            <div>
              <h3>Today's Attendance</h3>
              <p className="muted">Attendance status distribution</p>
            </div>
            <Activity size={19} />
          </div>
          {statusData.length ? (
            <div className="chartArea">
              <ResponsiveContainer width="100%" height={270}>
                <BarChart
                  data={statusData}
                  margin={{ top: 8, right: 10, left: 0, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    angle={statusData.length > 3 ? -18 : 0}
                    textAnchor={statusData.length > 3 ? "end" : "middle"}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#2563eb" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="dashboardEmpty">
              <Activity size={25} />
              <b>No attendance data today</b>
              <span>
                No attendance records are available for the current date.
              </span>
            </div>
          )}
        </section>

        <section className="card dashboardPanel">
          <div className="panelHeading">
            <div>
              <h3>Work Mode</h3>
              <p className="muted">WFO vs WFH today</p>
            </div>
            <Wifi size={19} />
          </div>
          {modeData.length ? (
            <div className="donutArea">
              <ResponsiveContainer width="100%" height={270}>
                <PieChart>
                  <Pie
                    data={modeData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={65}
                    outerRadius={95}
                    paddingAngle={2}
                  >
                    {modeData.map((entry, index) => (
                      <Cell
                        key={entry.name}
                        fill={index === 0 ? "#334155" : "#16a34a"}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="dashboardEmpty">
              <Wifi size={25} />
              <b>No work-mode data today</b>
              <span>
                WFO/WFH distribution will appear after attendance is recorded.
              </span>
            </div>
          )}
        </section>

        <section className="card dashboardPanel">
          <div className="panelHeading">
            <div>
              <h3>Department Attendance</h3>
              <p className="muted">
                Active employees compared with today's attendance
              </p>
            </div>
            <Users size={19} />
          </div>
          {departmentData.length ? (
            <div className="chartArea">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={departmentData}
                  margin={{ top: 8, right: 10, left: 0, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="department" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="active"
                    name="Active Employees"
                    fill="#64748b"
                    radius={[5, 5, 0, 0]}
                  />
                  <Bar
                    dataKey="present"
                    name="Present Today"
                    fill="#2563eb"
                    radius={[5, 5, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="dashboardEmpty">
              <Users size={25} />
              <b>No department data</b>
              <span>
                Department attendance will appear when employee records are
                available.
              </span>
            </div>
          )}
        </section>

        <section className="card dashboardPanel quickPanel">
          <div className="panelHeading">
            <div>
              <h3>Quick Overview</h3>
              <p className="muted">Items that may need admin attention</p>
            </div>
            <CalendarClock size={19} />
          </div>
          <div className="overviewList">
            <div>
              <span>
                <Clock3 size={16} />
                Late attendance
              </span>
              <b>{late}</b>
            </div>
            <div>
              <span>
                <Activity size={16} />
                Insufficient hours
              </span>
              <b>{insufficient}</b>
            </div>
            <div>
              <span>
                <CalendarClock size={16} />
                Pending leave requests
              </span>
              <b>{pendingLeaves.length}</b>
            </div>
            <div>
              <span>
                <CheckCircle2 size={16} />
                Completed tasks
              </span>
              <b>{completedTasks}</b>
            </div>
            <div>
              <span>
                <FolderKanban size={16} />
                Active projects
              </span>
              <b>{activeProjects.length}</b>
            </div>
          </div>
        </section>
      </div>

      <section className="card dashboardPanel recentPanel">
        <div className="panelHeading">
          <div>
            <h3>Today's Recent Attendance</h3>
            <p className="muted">
              Latest attendance activity received from the server
            </p>
          </div>
        </div>
        <div className="recentTableWrap">
          <table className="table recentTable">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Employee ID</th>
                <th>Mode</th>
                <th>Status</th>
                <th>Login</th>
                <th>Active</th>
                <th>Break</th>
                <th>Idle</th>
                <th>Shortage</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => setSelectedAttendance(a)}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    <b>{a.employee?.fullName || "—"}</b>
                  </td>
                  <td>{a.employee?.employeeId || "—"}</td>
                  <td>
                    <StatusBadge status={a.workMode} />
                  </td>
                  <td>
                    <StatusBadge status={a.status} />
                  </td>
                  <td>{timeOnly(a.loginTime)}</td>
                  <td>{minutes(a.activeMinutes)}</td>
                  <td>{minutes(a.breakMinutes)}</td>
                  <td>{minutes(a.idleMinutes)}</td>
                  <td>{minutes(a.shortageMinutes)}</td>
                </tr>
              ))}
              {!recent.length && (
                <tr>
                  <td colSpan={9}>
                    <div className="dashboardEmpty compact">
                      <b>No recent attendance</b>
                      <span>There is no attendance activity to display.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedAttendance && (
        <div
          className="modalBackdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedAttendance(null);
            }
          }}
        >
          <div
            className="modal modalLarge adminEmployeeDetailsModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-employee-details-title"
          >
            <div className="adminEmployeeDetailsHeader">
              <div className="adminEmployeeDetailsTitle">
                <div className="adminEmployeeDetailsIcon">
                  <UserCheck size={21} />
                </div>

                <div>
                  <h2 id="admin-employee-details-title">Employee Details</h2>
                  <p>
                    {selectedAttendance.employee?.employeeId || "—"} ·{" "}
                    {selectedEmployee?.designation || "Employee"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="adminEmployeeDetailsClose"
                onClick={() => setSelectedAttendance(null)}
                aria-label="Close employee details"
              >
                <X size={20} />
              </button>
            </div>

            <div className="adminEmployeeDetailsBody">
              <div className="adminEmployeeDetailsProfile">
                <div className="adminEmployeeDetailsAvatar">
                  {(
                    selectedEmployee?.fullName ||
                    selectedAttendance.employee?.fullName ||
                    "E"
                  )
                    .charAt(0)
                    .toUpperCase()}
                </div>

                <div className="adminEmployeeDetailsProfileInfo">
                  <h3>
                    {selectedEmployee?.fullName ||
                      selectedAttendance.employee?.fullName ||
                      "—"}
                  </h3>
                  <span>
                    {selectedEmployee?.designation ||
                      selectedAttendance.employee?.designation ||
                      "—"}
                  </span>
                </div>

                <div className="adminEmployeeDetailsBadges">
                  <span className="adminEmployeeDetailsRole">
                    {selectedEmployee?.user?.role || "EMPLOYEE"}
                  </span>

                  <span
                    className={`adminEmployeeDetailsStatus ${
                      (selectedEmployee?.accountStatus ||
                        selectedEmployee?.user?.accountStatus ||
                        "ACTIVE") === "ACTIVE"
                        ? "active"
                        : "inactive"
                    }`}
                  >
                    {selectedEmployee?.accountStatus ||
                      selectedEmployee?.user?.accountStatus ||
                      "ACTIVE"}
                  </span>
                </div>
              </div>

              <div className="adminEmployeeDetailsSection">
                <div className="adminEmployeeDetailsSectionTitle">
                  Contact & Account
                </div>

                <div className="adminEmployeeDetailsGrid">
                  <div className="adminEmployeeDetailsItem">
                    <span>Email Address</span>
                    <strong>{selectedEmployee?.user?.email || "—"}</strong>
                  </div>

                  <div className="adminEmployeeDetailsItem">
                    <span>Phone</span>
                    <strong>{selectedEmployee?.phone || "—"}</strong>
                  </div>

                  <div className="adminEmployeeDetailsItem">
                    <span>Employee ID</span>
                    <strong>
                      {selectedEmployee?.employeeId ||
                        selectedAttendance.employee?.employeeId ||
                        "—"}
                    </strong>
                  </div>

                  <div className="adminEmployeeDetailsItem">
                    <span>Role</span>
                    <strong>
                      {selectedEmployee?.user?.role || "EMPLOYEE"}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="adminEmployeeDetailsSection">
                <div className="adminEmployeeDetailsSectionTitle">
                  Work Information
                </div>

                <div className="adminEmployeeDetailsGrid">
                  <div className="adminEmployeeDetailsItem">
                    <span>Department</span>
                    <strong>
                      {selectedEmployee?.department?.name ||
                        selectedAttendance.employee?.department?.name ||
                        "—"}
                    </strong>
                  </div>

                  <div className="adminEmployeeDetailsItem">
                    <span>Designation</span>
                    <strong>
                      {selectedEmployee?.designation ||
                        selectedAttendance.employee?.designation ||
                        "—"}
                    </strong>
                  </div>

                  <div className="adminEmployeeDetailsItem">
                    <span>Manager</span>
                    <strong>
                      {selectedEmployee?.manager?.fullName || "—"}
                    </strong>
                  </div>

                  <div className="adminEmployeeDetailsItem">
                    <span>Date of Joining</span>
                    <strong>
                      {selectedEmployee?.dateOfJoining
                        ? new Date(
                            selectedEmployee.dateOfJoining,
                          ).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </strong>
                  </div>

                  <div className="adminEmployeeDetailsItem">
                    <span>Employment Status</span>
                    <strong>{selectedEmployee?.employmentStatus || "—"}</strong>
                  </div>

                  <div className="adminEmployeeDetailsItem">
                    <span>Account Status</span>
                    <strong>
                      {selectedEmployee?.accountStatus ||
                        selectedEmployee?.user?.accountStatus ||
                        "ACTIVE"}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="adminEmployeeDetailsSection">
                <div className="adminEmployeeDetailsSectionTitle">
                  Today's Attendance
                </div>

                <div className="adminEmployeeDetailsGrid">
                  <div className="adminEmployeeDetailsItem">
                    <span>Date</span>
                    <strong>{dateOnly(selectedAttendance.date)}</strong>
                  </div>

                  <div className="adminEmployeeDetailsItem">
                    <span>Work Mode</span>
                    <strong>{statusLabel(selectedAttendance.workMode)}</strong>
                  </div>

                  <div className="adminEmployeeDetailsItem">
                    <span>Status</span>
                    <strong>{statusLabel(selectedAttendance.status)}</strong>
                  </div>

                  <div className="adminEmployeeDetailsItem">
                    <span>Login Time</span>
                    <strong>{timeOnly(selectedAttendance.loginTime)}</strong>
                  </div>

                  <div className="adminEmployeeDetailsItem">
                    <span>Logout Time</span>
                    <strong>{timeOnly(selectedAttendance.logoutTime)}</strong>
                  </div>

                  <div className="adminEmployeeDetailsItem">
                    <span>Logged In</span>
                    <strong>
                      {minutes(selectedAttendance.loggedInMinutes)}
                    </strong>
                  </div>

                  <div className="adminEmployeeDetailsItem">
                    <span>Active Time</span>
                    <strong>{minutes(selectedAttendance.activeMinutes)}</strong>
                  </div>

                  <div className="adminEmployeeDetailsItem">
                    <span>Break Time</span>
                    <strong>{minutes(selectedAttendance.breakMinutes)}</strong>
                  </div>

                  <div className="adminEmployeeDetailsItem">
                    <span>Idle Time</span>
                    <strong>{minutes(selectedAttendance.idleMinutes)}</strong>
                  </div>

                  <div className="adminEmployeeDetailsItem">
                    <span>Task Time</span>
                    <strong>{minutes(selectedAttendance.taskMinutes)}</strong>
                  </div>

                  <div className="adminEmployeeDetailsItem">
                    <span>Required Time</span>
                    <strong>
                      {minutes(selectedAttendance.requiredMinutes)}
                    </strong>
                  </div>

                  <div className="adminEmployeeDetailsItem">
                    <span>Shortage</span>
                    <strong>
                      {minutes(selectedAttendance.shortageMinutes)}
                    </strong>
                  </div>

                  <div className="adminEmployeeDetailsItem">
                    <span>Overtime</span>
                    <strong>
                      {minutes(selectedAttendance.overtimeMinutes)}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="adminEmployeeDetailsFooter">
              <button
                type="button"
                className="btn primary"
                onClick={() => setSelectedAttendance(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="dashboardFooter muted">
        <span>Dashboard refreshes automatically every 30 seconds.</span>
        {refreshing && <span>Updating live data…</span>}
      </div>
    </div>
  );
}
