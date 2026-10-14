import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Activity,
  Coffee,
  LogIn,
  LogOut,
  Pause,
  Play,
  Square,
  UserRound,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  ListTodo,
  RefreshCw,
  UserCheck,
  Users,
  Wifi,
  X,
} from "lucide-react";

import "../manager-dashboard.css";

import { get, patch, post } from "../api/client";

import type { Attendance, Employee, LeaveRequest, Task } from "../types";

/* =========================================================

   HELPERS

\========================================================= */

function list<T>(data: any): T[] {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.items)) {
    return data.items;
  }

  if (Array.isArray(data?.data)) {
    return data.data;
  }

  return [];
}

function minutes(value: number | undefined | null) {
  const total = Math.max(0, Number(value || 0));

  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`;
}

function timeOnly(value?: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",

    minute: "2-digit",
  });
}

function minutesBetween(start?: string | null, end?: string | null) {
  if (!start) return 0;
  const from = new Date(start).getTime();
  const to = end ? new Date(end).getTime() : Date.now();
  return Number.isFinite(from) && Number.isFinite(to)
    ? Math.max(0, Math.floor((to - from) / 60000))
    : 0;
}

function dateOnly(value?: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",

    month: "short",

    year: "numeric",
  });
}

function statusLabel(value?: string | null) {
  if (!value) {
    return "—";
  }

  return String(value)
    .replaceAll("_", " ")

    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function isToday(value?: string | null) {
  if (!value) {
    return false;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const today = new Date();

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function isActiveEmployee(employee: Employee) {
  const employmentStatus = String(
    employee.employmentStatus || "",
  ).toUpperCase();

  const accountStatus = String(employee.accountStatus || "").toUpperCase();

  return employmentStatus === "ACTIVE" || accountStatus === "ACTIVE";
}

function isPresentStatus(status?: string) {
  return [
    "PRESENT",

    "LATE",

    "PRESENT_WITH_INSUFFICIENT_HOURS",

    "EARLY_LOGOUT",
  ].includes(String(status || "").toUpperCase());
}

function isCompletedTask(status?: string) {
  return String(status || "").toUpperCase() === "COMPLETED";
}

function isCancelledTask(status?: string) {
  return String(status || "").toUpperCase() === "CANCELLED";
}

function isOverdueTask(task: Task) {
  if (!task.dueDate) {
    return false;
  }

  if (isCompletedTask(task.status) || isCancelledTask(task.status)) {
    return false;
  }

  const dueDate = new Date(task.dueDate);

  if (Number.isNaN(dueDate.getTime())) {
    return false;
  }

  return dueDate.getTime() < Date.now();
}

/* =========================================================

   PERSONAL DASHBOARD HELPERS

\========================================================= */

type PersonalAttendance = Attendance & {
  workEvents?: { id?: string; type: string; occurredAt: string }[];
};

type PersonalTask = Task & {
  timers?: { id?: string; startedAt?: string; endedAt?: string | null }[];
};

type PersonalHistoryRow = {
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

type ManagerSettings = {
  allowWFO?: boolean;

  allowWFH?: boolean;

  idleThresholdMinutes?: number;

  idleWarningSeconds?: number;

  requiredMinutes?: number;
};

function duration(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));

  const hours = Math.floor(safe / 3600);

  const mins = Math.floor((safe % 3600) / 60);

  const secs = safe % 60;

  return [hours, mins, secs].map((v) => String(v).padStart(2, "0")).join(":");
}

function timeWithSeconds(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",

    minute: "2-digit",

    second: "2-digit",
  });
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

function greeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good Morning";

  if (hour < 17) return "Good Afternoon";

  return "Good Evening";
}

/* =========================================================

   COMPONENT

\========================================================= */

export default function ManagerDashboard() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  /* -------------------------------------------------------

     API

  ------------------------------------------------------- */

  const meQ = useQuery({
    queryKey: ["manager-dashboard", "auth-me"],

    queryFn: () => get("/auth/me"),

    staleTime: 60000,
  });

  const settingsQ = useQuery<ManagerSettings>({
    queryKey: ["settings"],
    queryFn: () => get("/settings"),
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const personalAttendanceQ = useQuery<PersonalAttendance>({
    queryKey: ["manager-dashboard", "personal-attendance"],

    queryFn: () => get("/attendance/today"),

    refetchInterval: 15000,
  });

  const personalBreaksQ = useQuery({
    queryKey: ["manager-dashboard", "personal-breaks"],
    queryFn: () => get("/breaks/today"),
    refetchInterval: 15000,
  });

  const personalTasksQ = useQuery({
    queryKey: ["manager-dashboard", "personal-tasks"],
    queryFn: () =>
      meQ.data?.employee?.id
        ? get(
            `/tasks?scope=OWN&assignedToId=${encodeURIComponent(
              meQ.data.employee.id,
            )}`,
          )
        : Promise.resolve([]),
    enabled: Boolean(meQ.data?.employee?.id),
    refetchInterval: 30000,
  });

  const activeTaskTimerQ = useQuery({
    queryKey: ["manager-dashboard", "personal-active-task-timer"],
    queryFn: () => get("/task-timers/active"),
    refetchInterval: 15000,
  });

  const personalHistoryQ = useQuery({
    queryKey: ["manager-dashboard", "personal-history"],

    queryFn: () => get("/attendance/history"),

    refetchInterval: 60000,
  });

  const employeesQ = useQuery({
    queryKey: ["manager-dashboard", "employees"],

    queryFn: () => get("/employees"),

    refetchInterval: 30000,
  });

  const attendanceQ = useQuery({
    queryKey: ["manager-dashboard", "attendance"],

    queryFn: () => get("/attendance/company"),

    refetchInterval: 30000,
  });

  const leavesQ = useQuery({
    queryKey: ["manager-dashboard", "leaves"],

    queryFn: () => get("/leaves"),

    refetchInterval: 30000,
  });

  const tasksQ = useQuery({
    queryKey: ["manager-dashboard", "tasks"],

    queryFn: () => get("/tasks"),

    refetchInterval: 30000,
  });

  /* -------------------------------------------------------

     STATES

  ------------------------------------------------------- */

  const [selectedAttendance, setSelectedAttendance] =
    useState<Attendance | null>(null);

  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [pendingLeavesOpen, setPendingLeavesOpen] = useState(false);
  const [selectedTeamCard, setSelectedTeamCard] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<PersonalTask | null>(null);
  const [taskActionLoading, setTaskActionLoading] = useState<string>("");
  const [leaveActionLoading, setLeaveActionLoading] = useState<string>("");

  const [dashboardMode, setDashboardMode] = useState<"MY" | "TEAM">("MY");

  const [now, setNow] = useState(Date.now());

  const [selectedWorkMode, setSelectedWorkMode] = useState<
    "WFO" | "WFH" | null
  >(null);

  const [personalActionLoading, setPersonalActionLoading] = useState<
    "CHECK_IN" | "LOGOUT" | "BREAK" | "REFRESH" | null
  >(null);

  const [personalWarning, setPersonalWarning] = useState(false);

  const lastActivity = useRef(Date.now());

  const idleRef = useRef(false);

  const employees = list<Employee>(employeesQ.data);

  const attendance = list<Attendance>(attendanceQ.data);

  const leaves = list<LeaveRequest>(leavesQ.data);

  const tasks = list<Task>(tasksQ.data);

  const managerEmployee: Employee | undefined = meQ.data?.employee;

  const personalAttendance = personalAttendanceQ.data;

  const personalBreakRows = list<any>(personalBreaksQ.data?.rows);
  const personalBreakTotalMinutes =
    Number(personalBreaksQ.data?.totalMinutes) || 0;
  const personalTasks = list<PersonalTask>(personalTasksQ.data);

  const personalHistory = list<PersonalHistoryRow>(personalHistoryQ.data);

  const managerName = managerEmployee?.fullName?.trim() || "Manager";

  const managerEmployeeId = managerEmployee?.employeeId?.trim() || "";

  const managerDesignation = managerEmployee?.designation?.trim() || "Manager";

  const managerDepartment = managerEmployee?.department?.name?.trim() || "";

  const allowWFO = settingsQ.data?.allowWFO === true;

  const allowWFH = settingsQ.data?.allowWFH === true;

  const personalCheckedIn = Boolean(
    personalAttendance?.loginTime && !personalAttendance?.logoutTime,
  );

  const personalCheckedOut = Boolean(
    personalAttendance?.loginTime && personalAttendance?.logoutTime,
  );

  const personalOffline = !personalAttendance?.loginTime;

  const personalLoggedInSeconds = personalAttendance?.loginTime
    ? Math.max(
        0,
        Math.floor(
          ((personalAttendance.logoutTime
            ? new Date(personalAttendance.logoutTime)
            : new Date(now)
          ).getTime() -
            new Date(personalAttendance.loginTime).getTime()) /
            1000,
        ),
      )
    : 0;

  const personalBreakMinutes = Math.max(
    Number(personalAttendance?.breakMinutes) || 0,
    personalBreakTotalMinutes,
  );

  const personalIdleMinutes = Number(personalAttendance?.idleMinutes) || 0;

  const personalBackendActiveSeconds = Math.max(
    0,
    (Number(personalAttendance?.activeMinutes) || 0) * 60,
  );

  const personalLiveActiveSeconds = Math.max(
    0,
    personalLoggedInSeconds -
      personalBreakMinutes * 60 -
      personalIdleMinutes * 60,
  );

  const personalActiveSeconds = personalAttendance?.logoutTime
    ? personalBackendActiveSeconds
    : Math.max(personalBackendActiveSeconds, personalLiveActiveSeconds);

  const personalActiveMinutes = Math.floor(personalActiveSeconds / 60);

  const personalRequiredMinutes = Math.max(
    0,
    Number(
      personalAttendance?.requiredMinutes ??
        settingsQ.data?.requiredMinutes ??
        480,
    ) || 480,
  );

  const personalRequiredSeconds = personalRequiredMinutes * 60;

  const personalShortageMinutes =
    personalAttendance?.shortageMinutes !== undefined
      ? Number(personalAttendance.shortageMinutes) || 0
      : Math.max(0, personalRequiredMinutes - personalActiveMinutes);

  const personalOvertimeMinutes =
    personalAttendance?.overtimeMinutes !== undefined
      ? Number(personalAttendance.overtimeMinutes) || 0
      : Math.max(0, personalActiveMinutes - personalRequiredMinutes);

  const personalHistoryByDate = useMemo(() => {
    const map = new Map<string, PersonalHistoryRow>();

    personalHistory.forEach((row) => {
      const key = row.date
        ? localDateKey(row.date)
        : row.loginTime
          ? localDateKey(row.loginTime)
          : "";

      if (key) map.set(key, row);
    });

    if (personalAttendance?.date) {
      const key = localDateKey(personalAttendance.date);

      if (key) map.set(key, personalAttendance);
    }

    return map;
  }, [personalHistory, personalAttendance]);

  const personalIsBreakActive = Boolean(
    personalCheckedIn && personalBreakRows.some((row) => !row?.endedAt),
  );

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);

    const events = [
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

        qc.invalidateQueries({
          queryKey: ["manager-dashboard", "personal-attendance"],
        });
      }

      setPersonalWarning(false);
    };

    events.forEach((event) => window.addEventListener(event, onActivity));

    const idleTimer = window.setInterval(() => {
      if (!personalAttendance?.loginTime || personalAttendance?.logoutTime)
        return;

      const threshold =
        (Number(settingsQ.data?.idleThresholdMinutes) || 5) * 60000;

      const warningWindow = Math.min(threshold, Math.max(0, Number(settingsQ.data?.idleWarningSeconds ?? 60)) * 1000);

      const elapsed = Date.now() - lastActivity.current;

      if (elapsed >= threshold && !idleRef.current) {
        idleRef.current = true;

        post("/idle/heartbeat", { active: false })
          .then(() =>
            qc.invalidateQueries({
              queryKey: ["manager-dashboard", "personal-attendance"],
            }),
          )

          .catch(() => {});
      } else if (elapsed >= Math.max(0, threshold - warningWindow)) {
        setPersonalWarning(true);
      }
    }, 10000);

    return () => {
      window.clearInterval(clock);

      window.clearInterval(idleTimer);

      events.forEach((event) => window.removeEventListener(event, onActivity));
    };
  }, [
    personalAttendance?.loginTime,
    personalAttendance?.logoutTime,
    settingsQ.data?.idleThresholdMinutes,
    settingsQ.data?.idleWarningSeconds,
    qc,
  ]);

  async function managerCheckIn() {
    if (!selectedWorkMode) {
      window.alert("Please select WFO or WFH before login.");

      return;
    }

    if (selectedWorkMode === "WFO" && !allowWFO) {
      window.alert("Work From Office is currently disabled by administrator.");

      return;
    }

    if (selectedWorkMode === "WFH" && !allowWFH) {
      window.alert("Work From Home is currently disabled by administrator.");

      return;
    }

    try {
      setPersonalActionLoading("CHECK_IN");

      await post("/attendance/check-in", { workMode: selectedWorkMode });

      lastActivity.current = Date.now();

      idleRef.current = false;

      setSelectedWorkMode(null);

      await qc.invalidateQueries({
        queryKey: ["manager-dashboard", "personal-attendance"],
      });
    } catch (error: any) {
      window.alert(
        error?.response?.data?.message || "Unable to start attendance.",
      );
    } finally {
      setPersonalActionLoading(null);
    }
  }

  async function managerCheckOut() {
    try {
      setPersonalActionLoading("LOGOUT");

      await post("/attendance/check-out");

      idleRef.current = false;

      await qc.invalidateQueries({
        queryKey: ["manager-dashboard", "personal-attendance"],
      });
    } catch (error: any) {
      window.alert(error?.response?.data?.message || "Unable to check out.");
    } finally {
      setPersonalActionLoading(null);
    }
  }

  const activeTaskTimer = useMemo<any>(() => {
    const data = activeTaskTimerQ.data;
    if (!data) return null;
    if (Array.isArray(data)) return data[0] || null;
    return data?.data || data?.timer || data || null;
  }, [activeTaskTimerQ.data]);

  const activeTaskId =
    activeTaskTimer?.taskId || activeTaskTimer?.task?.id || null;

  async function handlePersonalTaskTimer(
    task: PersonalTask,
    action: "start" | "pause" | "resume" | "stop",
  ) {
    setTaskActionLoading(`${task.id}:${action}`);

    try {
      await post(`/tasks/${task.id}/timer/${action}`);

      if (
        (action === "start" || action === "resume") &&
        task.status !== "IN_PROGRESS" &&
        task.status !== "COMPLETED" &&
        task.status !== "CANCELLED"
      ) {
        await patch(`/tasks/${task.id}`, { status: "IN_PROGRESS" });
      }

      await Promise.all([
        qc.invalidateQueries({
          queryKey: ["manager-dashboard", "personal-tasks"],
        }),
        qc.invalidateQueries({
          queryKey: ["manager-dashboard", "personal-active-task-timer"],
        }),
        qc.invalidateQueries({
          queryKey: ["manager-dashboard", "personal-attendance"],
        }),
        qc.invalidateQueries({ queryKey: ["tasks"] }),
      ]);

      const refreshed = await personalTasksQ.refetch();
      const updated = list<PersonalTask>(refreshed.data).find(
        (item) => item.id === task.id,
      );

      if (updated) setSelectedTask(updated);
    } catch (error: any) {
      window.alert(
        error?.response?.data?.message ||
          "Task timer operation failed. Please try again.",
      );
    } finally {
      setTaskActionLoading("");
    }
  }

  async function completePersonalTask(task: PersonalTask) {
    setTaskActionLoading(`${task.id}:complete`);

    try {
      if (activeTaskId === task.id) {
        await post(`/tasks/${task.id}/timer/stop`);
      }

      await patch(`/tasks/${task.id}`, { status: "COMPLETED" });

      await Promise.all([
        qc.invalidateQueries({
          queryKey: ["manager-dashboard", "personal-tasks"],
        }),
        qc.invalidateQueries({
          queryKey: ["manager-dashboard", "personal-active-task-timer"],
        }),
        qc.invalidateQueries({
          queryKey: ["manager-dashboard", "personal-attendance"],
        }),
        qc.invalidateQueries({ queryKey: ["tasks"] }),
      ]);

      setSelectedTask(null);
      await personalTasksQ.refetch();
    } catch (error: any) {
      window.alert(
        error?.response?.data?.message ||
          "Unable to complete this task. Please try again.",
      );
    } finally {
      setTaskActionLoading("");
    }
  }

  async function reviewTeamLeave(
    leave: LeaveRequest,
    action: "APPROVE" | "REJECT",
  ) {
    const employeeName = leave.employee?.fullName || "this employee";

    if (
      !window.confirm(
        `Are you sure you want to ${
          action === "APPROVE" ? "approve" : "reject"
        } the leave request of ${employeeName}?`,
      )
    ) {
      return;
    }

    setLeaveActionLoading(leave.id);

    try {
      if (action === "REJECT") {
        const reason = window.prompt("Enter rejection reason:");
        if (!reason?.trim()) {
          window.alert("A rejection reason is required.");
          return;
        }

        await patch(`/leaves/${leave.id}/reject`, {
          reviewComment: reason.trim(),
        });
      } else {
        await patch(`/leaves/${leave.id}/approve`, {
          reviewComment: "",
        });
      }

      setSelectedLeave(null);
      await qc.invalidateQueries({
        queryKey: ["manager-dashboard", "leaves"],
      });
      await leavesQ.refetch();
    } catch (error: any) {
      window.alert(
        error?.response?.data?.message ||
          `Unable to ${action.toLowerCase()} this leave request.`,
      );
    } finally {
      setLeaveActionLoading("");
    }
  }

  const personalTimelineRows = useMemo(() => {
    const today = new Date(now);

    today.setHours(0, 0, 0, 0);

    const monday = new Date(today);

    const day = monday.getDay();

    monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);

      date.setDate(monday.getDate() + index);

      const key = localDateKey(date);

      const row = personalHistoryByDate.get(key);

      const isTodayRow = key === localDateKey(today);

      return {
        key,

        label: date.toLocaleDateString("en-IN", { weekday: "short" }),

        dateLabel: date.toLocaleDateString("en-IN", { day: "numeric" }),

        activeMinutes: isTodayRow
          ? personalActiveMinutes
          : Number(row?.activeMinutes) || 0,

        loggedInMinutes: isTodayRow
          ? Math.floor(personalLoggedInSeconds / 60)
          : Number(row?.loggedInMinutes) || 0,

        breakMinutes: isTodayRow
          ? personalBreakMinutes
          : Number(row?.breakMinutes) || 0,

        idleMinutes: isTodayRow
          ? personalIdleMinutes
          : Number(row?.idleMinutes) || 0,
      };
    });
  }, [
    now,
    personalHistoryByDate,
    personalActiveMinutes,
    personalLoggedInSeconds,
    personalBreakMinutes,
    personalIdleMinutes,
  ]);

  /* -------------------------------------------------------

     LOADING / REFRESH

  ------------------------------------------------------- */

  const loading =
    meQ.isLoading ||
    settingsQ.isLoading ||
    personalAttendanceQ.isLoading ||
    personalBreaksQ.isLoading ||
    personalTasksQ.isLoading ||
    activeTaskTimerQ.isLoading ||
    employeesQ.isLoading ||
    attendanceQ.isLoading ||
    leavesQ.isLoading ||
    tasksQ.isLoading;

  const refreshing =
    meQ.isFetching ||
    settingsQ.isFetching ||
    personalAttendanceQ.isFetching ||
    personalBreaksQ.isFetching ||
    personalTasksQ.isFetching ||
    activeTaskTimerQ.isFetching ||
    personalHistoryQ.isFetching ||
    employeesQ.isFetching ||
    attendanceQ.isFetching ||
    leavesQ.isFetching ||
    tasksQ.isFetching;

  const refresh = async () => {
    await Promise.all([
      meQ.refetch(),

      settingsQ.refetch(),

      personalAttendanceQ.refetch(),

      personalBreaksQ.refetch(),

      personalTasksQ.refetch(),

      activeTaskTimerQ.refetch(),

      personalHistoryQ.refetch(),

      employeesQ.refetch(),

      attendanceQ.refetch(),

      leavesQ.refetch(),

      tasksQ.refetch(),
    ]);
  };

  /* -------------------------------------------------------

     IMPORTANT FIX



     Attendance API may not contain designation.



     Therefore find the complete employee object from

     /employees using employee.id / employeeId.



     This guarantees designation is taken from the

     employee master data.

  ------------------------------------------------------- */

  const selectedEmployee = useMemo(() => {
    if (!selectedAttendance) {
      return null;
    }

    const attendanceEmployee = selectedAttendance.employee;

    if (!attendanceEmployee) {
      return null;
    }

    return (
      employees.find(
        (employee) =>
          employee.id === attendanceEmployee.id ||
          employee.employeeId === attendanceEmployee.employeeId,
      ) || null
    );
  }, [employees, selectedAttendance]);

  /* -------------------------------------------------------

     FINAL EMPLOYEE DISPLAY VALUES



     Use selectedEmployee first.

     Attendance employee is fallback.

  ------------------------------------------------------- */

  const selectedEmployeeName =
    selectedEmployee?.fullName || selectedAttendance?.employee?.fullName || "—";

  const selectedEmployeeId =
    selectedEmployee?.employeeId ||
    selectedAttendance?.employee?.employeeId ||
    "—";

  const selectedDesignation =
    selectedEmployee?.designation ||
    selectedAttendance?.employee?.designation ||
    "—";

  const selectedDepartment =
    selectedEmployee?.department?.name ||
    selectedAttendance?.employee?.department?.name ||
    "—";

  const selectedPhone =
    selectedEmployee?.phone || selectedAttendance?.employee?.phone || "—";

  /* -------------------------------------------------------

     TODAY ATTENDANCE

  ------------------------------------------------------- */

  const todayAttendance = useMemo(() => {
    return attendance.filter((item) => {
      if (item.date && isToday(item.date)) {
        return true;
      }

      if (item.loginTime && isToday(item.loginTime)) {
        return true;
      }

      return false;
    });
  }, [attendance]);

  /* -------------------------------------------------------

     DASHBOARD CALCULATIONS

  ------------------------------------------------------- */

  const activeEmployees = useMemo(() => {
    return employees.filter(isActiveEmployee);
  }, [employees]);

  const presentToday = useMemo(() => {
    return todayAttendance.filter((item) => isPresentStatus(item.status))
      .length;
  }, [todayAttendance]);

  const wfhToday = useMemo(() => {
    return todayAttendance.filter(
      (item) => String(item.workMode || "").toUpperCase() === "WFH",
    ).length;
  }, [todayAttendance]);

  const pendingLeaves = useMemo(() => {
    return leaves.filter(
      (leave) => String(leave.status || "").toUpperCase() === "PENDING",
    );
  }, [leaves]);

  const openTasks = useMemo(() => {
    return tasks.filter(
      (task) => !isCompletedTask(task.status) && !isCancelledTask(task.status),
    );
  }, [tasks]);

  const completedTasks = useMemo(() => {
    return tasks.filter((task) => isCompletedTask(task.status)).length;
  }, [tasks]);

  const overdueTasks = useMemo(() => {
    return tasks.filter(isOverdueTask);
  }, [tasks]);

  const lateToday = useMemo(() => {
    return todayAttendance.filter(
      (item) => String(item.status || "").toUpperCase() === "LATE",
    ).length;
  }, [todayAttendance]);

  const insufficientToday = useMemo(() => {
    return todayAttendance.filter(
      (item) =>
        String(item.status || "").toUpperCase() ===
        "PRESENT_WITH_INSUFFICIENT_HOURS",
    ).length;
  }, [todayAttendance]);

  const completionRate =
    tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

  const recentAttendance = useMemo(() => {
    return [...attendance]

      .sort(
        (a, b) =>
          new Date(b.loginTime || b.date || 0).getTime() -
          new Date(a.loginTime || a.date || 0).getTime(),
      )

      .slice(0, 10);
  }, [attendance]);

  /* -------------------------------------------------------

     ERROR

  ------------------------------------------------------- */

  const hasError =
    employeesQ.isError ||
    attendanceQ.isError ||
    leavesQ.isError ||
    tasksQ.isError;

  /* -------------------------------------------------------

     CARDS

  ------------------------------------------------------- */

  const cards = [
    {
      title: "Team Members",

      value: activeEmployees.length,

      subtitle: `${employees.length} total employees`,

      icon: Users,
    },

    {
      title: "Present Today",

      value: presentToday,

      subtitle: `${todayAttendance.length} attendance records`,

      icon: CheckCircle2,
    },

    {
      title: "Work From Home",

      value: wfhToday,

      subtitle: "Today's WFH attendance",

      icon: Wifi,
    },

    {
      title: "Pending Leaves",

      value: pendingLeaves.length,

      subtitle: "Requests awaiting action",

      icon: CalendarClock,
    },

    {
      title: "Open Tasks",

      value: openTasks.length,

      subtitle: `${completedTasks} completed`,

      icon: ListTodo,
    },

    {
      title: "Completed Tasks",

      value: completedTasks,

      subtitle: `${completionRate}% completion rate`,

      icon: CheckCircle2,
    },

    {
      title: "Late Today",

      value: lateToday,

      subtitle: "Attendance marked late",

      icon: Clock3,
    },

    {
      title: "Insufficient Hours",

      value: insufficientToday,

      subtitle: "Needs attention",

      icon: Activity,
    },
  ] as const;

  const teamCardDetails: Record<string, { subtitle: string; columns: string[]; rows: string[][] }> = {
    "Today's Mode": {
      subtitle: "Your selected work arrangement for today",
      columns: ["Work Mode", "Login", "Logout", "Attendance Status"],
      rows: [[statusLabel(personalAttendance?.workMode), timeOnly(personalAttendance?.loginTime), timeOnly(personalAttendance?.logoutTime), personalCheckedIn ? (personalIsBreakActive ? "On Break" : "Working") : personalCheckedOut ? "Checked Out" : "Not Checked In"]],
    },
    "Current Status": {
      subtitle: "Your current attendance status",
      columns: ["Status", "Login", "Logout", "Work Mode"],
      rows: [[personalCheckedIn ? (personalIsBreakActive ? "On Break" : idleRef.current ? "Idle" : "Working") : personalCheckedOut ? "Checked Out" : "Offline", timeOnly(personalAttendance?.loginTime), timeOnly(personalAttendance?.logoutTime), statusLabel(personalAttendance?.workMode)]],
    },
    "Logged-in Time": {
      subtitle: "Your total time since checking in today",
      columns: ["Login", "Logout", "Total Logged-in", "Status"],
      rows: [[timeOnly(personalAttendance?.loginTime), timeOnly(personalAttendance?.logoutTime), duration(personalLoggedInSeconds), personalCheckedIn ? "In progress" : personalCheckedOut ? "Complete" : "Not started"]],
    },
    "Active Work Time": {
      subtitle: "Time spent actively working today",
      columns: ["Active Work", "Break Time", "Idle Time", "Task Tracked"],
      rows: [[duration(personalActiveSeconds), duration(personalBreakMinutes * 60), duration(personalIdleMinutes * 60), minutes(Number(personalAttendance?.taskMinutes || 0))]],
    },
    "Break Time": {
      subtitle: "Your break sessions for today",
      columns: ["Break Type", "Started", "Ended", "Duration"],
      rows: personalBreakRows.map((item) => [item.breakType?.name || item.type || "Break", timeOnly(item.startedAt), timeOnly(item.endedAt), duration(Math.max(0, Number(item.durationMinutes || 0)) * 60 || minutesBetween(item.startedAt, item.endedAt) * 60)]),
    },
    "Idle Time": {
      subtitle: "Detected inactive time today",
      columns: ["Idle Time", "Attendance Status", "Last Activity"],
      rows: [[duration(personalIdleMinutes * 60), statusLabel(personalAttendance?.status), timeOnly((personalAttendance as any)?.lastActivityAt)]],
    },
    "Required Time": {
      subtitle: "Your daily required work duration",
      columns: ["Required", "Completed", "Remaining"],
      rows: [[duration(personalRequiredSeconds), duration(personalActiveSeconds), duration(personalShortageMinutes * 60)]],
    },
    "Remaining Time": {
      subtitle: "Time remaining to meet today's work requirement",
      columns: ["Remaining", "Required", "Completed"],
      rows: [[duration(personalShortageMinutes * 60), duration(personalRequiredSeconds), duration(personalActiveSeconds)]],
    },
    "Extra Time": {
      subtitle: "Time worked beyond today's requirement",
      columns: ["Extra Time", "Required", "Completed"],
      rows: [[duration(personalOvertimeMinutes * 60), duration(personalRequiredSeconds), duration(personalActiveSeconds)]],
    },
    "Team Members": {
      subtitle: "Active employees in your team",
      columns: ["Employee", "Employee ID", "Department", "Designation", "Status"],
      rows: activeEmployees.map((employee) => [employee.fullName || "—", employee.employeeId || "—", employee.department?.name || "Unassigned", employee.designation || "—", statusLabel(employee.employmentStatus)]),
    },
    "Present Today": {
      subtitle: "Team members marked present today",
      columns: ["Employee", "Employee ID", "Work Mode", "Login", "Active Time", "Status"],
      rows: todayAttendance.filter((record) => isPresentStatus(record.status)).map((record) => [record.employee?.fullName || "—", record.employee?.employeeId || "—", statusLabel(record.workMode), timeOnly(record.loginTime), minutes(Number(record.activeMinutes || 0)), statusLabel(record.status)]),
    },
    "Work From Home": {
      subtitle: "Team members working from home today",
      columns: ["Employee", "Employee ID", "Department", "Login", "Active Time"],
      rows: todayAttendance.filter((record) => String(record.workMode || "").toUpperCase() === "WFH").map((record) => [record.employee?.fullName || "—", record.employee?.employeeId || "—", record.employee?.department?.name || "Unassigned", timeOnly(record.loginTime), minutes(Number(record.activeMinutes || 0))]),
    },
    "Pending Leaves": {
      subtitle: "Leave requests awaiting your action",
      columns: ["Employee", "Leave Type", "From", "To", "Reason", "Status"],
      rows: pendingLeaves.map((leave) => [leave.employee?.fullName || "—", leave.leaveType?.name || "—", dateOnly(leave.fromDate), dateOnly(leave.toDate), leave.reason || "—", statusLabel(leave.status)]),
    },
    "Open Tasks": {
      subtitle: "Tasks that are not yet completed",
      columns: ["Task", "Assigned To", "Project", "Priority", "Due Date", "Status"],
      rows: openTasks.map((task) => [task.title || "—", task.assignedTo?.fullName || "Unassigned", task.project?.name || "—", statusLabel(task.priority), dateOnly(task.dueDate), statusLabel(task.status)]),
    },
    "Completed Tasks": {
      subtitle: "Tasks completed by your team",
      columns: ["Task", "Assigned To", "Project", "Due Date", "Status"],
      rows: tasks.filter((task) => String(task.status || "").toUpperCase() === "COMPLETED").map((task) => [task.title || "—", task.assignedTo?.fullName || "Unassigned", task.project?.name || "—", dateOnly(task.dueDate), statusLabel(task.status)]),
    },
    "Late Today": {
      subtitle: "Team members marked late today",
      columns: ["Employee", "Employee ID", "Work Mode", "Login", "Status"],
      rows: todayAttendance.filter((record) => String(record.status || "").toUpperCase().includes("LATE")).map((record) => [record.employee?.fullName || "—", record.employee?.employeeId || "—", statusLabel(record.workMode), timeOnly(record.loginTime), statusLabel(record.status)]),
    },
    "Insufficient Hours": {
      subtitle: "Team members who have not met required hours",
      columns: ["Employee", "Employee ID", "Work Mode", "Active Time", "Status"],
      rows: todayAttendance.filter((record) => String(record.status || "").toUpperCase() === "PRESENT_WITH_INSUFFICIENT_HOURS").map((record) => [record.employee?.fullName || "—", record.employee?.employeeId || "—", statusLabel(record.workMode), minutes(Number(record.activeMinutes || 0)), statusLabel(record.status)]),
    },
  };

  /* =========================================================

     JSX

  ========================================================= */

  return (
    <div className="managerDashboard">
      {/* =====================================================

          HEADER

      ====================================================== */}

      <div
        className="title managerDashboardHeader"
        style={{ alignItems: "center", gap: 18 }}
      >
        <div>
          <h1>Manager Dashboard</h1>
          <p className="pageSubtitle">
            Monitor your team attendance, tasks and leave activity.
          </p>
        </div>

        <div
          className="managerDashboardHeaderActions"
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <div
            className="managerDashboardModeSwitch"
            role="group"
            aria-label="Dashboard view"
          >
            <button
              type="button"
              className={dashboardMode === "MY" ? "active" : ""}
              onClick={() => setDashboardMode("MY")}
              aria-pressed={dashboardMode === "MY"}
            >
              <Clock3 size={17} />
              My Dashboard
            </button>
            <button
              type="button"
              className={dashboardMode === "TEAM" ? "active" : ""}
              onClick={() => setDashboardMode("TEAM")}
              aria-pressed={dashboardMode === "TEAM"}
            >
              <Users size={17} />
              Team Dashboard
            </button>
          </div>

          <button
            type="button"
            className="btn primaryBtn managerRefreshBtn"
            onClick={refresh}
            disabled={refreshing}
          >
            <RefreshCw size={16} className={refreshing ? "spin" : ""} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* =====================================================

          ERROR

      ====================================================== */}

      {hasError && (
        <div className="managerDashboardError">
          <strong>Unable to load some dashboard data.</strong>

          <span>Please refresh the page and try again.</span>
        </div>
      )}

      {/* =====================================================

          LOADING

      ====================================================== */}

      {loading ? (
        <div className="dashboardLoading">Loading manager dashboard...</div>
      ) : (
        <>
          {dashboardMode === "MY" ? (
            <div
              className="managerPersonalDashboard"
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              <section
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  padding: 18,
                  border: "1px solid #e2e8f0",
                  borderRadius: 14,
                  background: "#fff",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      display: "grid",
                      placeItems: "center",
                      borderRadius: 12,
                      color: "#2563eb",
                      background: "#eff6ff",
                    }}
                  >
                    <UserRound size={21} />
                  </div>

                  <div>
                    <div
                      style={{
                        color: "#64748b",
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      {managerEmployeeId} · {managerDesignation}
                    </div>

                    <h2
                      style={{
                        margin: "3px 0",
                        color: "#0f172a",
                        fontSize: 20,
                      }}
                    >
                      {greeting()}, {managerName}
                    </h2>

                    <p style={{ margin: 0, color: "#64748b", fontSize: 11 }}>
                      {managerDepartment || "Your personal workday overview"}
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    flexWrap: "wrap",
                  }}
                >
                  {personalOffline && !selectedWorkMode && allowWFO && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setSelectedWorkMode("WFO")}
                    >
                      <LogIn size={15} /> Work From Office
                    </button>
                  )}

                  {personalOffline && !selectedWorkMode && allowWFH && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setSelectedWorkMode("WFH")}
                    >
                      <LogIn size={15} /> Work From Home
                    </button>
                  )}

                  {personalOffline && selectedWorkMode && (
                    <>
                      <span
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          color: "#1d4ed8",
                          background: "#eff6ff",
                          border: "1px solid #bfdbfe",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {selectedWorkMode} Selected
                      </span>
                      <button
                        type="button"
                        className="btn primaryBtn"
                        onClick={managerCheckIn}
                        disabled={personalActionLoading !== null}
                      >
                        <LogIn size={15} />
                        {personalActionLoading === "CHECK_IN"
                          ? "Logging in..."
                          : "Login"}
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setSelectedWorkMode(null)}
                      >
                        Change
                      </button>
                    </>
                  )}

                  {personalCheckedIn && (
                    <>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => navigate("/manager/time-management")}
                        disabled={personalActionLoading !== null}
                      >
                        {personalIsBreakActive ? (
                          <Play size={15} />
                        ) : (
                          <Pause size={15} />
                        )}{" "}
                        {personalIsBreakActive ? "Manage Break" : "Start Break"}
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={managerCheckOut}
                        disabled={
                          personalActionLoading !== null ||
                          personalIsBreakActive
                        }
                      >
                        <LogOut size={15} />{" "}
                        {personalActionLoading === "LOGOUT"
                          ? "Logging out..."
                          : "Logout"}
                      </button>
                    </>
                  )}

                  {personalCheckedOut && (
                    <span
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        color: "#166534",
                        background: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      <CheckCircle2 size={14} /> Logged Out
                    </span>
                  )}
                </div>
              </section>

              {personalWarning && personalCheckedIn && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    padding: "10px 13px",
                    border: "1px solid #fde68a",
                    borderRadius: 10,
                    color: "#92400e",
                    background: "#fffbeb",
                    fontSize: 11,
                  }}
                >
                  <Activity size={16} />
                  <span>
                    No activity detected. You may be marked idle if activity
                    does not resume.
                  </span>
                  <button
                    type="button"
                    style={{
                      marginLeft: "auto",
                      border: 0,
                      background: "transparent",
                      color: "#92400e",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      lastActivity.current = Date.now();
                      idleRef.current = false;
                      setPersonalWarning(false);
                      post("/idle/heartbeat", { active: true }).catch(() => {});
                    }}
                  >
                    I'm Working
                  </button>
                </div>
              )}

              <section className="managerStatsGrid">
                {[
                  [
                    "Today's Mode",
                    personalAttendance?.workMode || "Not checked in",
                    "Selected work mode",
                  ],
                  [
                    "Current Status",
                    personalCheckedIn
                      ? personalIsBreakActive
                        ? "ON BREAK"
                        : idleRef.current
                          ? "IDLE"
                          : "WORKING"
                      : personalCheckedOut
                        ? "CHECKED OUT"
                        : "OFFLINE",
                    "Current work status",
                  ],
                  [
                    "Logged-in Time",
                    duration(personalLoggedInSeconds),
                    "Total time since login",
                  ],
                  [
                    "Active Work Time",
                    duration(personalActiveSeconds),
                    "Logged-in − break − idle",
                  ],
                  [
                    "Break Time",
                    duration(personalBreakMinutes * 60),
                    "Total break time today",
                  ],
                  [
                    "Idle Time",
                    duration(personalIdleMinutes * 60),
                    "Detected inactive time today",
                  ],
                  [
                    "Required Time",
                    duration(personalRequiredSeconds),
                    "Required working time",
                  ],
                  [
                    personalShortageMinutes > 0
                      ? "Remaining Time"
                      : "Extra Time",
                    duration(
                      (personalShortageMinutes > 0
                        ? personalShortageMinutes
                        : personalOvertimeMinutes) * 60,
                    ),
                    personalShortageMinutes > 0
                      ? "Required time remaining"
                      : "Required time completed",
                  ],
                ].map(([title, value, sub]) => (
                  <div
                    className="managerStatCard managerStatCardClickable"
                    key={title}
                    role="button"
                    tabIndex={0}
                    aria-haspopup="dialog"
                    aria-label={`Show ${title.toLowerCase()} details`}
                    onClick={() => setSelectedTeamCard(title)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedTeamCard(title);
                      }
                    }}
                  >
                    <div className="managerStatIcon">
                      <Clock3 size={20} />
                    </div>
                    <div className="managerStatContent">
                      <span>{title}</span>
                      <strong>{value}</strong>
                      <small>{sub}</small>
                    </div>
                  </div>
                ))}
              </section>

              <div className="managerDashboardTwoColumn">
                <section className="dashboardSection">
                  <div className="dashboardSectionHeader">
                    <div>
                      <h2>Today's Summary</h2>
                      <p>
                        Attendance and productivity summary for your workday.
                      </p>
                    </div>
                    <Activity size={18} />
                  </div>

                  {personalAttendance ? (
                    <div className="managerTaskSummary">
                      {[
                        ["Work Mode", personalAttendance.workMode || "—"],
                        [
                          "Login Time",
                          timeWithSeconds(personalAttendance.loginTime),
                        ],
                        [
                          "Logout Time",
                          timeOnly(personalAttendance.logoutTime),
                        ],
                        ["Shortage", minutes(personalShortageMinutes)],
                        ["Overtime", minutes(personalOvertimeMinutes)],
                        [
                          "Task Tracked",
                          minutes(personalAttendance.taskMinutes),
                        ],
                        [
                          "Unallocated Active",
                          minutes(
                            Math.max(
                              0,
                              personalActiveMinutes -
                                (Number(personalAttendance.taskMinutes) || 0),
                            ),
                          ),
                        ],
                        ["Status", statusLabel(personalAttendance.status)],
                      ].map(([label, value]) => (
                        <div className="managerTaskMetric" key={label}>
                          <span>{label}</span>
                          <strong>{value}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="dashboardEmpty compact">
                      <b>No attendance record for today</b>
                      <span>
                        Select WFO or WFH above to start your workday.
                      </span>
                    </div>
                  )}

                  <div
                    style={{
                      marginTop: 14,
                      padding: 12,
                      border: "1px solid #e7edf3",
                      borderRadius: 10,
                      background: "#f8fafc",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div>
                      <span
                        style={{
                          display: "block",
                          color: "#64748b",
                          fontSize: 9,
                        }}
                      >
                        BREAK CONTROL
                      </span>
                      <strong
                        style={{ display: "block", marginTop: 4, fontSize: 15 }}
                      >
                        {minutes(personalBreakMinutes)}
                      </strong>
                    </div>
                    <button
                      type="button"
                      className="btn"
                      disabled={
                        !personalCheckedIn || personalActionLoading !== null
                      }
                      onClick={() => navigate("/manager/time-management")}
                    >
                      <Coffee size={15} />
                      {personalIsBreakActive ? "Manage Break" : "Start Break"}
                    </button>
                  </div>
                </section>

                <section className="dashboardSection">
                  <div className="dashboardSectionHeader">
                    <div>
                      <h2>My Work Timeline</h2>
                      <p>Personal work time for the current week.</p>
                    </div>
                  </div>

                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    {personalTimelineRows.map((row) => {
                      const active = Number(row.activeMinutes) || 0;
                      const logged = Math.max(
                        active,
                        Number(row.loggedInMinutes) || 0,
                      );
                      const inactive = Math.max(
                        0,
                        Math.min(
                          logged,
                          (Number(row.breakMinutes) || 0) +
                            (Number(row.idleMinutes) || 0),
                        ),
                      );
                      const aw = Math.min(
                        100,
                        (active / Math.max(60, personalRequiredMinutes)) * 100,
                      );
                      const iw = Math.min(
                        100 - aw,
                        (inactive / Math.max(60, personalRequiredMinutes)) *
                          100,
                      );
                      return (
                        <div
                          key={row.key}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "52px minmax(0,1fr) 58px",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <div>
                            <strong style={{ display: "block", fontSize: 10 }}>
                              {row.label}
                            </strong>
                            <small style={{ color: "#94a3b8", fontSize: 8 }}>
                              {row.dateLabel}
                            </small>
                          </div>
                          <div
                            style={{
                              position: "relative",
                              height: 9,
                              borderRadius: 99,
                              background: "#eef2f7",
                              overflow: "hidden",
                            }}
                          >
                            <span
                              style={{
                                position: "absolute",
                                inset: "0 auto 0 0",
                                width: `${aw}%`,
                                background: "#2563eb",
                              }}
                            />
                            <span
                              style={{
                                position: "absolute",
                                top: 0,
                                bottom: 0,
                                left: `${aw}%`,
                                width: `${iw}%`,
                                background: "#cbd5e1",
                              }}
                            />
                          </div>
                          <span
                            style={{
                              fontSize: 9,
                              color: "#475569",
                              textAlign: "right",
                            }}
                          >
                            {minutes(active)}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <p
                    style={{
                      margin: "12px 0 0",
                      color: "#64748b",
                      fontSize: 10,
                    }}
                  >
                    Login: {timeWithSeconds(personalAttendance?.loginTime)} ·
                    Logout: {timeWithSeconds(personalAttendance?.logoutTime)}
                  </p>
                </section>
              </div>

              <section className="dashboardSection">
                <div className="dashboardSectionHeader">
                  <div>
                    <h2>My Tasks</h2>
                    <p>
                      Tasks assigned directly to you by Admin or an authorized
                      manager.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => navigate("/manager/tasks")}
                  >
                    <ExternalLink size={15} /> Open Tasks
                  </button>
                </div>

                {personalTasks.length ? (
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 9 }}
                  >
                    {personalTasks.slice(0, 5).map((task) => {
                      const active = activeTaskId === task.id;
                      const actionBusy = taskActionLoading.startsWith(
                        `${task.id}:`,
                      );
                      const status = String(task.status || "").toUpperCase();

                      return (
                        <div
                          key={task.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(0, 1fr) auto",
                            gap: 12,
                            alignItems: "center",
                            padding: 12,
                            border: "1px solid #e2e8f0",
                            borderRadius: 12,
                            background: "#fff",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedTask(task)}
                            style={{
                              border: 0,
                              background: "transparent",
                              textAlign: "left",
                              padding: 0,
                              cursor: "pointer",
                              minWidth: 0,
                            }}
                          >
                            <strong
                              style={{
                                display: "block",
                                color: "#0f172a",
                                fontSize: 13,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {task.title}
                            </strong>
                            <span
                              style={{
                                display: "block",
                                marginTop: 4,
                                color: "#64748b",
                                fontSize: 10,
                              }}
                            >
                              {task.taskNumber || "Task"} ·{" "}
                              {statusLabel(task.status)}
                              {task.priority
                                ? ` · ${statusLabel(task.priority)}`
                                : ""}
                              {task.dueDate
                                ? ` · Due ${dateOnly(task.dueDate)}`
                                : ""}
                            </span>
                          </button>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              flexWrap: "wrap",
                              justifyContent: "flex-end",
                            }}
                          >
                            {status === "COMPLETED" ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 5,
                                  padding: "7px 9px",
                                  borderRadius: 8,
                                  background: "#f0fdf4",
                                  color: "#166534",
                                  fontSize: 10,
                                  fontWeight: 700,
                                }}
                              >
                                <CheckCircle2 size={14} /> Completed
                              </span>
                            ) : active ? (
                              <>
                                <button
                                  type="button"
                                  className="btn"
                                  disabled={Boolean(taskActionLoading)}
                                  onClick={() =>
                                    handlePersonalTaskTimer(task, "pause")
                                  }
                                >
                                  <Pause size={14} /> Pause
                                </button>
                                <button
                                  type="button"
                                  className="btn"
                                  disabled={Boolean(taskActionLoading)}
                                  onClick={() =>
                                    handlePersonalTaskTimer(task, "stop")
                                  }
                                >
                                  <Square size={14} /> Stop
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="btn primaryBtn"
                                disabled={Boolean(taskActionLoading)}
                                onClick={() =>
                                  handlePersonalTaskTimer(
                                    task,
                                    status === "IN_PROGRESS"
                                      ? "resume"
                                      : "start",
                                  )
                                }
                              >
                                <Play size={14} />{" "}
                                {actionBusy
                                  ? "Starting..."
                                  : status === "IN_PROGRESS"
                                    ? "Resume"
                                    : "Start"}
                              </button>
                            )}

                            {status !== "COMPLETED" &&
                              status !== "CANCELLED" && (
                                <button
                                  type="button"
                                  className="btn"
                                  disabled={Boolean(taskActionLoading)}
                                  onClick={() => completePersonalTask(task)}
                                >
                                  <Check size={14} /> Complete
                                </button>
                              )}
                          </div>
                        </div>
                      );
                    })}

                    {personalTasks.length > 5 && (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => navigate("/tasks")}
                        style={{ alignSelf: "flex-start" }}
                      >
                        View all {personalTasks.length} tasks
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="dashboardEmpty compact">
                    <b>No tasks assigned to you</b>
                    <span>
                      When Admin assigns a task to this manager, it will appear
                      here with timer controls.
                    </span>
                  </div>
                )}
              </section>
            </div>
          ) : (
            <>
              {/* =================================================

              STAT CARDS

          ================================================== */}

              <section className="managerStatsGrid">
                {cards.map((card) => {
                  const Icon = card.icon;

                  return (
                    <div
                      className="managerStatCard managerStatCardClickable"
                      key={card.title}
                      role="button"
                      tabIndex={0}
                      aria-haspopup="dialog"
                      aria-label={`Show ${card.title.toLowerCase()} details`}
                      onClick={() => card.title === "Pending Leaves" ? setPendingLeavesOpen(true) : setSelectedTeamCard(card.title)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          card.title === "Pending Leaves" ? setPendingLeavesOpen(true) : setSelectedTeamCard(card.title);
                        }
                      }}
                    >
                      <div className="managerStatIcon">
                        <Icon size={20} />
                      </div>

                      <div className="managerStatContent">
                        <span>{card.title}</span>

                        <strong>{card.value}</strong>

                        <small>{card.subtitle}</small>
                      </div>
                    </div>
                  );
                })}
              </section>

              {/* =================================================

              ATTENDANCE OVERVIEW

          ================================================== */}

              <section className="dashboardSection">
                <div className="dashboardSectionHeader">
                  <div>
                    <h2>Attendance Overview</h2>

                    <p>Current attendance status of your team.</p>
                  </div>
                </div>

                <div className="managerStatusList">
                  <div className="managerStatusRow">
                    <span className="managerStatusDot present" />

                    <span>Present</span>

                    <strong>{presentToday}</strong>
                  </div>

                  <div className="managerStatusRow">
                    <span className="managerStatusDot late" />

                    <span>Late</span>

                    <strong>{lateToday}</strong>
                  </div>

                  <div className="managerStatusRow">
                    <span className="managerStatusDot insufficient" />

                    <span>Insufficient Hours</span>

                    <strong>{insufficientToday}</strong>
                  </div>

                  <div className="managerStatusRow">
                    <span className="managerStatusDot wfh" />

                    <span>Working From Home</span>

                    <strong>{wfhToday}</strong>
                  </div>
                </div>
              </section>

              {/* =================================================

              TASK + LEAVE

          ================================================== */}

              <div className="managerDashboardTwoColumn">
                {/* TASK PERFORMANCE */}

                <section className="dashboardSection">
                  <div className="dashboardSectionHeader">
                    <div>
                      <h2>Task Performance</h2>

                      <p>Team task completion overview.</p>
                    </div>
                  </div>

                  <div className="managerTaskSummary">
                    <div className="managerTaskMetric">
                      <span>Total Tasks</span>

                      <strong>{tasks.length}</strong>
                    </div>

                    <div className="managerTaskMetric">
                      <span>Completed</span>

                      <strong>{completedTasks}</strong>
                    </div>

                    <div className="managerTaskMetric">
                      <span>Open</span>

                      <strong>{openTasks.length}</strong>
                    </div>

                    <div className="managerTaskMetric">
                      <span>Overdue</span>

                      <strong>{overdueTasks.length}</strong>
                    </div>
                  </div>

                  <div className="managerCompletion">
                    <div className="managerCompletionHeader">
                      <span>Completion Rate</span>

                      <strong>{completionRate}%</strong>
                    </div>

                    <div className="managerCompletionTrack">
                      <div
                        className="managerCompletionBar"
                        style={{
                          width: `${completionRate}%`,
                        }}
                      />
                    </div>
                  </div>
                </section>

                {/* PENDING LEAVES */}

                <section className="dashboardSection">
                  <div className="dashboardSectionHeader">
                    <div>
                      <h2>Pending Leave Requests</h2>

                      <p>Leave requests awaiting your action.</p>
                    </div>
                  </div>

                  {pendingLeaves.length ? (
                    <div className="managerLeaveList">
                      {pendingLeaves.slice(0, 5).map((leave) => (
                        <div
                          className="managerLeaveRow"
                          key={leave.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedLeave(leave)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedLeave(leave);
                            }
                          }}
                        >
                          <div className="managerLeaveEmployee">
                            <div className="managerLeaveAvatar">
                              {(leave.employee?.fullName || "E")

                                .charAt(0)

                                .toUpperCase()}
                            </div>

                            <div>
                              <strong>
                                {leave.employee?.fullName || "Employee"}
                              </strong>

                              <span>{leave.leaveType?.name || "Leave"}</span>
                            </div>
                          </div>

                          <div className="managerLeaveDates">
                            <span>{dateOnly(leave.fromDate)}</span>

                            <span>to</span>

                            <span>{dateOnly(leave.toDate)}</span>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span className="managerPendingBadge">Pending</span>
                            <button
                              type="button"
                              className="btn"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedLeave(leave);
                              }}
                            >
                              Review
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="dashboardEmpty compact">
                      <b>No pending leave requests</b>

                      <span>
                        There are no leave requests waiting for approval.
                      </span>
                    </div>
                  )}
                </section>
              </div>

              {/* =================================================

              TEAM ATTENTION

          ================================================== */}

              <section className="dashboardSection">
                <div className="dashboardSectionHeader">
                  <div>
                    <h2>Team Attention</h2>

                    <p>Items that may require your attention.</p>
                  </div>
                </div>

                <div className="managerAttentionList">
                  <div className="managerAttentionRow">
                    <div className="managerAttentionIcon warning">
                      <Clock3 size={18} />
                    </div>

                    <div>
                      <strong>Late attendance</strong>

                      <span>
                        {lateToday} employee
                        {lateToday === 1 ? "" : "s"} marked late today.
                      </span>
                    </div>
                  </div>

                  <div className="managerAttentionRow">
                    <div className="managerAttentionIcon warning">
                      <Activity size={18} />
                    </div>

                    <div>
                      <strong>Insufficient working hours</strong>

                      <span>
                        {insufficientToday} employee
                        {insufficientToday === 1 ? "" : "s"} need attention for
                        working hours.
                      </span>
                    </div>
                  </div>

                  <div className="managerAttentionRow">
                    <div className="managerAttentionIcon danger">
                      <ListTodo size={18} />
                    </div>

                    <div>
                      <strong>Overdue tasks</strong>

                      <span>
                        {overdueTasks.length} task
                        {overdueTasks.length === 1 ? "" : "s"} are overdue.
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              {/* =================================================

              RECENT TEAM ATTENDANCE

          ================================================== */}

              <section className="dashboardSection">
                <div className="dashboardSectionHeader">
                  <div>
                    <h2>Recent Team Attendance</h2>

                    <p>Click any row to view complete attendance details.</p>
                  </div>
                </div>

                <div className="tableWrap">
                  <table className="dataTable managerAttendanceTable">
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
                      {recentAttendance.map((attendanceItem) => (
                        <tr
                          key={attendanceItem.id}
                          className="managerAttendanceRow"
                          onClick={() => setSelectedAttendance(attendanceItem)}
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();

                              setSelectedAttendance(attendanceItem);
                            }
                          }}
                        >
                          <td>
                            <div className="managerAttendanceEmployee">
                              <div className="managerAttendanceAvatar">
                                {(attendanceItem.employee?.fullName || "E")

                                  .charAt(0)

                                  .toUpperCase()}
                              </div>

                              <div>
                                <strong>
                                  {attendanceItem.employee?.fullName || "—"}
                                </strong>

                                {/* =================================================

                                FIX:

                                This line now resolves designation from

                                employee master data.

                            ================================================== */}

                                <span>
                                  {employees.find(
                                    (employee) =>
                                      employee.id ===
                                        attendanceItem.employee?.id ||
                                      employee.employeeId ===
                                        attendanceItem.employee?.employeeId,
                                  )?.designation ||
                                    attendanceItem.employee?.designation ||
                                    "—"}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td>{attendanceItem.employee?.employeeId || "—"}</td>

                          <td>
                            <span className="managerModeBadge">
                              {attendanceItem.workMode}
                            </span>
                          </td>

                          <td>
                            <span className="managerStatusBadge">
                              {statusLabel(attendanceItem.status)}
                            </span>
                          </td>

                          <td>{timeOnly(attendanceItem.loginTime)}</td>

                          <td>{minutes(attendanceItem.activeMinutes)}</td>

                          <td>{minutes(attendanceItem.breakMinutes)}</td>

                          <td>{minutes(attendanceItem.idleMinutes)}</td>

                          <td>{minutes(attendanceItem.shortageMinutes)}</td>
                        </tr>
                      ))}

                      {!recentAttendance.length && (
                        <tr>
                          <td colSpan={9}>
                            <div className="dashboardEmpty compact">
                              <b>No recent attendance</b>

                              <span>
                                There is no attendance activity to display.
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}

      {/* =====================================================
          TEAM DASHBOARD CARD DETAILS
      ====================================================== */}
      {selectedTeamCard && teamCardDetails[selectedTeamCard] && (
        <div
          className="managerAttendanceModalBackdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedTeamCard(null);
          }}
        >
          <div className="managerAttendanceModal managerDashboardCardModal" role="dialog" aria-modal="true" aria-labelledby="manager-card-title">
            <div className="managerAttendanceModalHeader">
              <div className="managerAttendanceModalTitle">
                <div className="managerAttendanceModalIcon"><Users size={21} /></div>
                <div>
                  <h2 id="manager-card-title">{selectedTeamCard}</h2>
                  <p>{teamCardDetails[selectedTeamCard].subtitle} · {teamCardDetails[selectedTeamCard].rows.length} record{teamCardDetails[selectedTeamCard].rows.length === 1 ? "" : "s"}</p>
                </div>
              </div>
              <button type="button" className="managerAttendanceModalClose" onClick={() => setSelectedTeamCard(null)} aria-label="Close details"><X size={20} /></button>
            </div>
            <div className="managerAttendanceModalBody">
              {teamCardDetails[selectedTeamCard].rows.length ? (
                <div className="managerCardDetailsTableWrap">
                  <table className="managerCardDetailsTable">
                    <thead><tr>{teamCardDetails[selectedTeamCard].columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                    <tbody>{teamCardDetails[selectedTeamCard].rows.map((row, rowIndex) => <tr key={`${selectedTeamCard}-${rowIndex}`}>{row.map((value, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{value}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              ) : (
                <div className="managerCardDetailsEmpty">No {selectedTeamCard.toLowerCase()} records found.</div>
              )}
            </div>
            <div className="managerAttendanceModalFooter"><button type="button" className="btn primaryBtn" onClick={() => setSelectedTeamCard(null)}>Close</button></div>
          </div>
        </div>
      )}

      {/* =====================================================
          PENDING LEAVES LIST MODAL
      ====================================================== */}
      {pendingLeavesOpen && (
        <div
          className="managerAttendanceModalBackdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setPendingLeavesOpen(false);
          }}
        >
          <div
            className="managerAttendanceModal"
            role="dialog"
            aria-modal="true"
          >
            <div className="managerAttendanceModalHeader">
              <div className="managerAttendanceModalTitle">
                <div className="managerAttendanceModalIcon">
                  <CalendarClock size={21} />
                </div>
                <div>
                  <h2>Pending Leave Requests</h2>
                  <p>
                    {pendingLeaves.length} request
                    {pendingLeaves.length === 1 ? "" : "s"} awaiting your action
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="managerAttendanceModalClose"
                onClick={() => setPendingLeavesOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="managerAttendanceModalBody">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {pendingLeaves.map((leave) => (
                  <div
                    key={leave.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gap: 10,
                      alignItems: "center",
                      padding: 11,
                      border: "1px solid #e2e8f0",
                      borderRadius: 10,
                      background: "#fff",
                    }}
                  >
                    <div>
                      <strong
                        style={{
                          display: "block",
                          color: "#0f172a",
                          fontSize: 12,
                        }}
                      >
                        {leave.employee?.fullName || "Employee"}
                      </strong>
                      <span
                        style={{
                          display: "block",
                          marginTop: 3,
                          color: "#64748b",
                          fontSize: 10,
                        }}
                      >
                        {leave.leaveType?.name || "Leave"} ·{" "}
                        {dateOnly(leave.fromDate)} to {dateOnly(leave.toDate)}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        flexWrap: "wrap",
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setPendingLeavesOpen(false);
                          setSelectedLeave(leave);
                        }}
                      >
                        Review
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={leaveActionLoading === leave.id}
                        onClick={() => reviewTeamLeave(leave, "REJECT")}
                      >
                        <X size={14} /> Reject
                      </button>
                      <button
                        type="button"
                        className="btn primaryBtn"
                        disabled={leaveActionLoading === leave.id}
                        onClick={() => reviewTeamLeave(leave, "APPROVE")}
                      >
                        <Check size={14} /> Approve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="managerAttendanceModalFooter"
              style={{ justifyContent: "space-between" }}
            >
              <button
                type="button"
                className="btn"
                onClick={() => navigate("/manager/leaves?view=team")}
              >
                <ExternalLink size={15} /> Open Leaves
              </button>
              <button
                type="button"
                className="btn primaryBtn"
                onClick={() => setPendingLeavesOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          TEAM LEAVE DETAILS MODAL
      ====================================================== */}
      {selectedLeave && (
        <div
          className="managerAttendanceModalBackdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedLeave(null);
          }}
        >
          <div
            className="managerAttendanceModal"
            role="dialog"
            aria-modal="true"
          >
            <div className="managerAttendanceModalHeader">
              <div className="managerAttendanceModalTitle">
                <div className="managerAttendanceModalIcon">
                  <CalendarClock size={21} />
                </div>
                <div>
                  <h2>Pending Leave Request</h2>
                  <p>
                    {selectedLeave.employee?.employeeId || "Employee"} ·{" "}
                    {selectedLeave.leaveType?.name || "Leave"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="managerAttendanceModalClose"
                onClick={() => setSelectedLeave(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="managerAttendanceModalBody">
              <div className="managerAttendanceProfile">
                <div className="managerAttendanceProfileAvatar">
                  {(selectedLeave.employee?.fullName || "E")
                    .charAt(0)
                    .toUpperCase()}
                </div>
                <div className="managerAttendanceProfileInfo">
                  <h3>{selectedLeave.employee?.fullName || "Employee"}</h3>
                  <span>
                    {selectedLeave.leaveType?.name || "Leave Request"}
                  </span>
                </div>
                <div className="managerAttendanceProfileBadges">
                  <span className="managerPendingBadge">Pending</span>
                </div>
              </div>

              <div className="managerAttendanceModalSection">
                <div className="managerAttendanceSectionTitle">
                  LEAVE INFORMATION
                </div>
                <div className="managerAttendanceDetailGrid">
                  <div className="managerAttendanceDetailItem accentBlue">
                    <span>FROM DATE</span>
                    <strong>{dateOnly(selectedLeave.fromDate)}</strong>
                  </div>
                  <div className="managerAttendanceDetailItem">
                    <span>TO DATE</span>
                    <strong>{dateOnly(selectedLeave.toDate)}</strong>
                  </div>
                  <div className="managerAttendanceDetailItem accentBlue">
                    <span>LEAVE TYPE</span>
                    <strong>{selectedLeave.leaveType?.name || "—"}</strong>
                  </div>
                  <div className="managerAttendanceDetailItem">
                    <span>REQUESTED</span>
                    <strong>{dateOnly(selectedLeave.createdAt)}</strong>
                  </div>
                </div>
              </div>

              <div className="managerAttendanceModalSection">
                <div className="managerAttendanceSectionTitle">REASON</div>
                <div
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                    background: "#f8fafc",
                    color: "#475569",
                    fontSize: 12,
                    lineHeight: 1.6,
                  }}
                >
                  {selectedLeave.reason || "No reason provided."}
                </div>
              </div>
            </div>

            <div
              className="managerAttendanceModalFooter"
              style={{ justifyContent: "space-between" }}
            >
              <button
                type="button"
                className="btn"
                onClick={() => navigate("/manager/leaves?view=team")}
              >
                <ExternalLink size={15} /> Open Leaves
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn"
                  disabled={leaveActionLoading === selectedLeave.id}
                  onClick={() => reviewTeamLeave(selectedLeave, "REJECT")}
                >
                  <X size={15} /> Reject
                </button>
                <button
                  type="button"
                  className="btn primaryBtn"
                  disabled={leaveActionLoading === selectedLeave.id}
                  onClick={() => reviewTeamLeave(selectedLeave, "APPROVE")}
                >
                  <Check size={15} />{" "}
                  {leaveActionLoading === selectedLeave.id
                    ? "Processing..."
                    : "Approve"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          PERSONAL TASK DETAILS MODAL
      ====================================================== */}
      {selectedTask && (
        <div
          className="managerAttendanceModalBackdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedTask(null);
          }}
        >
          <div
            className="managerAttendanceModal"
            role="dialog"
            aria-modal="true"
          >
            <div className="managerAttendanceModalHeader">
              <div className="managerAttendanceModalTitle">
                <div className="managerAttendanceModalIcon">
                  <ListTodo size={21} />
                </div>
                <div>
                  <h2>Task Details</h2>
                  <p>
                    {selectedTask.taskNumber || "Personal Task"} ·{" "}
                    {statusLabel(selectedTask.status)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="managerAttendanceModalClose"
                onClick={() => setSelectedTask(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="managerAttendanceModalBody">
              <div className="managerAttendanceProfile">
                <div className="managerAttendanceProfileAvatar">
                  <ListTodo size={20} />
                </div>
                <div className="managerAttendanceProfileInfo">
                  <h3>{selectedTask.title}</h3>
                  <span>{selectedTask.project?.name || "No project"}</span>
                </div>
                <div className="managerAttendanceProfileBadges">
                  <span className="managerModeBadge">
                    {statusLabel(selectedTask.priority)}
                  </span>
                </div>
              </div>

              <div className="managerAttendanceModalSection">
                <div className="managerAttendanceSectionTitle">
                  TASK INFORMATION
                </div>
                <div className="managerAttendanceDetailGrid">
                  <div className="managerAttendanceDetailItem accentBlue">
                    <span>TASK NUMBER</span>
                    <strong>{selectedTask.taskNumber || "—"}</strong>
                  </div>
                  <div className="managerAttendanceDetailItem">
                    <span>STATUS</span>
                    <strong>{statusLabel(selectedTask.status)}</strong>
                  </div>
                  <div className="managerAttendanceDetailItem accentBlue">
                    <span>DUE DATE</span>
                    <strong>{dateOnly(selectedTask.dueDate)}</strong>
                  </div>
                  <div className="managerAttendanceDetailItem">
                    <span>ACTUAL TIME</span>
                    <strong>{minutes(selectedTask.actualMinutes)}</strong>
                  </div>
                </div>
              </div>

              <div className="managerAttendanceModalSection">
                <div className="managerAttendanceSectionTitle">DESCRIPTION</div>
                <div
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                    background: "#f8fafc",
                    color: "#475569",
                    fontSize: 12,
                    lineHeight: 1.6,
                  }}
                >
                  {selectedTask.description || "No description provided."}
                </div>
              </div>
            </div>

            <div
              className="managerAttendanceModalFooter"
              style={{ justifyContent: "space-between" }}
            >
              <button
                type="button"
                className="btn"
                onClick={() => navigate("/tasks")}
              >
                <ExternalLink size={15} /> Open Tasks
              </button>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                {String(selectedTask.status).toUpperCase() !== "COMPLETED" &&
                  String(selectedTask.status).toUpperCase() !== "CANCELLED" && (
                    <>
                      {activeTaskId === selectedTask.id ? (
                        <>
                          <button
                            type="button"
                            className="btn"
                            disabled={Boolean(taskActionLoading)}
                            onClick={() =>
                              handlePersonalTaskTimer(selectedTask, "pause")
                            }
                          >
                            <Pause size={15} /> Pause
                          </button>
                          <button
                            type="button"
                            className="btn"
                            disabled={Boolean(taskActionLoading)}
                            onClick={() =>
                              handlePersonalTaskTimer(selectedTask, "stop")
                            }
                          >
                            <Square size={15} /> Stop
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn primaryBtn"
                          disabled={Boolean(taskActionLoading)}
                          onClick={() =>
                            handlePersonalTaskTimer(
                              selectedTask,
                              String(selectedTask.status).toUpperCase() ===
                                "IN_PROGRESS"
                                ? "resume"
                                : "start",
                            )
                          }
                        >
                          <Play size={15} />{" "}
                          {String(selectedTask.status).toUpperCase() ===
                          "IN_PROGRESS"
                            ? "Resume"
                            : "Start"}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn"
                        disabled={Boolean(taskActionLoading)}
                        onClick={() => completePersonalTask(selectedTask)}
                      >
                        <Check size={15} /> Complete
                      </button>
                    </>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================

          ATTENDANCE DETAILS MODAL

      ====================================================== */}

      {selectedAttendance && (
        <div
          className="managerAttendanceModalBackdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedAttendance(null);
            }
          }}
        >
          <div
            className="managerAttendanceModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manager-attendance-details-title"
          >
            {/* =================================================

                MODAL HEADER

            ================================================== */}

            <div className="managerAttendanceModalHeader">
              <div className="managerAttendanceModalTitle">
                <div className="managerAttendanceModalIcon">
                  <UserCheck size={21} />
                </div>

                <div>
                  <h2 id="manager-attendance-details-title">
                    Attendance Details
                  </h2>

                  <p>
                    {selectedEmployeeId} ·{" "}
                    {selectedDesignation === "—"
                      ? "Employee"
                      : selectedDesignation}
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="managerAttendanceModalClose"
                onClick={() => setSelectedAttendance(null)}
                aria-label="Close attendance details"
              >
                <X size={20} />
              </button>
            </div>

            {/* =================================================

                MODAL BODY

            ================================================== */}

            <div className="managerAttendanceModalBody">
              {/* -------------------------------------------------

                  EMPLOYEE PROFILE

              -------------------------------------------------- */}

              <div className="managerAttendanceProfile">
                <div className="managerAttendanceProfileAvatar">
                  {selectedEmployeeName.charAt(0).toUpperCase()}
                </div>

                <div className="managerAttendanceProfileInfo">
                  <h3>{selectedEmployeeName}</h3>

                  {/* =================================================

                      THIS IS THE LINE YOU ASKED ABOUT.



                      It will now show:

                      Software Developer



                      instead of:

                      —

                  ================================================== */}

                  <span>{selectedDesignation}</span>
                </div>

                <div className="managerAttendanceProfileBadges">
                  <span className="managerAttendanceRoleBadge">EMPLOYEE</span>

                  <span
                    className={`managerAttendanceStatusBadge ${String(
                      selectedAttendance.status || "",
                    ).toLowerCase()}`}
                  >
                    {statusLabel(selectedAttendance.status)}
                  </span>
                </div>
              </div>

              {/* -------------------------------------------------

                  EMPLOYEE INFORMATION

              -------------------------------------------------- */}

              <div className="managerAttendanceModalSection">
                <div className="managerAttendanceSectionTitle">
                  EMPLOYEE INFORMATION
                </div>

                <div className="managerAttendanceDetailGrid">
                  <div className="managerAttendanceDetailItem accentBlue">
                    <span>EMPLOYEE ID</span>

                    <strong>{selectedEmployeeId}</strong>
                  </div>

                  <div className="managerAttendanceDetailItem">
                    <span>EMPLOYEE NAME</span>

                    <strong>{selectedEmployeeName}</strong>
                  </div>

                  <div className="managerAttendanceDetailItem accentBlue">
                    <span>DESIGNATION</span>

                    <strong>{selectedDesignation}</strong>
                  </div>

                  <div className="managerAttendanceDetailItem">
                    <span>DEPARTMENT</span>

                    <strong>{selectedDepartment}</strong>
                  </div>

                  <div className="managerAttendanceDetailItem accentBlue">
                    <span>WORK MODE</span>

                    <strong>{statusLabel(selectedAttendance.workMode)}</strong>
                  </div>

                  <div className="managerAttendanceDetailItem">
                    <span>DATE</span>

                    <strong>{dateOnly(selectedAttendance.date)}</strong>
                  </div>
                </div>
              </div>

              {/* -------------------------------------------------

                  CONTACT

              -------------------------------------------------- */}

              <div className="managerAttendanceModalSection">
                <div className="managerAttendanceSectionTitle">
                  CONTACT INFORMATION
                </div>

                <div className="managerAttendanceDetailGrid">
                  <div className="managerAttendanceDetailItem accentBlue">
                    <span>PHONE</span>

                    <strong>{selectedPhone}</strong>
                  </div>

                  <div className="managerAttendanceDetailItem">
                    <span>MANAGER</span>

                    <strong>
                      {selectedEmployee?.manager?.fullName || "—"}
                    </strong>
                  </div>

                  <div className="managerAttendanceDetailItem accentBlue">
                    <span>EMPLOYMENT STATUS</span>

                    <strong>{selectedEmployee?.employmentStatus || "—"}</strong>
                  </div>

                  <div className="managerAttendanceDetailItem">
                    <span>ACCOUNT STATUS</span>

                    <strong>
                      {selectedEmployee?.accountStatus || "ACTIVE"}
                    </strong>
                  </div>
                </div>
              </div>

              {/* -------------------------------------------------

                  TIME & ATTENDANCE

              -------------------------------------------------- */}

              <div className="managerAttendanceModalSection">
                <div className="managerAttendanceSectionTitle">
                  TIME & ATTENDANCE
                </div>

                <div className="managerAttendanceDetailGrid">
                  <div className="managerAttendanceDetailItem accentBlue">
                    <span>LOGIN TIME</span>

                    <strong>{timeOnly(selectedAttendance.loginTime)}</strong>
                  </div>

                  <div className="managerAttendanceDetailItem">
                    <span>LOGOUT TIME</span>

                    <strong>{timeOnly(selectedAttendance.logoutTime)}</strong>
                  </div>

                  <div className="managerAttendanceDetailItem accentBlue">
                    <span>LOGGED IN</span>

                    <strong>
                      {minutes(selectedAttendance.loggedInMinutes)}
                    </strong>
                  </div>

                  <div className="managerAttendanceDetailItem">
                    <span>ACTIVE TIME</span>

                    <strong>{minutes(selectedAttendance.activeMinutes)}</strong>
                  </div>

                  <div className="managerAttendanceDetailItem accentBlue">
                    <span>BREAK TIME</span>

                    <strong>{minutes(selectedAttendance.breakMinutes)}</strong>
                  </div>

                  <div className="managerAttendanceDetailItem">
                    <span>IDLE TIME</span>

                    <strong>{minutes(selectedAttendance.idleMinutes)}</strong>
                  </div>

                  <div className="managerAttendanceDetailItem accentBlue">
                    <span>TASK TIME</span>

                    <strong>{minutes(selectedAttendance.taskMinutes)}</strong>
                  </div>

                  <div className="managerAttendanceDetailItem">
                    <span>REQUIRED TIME</span>

                    <strong>
                      {minutes(selectedAttendance.requiredMinutes)}
                    </strong>
                  </div>

                  <div className="managerAttendanceDetailItem accentBlue">
                    <span>SHORTAGE</span>

                    <strong>
                      {minutes(selectedAttendance.shortageMinutes)}
                    </strong>
                  </div>

                  <div className="managerAttendanceDetailItem">
                    <span>OVERTIME</span>

                    <strong>
                      {minutes(selectedAttendance.overtimeMinutes)}
                    </strong>
                  </div>

                  <div className="managerAttendanceDetailItem accentBlue">
                    <span>STATUS</span>

                    <strong>{statusLabel(selectedAttendance.status)}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* =================================================

                MODAL FOOTER

            ================================================== */}

            <div className="managerAttendanceModalFooter">
              <button
                type="button"
                className="btn primaryBtn"
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
