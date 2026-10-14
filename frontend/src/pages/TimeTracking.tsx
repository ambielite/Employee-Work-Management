import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  CircleStop,
  Clock3,
  Coffee,
  LogIn,
  LogOut,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  TimerReset,
  UserRound,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { get, post } from "../api/client";
import { fmt } from "../utils/time";
import "./time-tracking.css";

type AnyRecord = Record<string, any>;

function asArray(value: any): AnyRecord[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

function minutesBetween(start?: string | null, end?: string | null) {
  if (!start) return 0;
  const from = new Date(start).getTime();
  const to = end ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.floor((to - from) / 60000));
}

function timeLabel(value?: string | null) {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function eventLabel(type: string) {
  return type
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function TimeTracking() {
  const qc = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const [actionLoading, setActionLoading] = useState<
    "start" | "end" | "checkout" | null
  >(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [showEndBreakConfirm, setShowEndBreakConfirm] = useState(false);
  const [selectedBreakTypeId, setSelectedBreakTypeId] = useState("");

  const attendanceQuery = useQuery({
    queryKey: ["attendance"],
    queryFn: () => get("/attendance/today"),
    refetchInterval: 15000,
  });

  const breaksQuery = useQuery({
    queryKey: ["breaks"],
    queryFn: () => get("/breaks/today"),
    refetchInterval: 10000,
  });

  const breakTypesQuery = useQuery({
    queryKey: ["break-types"],
    queryFn: () => get("/break-types"),
    staleTime: 30_000,
  });

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => get("/settings"),
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const attendance = attendanceQuery.data as AnyRecord | undefined;
  const breakData = breaksQuery.data as AnyRecord | undefined;
  const breakTypes = asArray(breakTypesQuery.data).filter(
    (item) => item.enabled !== false,
  );

  // The API may return either an array or an object containing
  // breaks/sessions/activeBreak. Normalize all supported shapes here.
  const breaks = useMemo(() => {
    const list =
      asArray(breakData).length > 0
        ? asArray(breakData)
        : asArray(breakData?.breaks).length > 0
          ? asArray(breakData?.breaks)
          : asArray(breakData?.rows).length > 0
            ? asArray(breakData?.rows)
            : asArray(breakData?.sessions).length > 0
              ? asArray(breakData?.sessions)
              : [];

    const explicitActive =
      breakData?.activeBreak && typeof breakData.activeBreak === "object"
        ? [breakData.activeBreak]
        : [];

    const merged = [...list, ...explicitActive];
    const seen = new Set<string>();

    return merged.filter((item) => {
      const key = String(item.id || `${item.startedAt}-${item.endedAt}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [breakData]);

  const activeBreak = useMemo(() => {
    const explicit =
      breakData?.activeBreak && typeof breakData.activeBreak === "object"
        ? breakData.activeBreak
        : null;

    if (
      explicit &&
      !explicit.endedAt &&
      !explicit.endTime &&
      !explicit.endedAtTime
    ) {
      return explicit;
    }

    return (
      breaks.find(
        (item) =>
          item.startedAt && !item.endedAt && !item.endTime && !item.endedAtTime,
      ) || null
    );
  }, [breakData, breaks]);

  const breakLimitMinutes = Math.max(
    1,
    Number(settingsQuery.data?.breakLimitMinutes) || 60,
  );

  const breakElapsedSeconds = activeBreak?.startedAt
    ? Math.max(
        0,
        Math.floor((now - new Date(activeBreak.startedAt).getTime()) / 1000),
      )
    : 0;

  const activeBreakLimitMinutes = Math.max(
    1,
    Number(activeBreak?.breakType?.timeLimitMinutes) || breakLimitMinutes,
  );

  const breakRemainingSeconds = activeBreak
    ? Math.max(0, activeBreakLimitMinutes * 60 - breakElapsedSeconds)
    : 0;

  const formatCountdown = (seconds: number) => {
    const safe = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;

    return hours > 0
      ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const loggedIn = attendance?.loginTime
    ? attendance?.logoutTime
      ? Number(attendance.loggedInMinutes || 0)
      : minutesBetween(attendance.loginTime, null)
    : 0;

  const summaryBreakMinutes = Number(
    breakData?.totalMinutes ?? attendance?.breakMinutes ?? 0,
  );

  const sessionBreakMinutes = breaks.reduce((total, item) => {
    if (!item.startedAt) return total;
    return total + minutesBetween(item.startedAt, item.endedAt || null);
  }, 0);

  const breakMinutes = Math.max(summaryBreakMinutes, sessionBreakMinutes);

  const idleMinutes = Number(attendance?.idleMinutes || 0);

  const activeMinutes = attendance?.logoutTime
    ? Number(attendance.activeMinutes || 0)
    : Math.max(0, loggedIn - breakMinutes - idleMinutes);

  const requiredMinutes = Number(
    attendance?.requiredMinutes ?? settingsQuery.data?.requiredMinutes ?? 480,
  );
  const remainingMinutes = Math.max(0, requiredMinutes - activeMinutes);
  const overtimeMinutes = Math.max(0, activeMinutes - requiredMinutes);

  const status = !attendance?.loginTime
    ? "NOT CHECKED IN"
    : attendance?.logoutTime
      ? "CHECKED OUT"
      : activeBreak
        ? "ON BREAK"
        : "WORKING";

  const events = [...asArray(attendance?.workEvents)].sort(
    (a, b) =>
      new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );

  const timelineChartData = [
    { name: "Active", minutes: activeMinutes, fill: "#2563eb" },
    { name: "Break", minutes: breakMinutes, fill: "#f59e0b" },
    { name: "Idle", minutes: idleMinutes, fill: "#94a3b8" },
    { name: "Remaining", minutes: remainingMinutes, fill: "#e2e8f0" },
  ];
  const activeProgress = requiredMinutes > 0
    ? Math.min(100, Math.round((activeMinutes / requiredMinutes) * 100))
    : 0;
  const timelineBreakdown = [
    { label: "Active work", value: activeMinutes, color: "#2563eb" },
    { label: "Breaks", value: breakMinutes, color: "#f59e0b" },
    { label: "Idle", value: idleMinutes, color: "#94a3b8" },
  ];

  async function runAction(
    action: "start" | "end" | "checkout",
    endpoint: string,
    successText: string,
    body?: any,
  ) {
    setActionLoading(action);
    setMessage(null);

    try {
      await post(endpoint, body);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["attendance"] }),
        qc.invalidateQueries({ queryKey: ["breaks"] }),
      ]);
      setMessage({ type: "success", text: successText });
      if (action === "start") setSelectedBreakTypeId("");
    } catch (error: any) {
      const apiMessage =
        error?.response?.data?.message ||
        error?.message ||
        "Unable to complete this action.";
      setMessage({
        type: "error",
        text: Array.isArray(apiMessage) ? apiMessage.join(", ") : apiMessage,
      });
    } finally {
      setActionLoading(null);
    }
  }

  const refresh = async () => {
    await Promise.all([
      attendanceQuery.refetch(),
      breaksQuery.refetch(),
      breakTypesQuery.refetch(),
    ]);
  };

  if (attendanceQuery.isLoading || breaksQuery.isLoading) {
    return (
      <div className="timeTrackingPage">
        <div className="timeTrackingLoading">
          <RefreshCw size={20} className="timeTrackingSpin" />
          Loading time tracking...
        </div>
      </div>
    );
  }

  if (attendanceQuery.isError || breaksQuery.isError) {
    return (
      <div className="timeTrackingPage">
        <div className="timeTrackingError">
          <h2>Unable to load time tracking</h2>
          <p>Please refresh and try again.</p>
          <button className="ttButton ttButtonPrimary" onClick={refresh}>
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="timeTrackingPage">
      <div className="ttPageHeader">
        <div>
          <div className="ttEyebrow">
            <TimerReset size={15} />
            Employee Time Tracking
          </div>
          <h1>Time Tracking</h1>
          <p>
            Track today's logged-in, active, break and idle time from one place.
          </p>
        </div>

        <button
          type="button"
          className="ttButton ttButtonSecondary"
          onClick={refresh}
          disabled={attendanceQuery.isFetching || breaksQuery.isFetching}
        >
          <RefreshCw
            size={16}
            className={
              attendanceQuery.isFetching || breaksQuery.isFetching
                ? "timeTrackingSpin"
                : ""
            }
          />
          Refresh
        </button>
      </div>

      {message && (
        <div className={`ttAlert ${message.type}`}>
          {message.type === "success" ? (
            <CheckCircle2 size={17} />
          ) : (
            <CircleStop size={17} />
          )}
          <span>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)}>
            ×
          </button>
        </div>
      )}

      <section
        className={`ttStatusCard ${status.toLowerCase().replaceAll(" ", "-")}`}
      >
        <div className="ttStatusIcon">
          {status === "WORKING" ? (
            <Activity size={22} />
          ) : status === "ON BREAK" ? (
            <Coffee size={22} />
          ) : status === "CHECKED OUT" ? (
            <LogOut size={22} />
          ) : (
            <Clock3 size={22} />
          )}
        </div>

        <div className="ttStatusContent">
          <span className="ttStatusLabel">Current Work Status</span>
          <strong>{status}</strong>
          <p>
            {status === "WORKING"
              ? "Your work session is currently active."
              : status === "ON BREAK"
                ? "Your break session is currently active."
                : status === "CHECKED OUT"
                  ? "Today's work session has ended."
                  : "Start your workday from the Employee Dashboard."}
          </p>
        </div>

        <div className="ttStatusActions">
          {attendance?.loginTime && !attendance?.logoutTime ? (
            activeBreak ? (
              <button
                type="button"
                className="ttButton ttButtonSuccess"
                disabled={actionLoading !== null}
                onClick={() => setShowEndBreakConfirm(true)}
              >
                <PlayCircle size={17} />
                End Break
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="ttButton ttButtonWarning"
                  disabled={actionLoading !== null || !selectedBreakTypeId}
                  onClick={() =>
                    runAction(
                      "start",
                      "/breaks/start",
                      "Break started successfully.",
                      { breakTypeId: selectedBreakTypeId },
                    )
                  }
                >
                  <PauseCircle size={17} />
                  {actionLoading === "start" ? "Starting..." : "Start Break"}
                </button>

                <button
                  type="button"
                  className="ttButton ttButtonDanger"
                  disabled={actionLoading !== null}
                  onClick={() =>
                    runAction(
                      "checkout",
                      "/attendance/check-out",
                      "You have been checked out successfully.",
                    )
                  }
                >
                  <LogOut size={17} />
                  {actionLoading === "checkout"
                    ? "Checking Out..."
                    : "Check Out"}
                </button>
              </>
            )
          ) : (
            <div className="ttDashboardHint">
              <UserRound size={16} />
              Check in from Dashboard to start tracking.
            </div>
          )}
        </div>
      </section>

      <div className="ttMetricsGrid">
        <div className="ttMetricCard blue">
          <div className="ttMetricIcon">
            <LogIn size={19} />
          </div>
          <div>
            <span>Logged-in Time</span>
            <strong>{fmt(loggedIn)}</strong>
            <small>Login to logout duration</small>
          </div>
        </div>

        <div className="ttMetricCard cyan">
          <div className="ttMetricIcon">
            <Activity size={19} />
          </div>
          <div>
            <span>Active Time</span>
            <strong>{fmt(activeMinutes)}</strong>
            <small>Logged-in − break − idle</small>
          </div>
        </div>

        <div className="ttMetricCard orange">
          <div className="ttMetricIcon">
            <Coffee size={19} />
          </div>
          <div>
            <span>Break Time</span>
            <strong>{fmt(breakMinutes)}</strong>
            <small>Today's cumulative breaks</small>
          </div>
        </div>

        <div className="ttMetricCard slate">
          <div className="ttMetricIcon">
            <Clock3 size={19} />
          </div>
          <div>
            <span>Idle Time</span>
            <strong>{fmt(idleMinutes)}</strong>
            <small>Detected inactive time</small>
          </div>
        </div>

        <div className="ttMetricCard teal">
          <div className="ttMetricIcon">
            <TimerReset size={19} />
          </div>
          <div>
            <span>Required Time</span>
            <strong>{fmt(requiredMinutes)}</strong>
            <small>Today's required working time</small>
          </div>
        </div>

        <div className="ttMetricCard red">
          <div className="ttMetricIcon">
            <CalendarClock size={19} />
          </div>
          <div>
            <span>Remaining Time</span>
            <strong>{fmt(remainingMinutes)}</strong>
            <small>
              {remainingMinutes ? "Required time remaining" : "Requirement met"}
            </small>
          </div>
        </div>
      </div>

      <div className="ttInfoGrid">
        <section className="ttPanel">
          <div className="ttPanelHeader">
            <div>
              <h2>Today's Session</h2>
              <p>Current attendance and work-session information.</p>
            </div>
            <div
              className={`ttStatusPill ${status.toLowerCase().replaceAll(" ", "-")}`}
            >
              {status}
            </div>
          </div>

          <div className="ttDetailsGrid">
            <div>
              <span>Work Mode</span>
              <strong>{attendance?.workMode || "--"}</strong>
            </div>
            <div>
              <span>Login Time</span>
              <strong>{timeLabel(attendance?.loginTime)}</strong>
            </div>
            <div>
              <span>Logout Time</span>
              <strong>{timeLabel(attendance?.logoutTime)}</strong>
            </div>
            <div>
              <span>Shortage</span>
              <strong>
                {fmt(
                  Number(
                    attendance?.shortageMinutes ||
                      Math.max(0, requiredMinutes - activeMinutes),
                  ),
                )}
              </strong>
            </div>
            <div>
              <span>Overtime</span>
              <strong>
                {fmt(Number(attendance?.overtimeMinutes || overtimeMinutes))}
              </strong>
            </div>
            <div>
              <span>Task Tracked</span>
              <strong>{fmt(Number(attendance?.taskMinutes || 0))}</strong>
            </div>
          </div>
        </section>

        <section className="ttPanel">
          <div className="ttPanelHeader">
            <div>
              <h2>Break Control</h2>
              <p>Manage your break session without leaving this page.</p>
            </div>
            <div className={`ttBreakIndicator ${activeBreak ? "active" : ""}`}>
              <Coffee size={15} />
              {activeBreak ? "Break Active" : "No Active Break"}
            </div>
          </div>

          <div className="ttBreakBox">
            <div className="ttBreakMain">
              <span>Today's break time</span>
              <strong>{fmt(breakMinutes)}</strong>
            </div>

            {activeBreak ? (
              <div className="ttBreakStarted">
                <span>Break started</span>
                <strong>{timeLabel(activeBreak.startedAt)}</strong>
              </div>
            ) : (
              <div className="ttBreakStarted">
                <span>Break sessions</span>
                <strong>{breaks.length}</strong>
              </div>
            )}
          </div>

          {activeBreak && (
            <div
              className={`ttBreakCountdown ${breakRemainingSeconds === 0 ? "limit" : ""}`}
            >
              <div>
                <span>Break time remaining</span>
                <strong>{formatCountdown(breakRemainingSeconds)}</strong>
              </div>
              <small>
                {breakRemainingSeconds === 0
                  ? "Configured break limit reached. End the break when you are ready."
                  : `Configured limit: ${activeBreakLimitMinutes} minutes`}
              </small>
            </div>
          )}

          {!activeBreak && (
            <div className="ttBreakTypeSelect">
              <label htmlFor="breakTypeSelect">Break Type</label>
              <select
                id="breakTypeSelect"
                value={selectedBreakTypeId}
                onChange={(event) => setSelectedBreakTypeId(event.target.value)}
                disabled={
                  actionLoading !== null ||
                  !attendance?.loginTime ||
                  !!attendance?.logoutTime
                }
              >
                <option value="">Select break type</option>
                {breakTypes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} — {item.timeLimitMinutes} min
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="ttBreakActions">
            {activeBreak ? (
              <button
                type="button"
                className="ttButton ttButtonSuccess ttButtonWide"
                disabled={actionLoading !== null}
                onClick={() => setShowEndBreakConfirm(true)}
              >
                <PlayCircle size={17} />
                End Break
              </button>
            ) : (
              <button
                type="button"
                className="ttButton ttButtonWarning ttButtonWide"
                disabled={
                  !attendance?.loginTime ||
                  !!attendance?.logoutTime ||
                  !selectedBreakTypeId ||
                  actionLoading !== null
                }
                onClick={() =>
                  runAction(
                    "start",
                    "/breaks/start",
                    "Break started successfully.",
                    { breakTypeId: selectedBreakTypeId },
                  )
                }
              >
                <PauseCircle size={17} />
                Start Break
              </button>
            )}
          </div>
        </section>
      </div>

      <section className="ttPanel ttTimelinePanel">
        <div className="ttPanelHeader">
          <div>
            <h2>Today's Work Timeline</h2>
            <p>Your recorded work events for today's attendance.</p>
          </div>
          <div className="ttTimelineCount">
            <Zap size={15} />
            {events.length} event{events.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="ttTimelineOverview">
          <div className="ttWorkGraph">
            <div className="ttGraphHeading">
              <div>
                <span className="ttGraphEyebrow">DAILY PROGRESS</span>
                <strong>{activeProgress}% <span>of daily goal</span></strong>
              </div>
              <span className="ttGraphGoal">{fmt(activeMinutes)} / {fmt(requiredMinutes)}</span>
            </div>
            <div className="ttProgressTrack" role="progressbar" aria-label="Daily active work progress" aria-valuenow={activeProgress} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${activeProgress}%` }} />
            </div>
            <div className="ttChartWrap">
              <ResponsiveContainer width="100%" height={176}>
                <BarChart data={timelineChartData} layout="vertical" margin={{ top: 4, right: 18, bottom: 0, left: 6 }} barSize={15}>
                  <CartesianGrid stroke="#eef2f7" horizontal={false} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(value) => `${Math.floor(value / 60)}h`} />
                  <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} width={66} tick={{ fill: "#64748b", fontSize: 11 }} />
                  <Tooltip formatter={(value) => fmt(Number(value))} cursor={{ fill: "#f8fafc" }} />
                  <Bar dataKey="minutes" radius={[0, 6, 6, 0]}>
                    {timelineChartData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="ttWorkSummary">
            <span className="ttGraphEyebrow">TIME BREAKDOWN</span>
            <strong className="ttSummaryTotal">{fmt(loggedIn)}<small> logged in</small></strong>
            <div className="ttBreakdownList">
              {timelineBreakdown.map((item) => (
                <div className="ttBreakdownRow" key={item.label}>
                  <span><i style={{ background: item.color }} />{item.label}</span>
                  <strong>{fmt(item.value)}</strong>
                </div>
              ))}
            </div>
            <div className="ttNextMilestone">
              <CalendarClock size={17} />
              <span>{remainingMinutes ? `${fmt(remainingMinutes)} left to reach your daily goal` : "Daily work goal reached"}</span>
            </div>
          </div>
        </div>

        {events.length ? (
          <div className="ttTimeline">
            {events.map((event, index) => (
              <div
                className="ttTimelineItem"
                key={event.id || `${event.occurredAt}-${event.type}-${index}`}
              >
                <div className="ttTimelineIcon">
                  {event.type === "LOGIN" ? (
                    <LogIn size={16} />
                  ) : event.type === "LOGOUT" ? (
                    <LogOut size={16} />
                  ) : event.type.includes("BREAK") ? (
                    <Coffee size={16} />
                  ) : event.type.includes("IDLE") ? (
                    <Clock3 size={16} />
                  ) : (
                    <Activity size={16} />
                  )}
                </div>
                <div className="ttTimelineContent">
                  <strong>{eventLabel(event.type)}</strong>
                  <span>{timeLabel(event.occurredAt)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="ttEmptyTimeline">
            <Activity size={24} />
            <strong>No work events recorded yet.</strong>
            <span>
              Today's login, break and logout events will appear here.
            </span>
          </div>
        )}
      </section>

      {showEndBreakConfirm && (
        <div
          className="ttModalOverlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowEndBreakConfirm(false);
            }
          }}
        >
          <div
            className="ttConfirmModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-break-title"
          >
            <div className="ttConfirmIcon">
              <Coffee size={22} />
            </div>

            <div className="ttConfirmContent">
              <h3 id="end-break-title">End Break?</h3>
              <p>
                Your break has been running for{" "}
                <strong>{formatCountdown(breakElapsedSeconds)}</strong>. Do you
                want to end the break and resume working?
              </p>
            </div>

            <div className="ttConfirmActions">
              <button
                type="button"
                className="ttButton ttButtonSecondary"
                onClick={() => setShowEndBreakConfirm(false)}
                disabled={actionLoading !== null}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ttButton ttButtonSuccess"
                disabled={actionLoading !== null}
                onClick={async () => {
                  setShowEndBreakConfirm(false);
                  await runAction(
                    "end",
                    "/breaks/end",
                    "Break ended successfully.",
                  );
                }}
              >
                <PlayCircle size={17} />
                {actionLoading === "end" ? "Ending..." : "End Break"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
