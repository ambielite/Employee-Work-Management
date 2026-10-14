import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Coffee,
  Download,
  Filter,
  RefreshCw,
  Search,
  Timer,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { get } from "../api/client";
import { fmt } from "../utils/time";
import "./employee-attendance.css";

type Attendance = {
  id: string;
  date: string;
  workMode?: string;
  status?: string;
  loginTime?: string;
  logoutTime?: string;
  loggedInMinutes?: number;
  activeMinutes?: number;
  idleMinutes?: number;
  breakMinutes?: number;
  taskMinutes?: number;
  requiredMinutes?: number;
  shortageMinutes?: number;
  overtimeMinutes?: number;
};

const PAGE_SIZE = 10;

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dateKey(value?: string) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function statusLabel(status?: string) {
  return status ? status.replaceAll("_", " ") : "—";
}

function statusClass(status?: string) {
  switch (status) {
    case "PRESENT":
      return "present";
    case "LATE":
      return "late";
    case "ON_LEAVE":
      return "leave";
    case "HOLIDAY":
      return "holiday";
    case "WEEKLY_OFF":
      return "weekly";
    case "EARLY_LOGOUT":
    case "PRESENT_WITH_INSUFFICIENT_HOURS":
      return "warning";
    case "INCOMPLETE":
      return "incomplete";
    case "ABSENT":
      return "absent";
    default:
      return "default";
  }
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function normalizeAttendance(data: any): Attendance[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export default function EmployeeAttendance() {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [workMode, setWorkMode] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["employee-attendance-history"],
    queryFn: () => get("/attendance/history"),
  });

  const attendance = useMemo(() => normalizeAttendance(data), [data]);

  const filteredAttendance = useMemo(() => {
    const query = search.trim().toLowerCase();

    return attendance.filter((row) => {
      const matchesSearch =
        !query ||
        row.workMode?.toLowerCase().includes(query) ||
        statusLabel(row.status).toLowerCase().includes(query);

      const matchesDate = !dateFilter || dateKey(row.date) === dateFilter;

      const matchesMode = workMode === "ALL" || row.workMode === workMode;

      const matchesStatus = status === "ALL" || row.status === status;

      return matchesSearch && matchesDate && matchesMode && matchesStatus;
    });
  }, [attendance, search, dateFilter, workMode, status]);

  const summary = useMemo(() => {
    const total = filteredAttendance.length;

    const present = filteredAttendance.filter(
      (row) =>
        row.status === "PRESENT" ||
        row.status === "LATE" ||
        row.status === "EARLY_LOGOUT" ||
        row.status === "PRESENT_WITH_INSUFFICIENT_HOURS",
    ).length;

    const late = filteredAttendance.filter(
      (row) => row.status === "LATE",
    ).length;

    const leave = filteredAttendance.filter(
      (row) => row.status === "ON_LEAVE",
    ).length;

    const active = filteredAttendance.reduce(
      (sum, row) => sum + (Number(row.activeMinutes) || 0),
      0,
    );

    const breaks = filteredAttendance.reduce(
      (sum, row) => sum + (Number(row.breakMinutes) || 0),
      0,
    );

    const idle = filteredAttendance.reduce(
      (sum, row) => sum + (Number(row.idleMinutes) || 0),
      0,
    );

    const overtime = filteredAttendance.reduce(
      (sum, row) => sum + (Number(row.overtimeMinutes) || 0),
      0,
    );

    return {
      total,
      present,
      late,
      leave,
      active,
      breaks,
      idle,
      overtime,
    };
  }, [filteredAttendance]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredAttendance.length / PAGE_SIZE),
  );

  const currentPage = Math.min(page, totalPages);

  const paginatedAttendance = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredAttendance.slice(start, start + PAGE_SIZE);
  }, [filteredAttendance, currentPage]);

  function updateFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setDateFilter("");
    setWorkMode("ALL");
    setStatus("ALL");
    setPage(1);
  }

  const hasFilters =
    Boolean(search) ||
    Boolean(dateFilter) ||
    workMode !== "ALL" ||
    status !== "ALL";

  function exportCsv() {
    if (!filteredAttendance.length) return;

    const headers = [
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
      "Required Time",
      "Shortage",
      "Overtime",
    ];

    const rows = filteredAttendance.map((row) => [
      formatDate(row.date),
      row.workMode || "",
      statusLabel(row.status),
      formatTime(row.loginTime),
      formatTime(row.logoutTime),
      fmt(row.loggedInMinutes || 0),
      fmt(row.activeMinutes || 0),
      fmt(row.breakMinutes || 0),
      fmt(row.idleMinutes || 0),
      fmt(row.taskMinutes || 0),
      fmt(row.requiredMinutes || 0),
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
    link.download = `my-attendance-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  return (
    <div className="employeeAttendancePage">
      <div className="employeeAttendanceHeader">
        <div>
          <h1>My Attendance</h1>
          <p>
            View your attendance history, working time, breaks and daily
            attendance status.
          </p>
        </div>

        <div className="employeeAttendanceActions">
          <button
            type="button"
            className="employeeAttendanceBtn secondary"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              size={16}
              className={isFetching ? "employeeAttendanceSpin" : ""}
            />
            Refresh
          </button>

          <button
            type="button"
            className="employeeAttendanceBtn primary"
            onClick={exportCsv}
            disabled={!filteredAttendance.length}
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      <section className="employeeAttendanceSummary">
        <div className="employeeAttendanceSummaryCard">
          <div className="employeeAttendanceSummaryIcon total">
            <CalendarDays size={19} />
          </div>
          <div>
            <span>Total Records</span>
            <strong>{summary.total}</strong>
          </div>
        </div>

        <div className="employeeAttendanceSummaryCard">
          <div className="employeeAttendanceSummaryIcon present">
            <CheckCircle2 size={19} />
          </div>
          <div>
            <span>Present Days</span>
            <strong>{summary.present}</strong>
          </div>
        </div>

        <div className="employeeAttendanceSummaryCard">
          <div className="employeeAttendanceSummaryIcon late">
            <Clock3 size={19} />
          </div>
          <div>
            <span>Late Days</span>
            <strong>{summary.late}</strong>
          </div>
        </div>

        <div className="employeeAttendanceSummaryCard">
          <div className="employeeAttendanceSummaryIcon leave">
            <CalendarDays size={19} />
          </div>
          <div>
            <span>Leave Days</span>
            <strong>{summary.leave}</strong>
          </div>
        </div>

        <div className="employeeAttendanceSummaryCard">
          <div className="employeeAttendanceSummaryIcon active">
            <Activity size={19} />
          </div>
          <div>
            <span>Total Active Time</span>
            <strong>{fmt(summary.active)}</strong>
          </div>
        </div>

        <div className="employeeAttendanceSummaryCard">
          <div className="employeeAttendanceSummaryIcon break">
            <Coffee size={19} />
          </div>
          <div>
            <span>Total Break Time</span>
            <strong>{fmt(summary.breaks)}</strong>
          </div>
        </div>

        <div className="employeeAttendanceSummaryCard">
          <div className="employeeAttendanceSummaryIcon idle">
            <Timer size={19} />
          </div>
          <div>
            <span>Total Idle Time</span>
            <strong>{fmt(summary.idle)}</strong>
          </div>
        </div>

        <div className="employeeAttendanceSummaryCard">
          <div className="employeeAttendanceSummaryIcon overtime">
            <TrendingUp size={19} />
          </div>
          <div>
            <span>Total Overtime</span>
            <strong>{fmt(summary.overtime)}</strong>
          </div>
        </div>
      </section>

      <section className="employeeAttendanceFilterCard">
        <div className="employeeAttendanceFilterHeader">
          <div className="employeeAttendanceFilterTitle">
            <Filter size={17} />
            <span>Attendance Filters</span>
          </div>

          <button
            type="button"
            className="employeeAttendanceClear"
            onClick={clearFilters}
            disabled={!hasFilters}
          >
            Clear Filters
          </button>
        </div>

        <div className="employeeAttendanceFilters">
          <label className="employeeAttendanceSearch">
            <Search size={17} />
            <input
              type="text"
              value={search}
              onChange={(event) => updateFilter(setSearch, event.target.value)}
              placeholder="Search work mode or status..."
            />
          </label>

          <label className="employeeAttendanceDate">
            <CalendarDays size={17} />
            <input
              type="date"
              value={dateFilter}
              onChange={(event) =>
                updateFilter(setDateFilter, event.target.value)
              }
            />
          </label>

          <select
            value={workMode}
            onChange={(event) => updateFilter(setWorkMode, event.target.value)}
          >
            <option value="ALL">All Work Modes</option>
            <option value="WFO">Work From Office</option>
            <option value="WFH">Work From Home</option>
          </select>

          <select
            value={status}
            onChange={(event) => updateFilter(setStatus, event.target.value)}
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
      </section>

      <section className="employeeAttendanceTableCard">
        <div className="employeeAttendanceTableHeader">
          <div>
            <h2>Attendance History</h2>
            <p>
              {filteredAttendance.length} record
              {filteredAttendance.length === 1 ? "" : "s"} found
            </p>
          </div>

          {filteredAttendance.length > 0 && (
            <span className="employeeAttendancePageInfo">
              Page {currentPage} of {totalPages}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="employeeAttendanceState">
            <RefreshCw className="employeeAttendanceSpin" size={21} />
            <span>Loading attendance history…</span>
          </div>
        ) : isError ? (
          <div className="employeeAttendanceState error">
            <XCircle size={21} />
            <span>Unable to load your attendance history.</span>
            <button type="button" onClick={() => refetch()}>
              Try Again
            </button>
          </div>
        ) : (
          <>
            <div className="employeeAttendanceTableWrap">
              <table className="employeeAttendanceTable">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Work Mode</th>
                    <th>Status</th>
                    <th>Login</th>
                    <th>Logout</th>
                    <th>Logged In</th>
                    <th>Active</th>
                    <th>Break</th>
                    <th>Idle</th>
                    <th>Shortage</th>
                    <th>Overtime</th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedAttendance.length ? (
                    paginatedAttendance.map((row) => (
                      <tr key={row.id}>
                        <td className="dateCell">{formatDate(row.date)}</td>

                        <td>
                          <span
                            className={`employeeModeBadge ${
                              row.workMode === "WFH" ? "wfh" : "wfo"
                            }`}
                          >
                            {row.workMode || "—"}
                          </span>
                        </td>

                        <td>
                          <span
                            className={`employeeAttendanceStatus ${statusClass(
                              row.status,
                            )}`}
                            title={statusLabel(row.status)}
                          >
                            {statusLabel(row.status)}
                          </span>
                        </td>

                        <td>{formatTime(row.loginTime)}</td>
                        <td>{formatTime(row.logoutTime)}</td>
                        <td>{fmt(row.loggedInMinutes || 0)}</td>
                        <td>{fmt(row.activeMinutes || 0)}</td>
                        <td>{fmt(row.breakMinutes || 0)}</td>
                        <td>{fmt(row.idleMinutes || 0)}</td>
                        <td>{fmt(row.shortageMinutes || 0)}</td>
                        <td>{fmt(row.overtimeMinutes || 0)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={11} className="employeeAttendanceNoResults">
                        <CheckCircle2 size={22} />
                        <strong>No attendance records found</strong>
                        <span>
                          Try changing your filters or clear the filters to view
                          your attendance history.
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="employeeAttendancePagination">
              <span>
                Showing{" "}
                {filteredAttendance.length
                  ? (currentPage - 1) * PAGE_SIZE + 1
                  : 0}{" "}
                to{" "}
                {Math.min(currentPage * PAGE_SIZE, filteredAttendance.length)}{" "}
                of {filteredAttendance.length}
              </span>

              <div>
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>

                {Array.from({ length: totalPages }, (_, index) => index + 1)
                  .slice(
                    Math.max(0, currentPage - 3),
                    Math.min(totalPages, currentPage + 2),
                  )
                  .map((pageNumber) => (
                    <button
                      type="button"
                      key={pageNumber}
                      className={pageNumber === currentPage ? "active" : ""}
                      onClick={() => setPage(pageNumber)}
                    >
                      {pageNumber}
                    </button>
                  ))}

                <button
                  type="button"
                  onClick={() =>
                    setPage((value) => Math.min(totalPages, value + 1))
                  }
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
