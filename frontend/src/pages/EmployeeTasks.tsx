import {
  CheckCircle2,
  ChevronDown,
  Clock3,
  Filter,
  History,
  MessageSquareText,
  Pause,
  Play,
  RefreshCw,
  Search,
  Square,
  Timer,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get, patch, post } from "../api/client";
import { fmt } from "../utils/time";
import type { Task } from "../types";
import "./employee-tasks.css";

type TaskStatus =
  | "BACKLOG"
  | "TODO"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "REVIEW"
  | "COMPLETED"
  | "CANCELLED";

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
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  project?: {
    id?: string;
    name?: string;
    description?: string;
    status?: string;
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
  timers?: Array<{
    id?: string;
    startedAt?: string;
    endedAt?: string;
  }>;
  comments?: Array<{
    id?: string;
    message?: string;
    createdAt?: string;
    author?: {
      fullName?: string;
    };
  }>;
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

function isCompleted(status?: string) {
  return status === "COMPLETED" || status === "CANCELLED";
}

function durationTextFromSeconds(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function timeText(value?: string) {
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function EmployeeTasks() {
  const qc = useQueryClient();

  const {
    data: tasksData,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["employee-tasks"],
    queryFn: () => get("/tasks"),
  });

  const { data: activeTimerData, isFetching: isTimerFetching } = useQuery({
    queryKey: ["employee-active-task-timer"],
    queryFn: () => get("/task-timers/active"),
    refetchInterval: 15000,
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [openDropdown, setOpenDropdown] = useState<
    "status" | "priority" | null
  >(null);
  const filterRef = useRef<HTMLDivElement | null>(null);

  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);

  const [timerNow, setTimerNow] = useState(Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setTimerNow(Date.now()), 1000);

    return () => window.clearInterval(interval);
  }, []);

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

    if (Array.isArray(activeTimerData)) {
      return activeTimerData[0] || null;
    }

    return (
      activeTimerData?.data || activeTimerData?.timer || activeTimerData || null
    );
  }, [activeTimerData]);

  const activeTaskId = activeTimer?.taskId || activeTimer?.task?.id || null;

  const activeTimerElapsedSeconds = useMemo(() => {
    if (!activeTimer?.startedAt) return 0;

    const started = new Date(activeTimer.startedAt).getTime();

    if (Number.isNaN(started)) return 0;

    return Math.max(0, Math.floor((timerNow - started) / 1000));
  }, [activeTimer, timerNow]);

  useEffect(() => {
    if (!selectedTask) return;

    const freshTask = tasks.find((task) => task.id === selectedTask.id);

    if (freshTask) {
      setSelectedTask((current) =>
        current ? { ...current, ...freshTask } : current,
      );
    }
  }, [tasks, selectedTask?.id]);

  useEffect(() => {
    function handleTaskModalKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedTask(null);
      }
    }

    if (!selectedTask) return;

    document.addEventListener("keydown", handleTaskModalKeyDown);
    return () =>
      document.removeEventListener("keydown", handleTaskModalKeyDown);
  }, [selectedTask]);

  function openTaskDetails(task: TaskRow) {
    setSelectedTask(task);
  }

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();

    return tasks.filter((task) => {
      const matchesSearch =
        !query ||
        task.taskNumber?.toLowerCase().includes(query) ||
        task.title?.toLowerCase().includes(query) ||
        task.project?.name?.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "ALL" || task.status === statusFilter;

      const matchesPriority =
        priorityFilter === "ALL" || task.priority === priorityFilter;

      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [tasks, search, statusFilter, priorityFilter]);

  const summary = useMemo(() => {
    const open = tasks.filter(
      (task) => task.status !== "COMPLETED" && task.status !== "CANCELLED",
    ).length;

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

    const estimated = tasks.reduce(
      (sum, task) => sum + (Number(task.estimatedMinutes) || 0),
      0,
    );

    return {
      total: tasks.length,
      open,
      inProgress,
      completed,
      urgent,
      actual,
      estimated,
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

  async function refreshAll() {
    setErrorMessage("");
    await Promise.all([
      refetch(),
      qc.invalidateQueries({
        queryKey: ["employee-active-task-timer"],
      }),
    ]);
  }

  async function timerAction(
    task: TaskRow,
    action: "start" | "pause" | "resume" | "stop",
  ) {
    setBusy(`${task.id}:${action}`);
    setErrorMessage("");

    try {
      await post(`/tasks/${task.id}/timer/${action}`);

      if (action === "start" || action === "resume") {
        if (
          task.status !== "IN_PROGRESS" &&
          task.status !== "COMPLETED" &&
          task.status !== "CANCELLED"
        ) {
          await patch(`/tasks/${task.id}`, {
            status: "IN_PROGRESS",
          });
        }
      }

      // The backend implements pause and stop by closing the current timer.
      // Keep Employee and Manager task status behavior consistent and resumable.
      if (
        (action === "pause" || action === "stop") &&
        task.status !== "COMPLETED" &&
        task.status !== "CANCELLED"
      ) {
        await patch(`/tasks/${task.id}`, { status: "ON_HOLD" });
      }

      await Promise.all([
        qc.invalidateQueries({
          queryKey: ["employee-tasks"],
        }),
        qc.invalidateQueries({
          queryKey: ["tasks"],
        }),
        qc.invalidateQueries({
          queryKey: ["employee-active-task-timer"],
        }),
      ]);
    } catch (error: any) {
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
        await post(`/tasks/${task.id}/timer/stop`);
      }

      const completedTask = (await patch(`/tasks/${task.id}`, {
        status: "COMPLETED",
      })) as TaskRow;

      setSelectedTask((current) =>
        current && current.id === task.id
          ? {
              ...current,
              ...(completedTask && typeof completedTask === "object"
                ? completedTask
                : {}),
              status: "COMPLETED",
              completedAt:
                completedTask?.completedAt || new Date().toISOString(),
            }
          : current,
      );

      await Promise.all([
        qc.invalidateQueries({
          queryKey: ["employee-tasks"],
        }),
        qc.invalidateQueries({
          queryKey: ["tasks"],
        }),
        qc.invalidateQueries({
          queryKey: ["employee-active-task-timer"],
        }),
      ]);
    } catch (error: any) {
      setErrorMessage(
        error?.response?.data?.message || "Unable to complete this task.",
      );
    } finally {
      setBusy("");
    }
  }

  function taskActualSeconds(task: TaskRow) {
    const storedSeconds = Math.max(0, Number(task.actualMinutes) || 0) * 60;

    if (activeTaskId !== task.id) {
      return storedSeconds;
    }

    return storedSeconds + activeTimerElapsedSeconds;
  }

  function selectedTaskActionLabel(task: TaskRow) {
    if (isCompleted(task.status)) {
      return task.status === "COMPLETED" ? "Completed" : "Cancelled";
    }

    if (activeTaskId === task.id) {
      return "Pause";
    }

    return task.status === "IN_PROGRESS" || task.status === "ON_HOLD"
      ? "Resume"
      : "Start";
  }

  function selectedTaskAction(task: TaskRow) {
    if (isCompleted(task.status)) return null;

    if (activeTaskId === task.id) {
      return "pause" as const;
    }

    return task.status === "IN_PROGRESS" || task.status === "ON_HOLD"
      ? ("resume" as const)
      : ("start" as const);
  }

  function renderTaskDetailsModal() {
    if (!selectedTask) return null;

    const liveSeconds = taskActualSeconds(selectedTask);
    const isActive = activeTaskId === selectedTask.id;
    const action = selectedTaskAction(selectedTask);
    const taskActionBusy = busy.startsWith(`${selectedTask.id}:`);

    return (
      <div
        className="employeeTaskModalOverlay"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setSelectedTask(null);
          }
        }}
      >
        <div
          className="employeeTaskModal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="employee-task-modal-title"
        >
          <div className="employeeTaskModalHeader">
            <div className="employeeTaskModalHeaderText">
              <span className="employeeTaskModalNumber">
                {selectedTask.taskNumber || "TASK"}
              </span>
              <h2 id="employee-task-modal-title">
                {selectedTask.title || "Task Details"}
              </h2>
            </div>

            <button
              type="button"
              className="employeeTaskModalClose"
              onClick={() => setSelectedTask(null)}
              aria-label="Close task details"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>

          <div className="employeeTaskModalBody">
            {selectedTask.description ? (
              <section className="employeeTaskModalDescription">
                <div className="employeeTaskModalSectionTitle">
                  <MessageSquareText size={15} />
                  Description
                </div>
                <p>{selectedTask.description}</p>
              </section>
            ) : null}

            <section className="employeeTaskModalSection">
              <div className="employeeTaskModalSectionTitle">
                <Clock3 size={15} />
                Task Information
              </div>

              <div className="employeeTaskModalGrid">
                <div className="employeeTaskModalItem">
                  <span>Task ID</span>
                  <strong>{selectedTask.id || "—"}</strong>
                </div>

                <div className="employeeTaskModalItem">
                  <span>Status</span>
                  <strong
                    className={`employeeTaskModalValueBadge ${statusClass(
                      selectedTask.status,
                    )}`}
                  >
                    {label(selectedTask.status)}
                  </strong>
                </div>

                <div className="employeeTaskModalItem">
                  <span>Project</span>
                  <strong>{selectedTask.project?.name || "No Project"}</strong>
                </div>

                <div className="employeeTaskModalItem">
                  <span>Priority</span>
                  <strong
                    className={`employeeTaskModalValueBadge ${priorityClass(
                      selectedTask.priority,
                    )}`}
                  >
                    {label(selectedTask.priority)}
                  </strong>
                </div>

                <div className="employeeTaskModalItem">
                  <span>Start Date</span>
                  <strong>{dateText(selectedTask.startDate)}</strong>
                </div>

                <div className="employeeTaskModalItem">
                  <span>Due Date</span>
                  <strong>{dateText(selectedTask.dueDate)}</strong>
                </div>

                <div className="employeeTaskModalItem">
                  <span>Estimated Time</span>
                  <strong>
                    {selectedTask.estimatedMinutes
                      ? durationTextFromSeconds(
                          Number(selectedTask.estimatedMinutes) * 60,
                        )
                      : "—"}
                  </strong>
                </div>

                <div className="employeeTaskModalItem employeeTaskModalActualItem">
                  <span>Actual Time</span>
                  <strong>{durationTextFromSeconds(liveSeconds)}</strong>
                  {isActive && (
                    <small>
                      LIVE +{" "}
                      {durationTextFromSeconds(activeTimerElapsedSeconds)}
                    </small>
                  )}
                </div>

                <div className="employeeTaskModalItem">
                  <span>Created</span>
                  <strong>{timeText(selectedTask.createdAt)}</strong>
                </div>

                <div className="employeeTaskModalItem">
                  <span>Last Updated</span>
                  <strong>{timeText(selectedTask.updatedAt)}</strong>
                </div>

                <div className="employeeTaskModalItem">
                  <span>Completed</span>
                  <strong>{timeText(selectedTask.completedAt)}</strong>
                </div>

                <div className="employeeTaskModalItem">
                  <span>Timer Sessions</span>
                  <strong>{selectedTask.timers?.length ?? 0}</strong>
                </div>
              </div>
            </section>

            <section className="employeeTaskModalSection">
              <div className="employeeTaskModalSectionTitle">
                <UserRound size={15} />
                Assignment
              </div>

              <div className="employeeTaskModalGrid">
                <div className="employeeTaskModalItem">
                  <span>Assigned To</span>
                  <strong>{selectedTask.assignedTo?.fullName || "—"}</strong>
                  <small>
                    {selectedTask.assignedTo?.employeeId || "Employee"}
                  </small>
                </div>

                <div className="employeeTaskModalItem">
                  <span>Assigned By</span>
                  <strong>
                    {selectedTask.assignedBy?.fullName ||
                      selectedTask.assignedBy?.email ||
                      "—"}
                  </strong>
                  <small>{selectedTask.assignedBy?.role || "—"}</small>
                </div>

                <div className="employeeTaskModalItem">
                  <span>Project Status</span>
                  <strong>{label(selectedTask.project?.status)}</strong>
                </div>

                <div className="employeeTaskModalItem">
                  <span>Project ID</span>
                  <strong>{selectedTask.project?.id || "—"}</strong>
                </div>
              </div>
            </section>

            {(selectedTask.comments?.length ?? 0) > 0 ? (
              <section className="employeeTaskModalSection">
                <div className="employeeTaskModalSectionTitle">
                  <History size={15} />
                  Task Comments
                </div>

                <div className="employeeTaskModalComments">
                  {selectedTask.comments?.map((comment) => (
                    <div className="employeeTaskModalComment" key={comment.id}>
                      <div>
                        <strong>
                          {comment.author?.fullName || "Employee"}
                        </strong>
                        <span>{timeText(comment.createdAt)}</span>
                      </div>
                      <p>{comment.message || "—"}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <div className="employeeTaskModalFooter">
            <div className="employeeTaskModalFooterMeta">
              {isActive ? (
                <span className="employeeTaskModalLiveBadge">
                  <Timer size={14} />
                  Running · {durationTextFromSeconds(activeTimerElapsedSeconds)}
                </span>
              ) : isCompleted(selectedTask.status) ? (
                <span className="employeeTaskModalCompletedBadge">
                  <CheckCircle2 size={14} />
                  {selectedTaskActionLabel(selectedTask)}
                </span>
              ) : (
                <span className="employeeTaskModalHint">
                  Task timer is separate from active browser time.
                </span>
              )}
            </div>

            <div className="employeeTaskModalActions">
              {!isCompleted(selectedTask.status) && action && (
                <>
                  {action === "pause" ? (
                    <button
                      type="button"
                      className="employeeTaskModalButton warning"
                      disabled={Boolean(busy)}
                      onClick={() => timerAction(selectedTask, "pause")}
                    >
                      <Pause size={14} />
                      Pause
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="employeeTaskModalButton primary"
                      disabled={Boolean(busy) || Boolean(activeTaskId)}
                      onClick={() => timerAction(selectedTask, action)}
                    >
                      <Play size={14} />
                      {action === "resume" ? "Resume" : "Start"}
                    </button>
                  )}

                  {isActive && (
                    <button
                      type="button"
                      className="employeeTaskModalButton danger"
                      disabled={Boolean(busy)}
                      onClick={() => timerAction(selectedTask, "stop")}
                    >
                      <Square size={13} />
                      Stop
                    </button>
                  )}

                  <button
                    type="button"
                    className="employeeTaskModalButton success"
                    disabled={Boolean(busy)}
                    onClick={() => completeTask(selectedTask)}
                  >
                    <CheckCircle2 size={14} />
                    Complete
                  </button>
                </>
              )}

              {taskActionBusy && (
                <RefreshCw size={15} className="employeeTaskButtonSpin" />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderTimerAction(task: TaskRow) {
    if (isCompleted(task.status)) {
      return (
        <span className="employeeTaskCompletedAction">
          <CheckCircle2 size={15} />
          {task.status === "COMPLETED" ? "Completed" : "Cancelled"}
        </span>
      );
    }

    const isActive = activeTaskId === task.id;
    const isBusy = busy.startsWith(`${task.id}:`);

    if (isActive) {
      return (
        <div className="employeeTaskActionGroup">
          <button
            type="button"
            className="employeeTaskAction warning"
            disabled={Boolean(busy)}
            onClick={() => timerAction(task, "pause")}
            title="Pause timer"
          >
            <Pause size={14} />
            Pause
          </button>

          <button
            type="button"
            className="employeeTaskAction danger"
            disabled={Boolean(busy)}
            onClick={() => timerAction(task, "stop")}
            title="Stop timer"
          >
            <Square size={13} />
            Stop
          </button>

          <button
            type="button"
            className="employeeTaskAction success"
            disabled={Boolean(busy)}
            onClick={() => completeTask(task)}
            title="Complete task"
          >
            <CheckCircle2 size={14} />
            Complete
          </button>

          {isBusy && <RefreshCw size={14} className="employeeTaskButtonSpin" />}
        </div>
      );
    }

    const canResume =
      task.status === "IN_PROGRESS" || task.status === "ON_HOLD";

    return (
      <div className="employeeTaskActionGroup">
        <button
          type="button"
          className="employeeTaskAction primary"
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
          <Play size={14} />
          {canResume ? "Resume" : "Start"}
        </button>

        <button
          type="button"
          className="employeeTaskAction success"
          disabled={Boolean(busy)}
          onClick={() => completeTask(task)}
        >
          <CheckCircle2 size={14} />
          Complete
        </button>

        {isBusy && <RefreshCw size={14} className="employeeTaskButtonSpin" />}
      </div>
    );
  }

  return (
    <div className="employeeTasksPage">
      <div className="employeeTasksHeader">
        <div>
          <h1>My Tasks</h1>
          <p>
            Manage your assigned tasks and track task time. Task time is
            separate from active browser time.
          </p>
        </div>

        <button
          type="button"
          className="employeeTasksRefresh"
          onClick={refreshAll}
          disabled={isFetching || isTimerFetching}
        >
          <RefreshCw
            size={16}
            className={
              isFetching || isTimerFetching ? "employeeTaskButtonSpin" : ""
            }
          />
          Refresh
        </button>
      </div>

      {activeTaskId && (
        <section className="employeeActiveTimer">
          <div className="employeeActiveTimerIcon">
            <Timer size={20} />
          </div>

          <div className="employeeActiveTimerInfo">
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

          <div className="employeeActiveTimerClock">
            {durationTextFromSeconds(activeTimerElapsedSeconds)}
          </div>
        </section>
      )}

      {errorMessage && (
        <div className="employeeTasksAlert">
          <XCircle size={17} />
          <span>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage("")}>
            Dismiss
          </button>
        </div>
      )}

      <section className="employeeTaskSummary">
        <div className="employeeTaskSummaryCard">
          <div className="employeeTaskSummaryIcon total">
            <Clock3 size={18} />
          </div>
          <div>
            <span>Total Tasks</span>
            <strong>{summary.total}</strong>
          </div>
        </div>

        <div className="employeeTaskSummaryCard">
          <div className="employeeTaskSummaryIcon open">
            <Timer size={18} />
          </div>
          <div>
            <span>Open Tasks</span>
            <strong>{summary.open}</strong>
          </div>
        </div>

        <div className="employeeTaskSummaryCard">
          <div className="employeeTaskSummaryIcon progress">
            <Play size={18} />
          </div>
          <div>
            <span>In Progress</span>
            <strong>{summary.inProgress}</strong>
          </div>
        </div>

        <div className="employeeTaskSummaryCard">
          <div className="employeeTaskSummaryIcon completed">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <span>Completed</span>
            <strong>{summary.completed}</strong>
          </div>
        </div>

        <div className="employeeTaskSummaryCard">
          <div className="employeeTaskSummaryIcon urgent">
            <Filter size={18} />
          </div>
          <div>
            <span>Urgent</span>
            <strong>{summary.urgent}</strong>
          </div>
        </div>

        <div className="employeeTaskSummaryCard">
          <div className="employeeTaskSummaryIcon actual">
            <ActivityIcon />
          </div>
          <div>
            <span>Task Time</span>
            <strong>{fmt(summary.actual)}</strong>
          </div>
        </div>
      </section>

      <section className="employeeTaskFilterCard">
        <div className="employeeTaskFilterHeader">
          <div className="employeeTaskFilterTitle">
            <Filter size={17} />
            <span>Task Filters</span>
          </div>

          <button
            type="button"
            className="employeeTaskClear"
            onClick={clearFilters}
            disabled={!hasFilters}
          >
            Clear Filters
          </button>
        </div>

        <div className="employeeTaskFilters" ref={filterRef}>
          <label className="employeeTaskSearch">
            <Search size={17} />
            <input
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search task number, title or project..."
            />
          </label>

          <div className="employeeTaskDropdown">
            <button
              type="button"
              className={`employeeTaskDropdownButton ${
                openDropdown === "status" ? "open" : ""
              }`}
              onClick={() =>
                setOpenDropdown((current) =>
                  current === "status" ? null : "status",
                )
              }
              aria-haspopup="listbox"
              aria-expanded={openDropdown === "status"}
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
              <div className="employeeTaskDropdownMenu" role="listbox">
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

          <div className="employeeTaskDropdown">
            <button
              type="button"
              className={`employeeTaskDropdownButton ${
                openDropdown === "priority" ? "open" : ""
              }`}
              onClick={() =>
                setOpenDropdown((current) =>
                  current === "priority" ? null : "priority",
                )
              }
              aria-haspopup="listbox"
              aria-expanded={openDropdown === "priority"}
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
              <div className="employeeTaskDropdownMenu" role="listbox">
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

      <section className="employeeTaskTableCard">
        <div className="employeeTaskTableHeader">
          <div>
            <h2>My Assigned Tasks</h2>
            <p>
              {filteredTasks.length} task
              {filteredTasks.length === 1 ? "" : "s"} found
            </p>
          </div>

          <span className="employeeTaskPageInfo">
            Page {currentPage} of {totalPages}
          </span>
        </div>

        {isLoading ? (
          <div className="employeeTaskState">
            <RefreshCw size={21} className="employeeTaskButtonSpin" />
            <span>Loading your tasks…</span>
          </div>
        ) : isError ? (
          <div className="employeeTaskState error">
            <XCircle size={21} />
            <span>Unable to load your assigned tasks.</span>
            <button type="button" onClick={() => refetch()}>
              Try Again
            </button>
          </div>
        ) : (
          <>
            <div className="employeeTaskTableWrap">
              <table className="employeeTaskTable">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Project</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Due Date</th>
                    <th>Estimated</th>
                    <th>Actual</th>
                    <th>Timer / Action</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleTasks.length ? (
                    visibleTasks.map((task) => {
                      const isActive = activeTaskId === task.id;

                      return (
                        <tr
                          key={task.id}
                          className={`employeeTaskClickableRow ${
                            isActive ? "activeTaskRow" : ""
                          }`}
                          onClick={() => openTaskDetails(task)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openTaskDetails(task);
                            }
                          }}
                          tabIndex={0}
                          role="button"
                          title="Open task details"
                        >
                          <td className="employeeTaskMainCell">
                            <strong>{task.taskNumber}</strong>
                            <span>{task.title}</span>
                            {task.description && (
                              <small>{task.description}</small>
                            )}
                          </td>

                          <td>{task.project?.name || "No Project"}</td>

                          <td>
                            <span
                              className={`employeeTaskPriority ${priorityClass(
                                task.priority,
                              )}`}
                            >
                              {label(task.priority)}
                            </span>
                          </td>

                          <td>
                            <span
                              className={`employeeTaskStatus ${statusClass(
                                task.status,
                              )}`}
                            >
                              {label(task.status)}
                            </span>
                          </td>

                          <td>{dateText(task.dueDate)}</td>

                          <td>
                            {task.estimatedMinutes
                              ? fmt(task.estimatedMinutes)
                              : "—"}
                          </td>

                          <td>
                            <strong className="employeeTaskActual">
                              {durationTextFromSeconds(taskActualSeconds(task))}
                            </strong>
                            {isActive && (
                              <small className="employeeTaskLive">
                                LIVE +{" "}
                                {durationTextFromSeconds(
                                  activeTimerElapsedSeconds,
                                )}
                              </small>
                            )}
                          </td>

                          <td onClick={(event) => event.stopPropagation()}>
                            {renderTimerAction(task)}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="employeeTaskNoResults">
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

            <div className="employeeTaskPagination">
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

      {renderTaskDetailsModal()}
    </div>
  );
}

function ActivityIcon() {
  return (
    <span className="employeeTaskActivityIcon">
      <Clock3 size={18} />
    </span>
  );
}
