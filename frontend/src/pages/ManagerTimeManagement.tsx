import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  CheckCircle2,
  CircleStop,
  Coffee,
  Clock3,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Search,
  TimerReset,
  Users,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { get, post } from "../api/client";
import { fmt } from "../utils/time";
import type { Attendance } from "../types";
import "./manager-time-management.css";

type BreakType = {
  id: string;
  name: string;
  description?: string | null;
  timeLimitMinutes: number;
  enabled?: boolean;
};

function list<T>(value: any): T[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isToday(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return key === todayKey();
}

function time(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function label(value?: string | null) {
  return value
    ? value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())
    : "—";
}

function isPresent(row: Attendance) {
  return ["PRESENT", "LATE", "PRESENT_WITH_INSUFFICIENT_HOURS"].includes(
    String(row.status || "").toUpperCase(),
  );
}

export default function ManagerTimeManagement() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [workMode, setWorkMode] = useState("ALL");
  const [now, setNow] = useState(Date.now());
  const [selectedBreakTypeId, setSelectedBreakTypeId] = useState("");
  const [breakActionLoading, setBreakActionLoading] = useState(false);
  const [showEndBreakConfirm, setShowEndBreakConfirm] = useState(false);
  const [breakMessage, setBreakMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const attendanceQuery = useQuery({
    queryKey: ["manager-time-management", "attendance"],
    queryFn: () => get<Attendance[]>("/attendance/company"),
    refetchInterval: 30000,
  });
  const breakTypesQuery = useQuery({
    queryKey: ["manager-time-management", "break-types"],
    queryFn: () => get<BreakType[]>("/break-types"),
    refetchInterval: 60000,
  });
  const myAttendanceQuery = useQuery({
    queryKey: ["manager-dashboard", "personal-attendance"],
    queryFn: () => get<any>("/attendance/today"),
    refetchInterval: 15000,
  });
  const breaksQuery = useQuery({
    queryKey: ["manager-dashboard", "personal-breaks"],
    queryFn: () => get<any>("/breaks/today"),
    refetchInterval: 10000,
  });
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => get<any>("/settings"),
    refetchInterval: 30000,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const todayRows = useMemo(
    () => list<Attendance>(attendanceQuery.data).filter((row) => isToday(row.date || row.loginTime)),
    [attendanceQuery.data],
  );
  const employees = useMemo(() => {
    const query = search.trim().toLowerCase();
    return todayRows.filter((row) => {
      const employee = row.employee;
      const matchesSearch = !query || [employee?.fullName, employee?.employeeId, employee?.department?.name]
        .some((value) => value?.toLowerCase().includes(query));
      const matchesMode = workMode === "ALL" || row.workMode === workMode;
      return matchesSearch && matchesMode;
    });
  }, [todayRows, search, workMode]);
  const breakTypes = useMemo(() => list<BreakType>(breakTypesQuery.data), [breakTypesQuery.data]);
  const enabledBreakTypes = useMemo(() => breakTypes.filter((item) => item.enabled !== false), [breakTypes]);
  useEffect(() => {
    setSelectedBreakTypeId((current) =>
      enabledBreakTypes.some((item) => item.id === current)
        ? current
        : enabledBreakTypes[0]?.id || "",
    );
  }, [enabledBreakTypes]);
  const myAttendance = myAttendanceQuery.data;
  const myBreakRows = list<any>(breaksQuery.data?.rows);
  const explicitActiveBreak = breaksQuery.data?.activeBreak;
  const activeBreak = myBreakRows.find((row) => row.startedAt && !row.endedAt && !row.endTime && !row.endedAtTime)
    || (explicitActiveBreak?.startedAt && !explicitActiveBreak.endedAt && !explicitActiveBreak.endTime && !explicitActiveBreak.endedAtTime ? explicitActiveBreak : null);
  const isCheckedIn = Boolean(myAttendance?.loginTime && !myAttendance?.logoutTime);
  const isOnBreak = Boolean(isCheckedIn && activeBreak);
  const breakElapsedSeconds = activeBreak?.startedAt
    ? Math.max(0, Math.floor((now - new Date(activeBreak.startedAt).getTime()) / 1000))
    : 0;
  const breakLimitMinutes = Math.max(1, Number(activeBreak?.breakType?.timeLimitMinutes) || Number(settingsQuery.data?.breakLimitMinutes) || 60);
  const breakRemainingSeconds = Math.max(0, breakLimitMinutes * 60 - breakElapsedSeconds);
  const formatTimer = (seconds: number) => {
    const value = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const secs = value % 60;
    return hours ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };
  const breakProgress = activeBreak ? Math.min(100, Math.round((breakElapsedSeconds / (breakLimitMinutes * 60)) * 100)) : 0;

  async function manageBreak(action: "start" | "end") {
    setBreakActionLoading(true);
    setBreakMessage(null);
    try {
      await post(`/breaks/${action}`, action === "start" ? { breakTypeId: selectedBreakTypeId } : undefined);
      await Promise.all([
        breaksQuery.refetch(),
        myAttendanceQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ["manager-dashboard", "personal-attendance"] }),
        queryClient.invalidateQueries({ queryKey: ["manager-dashboard", "personal-breaks"] }),
        queryClient.invalidateQueries({ queryKey: ["manager-dashboard", "attendance"] }),
        queryClient.invalidateQueries({ queryKey: ["manager-team-attendance"] }),
      ]);
      setBreakMessage({ type: "success", text: action === "start" ? "Break started. Your break timer is now running." : "Break ended. You are back on the clock." });
      if (action === "start") setSelectedBreakTypeId("");
      setShowEndBreakConfirm(false);
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || `Unable to ${action} break.`;
      setBreakMessage({ type: "error", text: Array.isArray(message) ? message.join(", ") : message });
    } finally {
      setBreakActionLoading(false);
    }
  }
  const totals = useMemo(() => ({
    employees: todayRows.length,
    present: todayRows.filter(isPresent).length,
    active: todayRows.reduce((sum, row) => sum + Number(row.activeMinutes || 0), 0),
    breaks: todayRows.reduce((sum, row) => sum + Number(row.breakMinutes || 0), 0),
    idle: todayRows.reduce((sum, row) => sum + Number(row.idleMinutes || 0), 0),
  }), [todayRows]);
  const chartRows = [...employees]
    .sort((left, right) => Number(right.activeMinutes || 0) - Number(left.activeMinutes || 0))
    .slice(0, 12)
    .map((row) => ({
    name: row.employee?.fullName || row.employee?.employeeId || "Employee",
    Active: Number(row.activeMinutes || 0),
    Break: Number(row.breakMinutes || 0),
    Idle: Number(row.idleMinutes || 0),
    }));
  const isLoading = attendanceQuery.isLoading || breakTypesQuery.isLoading || myAttendanceQuery.isLoading || breaksQuery.isLoading;
  const isError = attendanceQuery.isError || breakTypesQuery.isError;

  return (
    <div className="managerTimePage">
      <header className="managerTimeHeader">
        <div>
          <span className="managerTimeEyebrow"><TimerReset size={15} /> TEAM OPERATIONS</span>
          <h1>Time Management</h1>
          <p>Review your team’s work hours, attendance, and break policies for today.</p>
        </div>
        <button
          type="button"
          className="managerTimeRefresh"
          onClick={() => Promise.all([attendanceQuery.refetch(), breakTypesQuery.refetch(), myAttendanceQuery.refetch(), breaksQuery.refetch(), settingsQuery.refetch()])}
          disabled={attendanceQuery.isFetching || breakTypesQuery.isFetching || breaksQuery.isFetching}
        >
          <RefreshCw size={16} className={attendanceQuery.isFetching || breakTypesQuery.isFetching ? "managerTimeSpin" : ""} />
          Refresh
        </button>
      </header>

      {isError && <div className="managerTimeError">Unable to load team time information. Refresh to try again.</div>}

      {isLoading ? (
        <div className="managerTimeLoading"><RefreshCw className="managerTimeSpin" size={20} /> Loading team time data…</div>
      ) : (
        <>
          <section className="managerTimeMetrics" aria-label="Team time summary">
            <article><span className="managerTimeMetricIcon blue"><Users size={18} /></span><div><small>Employees tracked</small><strong>{totals.employees}</strong><span>{totals.present} present today</span></div></article>
            <article><span className="managerTimeMetricIcon green"><Activity size={18} /></span><div><small>Active work</small><strong>{fmt(totals.active)}</strong><span>Team total today</span></div></article>
            <article><span className="managerTimeMetricIcon amber"><Coffee size={18} /></span><div><small>Break time</small><strong>{fmt(totals.breaks)}</strong><span>Team total today</span></div></article>
            <article><span className="managerTimeMetricIcon slate"><Clock3 size={18} /></span><div><small>Idle time</small><strong>{fmt(totals.idle)}</strong><span>Detected today</span></div></article>
          </section>

          <section className="managerTimePanel managerBreakControl">
            <div className="managerTimePanelHeader">
              <div><h2>My break control</h2><p>Choose a break type, start your break, and end it here when you’re ready to resume.</p></div>
              <span className={`managerTimeStatus ${isOnBreak ? "breakActive" : isCheckedIn ? "present" : "other"}`}>
                {isOnBreak ? "On break" : isCheckedIn ? "Working" : myAttendance?.logoutTime ? "Checked out" : "Not checked in"}
              </span>
            </div>

            {breakMessage && (
              <div className={`managerBreakMessage ${breakMessage.type}`}>
                {breakMessage.type === "success" ? <CheckCircle2 size={17} /> : <CircleStop size={17} />}
                <span>{breakMessage.text}</span>
                <button type="button" onClick={() => setBreakMessage(null)} aria-label="Dismiss message"><X size={16} /></button>
              </div>
            )}

            {isOnBreak ? (
              <div className="managerBreakActiveBox">
                <div className="managerBreakActiveTop">
                  <div className="managerBreakTypeBadge"><Coffee size={17} /><span><small>Current break</small><strong>{activeBreak?.breakType?.name || "Break"}</strong></span></div>
                  <div className="managerBreakElapsed"><small>Time elapsed</small><strong>{formatTimer(breakElapsedSeconds)}</strong></div>
                </div>
                <div className={`managerBreakCountdown ${breakRemainingSeconds === 0 ? "limit" : ""}`}>
                  <div><span>Time until configured limit</span><strong>{formatTimer(breakRemainingSeconds)}</strong></div>
                  <div className="managerBreakProgress"><span style={{ width: `${breakProgress}%` }} /></div>
                  <small>{breakRemainingSeconds === 0 ? "Configured limit reached. End your break when you’re ready." : `Configured limit: ${breakLimitMinutes} minutes · Started ${time(activeBreak?.startedAt)}`}</small>
                </div>
                <button type="button" className="managerBreakAction end" disabled={breakActionLoading} onClick={() => setShowEndBreakConfirm(true)}>
                  <PlayCircle size={17} /> End Break & Resume Work
                </button>
              </div>
            ) : (
              <div className="managerBreakStartBox">
                <div className="managerBreakSelectWrap">
                  <label htmlFor="managerBreakType">Break type</label>
                  <select id="managerBreakType" value={selectedBreakTypeId} onChange={(event) => setSelectedBreakTypeId(event.target.value)} disabled={!isCheckedIn || breakActionLoading}>
                    <option value="">Choose a break type</option>
                    {enabledBreakTypes.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.timeLimitMinutes} min</option>)}
                  </select>
                  {selectedBreakTypeId && (() => {
                    const item = enabledBreakTypes.find((type) => type.id === selectedBreakTypeId);
                    return item ? <small>{item.description || "Break allowance"} · Limit {item.timeLimitMinutes} minutes</small> : null;
                  })()}
                  {!isCheckedIn && <small>Check in from the Manager Dashboard before starting a break.</small>}
                  {isCheckedIn && !enabledBreakTypes.length && <small>No enabled break types are configured. Contact an administrator.</small>}
                </div>
                <button type="button" className="managerBreakAction start" disabled={!isCheckedIn || !selectedBreakTypeId || breakActionLoading} onClick={() => manageBreak("start")}>
                  {breakActionLoading ? <RefreshCw size={17} className="managerTimeSpin" /> : <PauseCircle size={17} />}
                  {breakActionLoading ? "Starting break…" : "Start Break"}
                </button>
              </div>
            )}
          </section>

          <section className="managerTimePanel">
            <div className="managerTimePanelHeader">
              <div><h2>Team work hours</h2><p>Compare active work, break, and idle time across your team.</p></div>
              <Activity size={18} />
            </div>
            {chartRows.length ? (
              <div className="managerTimeChart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartRows} margin={{ top: 8, right: 12, left: 0, bottom: 36 }} barGap={4}>
                    <CartesianGrid stroke="#edf1f6" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 10 }} angle={-25} textAnchor="end" interval={0} height={52} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(value) => `${Math.floor(value / 60)}h`} />
                    <Tooltip formatter={(value) => fmt(Number(value))} />
                    <Legend />
                    <Bar dataKey="Active" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Break" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Idle" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <div className="managerTimeEmpty">No team attendance recorded today.</div>}
          </section>

          <section className="managerTimePanel">
            <div className="managerTimePanelHeader managerTimeEmployeeHeader">
              <div><h2>Employee time details</h2><p>Today’s attendance, hours, and work status for each team member.</p></div>
              <div className="managerTimeFilters">
                <label className="managerTimeSearch"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee" /></label>
                <select aria-label="Filter by work mode" value={workMode} onChange={(event) => setWorkMode(event.target.value)}>
                  <option value="ALL">All work modes</option><option value="WFO">Office</option><option value="WFH">Remote</option>
                </select>
              </div>
            </div>
            {employees.length ? (
              <div className="managerTimeTableWrap">
                <table className="managerTimeTable">
                  <thead><tr><th>Employee</th><th>Employee ID</th><th>Department</th><th>Mode</th><th>Status</th><th>Login</th><th>Logout</th><th>Active</th><th>Break</th><th>Idle</th></tr></thead>
                  <tbody>{employees.map((row, index) => (
                    <tr key={row.id || `${row.employee?.employeeId}-${index}`}>
                      <td>{row.employee?.fullName || "—"}</td><td>{row.employee?.employeeId || "—"}</td><td>{row.employee?.department?.name || "Unassigned"}</td><td>{label(row.workMode)}</td><td><span className={`managerTimeStatus ${isPresent(row) ? "present" : "other"}`}>{label(row.status)}</span></td><td>{time(row.loginTime)}</td><td>{time(row.logoutTime)}</td><td>{fmt(Number(row.activeMinutes || 0))}</td><td>{fmt(Number(row.breakMinutes || 0))}</td><td>{fmt(Number(row.idleMinutes || 0))}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <div className="managerTimeEmpty">No employees match this view.</div>}
          </section>

        </>
      )}
      {showEndBreakConfirm && (
        <div className="managerBreakConfirmBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowEndBreakConfirm(false); }}>
          <section className="managerBreakConfirm" role="dialog" aria-modal="true" aria-labelledby="manager-end-break-title">
            <span className="managerBreakConfirmIcon"><Coffee size={22} /></span>
            <h2 id="manager-end-break-title">End your break?</h2>
            <p>Your break has been running for <strong>{formatTimer(breakElapsedSeconds)}</strong>. End it now to resume tracking your active work time.</p>
            <div className="managerBreakConfirmActions">
              <button type="button" className="managerBreakAction cancel" onClick={() => setShowEndBreakConfirm(false)} disabled={breakActionLoading}>Keep Break</button>
              <button type="button" className="managerBreakAction end" onClick={() => manageBreak("end")} disabled={breakActionLoading}>
                {breakActionLoading ? <RefreshCw size={16} className="managerTimeSpin" /> : <PlayCircle size={16} />}
                {breakActionLoading ? "Ending…" : "End Break"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
