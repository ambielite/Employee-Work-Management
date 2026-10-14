import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import "./admin-reports.css";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Filter,
  ListChecks,
  RefreshCw,
  Search,
  TimerOff,
  Users,
  XCircle,
} from "lucide-react";

import { get } from "../api/client";
import { fmt } from "../utils/time";

type ReportTab = "attendance" | "tasks" | "leaves";

type AttendanceStatus =
  | "PRESENT"
  | "LATE"
  | "ABSENT"
  | "ON_LEAVE"
  | "HOLIDAY"
  | "WEEKLY_OFF"
  | "INCOMPLETE"
  | "EARLY_LOGOUT"
  | "PRESENT_WITH_INSUFFICIENT_HOURS";

type WorkMode = "WFO" | "WFH";

type ReportEmployee = {
  employeeId: string;
  fullName: string;
  department?: { name: string } | null;
};

type AttendanceReportRow = {
  id: string;
  date: string;
  workMode: WorkMode;
  status: AttendanceStatus;
  loginTime?: string | null;
  logoutTime?: string | null;
  requiredMinutes: number;
  loggedInMinutes: number;
  activeMinutes: number;
  idleMinutes: number;
  breakMinutes: number;
  taskMinutes: number;
  shortageMinutes: number;
  overtimeMinutes: number;
  employee: ReportEmployee;
};

type TaskReportRow = {
  employee: {
    id: string;
    employeeId: string;
    fullName: string;
    department?: { name: string } | null;
  };
  summary: {
    total: number;
    completed: number;
    pending: number;
    cancelled: number;
    overdue: number;
    trackedMinutes: number;
    completionRate: number;
  };
};

type LeaveReportRow = {
  employee: {
    id: string;
    employeeId: string;
    fullName: string;
    department?: { name: string } | null;
  };
  summary: {
    totalRequests: number;
    approved: number;
    pending: number;
    rejected: number;
    cancelled: number;
    approvedDays: number;
  };
  leaves: Array<{
    id: string;
    leaveType: { id: string; name: string };
    fromDate: string;
    toDate: string;
    reason: string;
    halfDay: boolean;
    status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
    reviewedAt?: string | null;
    reviewComment?: string | null;
    days: number;
  }>;
};

const PAGE_SIZE = 10;

function formatDate(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getStatusLabel(status: AttendanceStatus) {
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getStatusClass(status: AttendanceStatus) {
  switch (status) {
    case "PRESENT":
      return "present";
    case "LATE":
      return "late";
    case "ABSENT":
    case "EARLY_LOGOUT":
      return "absent";
    case "ON_LEAVE":
      return "leave";
    case "HOLIDAY":
    case "WEEKLY_OFF":
      return "holiday";
    case "INCOMPLETE":
      return "incomplete";
    case "PRESENT_WITH_INSUFFICIENT_HOURS":
      return "insufficient";
    default:
      return "default";
  }
}

function getLeaveStatusClass(
  status: LeaveReportRow["leaves"][number]["status"],
) {
  switch (status) {
    case "APPROVED":
      return "present";
    case "PENDING":
      return "late";
    case "REJECTED":
      return "absent";
    case "CANCELLED":
      return "holiday";
    default:
      return "default";
  }
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function EmployeeCell({
  employee,
}: {
  employee: {
    employeeId: string;
    fullName: string;
  };
}) {
  return (
    <div className="adminReportsEmployee">
      <div className="adminReportsAvatar">
        {(employee.fullName || "?").charAt(0).toUpperCase()}
      </div>
      <div>
        <strong>{employee.fullName || "-"}</strong>
        <small>{employee.employeeId || "-"}</small>
      </div>
    </div>
  );
}

export default function AdminReports() {
  const [tab, setTab] = useState<ReportTab>("attendance");

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [workModeFilter, setWorkModeFilter] = useState<"ALL" | WorkMode>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | AttendanceStatus>(
    "ALL",
  );

  const [page, setPage] = useState(1);
  const [expandedLeaveEmployees, setExpandedLeaveEmployees] = useState<
    Set<string>
  >(() => new Set());

  const attendanceQuery = useQuery({
    queryKey: ["admin-attendance-report"],
    queryFn: async () => {
      const response = await get("/reports/attendance");
      return Array.isArray(response)
        ? (response as AttendanceReportRow[])
        : Array.isArray(response?.data)
          ? (response.data as AttendanceReportRow[])
          : [];
    },
    enabled: tab === "attendance",
  });

  const tasksQuery = useQuery({
    queryKey: ["admin-task-report"],
    queryFn: async () => {
      const response = await get("/reports/tasks");
      return Array.isArray(response)
        ? (response as TaskReportRow[])
        : Array.isArray(response?.data)
          ? (response.data as TaskReportRow[])
          : [];
    },
    enabled: tab === "tasks",
  });

  const leavesQuery = useQuery({
    queryKey: ["admin-leave-report"],
    queryFn: async () => {
      const response = await get("/reports/leaves");
      return Array.isArray(response)
        ? (response as LeaveReportRow[])
        : Array.isArray(response?.data)
          ? (response.data as LeaveReportRow[])
          : [];
    },
    enabled: tab === "leaves",
  });

  const attendanceReports = attendanceQuery.data ?? [];
  const taskReports = tasksQuery.data ?? [];
  const leaveReports = leavesQuery.data ?? [];

  const departments = useMemo(() => {
    const names =
      tab === "attendance"
        ? attendanceReports.map((row) => row.employee?.department?.name)
        : tab === "tasks"
          ? taskReports.map((row) => row.employee?.department?.name)
          : leaveReports.map((row) => row.employee?.department?.name);

    return Array.from(new Set(names.filter(Boolean) as string[])).sort();
  }, [tab, attendanceReports, taskReports, leaveReports]);

  const employees = useMemo(() => {
    const source =
      tab === "attendance"
        ? attendanceReports.map((row) => row.employee)
        : tab === "tasks"
          ? taskReports.map((row) => row.employee)
          : leaveReports.map((row) => row.employee);

    const unique = new Map<string, any>();

    source.forEach((employee) => {
      if (employee?.employeeId) {
        unique.set(employee.employeeId, employee);
      }
    });

    return Array.from(unique.values()).sort((a, b) =>
      a.fullName.localeCompare(b.fullName),
    );
  }, [tab, attendanceReports, taskReports, leaveReports]);

  const filteredAttendance = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return attendanceReports.filter((row) => {
      const employee = row.employee;
      const employeeName = employee?.fullName || "";
      const employeeId = employee?.employeeId || "";
      const department = employee?.department?.name || "";
      const rowDate = row.date
        ? new Date(row.date).toISOString().slice(0, 10)
        : "";

      return (
        (!keyword ||
          employeeName.toLowerCase().includes(keyword) ||
          employeeId.toLowerCase().includes(keyword) ||
          department.toLowerCase().includes(keyword)) &&
        (!dateFrom || rowDate >= dateFrom) &&
        (!dateTo || rowDate <= dateTo) &&
        (employeeFilter === "ALL" || employeeId === employeeFilter) &&
        (departmentFilter === "ALL" || department === departmentFilter) &&
        (workModeFilter === "ALL" || row.workMode === workModeFilter) &&
        (statusFilter === "ALL" || row.status === statusFilter)
      );
    });
  }, [
    attendanceReports,
    search,
    dateFrom,
    dateTo,
    employeeFilter,
    departmentFilter,
    workModeFilter,
    statusFilter,
  ]);

  const filteredTasks = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return taskReports.filter((row) => {
      const employee = row.employee;
      const department = employee.department?.name || "";

      return (
        (!keyword ||
          employee.fullName.toLowerCase().includes(keyword) ||
          employee.employeeId.toLowerCase().includes(keyword) ||
          department.toLowerCase().includes(keyword)) &&
        (employeeFilter === "ALL" || employee.employeeId === employeeFilter) &&
        (departmentFilter === "ALL" || department === departmentFilter)
      );
    });
  }, [taskReports, search, employeeFilter, departmentFilter]);

  const filteredLeaves = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return leaveReports.filter((row) => {
      const employee = row.employee;
      const department = employee.department?.name || "";

      return (
        (!keyword ||
          employee.fullName.toLowerCase().includes(keyword) ||
          employee.employeeId.toLowerCase().includes(keyword) ||
          department.toLowerCase().includes(keyword)) &&
        (employeeFilter === "ALL" || employee.employeeId === employeeFilter) &&
        (departmentFilter === "ALL" || department === departmentFilter)
      );
    });
  }, [leaveReports, search, employeeFilter, departmentFilter]);

  const currentCount =
    tab === "attendance"
      ? filteredAttendance.length
      : tab === "tasks"
        ? filteredTasks.length
        : filteredLeaves.length;

  const totalPages = Math.max(1, Math.ceil(currentCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const paginatedAttendance = useMemo(
    () =>
      filteredAttendance.slice(
        (safePage - 1) * PAGE_SIZE,
        safePage * PAGE_SIZE,
      ),
    [filteredAttendance, safePage],
  );

  const paginatedTasks = useMemo(
    () => filteredTasks.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredTasks, safePage],
  );

  const paginatedLeaves = useMemo(
    () =>
      filteredLeaves.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredLeaves, safePage],
  );

  // The summary object depends on the selected report tab. This index signature
  // keeps the shared cards type-safe without changing their tab-specific values.
  const summary = useMemo<Record<string, number>>(() => {
    if (tab === "tasks") {
      return filteredTasks.reduce(
        (acc, row) => ({
          employees: acc.employees + 1,
          total: acc.total + row.summary.total,
          completed: acc.completed + row.summary.completed,
          pending: acc.pending + row.summary.pending,
          overdue: acc.overdue + row.summary.overdue,
          completionRateBase:
            acc.completionRateBase +
            Math.max(row.summary.total - row.summary.cancelled, 0),
        }),
        {
          employees: 0,
          total: 0,
          completed: 0,
          pending: 0,
          overdue: 0,
          completionRateBase: 0,
        },
      );
    }

    if (tab === "leaves") {
      return filteredLeaves.reduce(
        (acc, row) => ({
          employees: acc.employees + 1,
          total: acc.total + row.summary.totalRequests,
          approved: acc.approved + row.summary.approved,
          pending: acc.pending + row.summary.pending,
          rejected: acc.rejected + row.summary.rejected,
          approvedDays: acc.approvedDays + row.summary.approvedDays,
        }),
        {
          employees: 0,
          total: 0,
          approved: 0,
          pending: 0,
          rejected: 0,
          approvedDays: 0,
        },
      );
    }

    const total = filteredAttendance.length;
    const present = filteredAttendance.filter(
      (r) => r.status === "PRESENT",
    ).length;
    const late = filteredAttendance.filter((r) => r.status === "LATE").length;
    const absent = filteredAttendance.filter(
      (r) => r.status === "ABSENT",
    ).length;
    const leave = filteredAttendance.filter(
      (r) => r.status === "ON_LEAVE",
    ).length;
    const attended = filteredAttendance.filter((r) =>
      [
        "PRESENT",
        "LATE",
        "EARLY_LOGOUT",
        "PRESENT_WITH_INSUFFICIENT_HOURS",
      ].includes(r.status),
    ).length;

    return {
      total,
      present,
      late,
      absent,
      leave,
      attendanceRate:
        attended + absent > 0
          ? Math.round((attended / (attended + absent)) * 100)
          : 0,
      active: filteredAttendance.reduce(
        (s, r) => s + (r.activeMinutes || 0),
        0,
      ),
      idle: filteredAttendance.reduce((s, r) => s + (r.idleMinutes || 0), 0),
      break: filteredAttendance.reduce((s, r) => s + (r.breakMinutes || 0), 0),
      overtime: filteredAttendance.reduce(
        (s, r) => s + (r.overtimeMinutes || 0),
        0,
      ),
    };
  }, [tab, filteredAttendance, filteredTasks, filteredLeaves]);

  function resetPage() {
    setPage(1);
  }

  function toggleLeaveDetails(employeeId: string) {
    setExpandedLeaveEmployees((current) => {
      const next = new Set(current);

      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
      }

      return next;
    });
  }

  function clearExpandedLeaveDetails() {
    setExpandedLeaveEmployees(new Set());
  }

  function clearFilters() {
    clearExpandedLeaveDetails();
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setEmployeeFilter("ALL");
    setDepartmentFilter("ALL");
    setWorkModeFilter("ALL");
    setStatusFilter("ALL");
    resetPage();
  }

  function changeTab(nextTab: ReportTab) {
    setTab(nextTab);
    resetPage();
    clearExpandedLeaveDetails();
  }

  function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
    if (!rows.length) return;

    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportAttendanceCsv() {
    downloadCsv(
      `attendance-report-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Employee ID",
        "Employee Name",
        "Department",
        "Date",
        "Work Mode",
        "Status",
        "Logged In Minutes",
        "Active Minutes",
        "Break Minutes",
        "Idle Minutes",
        "Task Minutes",
        "Shortage Minutes",
        "Overtime Minutes",
      ],
      filteredAttendance.map((row) => [
        row.employee.employeeId,
        row.employee.fullName,
        row.employee.department?.name || "",
        formatDate(row.date),
        row.workMode,
        getStatusLabel(row.status),
        row.loggedInMinutes,
        row.activeMinutes,
        row.breakMinutes,
        row.idleMinutes,
        row.taskMinutes,
        row.shortageMinutes,
        row.overtimeMinutes,
      ]),
    );
  }

  function exportTaskCsv() {
    downloadCsv(
      `task-report-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Employee ID",
        "Employee Name",
        "Department",
        "Total Tasks",
        "Completed",
        "Pending",
        "Overdue",
        "Cancelled",
        "Tracked Minutes",
        "Completion Rate",
      ],
      filteredTasks.map((row) => [
        row.employee.employeeId,
        row.employee.fullName,
        row.employee.department?.name || "",
        row.summary.total,
        row.summary.completed,
        row.summary.pending,
        row.summary.overdue,
        row.summary.cancelled,
        row.summary.trackedMinutes,
        `${row.summary.completionRate}%`,
      ]),
    );
  }

  function exportLeaveCsv() {
    const rows: unknown[][] = [];

    filteredLeaves.forEach((row) => {
      row.leaves.forEach((leave) => {
        rows.push([
          row.employee.employeeId,
          row.employee.fullName,
          row.employee.department?.name || "",
          leave.leaveType.name,
          formatDate(leave.fromDate),
          formatDate(leave.toDate),
          leave.days,
          leave.halfDay ? "Yes" : "No",
          leave.status,
          leave.reason || "",
          leave.reviewedAt ? formatDate(leave.reviewedAt) : "",
          leave.reviewComment || "",
        ]);
      });
    });

    downloadCsv(
      `leave-report-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Employee ID",
        "Employee Name",
        "Department",
        "Leave Type",
        "From Date",
        "To Date",
        "Days",
        "Half Day",
        "Status",
        "Reason",
        "Reviewed At",
        "Review Comment",
      ],
      rows,
    );
  }

  function exportCurrentCsv() {
    if (tab === "attendance") exportAttendanceCsv();
    if (tab === "tasks") exportTaskCsv();
    if (tab === "leaves") exportLeaveCsv();
  }

  function refreshCurrent() {
    if (tab === "attendance") attendanceQuery.refetch();
    if (tab === "tasks") tasksQuery.refetch();
    if (tab === "leaves") leavesQuery.refetch();
  }

  const currentLoading =
    tab === "attendance"
      ? attendanceQuery.isLoading
      : tab === "tasks"
        ? tasksQuery.isLoading
        : leavesQuery.isLoading;

  const currentError =
    tab === "attendance"
      ? attendanceQuery.isError
      : tab === "tasks"
        ? tasksQuery.isError
        : leavesQuery.isError;

  const currentFetching =
    tab === "attendance"
      ? attendanceQuery.isFetching
      : tab === "tasks"
        ? tasksQuery.isFetching
        : leavesQuery.isFetching;

  const showingFrom = currentCount === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(safePage * PAGE_SIZE, currentCount);

  return (
    <div className="adminReportsPage">
      <div className="title adminReportsHeader">
        <div>
          <h1>Reports</h1>
          <p className="pageSubtitle">
            Review employee attendance, task completion and leave activity.
          </p>
          <span className="adminReportsRecordCount">
            {currentCount} {currentCount === 1 ? "record" : "records"}
          </span>
        </div>

        <div className="adminReportsHeaderActions">
          <button
            type="button"
            className="btn secondaryBtn adminReportsRefreshBtn"
            onClick={refreshCurrent}
            disabled={currentFetching}
          >
            <RefreshCw
              size={16}
              className={currentFetching ? "adminReportsSpin" : ""}
            />
            {currentFetching ? "Refreshing..." : "Refresh"}
          </button>

          <button
            type="button"
            className="btn primaryBtn adminReportsExportBtn"
            onClick={exportCurrentCsv}
            disabled={
              tab === "attendance"
                ? !filteredAttendance.length
                : tab === "tasks"
                  ? !filteredTasks.length
                  : !filteredLeaves.some((row) => row.leaves.length > 0)
            }
          >
            <Download size={16} />
            {tab === "attendance"
              ? "Export Attendance"
              : tab === "tasks"
                ? "Export Tasks"
                : "Export Leaves"}
          </button>
        </div>
      </div>

      <div className="adminReportsTabs" role="tablist" aria-label="Reports">
        <button
          type="button"
          className={`adminReportsTab ${tab === "attendance" ? "active" : ""}`}
          onClick={() => changeTab("attendance")}
        >
          <CalendarDays size={16} />
          Attendance
        </button>

        <button
          type="button"
          className={`adminReportsTab ${tab === "tasks" ? "active" : ""}`}
          onClick={() => changeTab("tasks")}
        >
          <ListChecks size={16} />
          Tasks
        </button>

        <button
          type="button"
          className={`adminReportsTab ${tab === "leaves" ? "active" : ""}`}
          onClick={() => changeTab("leaves")}
        >
          <CalendarDays size={16} />
          Leaves
        </button>
      </div>

      <div className="adminReportsSummaryGrid">
        {tab === "attendance" && (
          <>
            <SummaryCard
              icon={<Users size={19} />}
              label="Total Records"
              value={summary.total}
              variant="total"
            />
            <SummaryCard
              icon={<Activity size={19} />}
              label="Present"
              value={summary.present}
              variant="present"
            />
            <SummaryCard
              icon={<Clock3 size={19} />}
              label="Late"
              value={summary.late}
              variant="late"
            />
            <SummaryCard
              icon={<CalendarDays size={19} />}
              label="On Leave"
              value={summary.leave}
              variant="leave"
            />
            <SummaryCard
              icon={<XCircle size={19} />}
              label="Absent"
              value={summary.absent}
              variant="absent"
            />
            <SummaryCard
              icon={<Activity size={19} />}
              label="Attendance Rate"
              value={`${summary.attendanceRate}%`}
              variant="attendanceRate"
            />
            <SummaryCard
              icon={<Activity size={19} />}
              label="Total Active Time"
              value={fmt(summary.active)}
              variant="active"
            />
            <SummaryCard
              icon={<TimerOff size={19} />}
              label="Total Idle Time"
              value={fmt(summary.idle)}
              variant="idle"
            />
            <SummaryCard
              icon={<Clock3 size={19} />}
              label="Total Break Time"
              value={fmt(summary.break)}
              variant="active"
            />
            <SummaryCard
              icon={<Activity size={19} />}
              label="Total Overtime"
              value={fmt(summary.overtime)}
              variant="present"
            />
          </>
        )}

        {tab === "tasks" && (
          <>
            <SummaryCard
              icon={<Users size={19} />}
              label="Employees"
              value={summary.employees}
              variant="total"
            />
            <SummaryCard
              icon={<ListChecks size={19} />}
              label="Total Tasks"
              value={summary.total}
              variant="total"
            />
            <SummaryCard
              icon={<CheckCircle2 size={19} />}
              label="Completed"
              value={summary.completed}
              variant="present"
            />
            <SummaryCard
              icon={<Clock3 size={19} />}
              label="Pending"
              value={summary.pending}
              variant="late"
            />
            <SummaryCard
              icon={<XCircle size={19} />}
              label="Overdue"
              value={summary.overdue}
              variant="absent"
            />
            <SummaryCard
              icon={<Activity size={19} />}
              label="Completion Rate"
              value={`${summary.completionRateBase ? Math.round((summary.completed / summary.completionRateBase) * 100) : 0}%`}
              variant="attendanceRate"
            />
          </>
        )}

        {tab === "leaves" && (
          <>
            <SummaryCard
              icon={<Users size={19} />}
              label="Employees"
              value={summary.employees}
              variant="total"
            />
            <SummaryCard
              icon={<CalendarDays size={19} />}
              label="Leave Requests"
              value={summary.total}
              variant="total"
            />
            <SummaryCard
              icon={<CheckCircle2 size={19} />}
              label="Approved"
              value={summary.approved}
              variant="present"
            />
            <SummaryCard
              icon={<Clock3 size={19} />}
              label="Pending"
              value={summary.pending}
              variant="late"
            />
            <SummaryCard
              icon={<XCircle size={19} />}
              label="Rejected"
              value={summary.rejected}
              variant="absent"
            />
            <SummaryCard
              icon={<CalendarDays size={19} />}
              label="Approved Days"
              value={summary.approvedDays}
              variant="leave"
            />
          </>
        )}
      </div>

      <div className="card adminReportsFilterCard">
        <div className="adminReportsFilterHeader">
          <div className="adminReportsFilterTitle">
            <Filter size={17} />
            <span>Report Filters</span>
          </div>

          <button
            type="button"
            className="btn secondary adminReportsClearBtn"
            onClick={clearFilters}
            disabled={
              !search &&
              !dateFrom &&
              !dateTo &&
              employeeFilter === "ALL" &&
              departmentFilter === "ALL" &&
              workModeFilter === "ALL" &&
              statusFilter === "ALL"
            }
          >
            <RefreshCw size={14} />
            Clear Filter
          </button>
        </div>

        <div className="adminReportsFilters">
          <div className="adminReportsSearch">
            <Search size={17} />
            <input
              type="text"
              placeholder="Search employee, ID or department..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPage();
              }}
            />
          </div>

          {tab === "attendance" && (
            <>
              <div className="adminReportsFilterField">
                <label>From Date</label>
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    resetPage();
                  }}
                />
              </div>

              <div className="adminReportsFilterField">
                <label>To Date</label>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    resetPage();
                  }}
                />
              </div>
            </>
          )}

          <div className="adminReportsFilterField">
            <label>Employee</label>
            <select
              value={employeeFilter}
              onChange={(e) => {
                setEmployeeFilter(e.target.value);
                resetPage();
              }}
            >
              <option value="ALL">All Employees</option>
              {employees.map((employee) => (
                <option key={employee.employeeId} value={employee.employeeId}>
                  {employee.fullName} ({employee.employeeId})
                </option>
              ))}
            </select>
          </div>

          <div className="adminReportsFilterField">
            <label>Department</label>
            <select
              value={departmentFilter}
              onChange={(e) => {
                setDepartmentFilter(e.target.value);
                resetPage();
              }}
            >
              <option value="ALL">All</option>
              {departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </div>

          {tab === "attendance" && (
            <>
              <div className="adminReportsFilterField">
                <label>Work Mode</label>
                <select
                  value={workModeFilter}
                  onChange={(e) => {
                    setWorkModeFilter(e.target.value as "ALL" | WorkMode);
                    resetPage();
                  }}
                >
                  <option value="ALL">All</option>
                  <option value="WFO">WFO</option>
                  <option value="WFH">WFH</option>
                </select>
              </div>

              <div className="adminReportsFilterField">
                <label>Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as "ALL" | AttendanceStatus);
                    resetPage();
                  }}
                >
                  <option value="ALL">All</option>
                  <option value="PRESENT">Present</option>
                  <option value="LATE">Late</option>
                  <option value="ABSENT">Absent</option>
                  <option value="ON_LEAVE">On Leave</option>
                  <option value="HOLIDAY">Holiday</option>
                  <option value="WEEKLY_OFF">Weekly Off</option>
                  <option value="INCOMPLETE">Incomplete</option>
                  <option value="EARLY_LOGOUT">Early Logout</option>
                  <option value="PRESENT_WITH_INSUFFICIENT_HOURS">
                    Insufficient Hours
                  </option>
                </select>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card adminReportsTableCard">
        <div className="adminReportsTableHeader">
          <div>
            <h2>
              {tab === "attendance"
                ? "Attendance Report"
                : tab === "tasks"
                  ? "Task Completion Report"
                  : "Leave Report"}
            </h2>
            <span>
              Showing {showingFrom}–{showingTo} of {currentCount}
            </span>
          </div>
        </div>

        {currentLoading ? (
          <div className="adminReportsState">Loading report...</div>
        ) : currentError ? (
          <div className="adminReportsState error">
            <strong>Unable to load this report.</strong>
            <button type="button" className="btn" onClick={refreshCurrent}>
              Try Again
            </button>
          </div>
        ) : tab === "attendance" ? (
          <AttendanceTable rows={paginatedAttendance} />
        ) : tab === "tasks" ? (
          <TaskTable rows={paginatedTasks} />
        ) : (
          <LeaveTable
            rows={paginatedLeaves}
            expandedLeaveEmployees={expandedLeaveEmployees}
            onToggleDetails={toggleLeaveDetails}
          />
        )}

        {!currentLoading && !currentError && currentCount > 0 && (
          <div className="adminReportsPagination">
            <span>
              Showing {showingFrom}–{showingTo} of {currentCount}
            </span>

            <div className="adminReportsPaginationControls">
              <button
                type="button"
                className="adminReportsPageBtn"
                disabled={safePage === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft size={16} />
              </button>

              {Array.from({ length: totalPages }, (_, index) => index + 1).map(
                (pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    className={`adminReportsPageNumber ${
                      safePage === pageNumber ? "active" : ""
                    }`}
                    onClick={() => setPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                ),
              )}

              <button
                type="button"
                className="adminReportsPageBtn"
                disabled={safePage === totalPages}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  variant,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  variant: string;
}) {
  return (
    <div className="adminReportsSummaryCard">
      <div className={`adminReportsSummaryIcon ${variant}`}>{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function AttendanceTable({ rows }: { rows: AttendanceReportRow[] }) {
  return (
    <div className="adminReportsTableWrap">
      <table className="adminReportsTable">
        <thead>
          <tr>
            <th>EMPLOYEE</th>
            <th>DATE</th>
            <th>STATUS</th>
            <th>WORK MODE</th>
            <th>LOGGED IN</th>
            <th>ACTIVE</th>
            <th>BREAK</th>
            <th>IDLE</th>
            <th>TASK TIME</th>
            <th>SHORTAGE</th>
            <th>OVERTIME</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={11}>
                <div className="adminReportsState">
                  No attendance records found.
                </div>
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <EmployeeCell employee={row.employee} />
                </td>
                <td>{formatDate(row.date)}</td>
                <td>
                  <span
                    className={`adminReportsStatus ${getStatusClass(row.status)}`}
                  >
                    {getStatusLabel(row.status)}
                  </span>
                </td>
                <td>
                  <span
                    className={`adminReportsWorkMode ${row.workMode.toLowerCase()}`}
                  >
                    {row.workMode}
                  </span>
                </td>
                <td>{fmt(row.loggedInMinutes || 0)}</td>
                <td>{fmt(row.activeMinutes || 0)}</td>
                <td>{fmt(row.breakMinutes || 0)}</td>
                <td>{fmt(row.idleMinutes || 0)}</td>
                <td>{fmt(row.taskMinutes || 0)}</td>
                <td>
                  <span
                    className={
                      row.shortageMinutes > 0
                        ? "adminReportsMetric shortage"
                        : "adminReportsMetric"
                    }
                  >
                    {fmt(row.shortageMinutes || 0)}
                  </span>
                </td>
                <td>
                  <span
                    className={
                      row.overtimeMinutes > 0
                        ? "adminReportsMetric overtime"
                        : "adminReportsMetric"
                    }
                  >
                    {fmt(row.overtimeMinutes || 0)}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function TaskTable({ rows }: { rows: TaskReportRow[] }) {
  return (
    <div className="adminReportsTableWrap">
      <table className="adminReportsTable adminReportsTaskTable">
        <thead>
          <tr>
            <th>EMPLOYEE</th>
            <th>DEPARTMENT</th>
            <th>TOTAL TASKS</th>
            <th>COMPLETED</th>
            <th>PENDING</th>
            <th>OVERDUE</th>
            <th>CANCELLED</th>
            <th>TRACKED TIME</th>
            <th>COMPLETION</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={9}>
                <div className="adminReportsState">
                  No task report data found.
                </div>
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.employee.id}>
                <td>
                  <EmployeeCell employee={row.employee} />
                </td>
                <td>{row.employee.department?.name || "-"}</td>
                <td>
                  <strong>{row.summary.total}</strong>
                </td>
                <td>
                  <span className="adminReportsStatus present">
                    {row.summary.completed}
                  </span>
                </td>
                <td>
                  <span className="adminReportsStatus late">
                    {row.summary.pending}
                  </span>
                </td>
                <td>
                  <span className="adminReportsStatus absent">
                    {row.summary.overdue}
                  </span>
                </td>
                <td>
                  <span className="adminReportsStatus holiday">
                    {row.summary.cancelled}
                  </span>
                </td>
                <td>{fmt(row.summary.trackedMinutes || 0)}</td>
                <td>
                  <span className="adminReportsCompletion">
                    {row.summary.completionRate}%
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function LeaveTable({
  rows,
  expandedLeaveEmployees,
  onToggleDetails,
}: {
  rows: LeaveReportRow[];
  expandedLeaveEmployees: Set<string>;
  onToggleDetails: (employeeId: string) => void;
}) {
  return (
    <div className="adminReportsTableWrap">
      <table className="adminReportsTable adminReportsLeaveTable">
        <thead>
          <tr>
            <th>EMPLOYEE</th>
            <th>DEPARTMENT</th>
            <th>REQUESTS</th>
            <th>APPROVED</th>
            <th>PENDING</th>
            <th>REJECTED</th>
            <th>CANCELLED</th>
            <th>APPROVED DAYS</th>
            <th>LEAVE DETAILS</th>
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={9}>
                <div className="adminReportsState">
                  No leave report data found.
                </div>
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const expanded = expandedLeaveEmployees.has(row.employee.id);
              const visibleLeaves = expanded
                ? row.leaves
                : row.leaves.slice(0, 3);

              const extraCount = Math.max(row.leaves.length - 3, 0);

              return (
                <tr key={row.employee.id}>
                  <td>
                    <EmployeeCell employee={row.employee} />
                  </td>

                  <td>{row.employee.department?.name || "-"}</td>

                  <td>
                    <strong>{row.summary.totalRequests}</strong>
                  </td>

                  <td>
                    <span className="adminReportsStatus present">
                      {row.summary.approved}
                    </span>
                  </td>

                  <td>
                    <span className="adminReportsStatus late">
                      {row.summary.pending}
                    </span>
                  </td>

                  <td>
                    <span className="adminReportsStatus absent">
                      {row.summary.rejected}
                    </span>
                  </td>

                  <td>
                    <span className="adminReportsStatus holiday">
                      {row.summary.cancelled}
                    </span>
                  </td>

                  <td>
                    <strong>{row.summary.approvedDays}</strong>
                  </td>

                  <td>
                    <div className="adminReportsLeaveDetails">
                      {visibleLeaves.map((leave) => (
                        <div key={leave.id} className="adminReportsLeaveDetail">
                          <div className="adminReportsLeaveDetailMain">
                            <span>{leave.leaveType.name}</span>
                            <small>
                              {formatDate(leave.fromDate)} –{" "}
                              {formatDate(leave.toDate)}
                              {" · "}
                              {leave.days} {leave.days === 1 ? "day" : "days"}
                              {leave.halfDay ? " · Half Day" : ""}
                            </small>
                          </div>

                          <em
                            className={`adminReportsStatus ${getLeaveStatusClass(
                              leave.status,
                            )}`}
                          >
                            {leave.status}
                          </em>

                          {leave.reason && (
                            <small className="adminReportsLeaveReason">
                              {leave.reason}
                            </small>
                          )}
                        </div>
                      ))}

                      {extraCount > 0 && (
                        <button
                          type="button"
                          className="adminReportsMoreButton"
                          onClick={() => onToggleDetails(row.employee.id)}
                          aria-expanded={expanded}
                        >
                          {expanded ? "Show less" : `+${extraCount} more`}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
