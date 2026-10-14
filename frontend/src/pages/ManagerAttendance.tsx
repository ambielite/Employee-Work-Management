import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Coffee,
  Download,
  Filter,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
  TimerOff,
  UserRound,
  Users,
  X,
} from "lucide-react";

import { get } from "../api/client";
import { fmt } from "../utils/time";
import "./manager-attendance.css";

type AttendanceStatus =
  | "PRESENT"
  | "LATE"
  | "ABSENT"
  | "ON_LEAVE"
  | "HOLIDAY"
  | "WEEKLY_OFF"
  | "INCOMPLETE"
  | "EARLY_LOGOUT"
  | "PRESENT_WITH_INSUFFICIENT_HOURS"
  | string;

type WorkMode = "WFO" | "WFH";

type AttendanceEmployee = {
  id?: string;
  employeeId?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  designation?: string;
  department?: { id?: string; name?: string } | null;
};

type Attendance = {
  id: string;
  date: string;
  workMode: WorkMode;
  status: AttendanceStatus;
  scheduledStart?: string;
  scheduledEnd?: string;
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
  employee?: AttendanceEmployee | null;
};

const PAGE_SIZE = 10;

type ViewMode = "MY" | "TEAM";

function list<T>(value: any): T[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function statusLabel(status?: string) {
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
      return status || "—";
  }
}

function statusClass(status?: string) {
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

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return text.includes(",") || text.includes('"') || text.includes("\n")
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

function uniqueDepartments(rows: Attendance[]) {
  return Array.from(
    new Set(
      rows
        .map((row) => row.employee?.department?.name)
        .filter(Boolean) as string[],
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function ToggleButton({
  active,
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  icon: typeof UserRound;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
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

export default function ManagerAttendance() {
  const [viewMode, setViewMode] = useState<ViewMode>("MY");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [workModeFilter, setWorkModeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [selectedAttendance, setSelectedAttendance] =
    useState<Attendance | null>(null);

  const meQ = useQuery({
    queryKey: ["manager-attendance", "me"],
    queryFn: () => get("/auth/me"),
    staleTime: 60000,
  });

  const myAttendanceQ = useQuery({
    queryKey: ["manager-attendance", "my-today"],
    queryFn: () => get("/attendance/today"),
    refetchInterval: 15000,
  });

  const myHistoryQ = useQuery({
    queryKey: ["manager-attendance", "my-history"],
    queryFn: () => get("/attendance/history"),
    refetchInterval: 60000,
  });

  const teamQ = useQuery<Attendance[]>({
    queryKey: ["manager-team-attendance"],
    queryFn: () => get<Attendance[]>("/attendance/company"),
    refetchInterval: 30000,
    enabled: viewMode === "TEAM",
  });

  const myToday = myAttendanceQ.data as Attendance | undefined;
  const myHistory = list<Attendance>(myHistoryQ.data);
  const teamAttendance = teamQ.data || [];

  const teamDepartments = useMemo(
    () => uniqueDepartments(teamAttendance),
    [teamAttendance],
  );

  const filteredTeam = useMemo(() => {
    const searchText = search.trim().toLowerCase();
    return teamAttendance.filter((row) => {
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
    teamAttendance,
    search,
    dateFilter,
    departmentFilter,
    workModeFilter,
    statusFilter,
  ]);

  const myRows = useMemo(() => {
    const rows = [...myHistory];
    if (myToday?.id && !rows.some((row) => row.id === myToday.id))
      rows.unshift(myToday);
    return rows;
  }, [myHistory, myToday]);

  const summary = useMemo(() => {
    const rows = viewMode === "TEAM" ? filteredTeam : myRows;
    return {
      total: rows.length,
      present: rows.filter((row) =>
        [
          "PRESENT",
          "LATE",
          "EARLY_LOGOUT",
          "PRESENT_WITH_INSUFFICIENT_HOURS",
        ].includes(row.status),
      ).length,
      late: rows.filter((row) => row.status === "LATE").length,
      leave: rows.filter((row) => row.status === "ON_LEAVE").length,
      wfh: rows.filter((row) => row.workMode === "WFH").length,
      insufficient: rows.filter(
        (row) => row.status === "PRESENT_WITH_INSUFFICIENT_HOURS",
      ).length,
      activeMinutes: rows.reduce(
        (sum, row) => sum + (Number(row.activeMinutes) || 0),
        0,
      ),
      breakMinutes: rows.reduce(
        (sum, row) => sum + (Number(row.breakMinutes) || 0),
        0,
      ),
    };
  }, [viewMode, filteredTeam, myRows]);

  const rows = viewMode === "TEAM" ? filteredTeam : myRows;
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, currentPage]);

  const hasFilters =
    Boolean(search) ||
    Boolean(dateFilter) ||
    departmentFilter !== "ALL" ||
    workModeFilter !== "ALL" ||
    statusFilter !== "ALL";

  function clearFilters() {
    setSearch("");
    setDateFilter("");
    setDepartmentFilter("ALL");
    setWorkModeFilter("ALL");
    setStatusFilter("ALL");
    setPage(1);
  }

  async function refresh() {
    if (viewMode === "TEAM") await teamQ.refetch();
    else
      await Promise.all([
        myAttendanceQ.refetch(),
        myHistoryQ.refetch(),
        meQ.refetch(),
      ]);
  }

  function changeView(mode: ViewMode) {
    setViewMode(mode);
    setPage(1);
    setSearch("");
    setDateFilter("");
    setDepartmentFilter("ALL");
    setWorkModeFilter("ALL");
    setStatusFilter("ALL");
    setSelectedAttendance(null);
  }

  function exportCsv() {
    if (!rows.length) return;
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
    const data = rows.map((row) => [
      row.employee?.employeeId || "",
      row.employee?.fullName || "",
      row.employee?.department?.name || "",
      formatDate(row.date),
      row.workMode,
      statusLabel(row.status),
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
    const csv = [headers, ...data]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${viewMode === "MY" ? "my" : "team"}-attendance-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const loading =
    viewMode === "TEAM"
      ? teamQ.isLoading
      : myAttendanceQ.isLoading || myHistoryQ.isLoading;
  const fetching =
    viewMode === "TEAM"
      ? teamQ.isFetching
      : myAttendanceQ.isFetching || myHistoryQ.isFetching;
  const error =
    viewMode === "TEAM"
      ? teamQ.isError
      : myAttendanceQ.isError || myHistoryQ.isError;

  return (
    <div className="managerAttendancePage">
      <div
        className="managerAttendanceHeader"
        style={{ alignItems: "flex-start" }}
      >
        <div>
          <h1>{viewMode === "MY" ? "My Attendance" : "Team Attendance"}</h1>
          <p>
            {viewMode === "MY"
              ? "View your attendance, working hours and daily history."
              : "Monitor attendance, working time, breaks and productivity of your team."}
          </p>
        </div>
        <div className="managerAttendanceHeaderActions">
          <button
            type="button"
            className="managerAttendanceButton secondary"
            onClick={refresh}
            disabled={fetching}
          >
            <RefreshCw
              size={16}
              className={fetching ? "managerAttendanceSpin" : ""}
            />{" "}
            Refresh
          </button>
          <button
            type="button"
            className="managerAttendanceButton primary"
            onClick={exportCsv}
            disabled={!rows.length}
          >
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      <section className="managerViewSwitcher" aria-label="Attendance view">
        <ToggleButton
          active={viewMode === "MY"}
          icon={UserRound}
          title="My Attendance"
          subtitle=""
          onClick={() => changeView("MY")}
        />
        <ToggleButton
          active={viewMode === "TEAM"}
          icon={Users}
          title="Team Attendance"
          subtitle=""
          onClick={() => changeView("TEAM")}
        />
      </section>

      <section className="managerAttendanceSummary">
        {[
          ["total", Users, "Total Records", summary.total],
          ["present", CheckCircle2, "Present", summary.present],
          ["late", Clock3, "Late", summary.late],
          ["wfh", BriefcaseBusiness, "WFH", summary.wfh],
          ["leave", CalendarDays, "On Leave", summary.leave],
          ["insufficient", Activity, "Insufficient", summary.insufficient],
          ["active", Clock3, "Active Time", fmt(summary.activeMinutes)],
          ["break", Coffee, "Break Time", fmt(summary.breakMinutes)],
        ].map(([variant, Icon, label, value]: any) => (
          <div
            key={String(label)}
            className={`managerAttendanceSummaryCard ${variant}`}
          >
            <div className="managerAttendanceSummaryIcon">
              <Icon size={19} />
            </div>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          </div>
        ))}
      </section>

      {viewMode === "TEAM" && (
        <section className="managerAttendanceFilterCard">
          <div className="managerAttendanceFilterHeader">
            <div>
              <Filter size={17} />
              <strong>Attendance Filters</strong>
            </div>
            <button
              type="button"
              className="managerAttendanceClear"
              onClick={clearFilters}
              disabled={!hasFilters}
            >
              Clear Filters
            </button>
          </div>
          <div className="managerAttendanceFilters">
            <label className="managerAttendanceSearch">
              <Search size={17} />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search employee, ID or department..."
              />
            </label>
            <label className="managerAttendanceDate">
              <CalendarDays size={17} />
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <select
              value={departmentFilter}
              onChange={(e) => {
                setDepartmentFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">All Departments</option>
              {teamDepartments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              value={workModeFilter}
              onChange={(e) => {
                setWorkModeFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">All Work Modes</option>
              <option value="WFO">Work From Office</option>
              <option value="WFH">Work From Home</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">All Status</option>
              <option value="PRESENT">Present</option>
              <option value="LATE">Late</option>
              <option value="ON_LEAVE">On Leave</option>
              <option value="INCOMPLETE">Incomplete</option>
              <option value="EARLY_LOGOUT">Early Logout</option>
              <option value="PRESENT_WITH_INSUFFICIENT_HOURS">
                Insufficient Hours
              </option>
              <option value="ABSENT">Absent</option>
              <option value="HOLIDAY">Holiday</option>
              <option value="WEEKLY_OFF">Weekly Off</option>
            </select>
          </div>
        </section>
      )}

      {viewMode === "MY" && myToday && (
        <section
          className="managerAttendanceTableCard"
          style={{ marginBottom: 18 }}
        >
          <div className="managerAttendanceTableHeader">
            <div>
              <h2>Today's Workday</h2>
              <p>Live attendance values from the server.</p>
            </div>
            <span
              className={`managerAttendanceStatus ${statusClass(myToday.status)}`}
            >
              {statusLabel(myToday.status)}
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6,minmax(120px,1fr))",
              gap: 12,
              padding: "18px 18px 18px",
            }}
          >
            {[
              ["Work Mode", myToday.workMode],
              ["Login", formatTime(myToday.loginTime)],
              ["Logout", formatTime(myToday.logoutTime)],
              ["Active", fmt(myToday.activeMinutes || 0)],
              ["Break", fmt(myToday.breakMinutes || 0)],
              ["Shortage", fmt(myToday.shortageMinutes || 0)],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: 12,
                  background: "#f8fafc",
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "#64748b",
                    marginBottom: 4,
                  }}
                >
                  {label}
                </span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="managerAttendanceTableCard">
        <div className="managerAttendanceTableHeader">
          <div>
            <h2>
              {viewMode === "MY"
                ? "My Attendance History"
                : "Team Attendance Records"}
            </h2>
            <p>Showing {rows.length} records</p>
          </div>
          <div className="managerAttendanceServerBadge">
            <TimerOff size={15} /> Server-calculated attendance
          </div>
        </div>
        {loading ? (
          <div className="managerAttendanceState">
            <RefreshCw size={21} className="managerAttendanceSpin" />
            <span>Loading attendance...</span>
          </div>
        ) : error ? (
          <div className="managerAttendanceState error">
            <Activity size={22} />
            <strong>Unable to load attendance.</strong>
            <button type="button" onClick={refresh}>
              Try Again
            </button>
          </div>
        ) : (
          <>
            <div className="managerAttendanceTableWrap">
              <table className="managerAttendanceTable">
                <thead>
                  <tr>
                    <th>{viewMode === "MY" ? "Date" : "Employee"}</th>
                    <th>{viewMode === "MY" ? "Mode" : "Date"}</th>
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
                  {visibleRows.length ? (
                    visibleRows.map((row) => (
                      <tr
                        key={row.id}
                        className="managerAttendanceRow"
                        onClick={() => setSelectedAttendance(row)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedAttendance(row);
                          }
                        }}
                      >
                        <td>
                          {viewMode === "MY" ? (
                            formatDate(row.date)
                          ) : (
                            <div className="managerAttendanceEmployee">
                              <div className="managerAttendanceAvatar">
                                {row.employee?.fullName
                                  ?.charAt(0)
                                  .toUpperCase() || "E"}
                              </div>
                              <div>
                                <strong>{row.employee?.fullName || "—"}</strong>
                                <span>{row.employee?.employeeId || "—"}</span>
                                <small>
                                  {row.employee?.designation || "—"}
                                </small>
                              </div>
                            </div>
                          )}
                        </td>
                        <td>
                          {viewMode === "MY" ? (
                            <span
                              className={`managerAttendanceMode ${row.workMode.toLowerCase()}`}
                            >
                              {row.workMode}
                            </span>
                          ) : (
                            formatDate(row.date)
                          )}
                        </td>
                        <td>
                          <span
                            className={`managerAttendanceStatus ${statusClass(row.status)}`}
                          >
                            {statusLabel(row.status)}
                          </span>
                        </td>
                        <td>
                          <span className="managerAttendanceTime">
                            <LogIn size={14} />
                            {formatTime(row.loginTime)}
                          </span>
                        </td>
                        <td>
                          <span className="managerAttendanceTime">
                            <LogOut size={14} />
                            {formatTime(row.logoutTime)}
                          </span>
                        </td>
                        <td>
                          <strong>{fmt(row.loggedInMinutes || 0)}</strong>
                        </td>
                        <td>{fmt(row.activeMinutes || 0)}</td>
                        <td>{fmt(row.breakMinutes || 0)}</td>
                        <td>{fmt(row.idleMinutes || 0)}</td>
                        <td>{fmt(row.taskMinutes || 0)}</td>
                        <td>
                          <span
                            className={
                              row.shortageMinutes > 0
                                ? "managerAttendanceShortage"
                                : "managerAttendanceZero"
                            }
                          >
                            {fmt(row.shortageMinutes || 0)}
                          </span>
                        </td>
                        <td>
                          <span
                            className={
                              row.overtimeMinutes > 0
                                ? "managerAttendanceOvertime"
                                : "managerAttendanceZero"
                            }
                          >
                            {fmt(row.overtimeMinutes || 0)}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={12} className="managerAttendanceEmpty">
                        <CalendarDays size={25} />
                        <strong>No attendance records found</strong>
                        <span>
                          Try changing the filters or clear the filters.
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="managerAttendancePagination">
              <span>
                Showing {rows.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0} to{" "}
                {Math.min(currentPage * PAGE_SIZE, rows.length)} of{" "}
                {rows.length}
              </span>
              <div>
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setPage((v) => Math.max(1, v - 1))}
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
                      type="button"
                      key={n}
                      className={n === currentPage ? "active" : ""}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </button>
                  ))}
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setPage((v) => Math.min(totalPages, v + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {selectedAttendance && (
        <div
          className="managerAttendanceModalOverlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedAttendance(null);
          }}
        >
          <div className="managerAttendanceModal">
            <div className="managerAttendanceModalHeader">
              <div>
                <span>Attendance Details</span>
                <h2>
                  {selectedAttendance.employee?.fullName ||
                    (viewMode === "MY" ? "My Attendance" : "Employee")}
                </h2>
                <p>
                  {selectedAttendance.employee?.employeeId || "My record"} ·{" "}
                  {formatDate(selectedAttendance.date)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAttendance(null)}
                aria-label="Close"
              >
                <X size={19} />
              </button>
            </div>
            <div className="managerAttendanceModalBody">
              <div className="managerAttendanceProfile">
                <div className="managerAttendanceModalAvatar">
                  {selectedAttendance.employee?.fullName
                    ?.charAt(0)
                    .toUpperCase() || "M"}
                </div>
                <div>
                  <strong>
                    {selectedAttendance.employee?.fullName || "My Attendance"}
                  </strong>
                  <span>
                    {selectedAttendance.employee?.designation ||
                      meQ.data?.employee?.designation ||
                      "Manager"}
                  </span>
                  <small>
                    {selectedAttendance.employee?.department?.name ||
                      meQ.data?.employee?.department?.name ||
                      "—"}
                  </small>
                </div>
                <span
                  className={`managerAttendanceStatus ${statusClass(selectedAttendance.status)}`}
                >
                  {statusLabel(selectedAttendance.status)}
                </span>
              </div>
              <div className="managerAttendanceDetailGrid">
                {[
                  "Work Mode",
                  "Date",
                  "Scheduled Start",
                  "Scheduled End",
                  "Login Time",
                  "Logout Time",
                  "Required Time",
                  "Logged-in Time",
                  "Active Time",
                  "Break Time",
                  "Idle Time",
                  "Task Time",
                  "Shortage",
                  "Overtime",
                ].map((label) => {
                  const values: Record<string, React.ReactNode> = {
                    "Work Mode": selectedAttendance.workMode,
                    Date: formatDate(selectedAttendance.date),
                    "Scheduled Start": selectedAttendance.scheduledStart || "—",
                    "Scheduled End": selectedAttendance.scheduledEnd || "—",
                    "Login Time": formatTime(selectedAttendance.loginTime),
                    "Logout Time": formatTime(selectedAttendance.logoutTime),
                    "Required Time": fmt(
                      selectedAttendance.requiredMinutes || 0,
                    ),
                    "Logged-in Time": fmt(
                      selectedAttendance.loggedInMinutes || 0,
                    ),
                    "Active Time": fmt(selectedAttendance.activeMinutes || 0),
                    "Break Time": fmt(selectedAttendance.breakMinutes || 0),
                    "Idle Time": fmt(selectedAttendance.idleMinutes || 0),
                    "Task Time": fmt(selectedAttendance.taskMinutes || 0),
                    Shortage: fmt(selectedAttendance.shortageMinutes || 0),
                    Overtime: fmt(selectedAttendance.overtimeMinutes || 0),
                  };
                  return (
                    <div key={label}>
                      <span>{label}</span>
                      <strong
                        className={
                          label === "Shortage" &&
                          selectedAttendance.shortageMinutes > 0
                            ? "managerAttendanceShortage"
                            : label === "Overtime" &&
                                selectedAttendance.overtimeMinutes > 0
                              ? "managerAttendanceOvertime"
                              : ""
                        }
                      >
                        {values[label]}
                      </strong>
                    </div>
                  );
                })}
              </div>
              <div className="managerAttendanceCalculationNote">
                <Activity size={17} />
                <span>
                  Attendance values are calculated by the server. This page only
                  displays the returned values.
                </span>
              </div>
            </div>
            <div className="managerAttendanceModalFooter">
              <button type="button" onClick={() => setSelectedAttendance(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
