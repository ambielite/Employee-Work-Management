import {
  Activity,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Clock3,
  ExternalLink,
  LogIn,
  LogOut,
  Play,
  Pause,
  RefreshCw,
  Timer,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get, patch, post } from "../api/client";
import { fmt } from "../utils/time";
import "../employee-dashboard.css";

type WorkEvent = {
  id?: string;
  type: string;
  occurredAt: string;
};

type AttendanceData = {
  id?: string;
  date?: string;
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
  employee?: {
    id?: string;
    employeeId?: string;
    fullName?: string;
    designation?: string;
    department?: { name?: string };
  };
  workEvents?: WorkEvent[];
};

type AttendanceHistoryRow = {
  id?: string;
  date?: string;
  workMode?: string;
  status?: string;
  loginTime?: string;
  logoutTime?: string;
  loggedInMinutes?: number;
  activeMinutes?: number;
  breakMinutes?: number;
  idleMinutes?: number;
  taskMinutes?: number;
};

function formatDurationSeconds(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function normalizeAttendanceHistory(data: any): AttendanceHistoryRow[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function localDateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function shortDayLabel(value: Date) {
  return value.toLocaleDateString("en-IN", {
    weekday: "short",
  });
}

function dayNumberLabel(value: Date) {
  return value.toLocaleDateString("en-IN", {
    day: "numeric",
  });
}

function monthDayLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
  });
}

type Task = {
  id: string;
  taskNumber?: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  estimatedMinutes?: number;
  actualMinutes?: number;
  project?: {
    id?: string;
    name?: string;
  };
  assignedTo?: {
    id?: string;
    employeeId?: string;
    fullName?: string;
  };
  assignedBy?: {
    id?: string;
    email?: string;
    employeeId?: string;
    fullName?: string;
  };
};

type ActiveTaskTimer = {
  id?: string;
  taskId?: string;
  startedAt?: string;
  task?: {
    id?: string;
    taskNumber?: string;
    title?: string;
  };
};

function minutesFromDates(start?: string, end?: string, now = Date.now()) {
  if (!start) return 0;

  const from = new Date(start).getTime();
  const to = end ? new Date(end).getTime() : now;

  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return 0;
  }

  return Math.floor((to - from) / 60000);
}

function statusLabel(status?: string) {
  if (!status) return "—";
  return status.replaceAll("_", " ");
}

function statusClass(status?: string) {
  if (!status) return "neutral";

  if (
    status.includes("INSUFFICIENT") ||
    status === "EARLY_LOGOUT" ||
    status === "ABSENT"
  ) {
    return "warning";
  }

  if (
    status === "PRESENT" ||
    status === "LATE" ||
    status === "HOLIDAY" ||
    status === "WEEKLY_OFF"
  ) {
    return "success";
  }

  return "neutral";
}

function timeOnly(value?: string) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeWithSeconds(value?: string) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function greeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function normalizeTasks(data: any): Task[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export default function EmployeeDashboard() {
  const qc = useQueryClient();

  const [now, setNow] = useState(Date.now());
  const [warning, setWarning] = useState(false);
  const [selectedWorkMode, setSelectedWorkMode] = useState<
    "WFO" | "WFH" | null
  >(null);
  const [timelineView, setTimelineView] = useState<"DAY" | "WEEK" | "MONTH">(
    "DAY",
  );
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskActionLoading, setTaskActionLoading] = useState("");
  const [actionLoading, setActionLoading] = useState<
    "CHECK_IN" | "LOGOUT" | "REFRESH" | null
  >(null);

  const lastActivity = useRef(Date.now());
  const idleRef = useRef(false);
  const meQ = useQuery({
    queryKey: ["auth-me"],
    queryFn: () => get("/auth/me"),
    staleTime: 60000,
  });
  const settingsQ = useQuery({
    queryKey: ["settings"],
    queryFn: () => get("/settings"),
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const attendanceQ = useQuery<AttendanceData>({
    queryKey: ["attendance"],
    queryFn: () => get("/attendance/today"),
    refetchInterval: 15000,
  });

  const historyQ = useQuery({
    queryKey: ["employee-attendance-history"],
    queryFn: () => get("/attendance/history"),
    refetchInterval: 60000,
  });

  const tasksQ = useQuery({
    queryKey: ["employee-dashboard-tasks"],
    queryFn: () => get("/tasks"),
    refetchInterval: 30000,
  });

  const activeTaskTimerQ = useQuery({
    queryKey: ["employee-active-task-timer"],
    queryFn: () => get("/task-timers/active"),
    refetchInterval: 15000,
  });

  // Keep break status fresh so idle tracking does not run during a break.
  const breaksQ = useQuery({
    queryKey: ["employee-breaks-today"],
    queryFn: () => get("/breaks/today"),
    refetchInterval: 5000,
  });

  const breakRows = Array.isArray(breaksQ.data?.rows) ? breaksQ.data.rows : [];

  const isOnBreak = breakRows.some(
    (item: { endedAt?: string | null }) => !item.endedAt,
  );

  const attendance = attendanceQ.data;
  const me = meQ.data;

  const employee = me?.employee;

  const employeeName = employee?.fullName?.trim() || "Employee";

  const employeeId = employee?.employeeId?.trim() || "";

  const employeeDesignation = employee?.designation?.trim() || "";

  const departmentName = employee?.department?.name?.trim() || "";

  const attendanceHistory = useMemo(
    () => normalizeAttendanceHistory(historyQ.data),
    [historyQ.data],
  );

  const historyByDate = useMemo(() => {
    const map = new Map<string, AttendanceHistoryRow>();

    attendanceHistory.forEach((row) => {
      const key = row.date
        ? localDateKey(row.date)
        : row.loginTime
          ? localDateKey(row.loginTime)
          : "";

      if (!key) return;

      const current = map.get(key);
      if (!current || (row.loginTime || "") > (current.loginTime || "")) {
        map.set(key, row);
      }
    });

    if (attendance?.date) {
      const todayKey = localDateKey(attendance.date);
      if (todayKey) {
        map.set(todayKey, attendance);
      }
    }

    return map;
  }, [attendanceHistory, attendance]);

  const tasks = useMemo(() => {
    return normalizeTasks(tasksQ.data)
      .filter(
        (task) => task.status !== "COMPLETED" && task.status !== "CANCELLED",
      )
      .slice(0, 4);
  }, [tasksQ.data]);

  const activeTaskTimer = useMemo<ActiveTaskTimer | null>(() => {
    const data = activeTaskTimerQ.data;

    if (!data) return null;
    if (Array.isArray(data)) return data[0] || null;

    return data?.data || data?.timer || data || null;
  }, [activeTaskTimerQ.data]);

  const activeTaskId =
    activeTaskTimer?.taskId || activeTaskTimer?.task?.id || null;

  const activeTaskTimerSeconds = useMemo(() => {
    if (!activeTaskTimer?.startedAt) return 0;

    const startedAt = new Date(activeTaskTimer.startedAt).getTime();

    if (!Number.isFinite(startedAt)) return 0;

    return Math.max(0, Math.floor((now - startedAt) / 1000));
  }, [activeTaskTimer, now]);

  async function handleTaskTimerAction(
    task: Task,
    action: "start" | "pause" | "resume",
  ) {
    setTaskActionLoading(`${task.id}:${action}`);

    try {
      const timerAction =
        action === "pause" ? "pause" : action === "resume" ? "resume" : "start";

      await post(`/tasks/${task.id}/timer/${timerAction}`);

      if (
        (action === "start" || action === "resume") &&
        task.status !== "IN_PROGRESS"
      ) {
        await patch(`/tasks/${task.id}`, {
          status: "IN_PROGRESS",
        });
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["employee-dashboard-tasks"] }),
        qc.invalidateQueries({ queryKey: ["employee-active-task-timer"] }),
        qc.invalidateQueries({ queryKey: ["tasks"] }),
      ]);

      await activeTaskTimerQ.refetch();

      const refreshed = await tasksQ.refetch();
      const nextTasks = normalizeTasks(refreshed.data);
      const updatedTask = nextTasks.find((item) => item.id === task.id);

      if (updatedTask) {
        setSelectedTask(updatedTask);
      }
    } catch (error: any) {
      window.alert(
        error?.response?.data?.message ||
          "Task timer operation failed. Please try again.",
      );
    } finally {
      setTaskActionLoading("");
    }
  }

  async function handleCompleteTask(task: Task) {
    setTaskActionLoading(`${task.id}:complete`);

    try {
      if (activeTaskId === task.id) {
        await post(`/tasks/${task.id}/timer/stop`);
      }

      await patch(`/tasks/${task.id}`, {
        status: "COMPLETED",
      });

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["employee-dashboard-tasks"] }),
        qc.invalidateQueries({ queryKey: ["employee-active-task-timer"] }),
        qc.invalidateQueries({ queryKey: ["tasks"] }),
      ]);

      await activeTaskTimerQ.refetch();

      const refreshed = await tasksQ.refetch();
      const nextTasks = normalizeTasks(refreshed.data);
      const updatedTask = nextTasks.find((item) => item.id === task.id);

      setSelectedTask(updatedTask || null);
    } catch (error: any) {
      window.alert(
        error?.response?.data?.message ||
          "Unable to complete this task. Please try again.",
      );
    } finally {
      setTaskActionLoading("");
    }
  }

  useEffect(() => {
    const clock = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    const activityEvents = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ];

    const onActivity = () => {
      lastActivity.current = Date.now();

      if (idleRef.current) {
        idleRef.current = false;
        post("/idle/heartbeat", { active: true }).catch(() => {});
        qc.invalidateQueries({ queryKey: ["attendance"] });
      }
    };

    activityEvents.forEach((event) => {
      window.addEventListener(event, onActivity);
    });

    const idleTimer = window.setInterval(() => {
      if (!attendance?.loginTime || attendance?.logoutTime) return;

      // While a break is active, close any open idle session and do not start another.
      if (isOnBreak) {
        if (idleRef.current) idleRef.current = false;

        post("/idle/heartbeat", { active: true })
          .then(() => qc.invalidateQueries({ queryKey: ["attendance"] }))
          .catch(() => {});
        return;
      }

      const thresholdMinutes =
        Number(settingsQ.data?.idleThresholdMinutes) || 5;

      const elapsed = Date.now() - lastActivity.current;
      const threshold = thresholdMinutes * 60000;
      const warningWindow = Math.min(
        threshold,
        Math.max(0, Number(settingsQ.data?.idleWarningSeconds ?? 60) * 1000),
      );
      const isIdle = elapsed > threshold;

      if (isIdle && !idleRef.current) {
        idleRef.current = true;

        post("/idle/heartbeat", { active: false })
          .then(() => qc.invalidateQueries({ queryKey: ["attendance"] }))
          .catch(() => {
            idleRef.current = false;
          });
      }

      if (
        !isIdle &&
        elapsed >= Math.max(0, threshold - warningWindow) &&
        !warning
      ) {
        setWarning(true);
      }
    }, 10000);

    return () => {
      window.clearInterval(clock);
      window.clearInterval(idleTimer);

      activityEvents.forEach((event) => {
        window.removeEventListener(event, onActivity);
      });
    };
  }, [
    attendance?.loginTime,
    attendance?.logoutTime,
    settingsQ.data?.idleThresholdMinutes,
    settingsQ.data?.idleWarningSeconds,
    warning,
    isOnBreak,
    qc,
  ]);

  const loggedInMinutes = attendance?.loginTime
    ? attendance.logoutTime
      ? minutesFromDates(attendance.loginTime, attendance.logoutTime, now)
      : Math.max(
          Number(attendance.loggedInMinutes) || 0,
          minutesFromDates(attendance.loginTime, undefined, now),
        )
    : 0;

  const loggedInSeconds = attendance?.loginTime
    ? Math.max(
        0,
        Math.floor(
          ((attendance.logoutTime
            ? new Date(attendance.logoutTime)
            : new Date(now)
          ).getTime() -
            new Date(attendance.loginTime).getTime()) /
            1000,
        ),
      )
    : 0;

  const breakMinutes = Number(attendance?.breakMinutes) || 0;
  const idleMinutes = Number(attendance?.idleMinutes) || 0;

  const breakSeconds = Math.max(0, breakMinutes * 60);
  const idleSeconds = Math.max(0, idleMinutes * 60);

  const backendActiveSeconds = Math.max(
    0,
    (Number(attendance?.activeMinutes) || 0) * 60,
  );

  const liveCalculatedActiveSeconds = Math.max(
    0,
    loggedInSeconds - breakSeconds - idleSeconds,
  );

  const activeSeconds = attendance?.logoutTime
    ? backendActiveSeconds
    : Math.max(backendActiveSeconds, liveCalculatedActiveSeconds);

  const activeMinutes = Math.floor(activeSeconds / 60);

  const requiredSeconds = Math.max(
    0,
    (Number(attendance?.requiredMinutes ?? settingsQ.data?.requiredMinutes) ||
      480) * 60,
  );

  const requiredMinutes = Math.floor(requiredSeconds / 60);

  const remainingSeconds = Math.max(0, requiredSeconds - activeSeconds);
  const overtimeSeconds = Math.max(0, activeSeconds - requiredSeconds);

  const remainingMinutes = Math.floor(remainingSeconds / 60);

  const shortageMinutes =
    attendance?.shortageMinutes !== undefined
      ? Number(attendance.shortageMinutes) || 0
      : remainingMinutes;

  const overtimeMinutes =
    attendance?.overtimeMinutes !== undefined
      ? Number(attendance.overtimeMinutes) || 0
      : Math.max(0, activeMinutes - requiredMinutes);

  const taskMinutes = Number(attendance?.taskMinutes) || 0;

  const isCheckedIn = Boolean(attendance?.loginTime && !attendance?.logoutTime);

  const isCheckedOut = Boolean(attendance?.loginTime && attendance?.logoutTime);

  const isOffline = !attendance?.loginTime;

  const todayTimeline = useMemo(() => {
    const active = attendance?.logoutTime
      ? Number(attendance.activeMinutes) || 0
      : activeMinutes;

    const logged = attendance?.logoutTime
      ? Number(attendance.loggedInMinutes) || 0
      : Math.max(loggedInMinutes, Number(attendance?.loggedInMinutes) || 0);

    return {
      activeMinutes: Math.max(0, active),
      loggedInMinutes: Math.max(0, logged),
      breakMinutes: Math.max(0, Number(attendance?.breakMinutes) || 0),
      idleMinutes: Math.max(0, Number(attendance?.idleMinutes) || 0),
    };
  }, [attendance, activeMinutes, loggedInMinutes]);

  const weekHistory = useMemo(() => {
    const currentDate = new Date(now);
    currentDate.setHours(0, 0, 0, 0);

    const monday = new Date(currentDate);
    const day = monday.getDay();
    const distanceFromMonday = day === 0 ? 6 : day - 1;
    monday.setDate(monday.getDate() - distanceFromMonday);

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);

      const key = localDateKey(date);
      const row = historyByDate.get(key);

      return {
        key,
        label: shortDayLabel(date),
        dateLabel: dayNumberLabel(date),
        activeMinutes: Number(row?.activeMinutes) || 0,
        loggedInMinutes: Number(row?.loggedInMinutes) || 0,
        breakMinutes: Number(row?.breakMinutes) || 0,
        idleMinutes: Number(row?.idleMinutes) || 0,
        status: row?.status || "",
      };
    });
  }, [historyByDate, now]);

  const monthHistory = useMemo(() => {
    const currentDate = new Date(now);
    currentDate.setHours(0, 0, 0, 0);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    return Array.from({ length: daysInMonth }, (_, index) => {
      const date = new Date(year, month, index + 1);
      const key = localDateKey(date);
      const row = historyByDate.get(key);

      return {
        key,
        label: monthDayLabel(key),
        dateLabel: monthDayLabel(key),
        activeMinutes: Number(row?.activeMinutes) || 0,
        loggedInMinutes: Number(row?.loggedInMinutes) || 0,
        breakMinutes: Number(row?.breakMinutes) || 0,
        idleMinutes: Number(row?.idleMinutes) || 0,
        status: row?.status || "",
      };
    });
  }, [historyByDate, now]);

  const timelineRows = useMemo(() => {
    if (timelineView === "DAY") {
      return [
        {
          key: "today",
          label: "Today",
          dateLabel: attendance?.date
            ? new Date(attendance.date).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
              })
            : "Today",
          activeMinutes: todayTimeline.activeMinutes,
          loggedInMinutes: todayTimeline.loggedInMinutes,
          breakMinutes: todayTimeline.breakMinutes,
          idleMinutes: todayTimeline.idleMinutes,
          status: attendance?.status || "",
        },
      ];
    }

    return timelineView === "WEEK" ? weekHistory : monthHistory;
  }, [
    timelineView,
    todayTimeline,
    attendance?.date,
    attendance?.status,
    weekHistory,
    monthHistory,
  ]);

  const timelineMaxMinutes = useMemo(() => {
    const values = timelineRows.flatMap((row) => [
      Number(row.loggedInMinutes) || 0,
      Number(row.activeMinutes) || 0,
      Number(row.breakMinutes) || 0,
      Number(row.idleMinutes) || 0,
      Number(requiredMinutes) || 0,
    ]);

    return Math.max(60, ...values);
  }, [timelineRows, requiredMinutes]);

  const allowWFO = settingsQ.data?.allowWFO === true;
  const allowWFH = settingsQ.data?.allowWFH === true;
  const hasAvailableWorkMode = allowWFO || allowWFH;

  function openTaskDetails(task: Task) {
    setSelectedTask(task);
  }

  function openTaskPage() {
    window.location.href = "/employee/tasks";
  }

  useEffect(() => {
    if (!selectedTask) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedTask(null);
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [selectedTask]);

  useEffect(() => {
    if (selectedWorkMode === "WFO" && !allowWFO) {
      setSelectedWorkMode(null);
    }

    if (selectedWorkMode === "WFH" && !allowWFH) {
      setSelectedWorkMode(null);
    }
  }, [allowWFO, allowWFH, selectedWorkMode]);

  async function checkIn() {
    const mode = selectedWorkMode;

    if (!mode) {
      window.alert("Please select WFO or WFH before login.");
      return;
    }

    if (mode === "WFO" && !allowWFO) {
      window.alert(
        "Work From Office is currently disabled by your administrator.",
      );
      setSelectedWorkMode(null);
      return;
    }

    if (mode === "WFH" && !allowWFH) {
      window.alert(
        "Work From Home is currently disabled by your administrator.",
      );
      setSelectedWorkMode(null);
      return;
    }

    try {
      setActionLoading("CHECK_IN");

      await post("/attendance/check-in", {
        workMode: mode,
      });

      lastActivity.current = Date.now();
      idleRef.current = false;
      setSelectedWorkMode(null);

      await qc.invalidateQueries({
        queryKey: ["attendance"],
      });
    } catch (error: any) {
      window.alert(
        error?.response?.data?.message || "Unable to start attendance.",
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function checkOut() {
    try {
      setActionLoading("LOGOUT");

      await post("/attendance/check-out");

      idleRef.current = false;

      await qc.invalidateQueries({
        queryKey: ["attendance"],
      });
    } catch (error: any) {
      window.alert(error?.response?.data?.message || "Unable to check out.");
    } finally {
      setActionLoading(null);
    }
  }

  async function refreshDashboard() {
    try {
      setActionLoading("REFRESH");

      await Promise.all([
        meQ.refetch(),
        attendanceQ.refetch(),
        historyQ.refetch(),
        tasksQ.refetch(),
        settingsQ.refetch(),
      ]);
    } finally {
      setActionLoading(null);
    }
  }

  if (attendanceQ.isLoading || meQ.isLoading || settingsQ.isLoading) {
    return (
      <div className="employeeDashboardLoading">
        <div className="employeeDashboardLoader" />
        <span>Loading your dashboard…</span>
      </div>
    );
  }

  return (
    <div className="employeeDashboard">
      <div className="employeeDashboardHeader">
        <div className="employeeDashboardIdentity">
          <div className="employeeDashboardAvatar">
            <UserRound size={21} />
          </div>

          <div>
            <div className="employeeDashboardEyebrow">
              {employeeId && employeeDesignation
                ? `${employeeId} · ${employeeDesignation}`
                : employeeId || employeeDesignation || "Employee"}
            </div>

            <h1>
              {greeting()}, {employeeName}
            </h1>

            <p>{departmentName || "Your live workday overview"}</p>
          </div>
        </div>

        <div className="employeeDashboardHeaderActions">
          {isOffline && (
            <>
              {!selectedWorkMode && (
                <>
                  {allowWFO && (
                    <button
                      type="button"
                      className="employeeActionBtn office"
                      onClick={() => setSelectedWorkMode("WFO")}
                      disabled={actionLoading !== null}
                    >
                      <LogIn size={16} />
                      Work From Office
                    </button>
                  )}

                  {allowWFH && (
                    <button
                      type="button"
                      className="employeeActionBtn home"
                      onClick={() => setSelectedWorkMode("WFH")}
                      disabled={actionLoading !== null}
                    >
                      <LogIn size={16} />
                      Work From Home
                    </button>
                  )}

                  {!hasAvailableWorkMode && (
                    <span className="employeeWorkModeDisabled">
                      Work mode is currently unavailable. Please contact your
                      administrator.
                    </span>
                  )}
                </>
              )}

              {selectedWorkMode && (
                <>
                  <span
                    className={`employeeSelectedWorkMode ${
                      selectedWorkMode === "WFO" ? "office" : "home"
                    }`}
                  >
                    <LogIn size={15} />
                    {selectedWorkMode === "WFO"
                      ? "WFO Selected"
                      : "WFH Selected"}
                  </span>

                  <button
                    type="button"
                    className="employeeActionBtn employeeLoginBtn"
                    onClick={checkIn}
                    disabled={actionLoading !== null}
                  >
                    <LogIn size={16} />
                    {actionLoading === "CHECK_IN" ? "Logging in…" : "Login"}
                  </button>

                  <button
                    type="button"
                    className="employeeModeChangeBtn"
                    onClick={() => setSelectedWorkMode(null)}
                    disabled={actionLoading !== null}
                  >
                    Change
                  </button>
                </>
              )}
            </>
          )}

          {isCheckedIn && (
            <button
              type="button"
              className="employeeActionBtn logout"
              onClick={checkOut}
              disabled={actionLoading !== null}
            >
              <LogOut size={16} />
              {actionLoading === "LOGOUT" ? "Logging out…" : "Logout"}
            </button>
          )}

          {isCheckedOut && (
            <span className="employeeCheckedOutBadge">
              <CheckCircle2 size={15} />
              Logged Out
            </span>
          )}

          <button
            type="button"
            className="employeeRefreshBtn"
            onClick={refreshDashboard}
            disabled={actionLoading !== null}
            title="Refresh dashboard"
          >
            <RefreshCw
              size={16}
              className={actionLoading === "REFRESH" ? "employeeSpin" : ""}
            />
          </button>
        </div>
      </div>

      {warning && isCheckedIn && (
        <div className="employeeIdleWarning">
          <Activity size={17} />
          <span>
            No activity detected. You may be marked idle if activity does not
            resume.
          </span>

          <button
            type="button"
            onClick={() => {
              lastActivity.current = Date.now();
              setWarning(false);
            }}
          >
            I'm Working
          </button>
        </div>
      )}

      <section className="employeeStatsGrid">
        <div className="employeeMetricCard mode">
          <span>Today's Mode</span>
          <strong>{attendance?.workMode || "Not checked in"}</strong>
          <small>
            {attendance?.workMode ? "Selected work mode" : "No attendance yet"}
          </small>
        </div>

        <div className="employeeMetricCard status">
          <span>Current Status</span>
          <strong>
            {isCheckedIn
              ? idleRef.current
                ? "IDLE"
                : "ACTIVE"
              : isCheckedOut
                ? "CHECKED OUT"
                : "OFFLINE"}
          </strong>
          <small>
            {isCheckedIn
              ? idleRef.current
                ? "No recent activity"
                : "Work session running"
              : isCheckedOut
                ? "Today's session ended"
                : "Work session not started"}
          </small>
        </div>

        <div className="employeeMetricCard time">
          <span>Logged-in Time</span>
          <strong>{formatDurationSeconds(loggedInSeconds)}</strong>
          <small>Total time since login</small>
        </div>

        <div className="employeeMetricCard active">
          <span>Active Work Time</span>
          <strong>{formatDurationSeconds(activeSeconds)}</strong>
          <small>Logged-in − break − idle</small>
        </div>

        <div className="employeeMetricCard break">
          <span>Break Time</span>
          <strong>{formatDurationSeconds(breakSeconds)}</strong>
          <small>Total break time today</small>
        </div>

        <div className="employeeMetricCard idle">
          <span>Idle Time</span>
          <strong>{formatDurationSeconds(idleSeconds)}</strong>
          <small>Detected inactive time today</small>
        </div>

        <div className="employeeMetricCard required">
          <span>Required Time</span>
          <strong>{formatDurationSeconds(requiredSeconds)}</strong>
          <small>Today's required working time</small>
        </div>

        <div className="employeeMetricCard remaining">
          <span>{remainingMinutes > 0 ? "Remaining Time" : "Extra Time"}</span>

          <strong>
            {formatDurationSeconds(
              remainingSeconds > 0 ? remainingSeconds : overtimeSeconds,
            )}
          </strong>

          <small>
            {remainingMinutes > 0
              ? "Required time remaining"
              : "Required time completed"}
          </small>
        </div>
      </section>

      <section className="employeeMainGrid">
        <div className="employeePanel">
          <div className="employeePanelHeader">
            <div>
              <h2>Today's Summary</h2>
              <p>Attendance and productivity summary for today.</p>
            </div>

            <div className="employeePanelIcon">
              <Activity size={18} />
            </div>
          </div>

          {attendance ? (
            <div className="employeeSummaryGrid">
              <div>
                <span>Work Mode</span>
                <b>{attendance.workMode || "—"}</b>
              </div>

              <div>
                <span>Login Time</span>
                <b>{timeWithSeconds(attendance.loginTime)}</b>
              </div>

              <div>
                <span>Logout Time</span>
                <b>{timeOnly(attendance.logoutTime)}</b>
              </div>

              <div>
                <span>Shortage</span>
                <b>{fmt(shortageMinutes)}</b>
              </div>

              <div>
                <span>Overtime</span>
                <b>{fmt(overtimeMinutes)}</b>
              </div>

              <div>
                <span>Task Tracked</span>
                <b>{fmt(taskMinutes)}</b>
              </div>

              <div>
                <span>Unallocated Active</span>
                <b>{fmt(Math.max(0, activeMinutes - taskMinutes))}</b>
              </div>

              <div className="employeeSummaryStatus">
                <span>Attendance Status</span>
                <span
                  className={`employeeStatusBadge ${statusClass(
                    attendance.status,
                  )}`}
                  title={statusLabel(attendance.status)}
                >
                  {statusLabel(attendance.status)}
                </span>
              </div>
            </div>
          ) : (
            <div className="employeeEmptyState">
              <Clock3 size={20} />
              <span>No attendance record for today.</span>
            </div>
          )}
        </div>

        <div className="employeePanel employeeTimelinePanel">
          <div className="employeePanelHeader employeeTimelineHeader">
            <div>
              <h2>Work Timeline</h2>
              <p>Track your work time by day, week and month.</p>
            </div>

            <div className="employeeTimelineHeaderRight">
              <div className="employeeTimelineViewSwitch">
                {(["DAY", "WEEK", "MONTH"] as const).map((view) => (
                  <button
                    key={view}
                    type="button"
                    className={timelineView === view ? "active" : ""}
                    onClick={() => setTimelineView(view)}
                  >
                    {view === "DAY"
                      ? "Day"
                      : view === "WEEK"
                        ? "Week"
                        : "Month"}
                  </button>
                ))}
              </div>

              <div className="employeePanelIcon">
                <Clock3 size={18} />
              </div>
            </div>
          </div>

          <div className="employeeSimpleTimeline">
            <div className="employeeTimelineSummary">
              <div>
                <span>Login</span>
                <strong>{timeWithSeconds(attendance?.loginTime)}</strong>
              </div>
              <div>
                <span>Logout</span>
                <strong>{timeWithSeconds(attendance?.logoutTime)}</strong>
              </div>
              <div>
                <span>Active</span>
                <strong>
                  {timelineView === "DAY"
                    ? formatDurationSeconds(activeSeconds)
                    : formatDurationSeconds(
                        Math.max(
                          0,
                          timelineRows.reduce(
                            (sum, row) =>
                              sum + (Number(row.activeMinutes) || 0),
                            0,
                          ) * 60,
                        ),
                      )}
                </strong>
              </div>
            </div>

            <div className="employeeSimpleTimelineLegend">
              <span>
                <i className="active" /> Active
              </span>
              <span>
                <i className="inactive" /> Break + Idle
              </span>
            </div>

            <div
              className={`employeeSimpleTimelineRows ${
                timelineView === "MONTH" ? "month" : ""
              }`}
            >
              {timelineRows.map((row) => {
                const logged =
                  Number(row.loggedInMinutes) ||
                  Math.max(
                    0,
                    (Number(row.activeMinutes) || 0) +
                      (Number(row.breakMinutes) || 0) +
                      (Number(row.idleMinutes) || 0),
                  );

                const active = Math.max(0, Number(row.activeMinutes) || 0);
                const inactive = Math.max(
                  0,
                  Math.min(
                    Math.max(0, logged),
                    (Number(row.breakMinutes) || 0) +
                      (Number(row.idleMinutes) || 0),
                  ),
                );

                const activeWidth =
                  timelineMaxMinutes > 0
                    ? Math.min(100, (active / timelineMaxMinutes) * 100)
                    : 0;

                const inactiveWidth =
                  timelineMaxMinutes > 0
                    ? Math.min(
                        100 - activeWidth,
                        (inactive / timelineMaxMinutes) * 100,
                      )
                    : 0;

                return (
                  <div className="employeeSimpleTimelineRow" key={row.key}>
                    <div className="employeeSimpleTimelineLabel">
                      <strong>{row.label}</strong>
                      <small>{row.dateLabel}</small>
                    </div>

                    <div className="employeeSimpleTimelineTrack">
                      <span
                        className="employeeSimpleTimelineActive"
                        style={{ width: `${activeWidth}%` }}
                        title={`Active: ${formatDurationSeconds(active * 60)}`}
                      />
                      <span
                        className="employeeSimpleTimelineInactive"
                        style={{
                          left: `${activeWidth}%`,
                          width: `${inactiveWidth}%`,
                        }}
                        title={`Break + Idle: ${formatDurationSeconds(
                          inactive * 60,
                        )}`}
                      />
                    </div>

                    <div className="employeeSimpleTimelineValue">
                      {formatDurationSeconds(active * 60)}
                    </div>
                  </div>
                );
              })}
            </div>

            {timelineView === "DAY" && (
              <div className="employeeDayTimelineNote">
                <span>
                  {attendance?.loginTime
                    ? `Login ${timeWithSeconds(attendance.loginTime)}`
                    : "Not logged in"}
                </span>
                <span>
                  {attendance?.logoutTime
                    ? `Logout ${timeWithSeconds(attendance.logoutTime)}`
                    : isCheckedIn
                      ? `Working now · ${timeWithSeconds(new Date(now).toISOString())}`
                      : "Logout not recorded"}
                </span>
              </div>
            )}

            {!timelineRows.some((row) => Number(row.activeMinutes) > 0) && (
              <div className="employeeEmptyState employeeTimelineEmpty">
                <CalendarDays size={20} />
                <span>
                  No attendance time is recorded for the selected period.
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="employeePanel employeeTasksPanel">
        <div className="employeePanelHeader">
          <div>
            <h2>Today's Tasks</h2>
            <p>Your assigned open tasks.</p>
          </div>

          <a href="/employee/tasks" className="employeeViewAll">
            View All
          </a>
        </div>

        {tasksQ.isLoading ? (
          <div className="employeeTaskLoading">Loading assigned tasks…</div>
        ) : tasks.length ? (
          <>
            <style>{`
              .employeeTaskItemClickable {
                cursor: pointer;
                border-radius: 9px;
                padding-left: 15px;
                padding-right: 15px;
                transition: background-color 0.18s ease;
              }

              .employeeTaskItemClickable .employeeTaskInfo strong {
                transition: color 0.18s ease;
              }

              .employeeTaskItemClickable:hover {
                background: #f8fafc;
              }

              .employeeTaskItemClickable:hover .employeeTaskInfo strong {
                color: #2563eb;
              }

              .employeeTaskOpenPageBtn {
                transition: background-color 0.18s ease, color 0.18s ease,
                  border-color 0.18s ease, transform 0.18s ease,
                  box-shadow 0.18s ease;
              }

              .employeeTaskOpenPageBtn svg {
                transition: transform 0.18s ease;
              }

              .employeeTaskOpenPageBtn:hover {
                color: #1d4ed8;
                background: #eff6ff;
                border-color: #bfdbfe;
                transform: translateY(-1px);
                box-shadow: 0 5px 12px rgba(37, 99, 235, 0.12);
              }

              .employeeTaskOpenPageBtn:hover svg {
                transform: translateX(2px);
              }

              .employeeTaskOpenPageBtn:active {
                transform: translateY(0);
                box-shadow: none;
              }
            `}</style>

            <div className="employeeTaskList">
              {tasks.map((task) => (
                <div
                  className="employeeTaskItem employeeTaskItemClickable"
                  key={task.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openTaskDetails(task)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openTaskDetails(task);
                    }
                  }}
                  title="Open task details"
                >
                  <div className="employeeTaskInfo">
                    <strong>{task.title}</strong>

                    <span>
                      {task.taskNumber || "Task"}{" "}
                      {task.project?.name ? `· ${task.project.name}` : ""}
                    </span>
                  </div>

                  <div className="employeeTaskMeta">
                    {task.status && (
                      <span className="employeeTaskStatus">
                        {statusLabel(task.status)}
                      </span>
                    )}

                    {task.priority && (
                      <span className="employeeTaskPriority">
                        {task.priority}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="employeeEmptyState employeeTaskEmpty">
            <CheckSquare size={20} />
            <span>No open tasks assigned to you.</span>
          </div>
        )}
      </section>

      {selectedTask && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedTask(null);
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            background: "rgba(15, 23, 42, 0.48)",
            backdropFilter: "blur(2px)",
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="employeeTaskModalTitle"
            onMouseDown={(event) => event.stopPropagation()}
            style={{
              width: "min(680px, 100%)",
              maxHeight: "calc(100vh - 40px)",
              overflow: "auto",
              background: "#fff",
              border: "1px solid #dce3ea",
              borderRadius: 14,
              boxShadow: "0 18px 45px rgba(15, 23, 42, 0.18)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 14,
                padding: "16px 18px",
                borderBottom: "1px solid #e7edf3",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    color: "#64748b",
                    fontSize: 10,
                    fontWeight: 650,
                  }}
                >
                  {selectedTask.taskNumber || "Task"}
                </div>
                <h2
                  id="employeeTaskModalTitle"
                  style={{
                    margin: "4px 0 0",
                    color: "#0f172a",
                    fontSize: 18,
                    lineHeight: 1.25,
                    fontWeight: 750,
                  }}
                >
                  {selectedTask.title}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                aria-label="Close task details"
                title="Close"
                style={{
                  width: 32,
                  height: 32,
                  flex: "0 0 32px",
                  border: "1px solid #dce3ea",
                  borderRadius: 8,
                  color: "#64748b",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: 20,
                  lineHeight: 1,
                  fontFamily: "sans-serif",
                }}
              >
                x
              </button>
            </div>

            <div style={{ padding: "16px 18px" }}>
              {selectedTask.description && (
                <div
                  style={{
                    marginBottom: 14,
                    padding: "11px 12px",
                    color: "#475569",
                    background: "#f8fafc",
                    border: "1px solid #e7edf3",
                    borderRadius: 9,
                    fontSize: 11,
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {selectedTask.description}
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 9,
                }}
              >
                {[
                  [
                    "Assigned By",
                    selectedTask.assignedBy?.fullName ||
                      selectedTask.assignedBy?.employeeId ||
                      "—",
                  ],
                  [
                    "Assigned To",
                    selectedTask.assignedTo?.fullName ||
                      selectedTask.assignedTo?.employeeId ||
                      employeeName,
                  ],
                  ["Project", selectedTask.project?.name || "No Project"],
                  ["Priority", statusLabel(selectedTask.priority)],
                  ["Status", statusLabel(selectedTask.status)],
                  [
                    "Due Date",
                    selectedTask.dueDate
                      ? new Date(selectedTask.dueDate).toLocaleDateString(
                          "en-IN",
                          {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          },
                        )
                      : "—",
                  ],
                  [
                    "Estimated Time",
                    selectedTask.estimatedMinutes
                      ? formatDurationSeconds(
                          Number(selectedTask.estimatedMinutes) * 60,
                        )
                      : "—",
                  ],
                  [
                    "Actual Time",
                    formatDurationSeconds(
                      Number(selectedTask.actualMinutes || 0) * 60,
                    ),
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    style={{
                      minWidth: 0,
                      padding: "11px 12px",
                      border: "1px solid #e7edf3",
                      borderRadius: 9,
                      background: "#fff",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        color: "#020202",
                        fontSize: 10,
                      }}
                    >
                      {label}
                    </span>
                    <strong
                      style={{
                        display: "block",
                        marginTop: 5,
                        color: "#0f172a",
                        fontSize: 12,
                        fontWeight: 700,
                        lineHeight: 1.35,
                      }}
                    >
                      {value}
                    </strong>
                  </div>
                ))}

                {activeTaskId === selectedTask.id && (
                  <div
                    style={{
                      marginTop: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "10px 12px",
                      border: "1px solid #dbeafe",
                      borderRadius: 9,
                      background: "#eff6ff",
                    }}
                  >
                    <div>
                      <span
                        style={{
                          display: "block",
                          color: "#2563eb",
                          fontSize: 9,
                          fontWeight: 750,
                          letterSpacing: 0.3,
                        }}
                      >
                        TASK TIMER RUNNING
                      </span>
                      <strong
                        style={{
                          display: "block",
                          marginTop: 3,
                          color: "#0f172a",
                          fontSize: 16,
                          lineHeight: 1.2,
                        }}
                      >
                        {formatDurationSeconds(activeTaskTimerSeconds)}
                      </strong>
                    </div>
                    <Timer size={18} color="#2563eb" />
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
                padding: "12px 18px 16px",
                borderTop: "1px solid #e7edf3",
              }}
            >
              <button
                type="button"
                onClick={openTaskPage}
                className="employeeTaskOpenPageBtn"
                style={{
                  minHeight: 36,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  padding: "0 12px",
                  border: "1px solid #cbd5e1",
                  borderRadius: 9,
                  color: "#475569",
                  background: "#fff",
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 650,
                  cursor: "pointer",
                }}
              >
                <ExternalLink size={15} />
                Open Task Page
              </button>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginLeft: "auto",
                }}
              >
                {selectedTask.status !== "COMPLETED" &&
                  selectedTask.status !== "CANCELLED" && (
                    <button
                      type="button"
                      disabled={
                        Boolean(taskActionLoading) ||
                        (Boolean(activeTaskId) &&
                          activeTaskId !== selectedTask.id)
                      }
                      onClick={() =>
                        handleTaskTimerAction(
                          selectedTask,
                          activeTaskId === selectedTask.id
                            ? "pause"
                            : selectedTask.status === "IN_PROGRESS"
                              ? "resume"
                              : "start",
                        )
                      }
                      style={{
                        minHeight: 36,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 7,
                        padding: "0 13px",
                        border: "1px solid #2563eb",
                        borderRadius: 9,
                        color: "#fff",
                        background: "#2563eb",
                        fontFamily: "inherit",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        opacity:
                          taskActionLoading ||
                          (activeTaskId && activeTaskId !== selectedTask.id)
                            ? 0.65
                            : 1,
                      }}
                    >
                      {activeTaskId === selectedTask.id ? (
                        <Pause size={14} />
                      ) : (
                        <Play size={14} />
                      )}
                      {activeTaskId === selectedTask.id
                        ? "Pause"
                        : selectedTask.status === "IN_PROGRESS"
                          ? "Resume"
                          : "Start"}
                    </button>
                  )}

                {selectedTask.status !== "COMPLETED" &&
                  selectedTask.status !== "CANCELLED" && (
                    <button
                      type="button"
                      disabled={Boolean(taskActionLoading)}
                      onClick={() => handleCompleteTask(selectedTask)}
                      style={{
                        minHeight: 36,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 7,
                        padding: "0 13px",
                        border: "1px solid #16a34a",
                        borderRadius: 9,
                        color: "#fff",
                        background: "#16a34a",
                        fontFamily: "inherit",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        opacity: taskActionLoading ? 0.65 : 1,
                      }}
                    >
                      <CheckCircle2 size={14} />
                      Complete
                    </button>
                  )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
