import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Clock3,
  Coffee,
  Download,
  Filter,
  RefreshCw,
  UserRound,
  Users,
  ClipboardList,
  X,
  UserRoundCheck,
} from "lucide-react";
import { get } from "../api/client";
import { fmt } from "../utils/time";
import "./manager-attendance.css";

type ViewMode = "MY" | "TEAM";
type TeamReportType = "ATTENDANCE" | "TASKS" | "LEAVES";

type ReportRow = {
  id: string;
  date?: string;
  workMode?: string;
  status?: string;
  loginTime?: string | null;
  logoutTime?: string | null;
  requiredMinutes?: number;
  loggedInMinutes?: number;
  activeMinutes?: number;
  idleMinutes?: number;
  breakMinutes?: number;
  taskMinutes?: number;
  shortageMinutes?: number;
  overtimeMinutes?: number;
  employee?: {
    id?: string;
    employeeId?: string;
    fullName?: string;
    department?: { id?: string; name?: string } | null;
  } | null;
};

type TaskRow = {
  id: string;
  taskNumber?: string;
  title?: string;
  description?: string;
  priority?: string;
  status?: string;
  dueDate?: string;
  actualMinutes?: number;
  estimatedMinutes?: number;
  assignedTo?: {
    employeeId?: string;
    fullName?: string;
    department?: { name?: string } | null;
  } | null;
  assignedBy?: {
    employeeId?: string;
    fullName?: string;
    email?: string;
    role?: string;
  } | null;
  project?: { name?: string } | null;
};

type LeaveRow = {
  id: string;
  fromDate?: string;
  toDate?: string;
  createdAt?: string;
  reviewedAt?: string | null;
  reason?: string;
  reviewComment?: string | null;
  status?: string;
  halfDay?: boolean;
  leaveType?: { name?: string } | null;
  employee?: {
    employeeId?: string;
    fullName?: string;
    department?: { name?: string } | null;
  } | null;
  reviewedBy?: {
    employee?: { fullName?: string; employeeId?: string } | null;
    fullName?: string;
    email?: string;
    role?: string;
  } | null;
};

const PAGE_SIZE = 10;
function list<T>(v: any): T[] {
  return Array.isArray(v)
    ? v
    : Array.isArray(v?.items)
      ? v.items
      : Array.isArray(v?.data)
        ? v.data
        : [];
}
function dateText(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}
function dateKey(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
function timeText(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
}
function statusLabel(v?: string) {
  return String(v || "—")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
function csv(v: unknown) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function statusClass(v?: string) {
  return String(v || "pending")
    .toLowerCase()
    .replaceAll("_", "-");
}

function SwitchButton({ active, icon: Icon, title, subtitle, onClick }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`managerViewSwitchButton ${active ? "active" : ""}`}
    >
      <span className="managerViewSwitchIcon">
        <Icon size={17} />
      </span>
      <span className="managerViewSwitchText">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
    </button>
  );
}
function FilterField({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`managerReportFilterField ${className}`}>
      {children}
    </label>
  );
}

export default function ManagerReports() {
  const [mode, setMode] = useState<ViewMode>("MY");
  const [teamType, setTeamType] = useState<TeamReportType>("ATTENDANCE");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [workModeFilter, setWorkModeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [leaveTypeFilter, setLeaveTypeFilter] = useState("ALL");
  const [selectedAttendance, setSelectedAttendance] =
    useState<ReportRow | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRow | null>(null);

  const myQ = useQuery({
    queryKey: ["manager-reports", "my-attendance"],
    queryFn: () => get("/attendance/history"),
    refetchInterval: 60000,
    enabled: mode === "MY",
  });
  const teamAttendanceQ = useQuery({
    queryKey: ["manager-reports", "team-attendance"],
    queryFn: () => get("/reports/attendance"),
    refetchInterval: 30000,
    enabled: mode === "TEAM" && teamType === "ATTENDANCE",
  });
  const teamTasksQ = useQuery({
    queryKey: ["manager-reports", "team-tasks"],
    queryFn: () => get("/tasks?scope=TEAM"),
    refetchInterval: 30000,
    enabled: mode === "TEAM" && teamType === "TASKS",
  });
  const teamLeavesQ = useQuery({
    queryKey: ["manager-reports", "team-leaves"],
    queryFn: () => get("/leaves?scope=TEAM"),
    refetchInterval: 30000,
    enabled: mode === "TEAM" && teamType === "LEAVES",
  });

  const myRows = useMemo(() => list<ReportRow>(myQ.data), [myQ.data]);
  const teamAttendance = useMemo(
    () => list<ReportRow>(teamAttendanceQ.data),
    [teamAttendanceQ.data],
  );
  const teamTasks = useMemo(
    () => list<TaskRow>(teamTasksQ.data),
    [teamTasksQ.data],
  );
  const teamLeaves = useMemo(
    () => list<LeaveRow>(teamLeavesQ.data),
    [teamLeavesQ.data],
  );
  const departments = useMemo(
    () =>
      Array.from(
        new Set(
          teamAttendance
            .map((r) => r.employee?.department?.name)
            .filter(Boolean) as string[],
        ),
      ).sort(),
    [teamAttendance],
  );
  const employees = useMemo(() => {
    const m = new Map<string, string>();
    teamAttendance.forEach(
      (r) =>
        r.employee?.employeeId &&
        m.set(
          r.employee.employeeId,
          r.employee.fullName || r.employee.employeeId!,
        ),
    );
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [teamAttendance]);
  const leaveTypes = useMemo(
    () =>
      Array.from(
        new Set(
          teamLeaves.map((r) => r.leaveType?.name).filter(Boolean) as string[],
        ),
      ).sort(),
    [teamLeaves],
  );

  const filteredMy = useMemo(
    () =>
      myRows.filter((r) => {
        const d = dateKey(r.date);
        return (
          (!fromDate || d >= fromDate) &&
          (!toDate || d <= toDate) &&
          (workModeFilter === "ALL" || r.workMode === workModeFilter) &&
          (statusFilter === "ALL" || r.status === statusFilter)
        );
      }),
    [myRows, fromDate, toDate, workModeFilter, statusFilter],
  );
  const filteredAttendance = useMemo(
    () =>
      teamAttendance.filter((r) => {
        const q = search.trim().toLowerCase(),
          d = dateKey(r.date);
        return (
          (!q ||
            r.employee?.fullName?.toLowerCase().includes(q) ||
            r.employee?.employeeId?.toLowerCase().includes(q) ||
            r.employee?.department?.name?.toLowerCase().includes(q)) &&
          (!fromDate || d >= fromDate) &&
          (!toDate || d <= toDate) &&
          (employeeFilter === "ALL" ||
            r.employee?.employeeId === employeeFilter) &&
          (departmentFilter === "ALL" ||
            r.employee?.department?.name === departmentFilter) &&
          (workModeFilter === "ALL" || r.workMode === workModeFilter) &&
          (statusFilter === "ALL" || r.status === statusFilter)
        );
      }),
    [
      teamAttendance,
      search,
      fromDate,
      toDate,
      employeeFilter,
      departmentFilter,
      workModeFilter,
      statusFilter,
    ],
  );
  const filteredTasks = useMemo(
    () =>
      teamTasks.filter((r) => {
        const q = search.trim().toLowerCase(),
          d = dateKey(r.dueDate);
        return (
          (!q ||
            r.title?.toLowerCase().includes(q) ||
            r.taskNumber?.toLowerCase().includes(q) ||
            r.assignedTo?.fullName?.toLowerCase().includes(q) ||
            r.assignedBy?.fullName?.toLowerCase().includes(q)) &&
          (!fromDate || d >= fromDate) &&
          (!toDate || d <= toDate) &&
          (statusFilter === "ALL" || r.status === statusFilter) &&
          (priorityFilter === "ALL" || r.priority === priorityFilter)
        );
      }),
    [teamTasks, search, fromDate, toDate, statusFilter, priorityFilter],
  );
  const filteredLeaves = useMemo(
    () =>
      teamLeaves.filter((r) => {
        const q = search.trim().toLowerCase(),
          a = dateKey(r.fromDate),
          b = dateKey(r.toDate);
        return (
          (!q ||
            r.employee?.fullName?.toLowerCase().includes(q) ||
            r.employee?.employeeId?.toLowerCase().includes(q) ||
            r.reason?.toLowerCase().includes(q) ||
            r.reviewedBy?.employee?.fullName?.toLowerCase().includes(q)) &&
          (!fromDate || b >= fromDate) &&
          (!toDate || a <= toDate) &&
          (statusFilter === "ALL" || r.status === statusFilter) &&
          (leaveTypeFilter === "ALL" || r.leaveType?.name === leaveTypeFilter)
        );
      }),
    [teamLeaves, search, fromDate, toDate, statusFilter, leaveTypeFilter],
  );

  const totalRows =
    mode === "MY"
      ? filteredMy.length
      : teamType === "ATTENDANCE"
        ? filteredAttendance.length
        : teamType === "TASKS"
          ? filteredTasks.length
          : filteredLeaves.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleAttendance = (
    mode === "MY" ? filteredMy : filteredAttendance
  ).slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const visibleTasks = filteredTasks.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const visibleLeaves = filteredLeaves.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const activeQuery =
    mode === "MY"
      ? myQ
      : teamType === "ATTENDANCE"
        ? teamAttendanceQ
        : teamType === "TASKS"
          ? teamTasksQ
          : teamLeavesQ;

  const summary = useMemo(() => {
    if (mode === "TEAM" && teamType === "TASKS")
      return {
        total: filteredTasks.length,
        present: filteredTasks.filter((r) => r.status === "COMPLETED").length,
        late: filteredTasks.filter((r) => r.status === "IN_PROGRESS").length,
        active: filteredTasks.reduce(
          (s, r) => s + (Number(r.actualMinutes) || 0),
          0,
        ),
        breakTime: 0,
        overtime: 0,
      };
    if (mode === "TEAM" && teamType === "LEAVES")
      return {
        total: filteredLeaves.length,
        present: filteredLeaves.filter((r) => r.status === "APPROVED").length,
        late: filteredLeaves.filter((r) => r.status === "PENDING").length,
        active: 0,
        breakTime: 0,
        overtime: 0,
      };
    const data = mode === "MY" ? filteredMy : filteredAttendance;
    return {
      total: data.length,
      present: data.filter((r) =>
        [
          "PRESENT",
          "LATE",
          "EARLY_LOGOUT",
          "PRESENT_WITH_INSUFFICIENT_HOURS",
        ].includes(String(r.status)),
      ).length,
      late: data.filter((r) => r.status === "LATE").length,
      active: data.reduce((s, r) => s + (Number(r.activeMinutes) || 0), 0),
      breakTime: data.reduce((s, r) => s + (Number(r.breakMinutes) || 0), 0),
      overtime: data.reduce((s, r) => s + (Number(r.overtimeMinutes) || 0), 0),
    };
  }, [
    mode,
    teamType,
    filteredMy,
    filteredAttendance,
    filteredTasks,
    filteredLeaves,
  ]);

  function resetFilters() {
    setSearch("");
    setFromDate("");
    setToDate("");
    setEmployeeFilter("ALL");
    setDepartmentFilter("ALL");
    setWorkModeFilter("ALL");
    setStatusFilter("ALL");
    setPriorityFilter("ALL");
    setLeaveTypeFilter("ALL");
    setPage(1);
  }
  function changeMode(v: ViewMode) {
    setMode(v);
    setPage(1);
    resetFilters();
    setSelectedAttendance(null);
    setSelectedTask(null);
    setSelectedLeave(null);
  }
  function changeTeamType(v: TeamReportType) {
    setTeamType(v);
    setPage(1);
    resetFilters();
    setSelectedAttendance(null);
    setSelectedTask(null);
    setSelectedLeave(null);
  }

  function exportCsv() {
    let headers: string[] = [];
    let data: unknown[][] = [];
    if (mode === "MY" || teamType === "ATTENDANCE") {
      const rows = mode === "MY" ? filteredMy : filteredAttendance;
      headers = [
        "Employee",
        "Employee ID",
        "Date",
        "Work Mode",
        "Status",
        "Login",
        "Logout",
        "Logged In",
        "Active",
        "Break",
        "Idle",
        "Task",
        "Shortage",
        "Overtime",
      ];
      data = rows.map((r) => [
        r.employee?.fullName || "Me",
        r.employee?.employeeId || "",
        dateText(r.date),
        r.workMode,
        statusLabel(r.status),
        timeText(r.loginTime),
        timeText(r.logoutTime),
        fmt(r.loggedInMinutes || 0),
        fmt(r.activeMinutes || 0),
        fmt(r.breakMinutes || 0),
        fmt(r.idleMinutes || 0),
        fmt(r.taskMinutes || 0),
        fmt(r.shortageMinutes || 0),
        fmt(r.overtimeMinutes || 0),
      ]);
    } else if (teamType === "TASKS") {
      headers = [
        "Task",
        "Title",
        "Assigned To",
        "Assigned By",
        "Priority",
        "Status",
        "Due Date",
        "Actual Minutes",
      ];
      data = filteredTasks.map((r) => [
        r.taskNumber,
        r.title,
        r.assignedTo?.fullName,
        r.assignedBy?.fullName || r.assignedBy?.email,
        r.priority,
        statusLabel(r.status),
        dateText(r.dueDate),
        r.actualMinutes || 0,
      ]);
    } else {
      headers = [
        "Employee",
        "Employee ID",
        "Leave Type",
        "From",
        "To",
        "Status",
        "Reviewed By",
        "Reason",
        "Review Comment",
      ];
      data = filteredLeaves.map((r) => [
        r.employee?.fullName,
        r.employee?.employeeId,
        r.leaveType?.name,
        dateText(r.fromDate),
        dateText(r.toDate),
        statusLabel(r.status),
        r.reviewedBy?.employee?.fullName || r.reviewedBy?.email,
        r.reason,
        r.reviewComment,
      ]);
    }
    if (!data.length) return;
    const body = [headers, ...data]
      .map((row) => row.map(csv).join(","))
      .join("\n");
    const blob = new Blob([body], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `manager-${mode.toLowerCase()}-${teamType.toLowerCase()}-report.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const reportTitle =
    mode === "MY"
      ? "My Reports"
      : teamType === "ATTENDANCE"
        ? "Team Reports"
        : teamType === "TASKS"
          ? "Team Task Reports"
          : "Team Leave Reports";
  const reportSubtitle =
    mode === "MY"
      ? "Review your attendance and working history."
      : "Review team attendance, tasks and leave activity.";

  return (
    <div className="managerReportsPage">
      <div className="managerReportsHeader">
        <div>
          <h1>{reportTitle}</h1>
          <p>{reportSubtitle}</p>
        </div>
        <div className="managerReportsHeaderActions">
          <button
            type="button"
            className="managerReportsRefresh"
            onClick={() => activeQuery.refetch()}
            disabled={activeQuery.isFetching}
          >
            <RefreshCw size={15} />
            {activeQuery.isFetching ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            className="managerReportsExport"
            onClick={exportCsv}
          >
            <Download size={15} />
            Export CSV
          </button>
        </div>
      </div>

      <div className="managerReportsSwitcherRow">
        <div className="managerViewSwitcher">
          <SwitchButton
            active={mode === "MY"}
            icon={UserRound}
            title="My Reports"
            subtitle="My work & history"
            onClick={() => changeMode("MY")}
          />
          <SwitchButton
            active={mode === "TEAM"}
            icon={Users}
            title="Team Reports"
            subtitle="Team performance"
            onClick={() => changeMode("TEAM")}
          />
        </div>
        {mode === "TEAM" && (
          <div className="managerTeamReportTypeSwitch">
            <button
              type="button"
              className={teamType === "ATTENDANCE" ? "active" : ""}
              onClick={() => changeTeamType("ATTENDANCE")}
            >
              <Clock3 size={16} />
              Attendance
            </button>
            <button
              type="button"
              className={teamType === "TASKS" ? "active" : ""}
              onClick={() => changeTeamType("TASKS")}
            >
              <CheckSquare size={16} />
              Tasks
            </button>
            <button
              type="button"
              className={teamType === "LEAVES" ? "active" : ""}
              onClick={() => changeTeamType("LEAVES")}
            >
              <CalendarDays size={16} />
              Leaves
            </button>
          </div>
        )}
      </div>

      <div className="managerReportsSummary">
        <div className="managerReportStat blue">
          <Activity />
          <span>Total Records</span>
          <strong>{summary.total}</strong>
        </div>
        <div className="managerReportStat green">
          <CheckCircle2 />
          <span>
            {teamType === "TASKS" && mode === "TEAM"
              ? "Completed"
              : teamType === "LEAVES" && mode === "TEAM"
                ? "Approved"
                : "Present"}
          </span>
          <strong>{summary.present}</strong>
        </div>
        <div className="managerReportStat orange">
          <Clock3 />
          <span>
            {teamType === "TASKS" && mode === "TEAM"
              ? "In Progress"
              : teamType === "LEAVES" && mode === "TEAM"
                ? "Pending"
                : "Late"}
          </span>
          <strong>{summary.late}</strong>
        </div>
        <div className="managerReportStat cyan">
          <Activity />
          <span>Active Time</span>
          <strong>{fmt(summary.active)}</strong>
        </div>
        <div className="managerReportStat orange">
          <Coffee />
          <span>Break Time</span>
          <strong>{fmt(summary.breakTime)}</strong>
        </div>
        <div className="managerReportStat purple">
          <ClipboardList />
          <span>Overtime</span>
          <strong>{fmt(summary.overtime)}</strong>
        </div>
      </div>

      <section className="managerReportFilterCard">
        <div className="managerReportFilterHeading">
          <div>
            <Filter size={17} />
            <strong>
              {teamType === "TASKS" && mode === "TEAM"
                ? "Task Filters"
                : teamType === "LEAVES" && mode === "TEAM"
                  ? "Leave Filters"
                  : "Attendance Filters"}
            </strong>
          </div>
          <button type="button" onClick={resetFilters}>
            Clear Filters
          </button>
        </div>
        <div
          className={`managerReportFilterGrid ${
            mode === "MY" ? "myReports" : `teamReports ${teamType.toLowerCase()}`
          }`}
        >
          <FilterField className="search">
            <Activity size={16} />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={
                mode === "MY"
                  ? "Search my reports..."
                  : "Search employee, ID or department..."
              }
            />
          </FilterField>
          <FilterField>
            <CalendarDays size={16} />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
            />
          </FilterField>
          <FilterField>
            <CalendarDays size={16} />
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
            />
          </FilterField>
          {mode === "TEAM" && teamType === "ATTENDANCE" && (
            <>
              <select
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value)}
              >
                <option value="ALL">All Employees</option>
                {employees.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
              >
                <option value="ALL">All Departments</option>
                {departments.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
              <select
                value={workModeFilter}
                onChange={(e) => setWorkModeFilter(e.target.value)}
              >
                <option value="ALL">All Work Modes</option>
                <option value="WFO">Work From Office</option>
                <option value="WFH">Work From Home</option>
              </select>
            </>
          )}
          {mode === "TEAM" && teamType === "TASKS" && (
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="ALL">All Priorities</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          )}
          {mode === "TEAM" && teamType === "LEAVES" && (
            <select
              value={leaveTypeFilter}
              onChange={(e) => setLeaveTypeFilter(e.target.value)}
            >
              <option value="ALL">All Leave Types</option>
              {leaveTypes.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          )}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">All Status</option>
            {teamType === "TASKS" && mode === "TEAM" ? (
              <>
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </>
            ) : teamType === "LEAVES" && mode === "TEAM" ? (
              <>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="CANCELLED">Cancelled</option>
              </>
            ) : (
              <>
                <option value="PRESENT">Present</option>
                <option value="LATE">Late</option>
                <option value="ON_LEAVE">On Leave</option>
                <option value="INCOMPLETE">Incomplete</option>
                <option value="EARLY_LOGOUT">Early Logout</option>
              </>
            )}
          </select>
        </div>
      </section>

      <section className="managerReportTableCard">
        <div className="managerReportTableHeader">
          <div>
            <h2>
              {mode === "MY"
                ? "My Attendance Records"
                : teamType === "ATTENDANCE"
                  ? "Team Attendance Records"
                  : teamType === "TASKS"
                    ? "Team Task Records"
                    : "Team Leave Requests"}
            </h2>
            <p>Showing {totalRows} records · Click any row to view details</p>
          </div>
        </div>
        {activeQuery.isLoading ? (
          <div className="managerAttendanceState">
            <RefreshCw className="managerAttendanceSpin" />
            Loading report...
          </div>
        ) : activeQuery.isError ? (
          <div className="managerAttendanceState error">
            <Activity />
            Unable to load report.
            <button type="button" onClick={() => activeQuery.refetch()}>
              Try Again
            </button>
          </div>
        ) : (
          <div className="managerReportTableWrap">
            <table className="managerReportTable">
              <thead>
                {mode === "MY" || teamType === "ATTENDANCE" ? (
                  <tr>
                    <th>EMPLOYEE</th>
                    <th>DATE</th>
                    <th>MODE</th>
                    <th>STATUS</th>
                    <th>LOGIN</th>
                    <th>LOGOUT</th>
                    <th>ACTIVE</th>
                    <th>BREAK</th>
                    <th>IDLE</th>
                    <th>TASK</th>
                    <th>SHORTAGE</th>
                    <th>OVERTIME</th>
                  </tr>
                ) : teamType === "TASKS" ? (
                  <tr>
                    <th>TASK</th>
                    <th>TITLE</th>
                    <th>ASSIGNED TO</th>
                    <th>ASSIGNED BY</th>
                    <th>PRIORITY</th>
                    <th>STATUS</th>
                    <th>DUE DATE</th>
                    <th>ACTUAL</th>
                  </tr>
                ) : (
                  <tr>
                    <th>EMPLOYEE</th>
                    <th>LEAVE TYPE</th>
                    <th>FROM</th>
                    <th>TO</th>
                    <th>STATUS</th>
                    <th>REVIEWED BY</th>
                    <th>REASON</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {mode === "MY" || teamType === "ATTENDANCE"
                  ? visibleAttendance.map((r) => (
                      <tr
                        key={r.id}
                        className="managerReportClickableRow"
                        onClick={() => setSelectedAttendance(r)}
                      >
                        <td>
                          <strong>
                            {r.employee?.fullName || "My Attendance"}
                          </strong>
                          <small>{r.employee?.employeeId || "Manager"}</small>
                        </td>
                        <td>{dateText(r.date)}</td>
                        <td>{r.workMode || "—"}</td>
                        <td>
                          <span
                            className={`managerReportStatus ${statusClass(r.status)}`}
                          >
                            {statusLabel(r.status)}
                          </span>
                        </td>
                        <td>{timeText(r.loginTime)}</td>
                        <td>{timeText(r.logoutTime)}</td>
                        <td>{fmt(r.activeMinutes || 0)}</td>
                        <td>{fmt(r.breakMinutes || 0)}</td>
                        <td>{fmt(r.idleMinutes || 0)}</td>
                        <td>{fmt(r.taskMinutes || 0)}</td>
                        <td>{fmt(r.shortageMinutes || 0)}</td>
                        <td>{fmt(r.overtimeMinutes || 0)}</td>
                      </tr>
                    ))
                  : teamType === "TASKS"
                    ? visibleTasks.map((r) => (
                        <tr
                          key={r.id}
                          className="managerReportClickableRow"
                          onClick={() => setSelectedTask(r)}
                        >
                          <td>
                            <strong>{r.taskNumber || "—"}</strong>
                          </td>
                          <td>
                            <strong>{r.title || "—"}</strong>
                            <small>{r.project?.name || "No project"}</small>
                          </td>
                          <td>{r.assignedTo?.fullName || "—"}</td>
                          <td>
                            {r.assignedBy?.fullName ||
                              r.assignedBy?.email ||
                              "—"}
                          </td>
                          <td>{statusLabel(r.priority)}</td>
                          <td>
                            <span
                              className={`managerReportStatus ${statusClass(r.status)}`}
                            >
                              {statusLabel(r.status)}
                            </span>
                          </td>
                          <td>{dateText(r.dueDate)}</td>
                          <td>{fmt(r.actualMinutes || 0)}</td>
                        </tr>
                      ))
                    : visibleLeaves.map((r) => (
                        <tr
                          key={r.id}
                          className="managerReportClickableRow"
                          onClick={() => setSelectedLeave(r)}
                        >
                          <td>
                            <strong>{r.employee?.fullName || "—"}</strong>
                            <small>{r.employee?.employeeId || "—"}</small>
                          </td>
                          <td>{r.leaveType?.name || "—"}</td>
                          <td>{dateText(r.fromDate)}</td>
                          <td>{dateText(r.toDate)}</td>
                          <td>
                            <span
                              className={`managerReportStatus ${statusClass(r.status)}`}
                            >
                              {statusLabel(r.status)}
                            </span>
                          </td>
                          <td>
                            {r.reviewedBy?.employee?.fullName ||
                              r.reviewedBy?.email ||
                              "—"}
                          </td>
                          <td>
                            <span title={r.reason}>{r.reason || "—"}</span>
                          </td>
                        </tr>
                      ))}
                {totalRows === 0 && (
                  <tr>
                    <td
                      colSpan={
                        mode === "MY" || teamType === "ATTENDANCE"
                          ? 12
                          : teamType === "TASKS"
                            ? 8
                            : 7
                      }
                      className="managerReportEmpty"
                    >
                      <CalendarDays size={24} />
                      <strong>No records found</strong>
                      <span>Try changing your filters.</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="managerReportPagination">
          <span>
            Showing {totalRows ? (currentPage - 1) * PAGE_SIZE + 1 : 0} to{" "}
            {Math.min(currentPage * PAGE_SIZE, totalRows)} of {totalRows}
          </span>
          <div>
            <button
              disabled={currentPage === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .slice(
                Math.max(0, currentPage - 3),
                Math.min(totalPages, currentPage + 2),
              )
              .map((n) => (
                <button
                  key={n}
                  className={n === currentPage ? "active" : ""}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              ))}
            <button
              disabled={currentPage === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {selectedAttendance && (
        <div
          className="managerReportModalOverlay"
          onMouseDown={(e) =>
            e.target === e.currentTarget && setSelectedAttendance(null)
          }
        >
          <div className="managerReportModal">
            <header>
              <div className="managerReportModalIcon">
                <Clock3 size={20} />
              </div>
              <div>
                <h2>Attendance Details</h2>
                <p>
                  {selectedAttendance.employee?.employeeId || "Manager"} ·{" "}
                  {dateText(selectedAttendance.date)}
                </p>
              </div>
              <button onClick={() => setSelectedAttendance(null)}>
                <X size={19} />
              </button>
            </header>
            <div className="managerReportModalBody">
              <div className="managerReportProfile">
                <div className="managerReportAvatar">
                  {(selectedAttendance.employee?.fullName || "M")
                    .charAt(0)
                    .toUpperCase()}
                </div>
                <div>
                  <strong>
                    {selectedAttendance.employee?.fullName || "My Attendance"}
                  </strong>
                  <small>
                    {selectedAttendance.employee?.department?.name || "Manager"}
                  </small>
                </div>
                <span
                  className={`managerReportStatus ${statusClass(selectedAttendance.status)}`}
                >
                  {statusLabel(selectedAttendance.status)}
                </span>
              </div>
              <div className="managerReportDetailGrid">
                {[
                  ["Work Mode", selectedAttendance.workMode],
                  ["Date", dateText(selectedAttendance.date)],
                  ["Login", timeText(selectedAttendance.loginTime)],
                  ["Logout", timeText(selectedAttendance.logoutTime)],
                  ["Required", fmt(selectedAttendance.requiredMinutes || 0)],
                  ["Logged In", fmt(selectedAttendance.loggedInMinutes || 0)],
                  ["Active", fmt(selectedAttendance.activeMinutes || 0)],
                  ["Break", fmt(selectedAttendance.breakMinutes || 0)],
                  ["Idle", fmt(selectedAttendance.idleMinutes || 0)],
                  ["Task", fmt(selectedAttendance.taskMinutes || 0)],
                  ["Shortage", fmt(selectedAttendance.shortageMinutes || 0)],
                  ["Overtime", fmt(selectedAttendance.overtimeMinutes || 0)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <span>{k}</span>
                    <strong>{v}</strong>
                  </div>
                ))}
              </div>
            </div>
            <footer>
              <button onClick={() => setSelectedAttendance(null)}>Close</button>
            </footer>
          </div>
        </div>
      )}
      {selectedTask && (
        <div
          className="managerReportModalOverlay"
          onMouseDown={(e) =>
            e.target === e.currentTarget && setSelectedTask(null)
          }
        >
          <div className="managerReportModal">
            <header>
              <div className="managerReportModalIcon">
                <CheckSquare size={20} />
              </div>
              <div>
                <h2>Task Details</h2>
                <p>{selectedTask.taskNumber || "Task"}</p>
              </div>
              <button onClick={() => setSelectedTask(null)}>
                <X size={19} />
              </button>
            </header>
            <div className="managerReportModalBody">
              <div className="managerReportProfile">
                <div className="managerReportAvatar">
                  {(selectedTask.assignedTo?.fullName || "T")
                    .charAt(0)
                    .toUpperCase()}
                </div>
                <div>
                  <strong>{selectedTask.title || "Untitled Task"}</strong>
                  <small>{selectedTask.project?.name || "No project"}</small>
                </div>
                <span
                  className={`managerReportStatus ${statusClass(selectedTask.status)}`}
                >
                  {statusLabel(selectedTask.status)}
                </span>
              </div>
              <div className="managerReportDetailGrid">
                {[
                  ["Assigned To", selectedTask.assignedTo?.fullName || "—"],
                  [
                    "Assigned By",
                    selectedTask.assignedBy?.fullName ||
                      selectedTask.assignedBy?.email ||
                      "—",
                  ],
                  ["Priority", statusLabel(selectedTask.priority)],
                  ["Status", statusLabel(selectedTask.status)],
                  ["Due Date", dateText(selectedTask.dueDate)],
                  ["Estimated", fmt(selectedTask.estimatedMinutes || 0)],
                  ["Actual", fmt(selectedTask.actualMinutes || 0)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <span>{k}</span>
                    <strong>{v}</strong>
                  </div>
                ))}
              </div>
              {selectedTask.description && (
                <div className="managerReportReasonBox">
                  <span>DESCRIPTION</span>
                  <p>{selectedTask.description}</p>
                </div>
              )}
            </div>
            <footer>
              <button onClick={() => setSelectedTask(null)}>Close</button>
            </footer>
          </div>
        </div>
      )}
      {selectedLeave && (
        <div
          className="managerReportModalOverlay"
          onMouseDown={(e) =>
            e.target === e.currentTarget && setSelectedLeave(null)
          }
        >
          <div className="managerReportModal">
            <header>
              <div className="managerReportModalIcon">
                <CalendarDays size={20} />
              </div>
              <div>
                <h2>Leave Request Details</h2>
                <p>
                  {selectedLeave.employee?.employeeId || "Employee"} ·{" "}
                  {selectedLeave.leaveType?.name || "Leave"}
                </p>
              </div>
              <button onClick={() => setSelectedLeave(null)}>
                <X size={19} />
              </button>
            </header>
            <div className="managerReportModalBody">
              <div className="managerReportProfile">
                <div className="managerReportAvatar">
                  {(selectedLeave.employee?.fullName || "L")
                    .charAt(0)
                    .toUpperCase()}
                </div>
                <div>
                  <strong>{selectedLeave.employee?.fullName || "—"}</strong>
                  <small>
                    {selectedLeave.employee?.department?.name || "Team member"}
                  </small>
                </div>
                <span
                  className={`managerReportStatus ${statusClass(selectedLeave.status)}`}
                >
                  {statusLabel(selectedLeave.status)}
                </span>
              </div>
              <div className="managerReportDetailGrid">
                {[
                  ["Leave Type", selectedLeave.leaveType?.name || "—"],
                  ["Duration", selectedLeave.halfDay ? "Half Day" : "Full Day"],
                  ["From", dateText(selectedLeave.fromDate)],
                  ["To", dateText(selectedLeave.toDate)],
                  ["Requested On", dateText(selectedLeave.createdAt)],
                  [
                    "Reviewed By",
                    selectedLeave.reviewedBy?.employee?.fullName ||
                      selectedLeave.reviewedBy?.email ||
                      "—",
                  ],
                  ["Reviewed On", dateText(selectedLeave.reviewedAt)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <span>{k}</span>
                    <strong>{v}</strong>
                  </div>
                ))}
              </div>
              <div className="managerReportReasonBox">
                <span>REASON</span>
                <p>{selectedLeave.reason || "No reason provided."}</p>
              </div>
              {selectedLeave.reviewComment && (
                <div className="managerReportReasonBox">
                  <span>REVIEW COMMENT</span>
                  <p>{selectedLeave.reviewComment}</p>
                </div>
              )}
            </div>
            <footer>
              <button onClick={() => setSelectedLeave(null)}>Close</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
