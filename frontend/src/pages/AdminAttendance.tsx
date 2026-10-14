import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  Clock3,
  Coffee,
  Download,
  Filter,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
  Users,
  Activity,
  TimerOff,
  BriefcaseBusiness,
  X,
} from "lucide-react";

import { get } from "../api/client";
import { fmt } from "../utils/time";
import "./admin-attendance.css";

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

type AttendanceEmployee = {
  employeeId: string;
  fullName: string;
  department?: {
    name: string;
  } | null;
};

type Attendance = {
  id: string;
  date: string;
  workMode: WorkMode;
  status: AttendanceStatus;
  scheduledStart: string;
  scheduledEnd: string;
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
  employee: AttendanceEmployee;
};

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

function formatTime(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function getStatusLabel(status: AttendanceStatus) {
  switch (status) {
    case "PRESENT":
      return "Present";

    case "LATE":
      return "Late";

    case "ABSENT":
      return "Absent";

    case "ON_LEAVE":
      return "On Leave";

    case "HOLIDAY":
      return "Holiday";

    case "WEEKLY_OFF":
      return "Weekly Off";

    case "INCOMPLETE":
      return "Incomplete";

    case "EARLY_LOGOUT":
      return "Early Logout";

    case "PRESENT_WITH_INSUFFICIENT_HOURS":
      return "Insufficient Hours";

    default:
      return status;
  }
}

function getStatusClass(status: AttendanceStatus) {
  switch (status) {
    case "PRESENT":
      return "present";

    case "LATE":
      return "late";

    case "ABSENT":
      return "absent";

    case "ON_LEAVE":
      return "leave";

    case "HOLIDAY":
    case "WEEKLY_OFF":
      return "holiday";

    case "INCOMPLETE":
      return "incomplete";

    case "EARLY_LOGOUT":
      return "early";

    case "PRESENT_WITH_INSUFFICIENT_HOURS":
      return "insufficient";

    default:
      return "default";
  }
}

function getUniqueDepartments(rows: Attendance[]) {
  return Array.from(
    new Set(
      rows
        .map((row) => row.employee?.department?.name)
        .filter(Boolean) as string[],
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");

  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export default function AdminAttendance() {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [workModeFilter, setWorkModeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [selectedAttendance, setSelectedAttendance] =
    useState<Attendance | null>(null);

  const {
    data: attendance = [],
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery<Attendance[]>({
    queryKey: ["admin-attendance"],
    queryFn: () => get<Attendance[]>("/attendance/company"),
  });

  const departments = useMemo(
    () => getUniqueDepartments(attendance),
    [attendance],
  );

  const filteredAttendance = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return attendance.filter((row) => {
      const employee = row.employee;

      const matchesSearch =
        !searchText ||
        employee?.employeeId?.toLowerCase().includes(searchText) ||
        employee?.fullName?.toLowerCase().includes(searchText) ||
        employee?.department?.name?.toLowerCase().includes(searchText);

      const matchesDate =
        !dateFilter ||
        new Date(row.date).toISOString().slice(0, 10) === dateFilter;

      const matchesDepartment =
        departmentFilter === "ALL" ||
        employee?.department?.name === departmentFilter;

      const matchesWorkMode =
        workModeFilter === "ALL" || row.workMode === workModeFilter;

      const matchesStatus =
        statusFilter === "ALL" || row.status === statusFilter;

      return (
        matchesSearch &&
        matchesDate &&
        matchesDepartment &&
        matchesWorkMode &&
        matchesStatus
      );
    });
  }, [
    attendance,
    search,
    dateFilter,
    departmentFilter,
    workModeFilter,
    statusFilter,
  ]);

  const summary = useMemo(() => {
    const total = filteredAttendance.length;

    const present = filteredAttendance.filter(
      (row) => row.status === "PRESENT",
    ).length;

    const late = filteredAttendance.filter(
      (row) => row.status === "LATE",
    ).length;

    const leave = filteredAttendance.filter(
      (row) => row.status === "ON_LEAVE",
    ).length;

    const totalActiveMinutes = filteredAttendance.reduce(
      (sum, row) => sum + (row.activeMinutes || 0),
      0,
    );

    const totalBreakMinutes = filteredAttendance.reduce(
      (sum, row) => sum + (row.breakMinutes || 0),
      0,
    );

    return {
      total,
      present,
      late,
      leave,
      totalActiveMinutes,
      totalBreakMinutes,
    };
  }, [filteredAttendance]);

  function clearFilters() {
    setSearch("");
    setDateFilter("");
    setDepartmentFilter("ALL");
    setWorkModeFilter("ALL");
    setStatusFilter("ALL");
  }

  function exportCsv() {
    if (!filteredAttendance.length) return;

    const headers = [
      "Employee ID",
      "Employee Name",
      "Department",
      "Date",
      "Work Mode",
      "Status",
      "Login Time",
      "Logout Time",
      "Logged In",
      "Active Time",
      "Break Time",
      "Idle Time",
      "Task Time",
      "Shortage",
      "Overtime",
    ];

    const rows = filteredAttendance.map((row) => [
      row.employee?.employeeId || "",
      row.employee?.fullName || "",
      row.employee?.department?.name || "",
      formatDate(row.date),
      row.workMode,
      getStatusLabel(row.status),
      formatTime(row.loginTime),
      formatTime(row.logoutTime),
      fmt(row.loggedInMinutes || 0),
      fmt(row.activeMinutes || 0),
      fmt(row.breakMinutes || 0),
      fmt(row.idleMinutes || 0),
      fmt(row.taskMinutes || 0),
      fmt(row.shortageMinutes || 0),
      fmt(row.overtimeMinutes || 0),
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `attendance-${new Date().toISOString().slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  return (
    <div className="adminAttendancePage">
      {/* =========================================
          HEADER
      ========================================= */}

      <div className="title adminAttendanceHeader">
        <div>
          <h1>Attendance</h1>

          <p className="pageSubtitle">
            Monitor employee attendance, working time, breaks and productivity.
          </p>
        </div>

        <div className="attendanceHeaderActions">
          <button
            type="button"
            className="btn primaryBtn attendanceRefreshBtn"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              size={16}
              className={isFetching ? "attendanceSpin" : ""}
            />
            Refresh
          </button>

          <button
            type="button"
            className="btn primaryBtn"
            onClick={exportCsv}
            disabled={!filteredAttendance.length}
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* =========================================
          SUMMARY
      ========================================= */}

      <div className="attendanceSummaryGrid">
        <div className="attendanceSummaryCard total">
          <div className="attendanceSummaryIcon total">
            <Users size={19} />
          </div>

          <div>
            <span>Total Records</span>
            <strong>{summary.total}</strong>
          </div>
        </div>

        <div className="attendanceSummaryCard present">
          <div className="attendanceSummaryIcon present">
            <Activity size={19} />
          </div>

          <div>
            <span>Present</span>
            <strong>{summary.present}</strong>
          </div>
        </div>

        <div className="attendanceSummaryCard late">
          <div className="attendanceSummaryIcon late">
            <Clock3 size={19} />
          </div>

          <div>
            <span>Late</span>
            <strong>{summary.late}</strong>
          </div>
        </div>

        <div className="attendanceSummaryCard leave">
          <div className="attendanceSummaryIcon leave">
            <CalendarDays size={19} />
          </div>

          <div>
            <span>On Leave</span>
            <strong>{summary.leave}</strong>
          </div>
        </div>

        <div className="attendanceSummaryCard active">
          <div className="attendanceSummaryIcon active">
            <BriefcaseBusiness size={19} />
          </div>

          <div>
            <span>Total Active Time</span>
            <strong>{fmt(summary.totalActiveMinutes)}</strong>
          </div>
        </div>

        <div className="attendanceSummaryCard break">
          <div className="attendanceSummaryIcon break">
            <Coffee size={19} />
          </div>

          <div>
            <span>Total Break Time</span>
            <strong>{fmt(summary.totalBreakMinutes)}</strong>
          </div>
        </div>
      </div>

      {/* =========================================
          FILTERS
      ========================================= */}

      <div className="card attendanceFilterCard">
        <div className="attendanceFilterHeader">
          <div className="attendanceFilterTitle">
            <Filter size={17} />
            <span>Attendance Filters</span>
          </div>

          <button
            type="button"
            className="btn primaryBtn attendanceClearBtn"
            onClick={clearFilters}
            disabled={
              !search &&
              !dateFilter &&
              departmentFilter === "ALL" &&
              workModeFilter === "ALL" &&
              statusFilter === "ALL"
            }
          >
            Clear Filters
          </button>
        </div>

        <div className="attendanceFilter">
          <div className="attendanceSearch">
            <Search size={18} />

            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search employee, ID or department..."
            />
          </div>

          <div className="attendanceDateField">
            <CalendarDays size={17} />

            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              aria-label="Filter by date"
            />
          </div>

          <select
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value)}
          >
            <option value="ALL">All Departments</option>

            {departments.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>

          <select
            value={workModeFilter}
            onChange={(event) => setWorkModeFilter(event.target.value)}
          >
            <option value="ALL">All Work Modes</option>
            <option value="WFO">Work From Office</option>
            <option value="WFH">Work From Home</option>
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="ALL">All Status</option>
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
      </div>

      {/* =========================================
          TABLE
      ========================================= */}

      <div className="card attendanceTableCard">
        <div className="attendanceTableHeader">
          <div>
            <h3>Attendance Records</h3>

            <span>
              Showing {filteredAttendance.length} of {attendance.length} records
            </span>
          </div>

          <div className="attendanceTableHint">
            <TimerOff size={15} />
            Server-calculated attendance
          </div>
        </div>

        {isLoading ? (
          <div className="attendanceState">
            <RefreshCw size={20} className="attendanceSpin" />
            <span>Loading attendance...</span>
          </div>
        ) : isError ? (
          <div className="attendanceState attendanceErrorState">
            Unable to load attendance records.
          </div>
        ) : (
          <div className="attendanceTableWrap">
            <table className="table attendanceTable">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Date</th>
                  <th>Work Mode</th>
                  <th>Status</th>
                  <th>Login</th>
                  <th>Logout</th>
                  <th>Logged In</th>
                  <th>Active</th>
                  <th>Break</th>
                  <th>Idle</th>
                  <th>Task</th>
                  <th>Shortage</th>
                  <th>Overtime</th>
                </tr>
              </thead>

              <tbody>
                {filteredAttendance.length === 0 ? (
                  <tr>
                    <td colSpan={14}>
                      <div className="attendanceState">
                        <CalendarDays size={22} />
                        <span>No attendance records found.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredAttendance.map((row) => (
                    <tr
                      key={row.id}
                      className="attendanceClickableRow"
                      onClick={() => setSelectedAttendance(row)}
                    >
                      <td>
                        <div className="attendanceEmployeeCell">
                          <div className="attendanceEmployeeAvatar">
                            {row.employee?.fullName?.charAt(0).toUpperCase() ||
                              "?"}
                          </div>

                          <div>
                            <strong>{row.employee?.fullName || "-"}</strong>

                            <span>{row.employee?.employeeId || "-"}</span>
                          </div>
                        </div>
                      </td>

                      <td>{row.employee?.department?.name || "-"}</td>

                      <td>
                        <span className="attendanceDate">
                          {formatDate(row.date)}
                        </span>
                      </td>

                      <td>
                        <span
                          className={`workModeBadge ${row.workMode.toLowerCase()}`}
                        >
                          {row.workMode === "WFO" ? "WFO" : "WFH"}
                        </span>
                      </td>

                      <td>
                        <span
                          className={`attendanceStatusBadge ${getStatusClass(
                            row.status,
                          )}`}
                        >
                          {getStatusLabel(row.status)}
                        </span>
                      </td>

                      <td>
                        <span className="attendanceTimeCell">
                          <LogIn size={14} />
                          {formatTime(row.loginTime)}
                        </span>
                      </td>

                      <td>
                        <span className="attendanceTimeCell">
                          <LogOut size={14} />
                          {formatTime(row.logoutTime)}
                        </span>
                      </td>

                      <td>
                        <strong>{fmt(row.loggedInMinutes || 0)}</strong>
                      </td>

                      <td>
                        <span className="activeTime">
                          {fmt(row.activeMinutes || 0)}
                        </span>
                      </td>

                      <td>{fmt(row.breakMinutes || 0)}</td>

                      <td>{fmt(row.idleMinutes || 0)}</td>

                      <td>{fmt(row.taskMinutes || 0)}</td>

                      <td>
                        <span
                          className={
                            row.shortageMinutes > 0
                              ? "shortageTime"
                              : "zeroTime"
                          }
                        >
                          {fmt(row.shortageMinutes || 0)}
                        </span>
                      </td>

                      <td>
                        <span
                          className={
                            row.overtimeMinutes > 0
                              ? "overtimeTime"
                              : "zeroTime"
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
        )}
      </div>

      {selectedAttendance && (
        <div
          className="attendanceDetailsBackdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedAttendance(null);
            }
          }}
        >
          <div
            className="attendanceDetailsModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-details-title"
          >
            <button
              type="button"
              className="attendanceDetailsClose"
              aria-label="Close attendance details"
              onClick={() => setSelectedAttendance(null)}
            >
              <X size={18} />
            </button>

            <div className="attendanceDetailsHeader">
              <div className="attendanceDetailsAvatar">
                {selectedAttendance.employee?.fullName
                  ?.charAt(0)
                  .toUpperCase() || "?"}
              </div>
              <div className="attendanceDetailsIdentity">
                <h3 id="attendance-details-title">
                  {selectedAttendance.employee?.fullName || "Employee"}
                </h3>
                <span>
                  {selectedAttendance.employee?.employeeId || "—"}
                  {selectedAttendance.employee?.department?.name
                    ? ` • ${selectedAttendance.employee.department.name}`
                    : ""}
                </span>
              </div>
              <div className="attendanceDetailsStatus">
                <span
                  className={`attendanceStatusBadge ${getStatusClass(
                    selectedAttendance.status,
                  )}`}
                >
                  {getStatusLabel(selectedAttendance.status)}
                </span>
              </div>
            </div>

            <div className="attendanceDetailsBody">
              <div className="attendanceDetailsSectionTitle">
                <span>Attendance Overview</span>
                <span>{formatDate(selectedAttendance.date)}</span>
              </div>

              <div className="attendanceDetailsGrid">
                <div className="attendanceDetailsItem">
                  <strong>Date</strong>
                  <p>{formatDate(selectedAttendance.date)}</p>
                </div>
                <div className="attendanceDetailsItem">
                  <strong>Department</strong>
                  <p>{selectedAttendance.employee?.department?.name || "—"}</p>
                </div>
                <div className="attendanceDetailsItem">
                  <strong>Work Mode</strong>
                  <p>
                    <span
                      className={`workModeBadge ${selectedAttendance.workMode.toLowerCase()}`}
                    >
                      {selectedAttendance.workMode === "WFO"
                        ? "Work From Office"
                        : "Work From Home"}
                    </span>
                  </p>
                </div>
                <div className="attendanceDetailsItem">
                  <strong>Scheduled Time</strong>
                  <p>
                    {formatTime(selectedAttendance.scheduledStart)} -{" "}
                    {formatTime(selectedAttendance.scheduledEnd)}
                  </p>
                </div>
                <div className="attendanceDetailsItem">
                  <strong>Login Time</strong>
                  <p>{formatTime(selectedAttendance.loginTime)}</p>
                </div>
                <div className="attendanceDetailsItem">
                  <strong>Logout Time</strong>
                  <p>{formatTime(selectedAttendance.logoutTime)}</p>
                </div>
              </div>

              <div className="attendanceDetailsSectionTitle attendanceDetailsTimeTitle">
                <span>Time Summary</span>
              </div>

              <div className="attendanceDetailsMetrics">
                <div className="attendanceMetric logged">
                  <span>Logged In</span>
                  <strong>
                    {fmt(selectedAttendance.loggedInMinutes || 0)}
                  </strong>
                </div>
                <div className="attendanceMetric active">
                  <span>Active Time</span>
                  <strong>{fmt(selectedAttendance.activeMinutes || 0)}</strong>
                </div>
                <div className="attendanceMetric break">
                  <span>Break Time</span>
                  <strong>{fmt(selectedAttendance.breakMinutes || 0)}</strong>
                </div>
                <div className="attendanceMetric idle">
                  <span>Idle Time</span>
                  <strong>{fmt(selectedAttendance.idleMinutes || 0)}</strong>
                </div>
                <div className="attendanceMetric task">
                  <span>Task Time</span>
                  <strong>{fmt(selectedAttendance.taskMinutes || 0)}</strong>
                </div>
                <div className="attendanceMetric required">
                  <span>Required Time</span>
                  <strong>
                    {fmt(selectedAttendance.requiredMinutes || 0)}
                  </strong>
                </div>
                <div className="attendanceMetric shortage">
                  <span>Shortage</span>
                  <strong>
                    {fmt(selectedAttendance.shortageMinutes || 0)}
                  </strong>
                </div>
                <div className="attendanceMetric overtime">
                  <span>Overtime</span>
                  <strong>
                    {fmt(selectedAttendance.overtimeMinutes || 0)}
                  </strong>
                </div>
              </div>
            </div>

            <div className="attendanceDetailsFooter">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setSelectedAttendance(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
