import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Filter,
  FolderKanban,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Square,
  Save,
  Timer,
  Users,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get, patch, post } from "../api/client";
import { fmt } from "../utils/time";
import type { Task } from "../types";
import "./manager-tasks.css";

type TaskStatus =
  | "BACKLOG"
  | "TODO"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "REVIEW"
  | "COMPLETED"
  | "CANCELLED";

type ViewMode = "OWN" | "TEAM";

type EmployeeOption = {
  id: string;
  fullName: string;
  employeeId?: string;
  accountStatus?: string;
  user?: {
    role?: string;
    accountStatus?: string;
  };
};

type ProjectOption = {
  id: string;
  name: string;
  status?: string;
  managerId?: string | null;
};

type CreateTaskForm = {
  title: string;
  description: string;
  assignedToId: string;
  projectId: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dueDate: string;
  estimatedMinutes: string;
};

const EMPTY_CREATE_TASK_FORM: CreateTaskForm = {
  title: "",
  description: "",
  assignedToId: "",
  projectId: "",
  priority: "MEDIUM",
  dueDate: "",
  estimatedMinutes: "",
};

type ActiveTimer = {
  id?: string;
  taskId?: string;
  startedAt?: string;
  task?: {
    id?: string;
    taskNumber?: string;
    title?: string;
  };
};

type TaskRow = Task & {
  description?: string;
  startDate?: string;
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
    employeeId?: string;
    fullName?: string;
    email?: string;
    role?: string;
  };
};

const PAGE_SIZE = 10;

const STATUS_OPTIONS: Array<{
  value: "ALL" | TaskStatus;
  label: string;
}> = [
  { value: "ALL", label: "All Status" },
  { value: "BACKLOG", label: "Backlog" },
  { value: "TODO", label: "To Do" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "REVIEW", label: "Review" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const PRIORITY_OPTIONS = [
  { value: "ALL", label: "All Priorities" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

function normalizeTasks(data: any): TaskRow[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function normalizeList<T>(data: any): T[] {
  if (Array.isArray(data)) return data as T[];
  if (Array.isArray(data?.data)) return data.data as T[];
  if (Array.isArray(data?.items)) return data.items as T[];
  return [];
}

function apiErrorMessage(error: any, fallback: string) {
  const message = error?.response?.data?.message ?? error?.message;
  return Array.isArray(message) ? message.join(", ") : message || fallback;
}

function label(value?: string) {
  return value ? value.replaceAll("_", " ") : "—";
}

function dateText(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusClass(status?: string) {
  switch (status) {
    case "IN_PROGRESS":
      return "inProgress";
    case "TODO":
      return "todo";
    case "BACKLOG":
      return "backlog";
    case "ON_HOLD":
      return "onHold";
    case "REVIEW":
      return "review";
    case "COMPLETED":
      return "completed";
    case "CANCELLED":
      return "cancelled";
    default:
      return "default";
  }
}

function priorityClass(priority?: string) {
  switch (priority) {
    case "URGENT":
      return "urgent";
    case "HIGH":
      return "high";
    case "MEDIUM":
      return "medium";
    case "LOW":
      return "low";
    default:
      return "default";
  }
}

function isFinished(status?: string) {
  return status === "COMPLETED" || status === "CANCELLED";
}

function formatElapsedSeconds(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;

  return [hours, minutes, remainder]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export default function ManagerTasks() {
  const qc = useQueryClient();

  const [viewMode, setViewMode] = useState<ViewMode>("OWN");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [openDropdown, setOpenDropdown] = useState<
    "status" | "priority" | null
  >(null);
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createTaskForm, setCreateTaskForm] = useState<CreateTaskForm>(
    EMPTY_CREATE_TASK_FORM,
  );
  const [createTaskError, setCreateTaskError] = useState("");
  const [createTaskSuccess, setCreateTaskSuccess] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);
  const filterRef = useRef<HTMLDivElement | null>(null);
  const taskTableWrapRef = useRef<HTMLDivElement | null>(null);

  const queryKey = ["manager-tasks", viewMode];

  const {
    data: tasksData,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => get(`/tasks?scope=${viewMode}`),
  });

  const {
    data: activeTimerData,
    isFetching: isTimerFetching,
    refetch: refetchActiveTimer,
  } = useQuery({
    queryKey: ["manager-active-task-timer"],
    queryFn: () => get("/task-timers/active"),
    refetchInterval: 15000,
  });

  // Load assignment options only while the create form is open.
  const { data: employeeOptionsData, isFetching: employeesLoading } = useQuery({
    queryKey: ["manager-task-assignment-employees"],
    queryFn: () => get("/employees"),
    enabled: createTaskOpen,
  });

  const { data: managerProfileData } = useQuery({
    queryKey: ["manager-task-assignment-profile"],
    queryFn: () => get("/auth/me"),
    enabled: createTaskOpen,
  });

  const { data: projectOptionsData, isFetching: projectsLoading } = useQuery({
    queryKey: ["manager-task-assignment-projects"],
    queryFn: () => get("/projects"),
    enabled: createTaskOpen,
  });

  const employeeOptions = useMemo<EmployeeOption[]>(() => {
    return normalizeList<EmployeeOption>(employeeOptionsData).filter(
      (employee) => {
        const employeeStatus =
          employee.accountStatus ?? employee.user?.accountStatus;
        return !employeeStatus || employeeStatus === "ACTIVE";
      },
    );
  }, [employeeOptionsData]);

  const managerEmployeeId =
    managerProfileData?.employee?.id ??
    managerProfileData?.data?.employee?.id ??
    managerProfileData?.id ??
    managerProfileData?.data?.id;

  const projectOptions = useMemo<ProjectOption[]>(() => {
    return normalizeList<ProjectOption>(projectOptionsData).filter(
      (project) => {
        const isActive = !project.status || project.status === "ACTIVE";
        // Never offer a project that the backend will reject for this manager.
        const isManagedByCurrentManager =
          managerEmployeeId && project.managerId === managerEmployeeId;
        return isActive && isManagedByCurrentManager;
      },
    );
  }, [projectOptionsData, managerEmployeeId]);

  // Optimistic timer state prevents the action buttons from briefly
  // reverting to Start while the server query is refreshing.
  const [timerOverride, setTimerOverride] = useState<string | null | undefined>(
    undefined,
  );

  const [timerNow, setTimerNow] = useState(Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setTimerNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (taskTableWrapRef.current) {
      taskTableWrapRef.current.scrollLeft = 0;
    }
  }, [viewMode]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        filterRef.current &&
        !filterRef.current.contains(event.target as Node)
      ) {
        setOpenDropdown(null);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const tasks = useMemo(() => normalizeTasks(tasksData), [tasksData]);

  const activeTimer = useMemo<ActiveTimer | null>(() => {
    if (!activeTimerData) return null;
    if (Array.isArray(activeTimerData)) return activeTimerData[0] || null;

    return (
      activeTimerData?.data || activeTimerData?.timer || activeTimerData || null
    );
  }, [activeTimerData]);

  const serverActiveTaskId =
    activeTimer?.taskId || activeTimer?.task?.id || null;
  const activeTaskId =
    timerOverride !== undefined ? timerOverride : serverActiveTaskId;

  const activeTimerElapsed = useMemo(() => {
    if (!activeTimer?.startedAt) return "00:00:00";

    const started = new Date(activeTimer.startedAt).getTime();
    if (Number.isNaN(started)) return "00:00:00";

    return formatElapsedSeconds((timerNow - started) / 1000);
  }, [activeTimer, timerNow]);

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();

    return tasks.filter((task) => {
      const matchesSearch =
        !query ||
        task.taskNumber?.toLowerCase().includes(query) ||
        task.title?.toLowerCase().includes(query) ||
        task.project?.name?.toLowerCase().includes(query) ||
        task.assignedTo?.fullName?.toLowerCase().includes(query) ||
        task.assignedTo?.employeeId?.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "ALL" || task.status === statusFilter;

      const matchesPriority =
        priorityFilter === "ALL" || task.priority === priorityFilter;

      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [tasks, search, statusFilter, priorityFilter]);

  const summary = useMemo(() => {
    const open = tasks.filter((task) => !isFinished(task.status)).length;

    const inProgress = tasks.filter(
      (task) => task.status === "IN_PROGRESS",
    ).length;

    const completed = tasks.filter(
      (task) => task.status === "COMPLETED",
    ).length;

    const urgent = tasks.filter((task) => task.priority === "URGENT").length;

    const actual = tasks.reduce(
      (sum, task) => sum + (Number(task.actualMinutes) || 0),
      0,
    );

    return {
      total: tasks.length,
      open,
      inProgress,
      completed,
      urgent,
      actual,
    };
  }, [tasks]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE));

  const currentPage = Math.min(page, totalPages);

  const visibleTasks = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredTasks.slice(start, start + PAGE_SIZE);
  }, [filteredTasks, currentPage]);

  const hasFilters =
    Boolean(search) || statusFilter !== "ALL" || priorityFilter !== "ALL";

  function clearFilters() {
    setSearch("");
    setStatusFilter("ALL");
    setPriorityFilter("ALL");
    setPage(1);
  }

  function changeView(mode: ViewMode) {
    if (mode === viewMode) return;

    setViewMode(mode);
    setSearch("");
    setStatusFilter("ALL");
    setPriorityFilter("ALL");
    setPage(1);
    setSelectedTask(null);
    setTimerOverride(undefined);
    setErrorMessage("");
  }

  async function refreshAll() {
    setErrorMessage("");

    await Promise.all([
      refetch(),
      qc.invalidateQueries({
        queryKey: ["manager-active-task-timer"],
      }),
    ]);
  }

  async function timerAction(
    task: TaskRow,
    action: "start" | "pause" | "resume" | "stop",
  ) {
    setBusy(`${task.id}:${action}`);
    setErrorMessage("");

    const startsTimer = action === "start" || action === "resume";
    const stopsTimer = action === "pause" || action === "stop";

    // Immediately reflect the requested state in the UI.
    setTimerOverride(startsTimer ? task.id : null);

    try {
      await post(`/tasks/${task.id}/timer/${action}`);

      if (startsTimer) {
        await patch(`/tasks/${task.id}`, { status: "IN_PROGRESS" });
      }

      // Backend pause and stop both close the timer. Keep the task resumable.
      if (stopsTimer && !isFinished(task.status)) {
        await patch(`/tasks/${task.id}`, { status: "ON_HOLD" });
      }

      setSelectedTask((current) => {
        if (!current || current.id !== task.id) return current;
        if (startsTimer) return { ...current, status: "IN_PROGRESS" };
        if (stopsTimer) return { ...current, status: "ON_HOLD" };
        return current;
      });

      await Promise.all([
        qc.invalidateQueries({ queryKey }),
        qc.invalidateQueries({ queryKey: ["tasks"] }),
        qc.invalidateQueries({ queryKey: ["manager-active-task-timer"] }),
      ]);

      // Read the authoritative timer state before removing the optimistic override.
      await refetchActiveTimer();
      setTimerOverride(undefined);

      // Refresh the selected task as well so the modal uses the latest status.
      const refreshed = await refetch();
      const refreshedTasks = normalizeTasks(refreshed.data);
      const updatedTask = refreshedTasks.find((item) => item.id === task.id);
      if (updatedTask) {
        setSelectedTask((current) =>
          current?.id === task.id ? updatedTask : current,
        );
      }
    } catch (error: any) {
      setTimerOverride(undefined);
      setErrorMessage(
        error?.response?.data?.message ||
          "Timer operation failed. Please try again.",
      );
    } finally {
      setBusy("");
    }
  }

  async function completeTask(task: TaskRow) {
    setBusy(`${task.id}:complete`);
    setErrorMessage("");

    try {
      if (activeTaskId === task.id) {
        setTimerOverride(null);
        await post(`/tasks/${task.id}/timer/stop`);
      }

      await patch(`/tasks/${task.id}`, {
        status: "COMPLETED",
      });

      await Promise.all([
        qc.invalidateQueries({ queryKey }),
        qc.invalidateQueries({
          queryKey: ["manager-active-task-timer"],
        }),
        qc.invalidateQueries({
          queryKey: ["tasks"],
        }),
      ]);

      await refetchActiveTimer();
      setTimerOverride(undefined);
      setSelectedTask(null);
    } catch (error: any) {
      setErrorMessage(
        error?.response?.data?.message || "Unable to complete this task.",
      );
    } finally {
      setBusy("");
    }
  }

  async function updateTeamStatus(task: TaskRow, status: TaskStatus) {
    if (status === task.status) return;
    setBusy(`${task.id}:status`);
    setErrorMessage("");
    try {
      await patch(`/tasks/${task.id}`, { status });
      setSelectedTask((current) =>
        current?.id === task.id ? { ...current, status } : current,
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey }),
        qc.invalidateQueries({ queryKey: ["tasks"] }),
        qc.invalidateQueries({ queryKey: ["manager-active-task-timer"] }),
      ]);
    } catch (error: any) {
      setErrorMessage(
        error?.response?.data?.message || "Unable to update task status.",
      );
      await refetch();
    } finally {
      setBusy("");
    }
  }

  async function updateTeamPriority(task: TaskRow, priority: string) {
    setBusy(`${task.id}:priority`);
    setErrorMessage("");

    try {
      await patch(`/tasks/${task.id}`, { priority });

      await Promise.all([
        qc.invalidateQueries({ queryKey }),
        qc.invalidateQueries({ queryKey: ["tasks"] }),
      ]);

      setSelectedTask((current) =>
        current?.id === task.id ? { ...current, priority } : current,
      );
    } catch (error: any) {
      setErrorMessage(
        error?.response?.data?.message || "Unable to update task priority.",
      );
    } finally {
      setBusy("");
    }
  }

  function openCreateTask() {
    setCreateTaskError("");
    setCreateTaskSuccess("");
    setCreateTaskForm(EMPTY_CREATE_TASK_FORM);
    setCreateTaskOpen(true);
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateTaskError("");
    setCreateTaskSuccess("");

    const title = createTaskForm.title.trim();
    if (!title) {
      setCreateTaskError("Task title is required.");
      return;
    }
    if (!createTaskForm.assignedToId) {
      setCreateTaskError("Please select an employee from your team.");
      return;
    }

    const estimatedMinutes =
      createTaskForm.estimatedMinutes.trim() === ""
        ? undefined
        : Number(createTaskForm.estimatedMinutes);

    if (
      estimatedMinutes !== undefined &&
      (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1)
    ) {
      setCreateTaskError(
        "Estimated minutes must be a whole number greater than zero.",
      );
      return;
    }

    setCreatingTask(true);
    try {
      const payload: Record<string, unknown> = {
        title,
        assignedToId: createTaskForm.assignedToId,
        priority: createTaskForm.priority,
      };

      if (createTaskForm.description.trim()) {
        payload.description = createTaskForm.description.trim();
      }
      if (createTaskForm.projectId) {
        payload.projectId = createTaskForm.projectId;
      }
      if (createTaskForm.dueDate) {
        payload.dueDate = createTaskForm.dueDate;
      }
      if (estimatedMinutes !== undefined) {
        payload.estimatedMinutes = estimatedMinutes;
      }

      await post("/tasks", payload);
      setCreateTaskSuccess("Task created and assigned successfully.");
      setViewMode("TEAM");
      setSearch("");
      setStatusFilter("ALL");
      setPriorityFilter("ALL");
      setPage(1);
      setCreateTaskForm(EMPTY_CREATE_TASK_FORM);

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["manager-tasks"] }),
        qc.invalidateQueries({ queryKey: ["tasks"] }),
      ]);

      window.setTimeout(() => {
        setCreateTaskOpen(false);
        setCreateTaskSuccess("");
      }, 900);
    } catch (error: any) {
      setCreateTaskError(
        apiErrorMessage(error, "Unable to create task. Please try again."),
      );
    } finally {
      setCreatingTask(false);
    }
  }

  function renderOwnTimerActions(task: TaskRow) {
    if (isFinished(task.status)) {
      return (
        <span className="managerTaskCompletedAction">
          <CheckCircle2 size={15} />
          {task.status === "COMPLETED" ? "Completed" : "Cancelled"}
        </span>
      );
    }

    const isActive = activeTaskId === task.id;
    const isBusy = busy.startsWith(`${task.id}:`);
    const canResume =
      task.status === "ON_HOLD" || task.status === "IN_PROGRESS";

    if (isActive) {
      return (
        <div className="managerTaskActionGroup">
          <button
            type="button"
            className="managerTaskAction warning"
            disabled={Boolean(busy)}
            onClick={() => timerAction(task, "pause")}
            title="Pause timer"
          >
            <Pause size={14} /> Pause
          </button>
          <button
            type="button"
            className="managerTaskAction danger"
            disabled={Boolean(busy)}
            onClick={() => timerAction(task, "stop")}
            title="Stop timer"
          >
            <Square size={13} /> Stop
          </button>
          <button
            type="button"
            className="managerTaskAction success"
            disabled={Boolean(busy)}
            onClick={() => completeTask(task)}
            title="Complete task"
          >
            <CheckCircle2 size={14} /> Complete
          </button>
          {isBusy && <RefreshCw size={14} className="managerTaskButtonSpin" />}
        </div>
      );
    }

    return (
      <div className="managerTaskActionGroup">
        <button
          type="button"
          className="managerTaskAction primary"
          disabled={Boolean(busy) || Boolean(activeTaskId)}
          onClick={() => timerAction(task, canResume ? "resume" : "start")}
          title={
            activeTaskId
              ? "Another task timer is already running"
              : canResume
                ? "Resume timer"
                : "Start timer"
          }
        >
          <Play size={14} /> {canResume ? "Resume" : "Start"}
        </button>
        <button
          type="button"
          className="managerTaskAction success"
          disabled={Boolean(busy)}
          onClick={() => completeTask(task)}
          title="Complete task"
        >
          <CheckCircle2 size={14} /> Complete
        </button>
        {isBusy && <RefreshCw size={14} className="managerTaskButtonSpin" />}
      </div>
    );
  }

  function renderTeamActions(task: TaskRow) {
    return <span className="managerTaskEmployeeManaged">Employee managed</span>;
  }

  function renderOwnModalActions(task: TaskRow) {
    if (isFinished(task.status)) {
      return (
        <span className="managerTaskCompletedAction">
          <CheckCircle2 size={15} />
          {task.status === "COMPLETED" ? "Completed" : "Cancelled"}
        </span>
      );
    }

    const isActive = activeTaskId === task.id;
    const isBusy = busy.startsWith(`${task.id}:`);
    const canResume =
      task.status === "ON_HOLD" || task.status === "IN_PROGRESS";

    if (isActive) {
      return (
        <div className="managerTaskModalActionGroup">
          <button
            type="button"
            className="managerTaskModalAction pause"
            disabled={Boolean(busy)}
            onClick={() => timerAction(task, "pause")}
          >
            <Pause size={16} /> Pause
          </button>
          <button
            type="button"
            className="managerTaskModalAction stop"
            disabled={Boolean(busy)}
            onClick={() => timerAction(task, "stop")}
          >
            <Square size={15} /> Stop
          </button>
          <button
            type="button"
            className="managerTaskModalAction complete"
            disabled={Boolean(busy)}
            onClick={() => completeTask(task)}
          >
            <CheckCircle2 size={16} /> Complete
          </button>
          {isBusy && <RefreshCw size={15} className="managerTaskButtonSpin" />}
        </div>
      );
    }

    return (
      <div className="managerTaskModalActionGroup">
        <button
          type="button"
          className="managerTaskModalAction start"
          disabled={Boolean(busy) || Boolean(activeTaskId)}
          onClick={() => timerAction(task, canResume ? "resume" : "start")}
          title={
            activeTaskId
              ? "Another task timer is already running"
              : canResume
                ? "Resume timer"
                : "Start timer"
          }
        >
          <Play size={16} /> {canResume ? "Resume" : "Start"}
        </button>
        <button
          type="button"
          className="managerTaskModalAction complete"
          disabled={Boolean(busy)}
          onClick={() => completeTask(task)}
        >
          <CheckCircle2 size={16} /> Complete
        </button>
        {isBusy && <RefreshCw size={15} className="managerTaskButtonSpin" />}
      </div>
    );
  }

  return (
    <div
      className="managerTasksPage"
      data-view-mode={viewMode}
    >
      <div className="managerTasksHeader">
        <div>
          <h1>Task Management</h1>
          <p>
            Manage your assigned tasks and monitor tasks assigned to your team.
          </p>
        </div>

        <div className="managerTasksHeaderActions">
          <div
            className="managerTaskModeSwitch"
            role="group"
            aria-label="Task view"
          >
            <button
              type="button"
              className={viewMode === "OWN" ? "active" : ""}
              onClick={() => changeView("OWN")}
              aria-pressed={viewMode === "OWN"}
            >
              <Clock3 size={17} />
              My Tasks
            </button>

            <button
              type="button"
              className={viewMode === "TEAM" ? "active" : ""}
              onClick={() => changeView("TEAM")}
              aria-pressed={viewMode === "TEAM"}
            >
              <Users size={17} />
              Team Tasks
            </button>
          </div>

          {viewMode === "TEAM" && (
            <button
              type="button"
              className="managerTasksCreateButton"
              onClick={openCreateTask}
            >
              <Plus size={17} />
              Assign Task
            </button>
          )}

          <button
            type="button"
            className="managerTasksRefresh"
            onClick={refreshAll}
            disabled={isFetching || isTimerFetching}
          >
            <RefreshCw
              size={16}
              className={
                isFetching || isTimerFetching ? "managerTaskButtonSpin" : ""
              }
            />
            Refresh
          </button>
        </div>
      </div>

      {activeTaskId && viewMode === "OWN" && (
        <section className="managerActiveTaskTimer">
          <div className="managerActiveTaskTimerIcon">
            <Timer size={21} />
          </div>

          <div className="managerActiveTaskTimerInfo">
            <span>ACTIVE TASK TIMER</span>
            <strong>
              {activeTimer?.task?.taskNumber ||
                tasks.find((task) => task.id === activeTaskId)?.taskNumber ||
                "Current Task"}
              {" · "}
              {activeTimer?.task?.title ||
                tasks.find((task) => task.id === activeTaskId)?.title ||
                "Task"}
            </strong>
          </div>

          <div className="managerActiveTaskTimerClock">
            {activeTimerElapsed}
          </div>
        </section>
      )}

      {errorMessage && (
        <div className="managerTasksAlert">
          <XCircle size={17} />
          <span>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage("")}>
            Dismiss
          </button>
        </div>
      )}

      <section className="managerTaskSummary">
        <div className="managerTaskSummaryCard">
          <div className="managerTaskSummaryIcon total">
            <Clock3 size={18} />
          </div>
          <div>
            <span>{viewMode === "OWN" ? "My Tasks" : "Team Tasks"}</span>
            <strong>{summary.total}</strong>
          </div>
        </div>

        <div className="managerTaskSummaryCard">
          <div className="managerTaskSummaryIcon open">
            <Timer size={18} />
          </div>
          <div>
            <span>Open Tasks</span>
            <strong>{summary.open}</strong>
          </div>
        </div>

        <div className="managerTaskSummaryCard">
          <div className="managerTaskSummaryIcon progress">
            <Play size={18} />
          </div>
          <div>
            <span>In Progress</span>
            <strong>{summary.inProgress}</strong>
          </div>
        </div>

        <div className="managerTaskSummaryCard">
          <div className="managerTaskSummaryIcon completed">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <span>Completed</span>
            <strong>{summary.completed}</strong>
          </div>
        </div>

        <div className="managerTaskSummaryCard">
          <div className="managerTaskSummaryIcon urgent">
            <Filter size={18} />
          </div>
          <div>
            <span>Urgent</span>
            <strong>{summary.urgent}</strong>
          </div>
        </div>

        <div className="managerTaskSummaryCard">
          <div className="managerTaskSummaryIcon actual">
            <Clock3 size={18} />
          </div>
          <div>
            <span>Task Time</span>
            <strong>{fmt(summary.actual)}</strong>
          </div>
        </div>
      </section>

      <section className="managerTaskFilterCard">
        <div className="managerTaskFilterHeader">
          <div className="managerTaskFilterTitle">
            <Filter size={17} />
            <span>Task Filters</span>
          </div>

          <button
            type="button"
            className="managerTaskClear"
            onClick={clearFilters}
            disabled={!hasFilters}
          >
            Clear Filters
          </button>
        </div>

        <div className="managerTaskFilters" ref={filterRef}>
          <label className="managerTaskSearch">
            <Search size={17} />
            <input
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder={
                viewMode === "OWN"
                  ? "Search task number, title or project..."
                  : "Search employee, task, project or ID..."
              }
            />
          </label>

          <div className="managerTaskDropdown">
            <button
              type="button"
              className={`managerTaskDropdownButton ${
                openDropdown === "status" ? "open" : ""
              }`}
              onClick={() =>
                setOpenDropdown((current) =>
                  current === "status" ? null : "status",
                )
              }
            >
              <span>
                {STATUS_OPTIONS.find((option) => option.value === statusFilter)
                  ?.label || "All Status"}
              </span>
              <ChevronDown
                size={15}
                className={openDropdown === "status" ? "rotate" : ""}
              />
            </button>

            {openDropdown === "status" && (
              <div className="managerTaskDropdownMenu">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className={option.value === statusFilter ? "selected" : ""}
                    onClick={() => {
                      setStatusFilter(option.value);
                      setPage(1);
                      setOpenDropdown(null);
                    }}
                  >
                    <span>{option.label}</span>
                    {option.value === statusFilter && (
                      <CheckCircle2 size={14} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="managerTaskDropdown">
            <button
              type="button"
              className={`managerTaskDropdownButton ${
                openDropdown === "priority" ? "open" : ""
              }`}
              onClick={() =>
                setOpenDropdown((current) =>
                  current === "priority" ? null : "priority",
                )
              }
            >
              <span>
                {PRIORITY_OPTIONS.find(
                  (option) => option.value === priorityFilter,
                )?.label || "All Priorities"}
              </span>
              <ChevronDown
                size={15}
                className={openDropdown === "priority" ? "rotate" : ""}
              />
            </button>

            {openDropdown === "priority" && (
              <div className="managerTaskDropdownMenu">
                {PRIORITY_OPTIONS.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className={
                      option.value === priorityFilter ? "selected" : ""
                    }
                    onClick={() => {
                      setPriorityFilter(option.value);
                      setPage(1);
                      setOpenDropdown(null);
                    }}
                  >
                    <span>{option.label}</span>
                    {option.value === priorityFilter && (
                      <CheckCircle2 size={14} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="managerTaskTableCard">
        <div className="managerTaskTableHeader">
          <div>
            <h2>
              {viewMode === "OWN" ? "My Assigned Tasks" : "Team Assigned Tasks"}
            </h2>
            <p>
              {filteredTasks.length} task
              {filteredTasks.length === 1 ? "" : "s"} found
            </p>
          </div>

          <span className="managerTaskPageInfo">
            Page {currentPage} of {totalPages}
          </span>
        </div>

        {isLoading ? (
          <div className="managerTaskState">
            <RefreshCw size={21} className="managerTaskButtonSpin" />
            <span>Loading {viewMode === "OWN" ? "your" : "team"} tasks…</span>
          </div>
        ) : isError ? (
          <div className="managerTaskState error">
            <XCircle size={21} />
            <span>
              Unable to load {viewMode === "OWN" ? "your" : "team"} tasks.
            </span>
            <button type="button" onClick={() => refetch()}>
              Try Again
            </button>
          </div>
        ) : (
          <>
            <div className="managerTaskTableWrap" ref={taskTableWrapRef}>
              <table className={`managerTaskTable ${viewMode.toLowerCase()}`}>
                <thead>
                  <tr>
                    <th>Task</th>
                    {viewMode === "TEAM" && <th>Employee</th>}
                    <th>Assigned By</th>
                    <th>Project</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Due Date</th>
                    <th>Estimated</th>
                    <th>Actual</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleTasks.length ? (
                    visibleTasks.map((task) => {
                      const isActive = activeTaskId === task.id;

                      return (
                        <tr
                          key={task.id}
                          className={`managerTaskRow${
                            isActive ? " activeTaskRow" : ""
                          }`}
                          onClick={() => setSelectedTask(task)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedTask(task);
                            }
                          }}
                          tabIndex={0}
                          role="button"
                          aria-label={`Open details for ${task.taskNumber || "task"}`}
                          title="Click to view task details"
                        >
                          <td className="managerTaskMainCell">
                            <strong>{task.taskNumber}</strong>
                            <span>{task.title}</span>
                            {task.description && (
                              <small>{task.description}</small>
                            )}
                          </td>

                          {viewMode === "TEAM" && (
                            <td className="managerTaskEmployeeCell">
                              <strong>
                                {task.assignedTo?.fullName || "Unknown"}
                              </strong>
                              <small>
                                {task.assignedTo?.employeeId || "—"}
                              </small>
                            </td>
                          )}

                          <td className="managerTaskAssignedByCell">
                            <strong>
                              {task.assignedBy?.fullName ||
                                task.assignedBy?.email ||
                                "—"}
                            </strong>
                            <small>{task.assignedBy?.role || "—"}</small>
                          </td>

                          <td>{task.project?.name || "No Project"}</td>

                          <td
                            onClick={(event) => event.stopPropagation()}
                            onMouseDown={(event) => event.stopPropagation()}
                          >
                            {viewMode === "TEAM" ? (
                              <select
                                className={`managerTaskPrioritySelect ${priorityClass(
                                  task.priority,
                                )}`}
                                value={task.priority || "MEDIUM"}
                                disabled={Boolean(busy)}
                                aria-label={`Change priority for ${task.taskNumber}`}
                                onChange={(event) =>
                                  updateTeamPriority(task, event.target.value)
                                }
                              >
                                <option value="LOW">Low</option>
                                <option value="MEDIUM">Medium</option>
                                <option value="HIGH">High</option>
                                <option value="URGENT">Urgent</option>
                              </select>
                            ) : (
                              <span
                                className={`managerTaskPriority ${priorityClass(
                                  task.priority,
                                )}`}
                              >
                                {label(task.priority)}
                              </span>
                            )}
                          </td>

                          <td
                            onClick={(event) => event.stopPropagation()}
                            onMouseDown={(event) => event.stopPropagation()}
                          >
                            {viewMode === "TEAM" ? (
                              <select
                                className={`managerTaskStatusSelect ${statusClass(task.status)}`}
                                value={task.status || "TODO"}
                                disabled={Boolean(busy)}
                                aria-label={`Change status for ${task.taskNumber}`}
                                onChange={(event) =>
                                  updateTeamStatus(
                                    task,
                                    event.target.value as TaskStatus,
                                  )
                                }
                              >
                                {STATUS_OPTIONS.filter(
                                  (option) => option.value !== "ALL",
                                ).map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span
                                className={`managerTaskStatus ${statusClass(task.status)}`}
                              >
                                {label(task.status)}
                              </span>
                            )}
                          </td>

                          <td>{dateText(task.dueDate)}</td>

                          <td>
                            {task.estimatedMinutes
                              ? fmt(task.estimatedMinutes)
                              : "—"}
                          </td>

                          <td>
                            <strong className="managerTaskActual">
                              {fmt(Number(task.actualMinutes) || 0)}
                            </strong>

                            {isActive && (
                              <small className="managerTaskLive">
                                + {activeTimerElapsed} live
                              </small>
                            )}
                          </td>

                          <td
                            className="managerTaskActionsCell"
                            onClick={(event) => event.stopPropagation()}
                            onMouseDown={(event) => event.stopPropagation()}
                          >
                            {viewMode === "OWN"
                              ? renderOwnTimerActions(task)
                              : renderTeamActions(task)}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td
                        colSpan={viewMode === "TEAM" ? 10 : 9}
                        className="managerTaskNoResults"
                      >
                        <CheckCircle2 size={24} />
                        <strong>No tasks found</strong>
                        <span>
                          Try changing your filters or clear the filters.
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="managerTaskPagination">
              <span>
                Showing{" "}
                {filteredTasks.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}{" "}
                to {Math.min(currentPage * PAGE_SIZE, filteredTasks.length)} of{" "}
                {filteredTasks.length}
              </span>

              <div>
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  Previous
                </button>

                {Array.from({ length: totalPages }, (_, index) => index + 1)
                  .slice(
                    Math.max(0, currentPage - 3),
                    Math.min(totalPages, currentPage + 2),
                  )
                  .map((number) => (
                    <button
                      type="button"
                      key={number}
                      className={number === currentPage ? "active" : ""}
                      onClick={() => setPage(number)}
                    >
                      {number}
                    </button>
                  ))}

                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() =>
                    setPage((value) => Math.min(totalPages, value + 1))
                  }
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {createTaskOpen && (
        <div
          className="managerTaskModalOverlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !creatingTask) {
              setCreateTaskOpen(false);
              setCreateTaskError("");
            }
          }}
        >
          <div
            className="managerTaskModal managerTaskCreateModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-task-title"
          >
            <div className="managerTaskModalHeader">
              <div>
                <span>Team Management</span>
                <h2 id="create-task-title">Create & Assign Task</h2>
              </div>
              <button
                type="button"
                className="managerTaskModalClose"
                onClick={() => {
                  if (!creatingTask) {
                    setCreateTaskOpen(false);
                    setCreateTaskError("");
                  }
                }}
                aria-label="Close create task form"
                disabled={creatingTask}
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={createTask}>
              <div className="managerTaskModalBody managerTaskCreateBody">
                {createTaskError && (
                  <div className="managerTaskCreateMessage error" role="alert">
                    <XCircle size={16} />
                    <span>{createTaskError}</span>
                  </div>
                )}
                {createTaskSuccess && (
                  <div
                    className="managerTaskCreateMessage success"
                    role="status"
                  >
                    <CheckCircle2 size={16} />
                    <span>{createTaskSuccess}</span>
                  </div>
                )}

                <div className="managerTaskCreateIntro">
                  <div className="managerTaskCreateIntroIcon">
                    <Plus size={20} />
                  </div>
                  <div>
                    <strong>New team task</strong>
                    <p>Assign work to one of your direct-report employees.</p>
                  </div>
                </div>

                <div className="managerTaskCreateGrid">
                  <label className="managerTaskFormField full">
                    <span>
                      Task title <b>*</b>
                    </span>
                    <input
                      type="text"
                      maxLength={180}
                      required
                      autoFocus
                      value={createTaskForm.title}
                      onChange={(event) =>
                        setCreateTaskForm((form) => ({
                          ...form,
                          title: event.target.value,
                        }))
                      }
                      placeholder="e.g. Prepare monthly report"
                    />
                  </label>

                  <label className="managerTaskFormField full">
                    <span>Description</span>
                    <textarea
                      rows={3}
                      maxLength={5000}
                      value={createTaskForm.description}
                      onChange={(event) =>
                        setCreateTaskForm((form) => ({
                          ...form,
                          description: event.target.value,
                        }))
                      }
                      placeholder="Add task instructions or expected outcome..."
                    />
                  </label>

                  <label className="managerTaskFormField full">
                    <span>
                      <UserRound size={14} /> Assign to employee <b>*</b>
                    </span>
                    <select
                      required
                      value={createTaskForm.assignedToId}
                      disabled={
                        employeesLoading || employeeOptions.length === 0
                      }
                      onChange={(event) =>
                        setCreateTaskForm((form) => ({
                          ...form,
                          assignedToId: event.target.value,
                        }))
                      }
                    >
                      <option value="">
                        {employeesLoading
                          ? "Loading your team..."
                          : employeeOptions.length
                            ? "Select team employee"
                            : "No active team employees found"}
                      </option>
                      {employeeOptions.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.fullName}
                          {employee.employeeId
                            ? ` · ${employee.employeeId}`
                            : ""}
                        </option>
                      ))}
                    </select>
                    {!employeesLoading && employeeOptions.length === 0 && (
                      <small>
                        Check that active employees are assigned to you in
                        Employee Management.
                      </small>
                    )}
                  </label>

                  <label className="managerTaskFormField">
                    <span>
                      <FolderKanban size={14} /> Project{" "}
                      <small>(optional)</small>
                    </span>
                    <select
                      value={createTaskForm.projectId}
                      disabled={
                        projectsLoading ||
                        !managerEmployeeId ||
                        projectOptions.length === 0
                      }
                      onChange={(event) =>
                        setCreateTaskForm((form) => ({
                          ...form,
                          projectId: event.target.value,
                        }))
                      }
                    >
                      <option value="">
                        {projectsLoading
                          ? "Loading projects..."
                          : projectOptions.length
                            ? "No project"
                            : "No managed project"}
                      </option>
                      {projectOptions.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="managerTaskFormField">
                    <span>Priority</span>
                    <select
                      value={createTaskForm.priority}
                      onChange={(event) =>
                        setCreateTaskForm((form) => ({
                          ...form,
                          priority: event.target
                            .value as CreateTaskForm["priority"],
                        }))
                      }
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                  </label>

                  <label className="managerTaskFormField">
                    <span>
                      <CalendarDays size={14} /> Due date
                    </span>
                    <input
                      type="date"
                      value={createTaskForm.dueDate}
                      onChange={(event) =>
                        setCreateTaskForm((form) => ({
                          ...form,
                          dueDate: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="managerTaskFormField">
                    <span>
                      <Clock3 size={14} /> Estimated minutes
                    </span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={createTaskForm.estimatedMinutes}
                      onChange={(event) =>
                        setCreateTaskForm((form) => ({
                          ...form,
                          estimatedMinutes: event.target.value,
                        }))
                      }
                      placeholder="e.g. 120"
                    />
                  </label>
                </div>
              </div>

              <div className="managerTaskModalFooter managerTaskCreateFooter">
                <button
                  type="button"
                  className="managerTaskModalSecondary"
                  onClick={() => {
                    setCreateTaskOpen(false);
                    setCreateTaskError("");
                  }}
                  disabled={creatingTask}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="managerTaskModalPrimary"
                  disabled={
                    creatingTask ||
                    employeesLoading ||
                    employeeOptions.length === 0
                  }
                >
                  {creatingTask ? (
                    <RefreshCw size={15} className="managerTaskButtonSpin" />
                  ) : (
                    <Save size={15} />
                  )}
                  {creatingTask ? "Assigning..." : "Create & Assign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedTask && (
        <div
          className="managerTaskModalOverlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedTask(null);
            }
          }}
        >
          <div className="managerTaskModal">
            <div className="managerTaskModalHeader">
              <div>
                <span>Task Details</span>
                <h2>{selectedTask.taskNumber}</h2>
              </div>

              <button
                type="button"
                className="managerTaskModalClose"
                onClick={() => setSelectedTask(null)}
                aria-label="Close"
              >
                <X size={19} />
              </button>
            </div>

            <div className="managerTaskModalBody">
              <div className="managerTaskModalTitle">
                <h3>{selectedTask.title}</h3>
                {viewMode === "TEAM" ? (
                  <select
                    className={`managerTaskStatusSelect ${statusClass(selectedTask.status)}`}
                    value={selectedTask.status || "TODO"}
                    disabled={Boolean(busy)}
                    aria-label={`Change status for ${selectedTask.taskNumber}`}
                    onChange={(event) =>
                      updateTeamStatus(
                        selectedTask,
                        event.target.value as TaskStatus,
                      )
                    }
                  >
                    {STATUS_OPTIONS.filter(
                      (option) => option.value !== "ALL",
                    ).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span
                    className={`managerTaskStatus ${statusClass(selectedTask.status)}`}
                  >
                    {label(selectedTask.status)}
                  </span>
                )}
              </div>

              <div className="managerTaskDetailGrid">
                <div>
                  <span>Assigned Employee</span>
                  <strong>{selectedTask.assignedTo?.fullName || "—"}</strong>
                  <small>{selectedTask.assignedTo?.employeeId || "—"}</small>
                </div>

                <div>
                  <span>Project</span>
                  <strong>{selectedTask.project?.name || "No Project"}</strong>
                </div>

                <div>
                  <span>Priority</span>
                  {viewMode === "TEAM" ? (
                    <select
                      className={`managerTaskPrioritySelect ${priorityClass(
                        selectedTask.priority,
                      )}`}
                      value={selectedTask.priority || "MEDIUM"}
                      disabled={Boolean(busy)}
                      aria-label={`Change priority for ${selectedTask.taskNumber}`}
                      onChange={(event) =>
                        updateTeamPriority(selectedTask, event.target.value)
                      }
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                  ) : (
                    <strong>{label(selectedTask.priority)}</strong>
                  )}
                </div>

                <div>
                  <span>Due Date</span>
                  <strong>{dateText(selectedTask.dueDate)}</strong>
                </div>

                <div>
                  <span>Estimated Time</span>
                  <strong>
                    {selectedTask.estimatedMinutes
                      ? fmt(selectedTask.estimatedMinutes)
                      : "—"}
                  </strong>
                </div>

                <div>
                  <span>Actual Time</span>
                  <strong>
                    {fmt(Number(selectedTask.actualMinutes) || 0)}
                  </strong>
                </div>

                <div>
                  <span>Assigned By</span>
                  <strong>
                    {selectedTask.assignedBy?.fullName ||
                      selectedTask.assignedBy?.email ||
                      "—"}
                  </strong>
                </div>

                <div>
                  <span>Task Number</span>
                  <strong>{selectedTask.taskNumber}</strong>
                </div>
              </div>

              <div className="managerTaskDescription">
                <span>Description</span>
                <p>
                  {selectedTask.description || "No task description available."}
                </p>
              </div>

              {viewMode === "TEAM" && (
                <div className="managerTaskTeamNote">
                  <Users size={17} />
                  <span>
                    You can review task progress and update its status or
                    priority here. Status changes are saved immediately.
                  </span>
                </div>
              )}
            </div>

            <div className="managerTaskModalFooter">
              <button
                type="button"
                className="managerTaskModalSecondary"
                onClick={() => setSelectedTask(null)}
              >
                Close
              </button>

              {viewMode === "OWN" && renderOwnModalActions(selectedTask)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
