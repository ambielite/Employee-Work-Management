import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { del, get, patch, post } from "../api/client";
import type { Task } from "../types";
import { fmt } from "../utils/time";
import "./admin-tasks.css";

type TaskStatus =
  | "BACKLOG"
  | "TODO"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "REVIEW"
  | "COMPLETED"
  | "CANCELLED";

type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

type EmployeeOption = {
  id: string;
  employeeId?: string;
  fullName: string;
  accountStatus?: string;
  employmentStatus?: string;
};

type ProjectOption = {
  id: string;
  name: string;
  status?: string;
};

type CreateTaskForm = {
  title: string;
  description: string;
  assignedToId: string;
  projectId: string;
  priority: TaskPriority;
  dueDate: string;
  estimatedHours: string;
  estimatedMinutes: string;
};

const STATUS_OPTIONS: TaskStatus[] = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "ON_HOLD",
  "REVIEW",
  "COMPLETED",
  "CANCELLED",
];

const PRIORITY_OPTIONS: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const TASKS_PER_PAGE = 10;

const EMPTY_FORM: CreateTaskForm = {
  title: "",
  description: "",
  assignedToId: "",
  projectId: "",
  priority: "MEDIUM",
  dueDate: "",
  estimatedHours: "",
  estimatedMinutes: "",
};

function formatStatus(status?: string) {
  if (!status) return "—";

  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPriority(priority?: string) {
  if (!priority) return "—";

  return priority.charAt(0) + priority.slice(1).toLowerCase();
}

function formatDate(date?: string | null) {
  if (!date) return "—";

  const d = new Date(date);

  if (Number.isNaN(d.getTime())) {
    return "—";
  }

  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getAssignedEmployee(task: any) {
  return task.assignedTo?.fullName || "Unassigned";
}

export default function AdminTasks() {
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [showCreateModal, setShowCreateModal] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedDetailsTask, setSelectedDetailsTask] = useState<Task | null>(
    null,
  );

  const [form, setForm] = useState<CreateTaskForm>(EMPTY_FORM);

  const [formError, setFormError] = useState("");

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  /*
   * =========================================================
   * CREATE FORM ERROR SCROLL
   *
   * When validation fails, the error is displayed at the
   * beginning of the form. If the user is currently scrolled
   * lower inside the modal, automatically scroll the modal
   * back to the error message.
   * =========================================================
   */

  const formErrorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!formError || !showCreateModal) {
      return;
    }

    /*
     * requestAnimationFrame makes sure the error element has
     * already been rendered before scrolling to it.
     */
    requestAnimationFrame(() => {
      formErrorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [formError, showCreateModal]);

  function showToast(type: "success" | "error", message: string) {
    setToast({
      type,
      message,
    });

    window.setTimeout(() => {
      setToast(null);
    }, 3000);
  }

  /* =====================================================
     TASKS
  ===================================================== */

  const {
    data: tasks = [],
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<Task[]>({
    queryKey: ["admin-tasks"],
    queryFn: () => get<Task[]>("/tasks"),
  });

  /* =====================================================
     EMPLOYEES
     Load employees independently.
  ===================================================== */

  const { data: employeeData = [], isLoading: employeesLoading } = useQuery<
    EmployeeOption[]
  >({
    queryKey: ["admin-task-employees"],
    queryFn: () => get<EmployeeOption[]>("/employees"),
  });

  const employees = useMemo(() => {
    return employeeData
      .filter(
        (employee) =>
          employee.accountStatus !== "INACTIVE" &&
          employee.employmentStatus !== "RESIGNED" &&
          employee.employmentStatus !== "TERMINATED",
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [employeeData]);

  /* =====================================================
     PROJECTS
     Load projects independently.
  ===================================================== */

  const { data: projectData = [], isLoading: projectsLoading } = useQuery<
    ProjectOption[]
  >({
    queryKey: ["admin-task-projects"],
    queryFn: () => get<ProjectOption[]>("/projects"),
  });

  const projects = useMemo(() => {
    return projectData
      .filter((project) => !project.status || project.status === "ACTIVE")
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projectData]);

  /* =====================================================
     FILTERED TASKS
  ===================================================== */

  const filteredTasks = useMemo(() => {
    const value = search.trim().toLowerCase();

    return (tasks as any[]).filter((task) => {
      const employeeName = getAssignedEmployee(task).toLowerCase();

      const matchesSearch =
        !value ||
        String(task.taskNumber || "")
          .toLowerCase()
          .includes(value) ||
        String(task.title || "")
          .toLowerCase()
          .includes(value) ||
        employeeName.includes(value);

      const matchesStatus = !statusFilter || task.status === statusFilter;

      const matchesPriority =
        !priorityFilter || task.priority === priorityFilter;

      const matchesEmployee =
        !assignedFilter || task.assignedTo?.id === assignedFilter;

      return (
        matchesSearch && matchesStatus && matchesPriority && matchesEmployee
      );
    });
  }, [tasks, search, statusFilter, priorityFilter, assignedFilter]);

  /* =====================================================
     PAGINATION
  ===================================================== */

  const totalPages = Math.max(
    1,
    Math.ceil(filteredTasks.length / TASKS_PER_PAGE),
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, priorityFilter, assignedFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pageStartIndex = (currentPage - 1) * TASKS_PER_PAGE;
  const pageEndIndex = Math.min(
    pageStartIndex + TASKS_PER_PAGE,
    filteredTasks.length,
  );

  const paginatedTasks = filteredTasks.slice(pageStartIndex, pageEndIndex);

  function goToPage(page: number) {
    setCurrentPage(Math.min(Math.max(page, 1), totalPages));
  }

  /* =====================================================
     SUMMARY
  ===================================================== */

  const summary = useMemo(() => {
    const all = tasks as any[];

    return {
      total: all.length,

      completed: all.filter((task) => task.status === "COMPLETED").length,

      inProgress: all.filter((task) => task.status === "IN_PROGRESS").length,

      pending: all.filter(
        (task) =>
          task.status === "BACKLOG" ||
          task.status === "TODO" ||
          task.status === "ON_HOLD",
      ).length,

      urgent: all.filter((task) => task.priority === "URGENT").length,

      actualMinutes: all.reduce(
        (total, task) => total + Number(task.actualMinutes || 0),
        0,
      ),
    };
  }, [tasks]);

  /* =====================================================
     CREATE TASK
  ===================================================== */

  const createMutation = useMutation({
    mutationFn: (payload: {
      title: string;
      description?: string;
      assignedToId: string;
      projectId?: string;
      priority: TaskPriority;
      dueDate?: string;
      estimatedMinutes?: number;
    }) => post("/tasks", payload),

    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["admin-tasks"],
      });

      setShowCreateModal(false);
      setForm(EMPTY_FORM);
      setFormError("");

      showToast("success", "Task created successfully.");
    },

    onError: (error: any) => {
      const message =
        error?.response?.data?.message || "Unable to create task.";

      showToast("error", Array.isArray(message) ? message.join(", ") : message);
    },
  });

  /* =====================================================
     STATUS UPDATE
  ===================================================== */

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      patch(`/tasks/${id}`, {
        status,
      }),

    onSuccess: (_, variables) => {
      qc.invalidateQueries({
        queryKey: ["admin-tasks"],
      });

      setSelectedDetailsTask((current) =>
        current && current.id === variables.id
          ? { ...current, status: variables.status }
          : current,
      );

      showToast("success", "Task status updated.");
    },

    onError: (error: any) => {
      showToast(
        "error",
        error?.response?.data?.message || "Unable to update task status.",
      );
    },
  });

  /* =====================================================
     PRIORITY UPDATE - ADMIN ONLY
  ===================================================== */

  const priorityMutation = useMutation({
    mutationFn: ({ id, priority }: { id: string; priority: TaskPriority }) =>
      patch(`/tasks/${id}`, { priority }),

    onSuccess: (_, variables) => {
      qc.invalidateQueries({
        queryKey: ["admin-tasks"],
      });

      setSelectedDetailsTask((current) =>
        current && current.id === variables.id
          ? { ...current, priority: variables.priority }
          : current,
      );

      showToast("success", "Task priority updated.");
    },

    onError: (error: any) => {
      showToast(
        "error",
        error?.response?.data?.message || "Unable to update task priority.",
      );
    },
  });

  /* =====================================================
     DELETE TASK
  ===================================================== */

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del(`/tasks/${id}`),

    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["admin-tasks"],
      });

      setShowDeleteConfirm(false);
      setSelectedTask(null);

      showToast("success", "Task deleted successfully.");
    },

    onError: (error: any) => {
      showToast(
        "error",
        error?.response?.data?.message || "Unable to delete task.",
      );
    },
  });

  /* =====================================================
     FILTERS
  ===================================================== */

  function clearFilters() {
    setSearch("");
    setStatusFilter("");
    setPriorityFilter("");
    setAssignedFilter("");
    setCurrentPage(1);
  }

  const hasFilters =
    !!search || !!statusFilter || !!priorityFilter || !!assignedFilter;

  /* =====================================================
     CREATE MODAL
  ===================================================== */

  function openCreateModal() {
    setForm(EMPTY_FORM);
    setFormError("");
    setShowCreateModal(true);
  }

  function closeCreateModal() {
    if (createMutation.isPending) return;

    setShowCreateModal(false);
    setForm(EMPTY_FORM);
    setFormError("");
  }

  function validateForm() {
    const title = form.title.trim();

    if (!title) {
      return "Task title is required.";
    }

    if (title.length < 2) {
      return "Task title must contain at least 2 characters.";
    }

    if (title.length > 150) {
      return "Task title cannot exceed 150 characters.";
    }

    if (!form.assignedToId) {
      return "Please select an employee.";
    }

    const hours = form.estimatedHours ? Number(form.estimatedHours) : 0;

    const minutes = form.estimatedMinutes ? Number(form.estimatedMinutes) : 0;

    if (form.estimatedHours && (!Number.isInteger(hours) || hours < 0)) {
      return "Estimated hours must be a valid number.";
    }

    if (
      form.estimatedMinutes &&
      (!Number.isInteger(minutes) || minutes < 0 || minutes > 59)
    ) {
      return "Estimated minutes must be between 0 and 59.";
    }

    if (hours === 0 && minutes === 0) {
      return "Please enter estimated time.";
    }

    return "";
  }

  function submitCreate(e: React.FormEvent) {
    e.preventDefault();

    const error = validateForm();

    if (error) {
      setFormError(error);
      return;
    }

    const hours = form.estimatedHours ? Number(form.estimatedHours) : 0;

    const minutes = form.estimatedMinutes ? Number(form.estimatedMinutes) : 0;

    const totalMinutes = hours * 60 + minutes;

    setFormError("");

    createMutation.mutate({
      title: form.title.trim(),

      description: form.description.trim() || undefined,

      assignedToId: form.assignedToId,

      projectId: form.projectId || undefined,

      priority: form.priority,

      dueDate: form.dueDate || undefined,

      estimatedMinutes: totalMinutes,
    });
  }

  /* =====================================================
     DELETE
  ===================================================== */

  function openTaskDetails(task: Task) {
    setSelectedDetailsTask(task);
  }

  function closeTaskDetails() {
    if (priorityMutation.isPending || statusMutation.isPending) return;
    setSelectedDetailsTask(null);
  }

  function confirmDelete(task: Task) {
    setSelectedTask(task);
    setShowDeleteConfirm(true);
  }

  function deleteSelectedTask() {
    if (!selectedTask) return;

    deleteMutation.mutate(selectedTask.id);
  }

  /* =====================================================
     STATUS
  ===================================================== */

  function changeStatus(task: Task, status: TaskStatus) {
    if (task.status === status) return;

    statusMutation.mutate({
      id: task.id,
      status,
    });
  }

  /* =====================================================
     RENDER
  ===================================================== */

  return (
    <div className="adminTasksPage">
      {/* =================================================
          TOAST
      ================================================= */}

      {toast && (
        <div
          className={`adminTasksToast adminTasksToast-${toast.type}`}
          role="alert"
        >
          <span>
            {toast.type === "success" ? (
              <CheckCircle2 size={17} />
            ) : (
              <X size={17} />
            )}
          </span>

          <span>{toast.message}</span>

          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Close notification"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* =================================================
          HEADER
      ================================================= */}

      <div className="adminTasksHeader">
        <div>
          <div className="adminTasksTitleRow">
            <div className="adminTasksTitleIcon">
              <ClipboardList size={21} />
            </div>

            <div>
              <h1>Tasks</h1>

              <p>Manage employee tasks, priorities, progress and completion.</p>
            </div>
          </div>
        </div>

        <div className="adminTasksHeaderActions">
          <button
            type="button"
            className="btn primary adminTasksRefreshBtn"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              size={15}
              className={isFetching ? "adminTasksSpin" : ""}
            />
            Refresh
          </button>

          <button
            type="button"
            className="adminTasksPrimaryBtn"
            onClick={openCreateModal}
          >
            <Plus size={16} />
            Add Task
          </button>
        </div>
      </div>

      {/* =================================================
          SUMMARY
      ================================================= */}

      <div className="adminTasksSummaryGrid">
        <div className="adminTasksSummaryCard total">
          <div className="adminTasksSummaryIcon">
            <ClipboardList size={17} />
          </div>

          <div>
            <span>Total Tasks</span>
            <strong>{summary.total}</strong>
          </div>
        </div>

        <div className="adminTasksSummaryCard inProgress">
          <div className="adminTasksSummaryIcon">
            <Clock3 size={17} />
          </div>

          <div>
            <span>In Progress</span>
            <strong>{summary.inProgress}</strong>
          </div>
        </div>

        <div className="adminTasksSummaryCard completed">
          <div className="adminTasksSummaryIcon">
            <CheckCircle2 size={17} />
          </div>

          <div>
            <span>Completed</span>
            <strong>{summary.completed}</strong>
          </div>
        </div>

        <div className="adminTasksSummaryCard pending">
          <div className="adminTasksSummaryIcon">
            <ClipboardList size={17} />
          </div>

          <div>
            <span>Pending</span>
            <strong>{summary.pending}</strong>
          </div>
        </div>

        <div className="adminTasksSummaryCard urgent">
          <div className="adminTasksSummaryIcon">
            <Filter size={17} />
          </div>

          <div>
            <span>Urgent</span>
            <strong>{summary.urgent}</strong>
          </div>
        </div>

        <div className="adminTasksSummaryCard actualTime">
          <div className="adminTasksSummaryIcon">
            <Clock3 size={17} />
          </div>

          <div>
            <span>Actual Time</span>
            <strong>{fmt(summary.actualMinutes)}</strong>
          </div>
        </div>
      </div>

      {/* =================================================
          FILTERS
      ================================================= */}

      <div className="adminTasksFilterCard">
        <div className="adminTasksFilterHeader">
          <div className="adminTasksFilterTitle">
            <Filter size={15} />
            <span> Tasks Filter</span>
          </div>

          <button
            type="button"
            className="btn primary adminTasksClearBtn"
            onClick={clearFilters}
            disabled={!hasFilters}
          >
            Clear Filters
          </button>
        </div>

        <div className="adminTasksFilter">
          <div className="adminTasksSearch">
            <Search size={16} />

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search task, title or employee..."
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Status</option>

            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {formatStatus(status)}
              </option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="">All Priority</option>

            {PRIORITY_OPTIONS.map((priority) => (
              <option key={priority} value={priority}>
                {formatPriority(priority)}
              </option>
            ))}
          </select>

          <select
            value={assignedFilter}
            onChange={(e) => setAssignedFilter(e.target.value)}
          >
            <option value="">All Employees</option>

            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* =================================================
          TABLE
      ================================================= */}

      <div className="adminTasksTableCard">
        <div className="adminTasksTableHeader">
          <div>
            <h2>Task List</h2>

            <span>
              {filteredTasks.length === 0
                ? `Showing 0 of ${tasks.length} tasks`
                : `Showing ${pageStartIndex + 1}-${pageEndIndex} of ${filteredTasks.length} tasks`}
            </span>
          </div>

          <div className="adminTasksTableCount">
            <Users size={15} />
            {employees.length} employees
          </div>
        </div>

        {isLoading ? (
          <div className="adminTasksState">
            <div className="adminTasksLoader" />

            <span>Loading tasks...</span>
          </div>
        ) : isError ? (
          <div className="adminTasksState adminTasksErrorState">
            <span>Unable to load tasks.</span>

            <button type="button" onClick={() => refetch()}>
              Try Again
            </button>
          </div>
        ) : (
          <>
            <div className="adminTasksTableWrap">
              <table className="adminTasksTable">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Title</th>
                    <th>Assigned To</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Due Date</th>
                    <th>Estimated</th>
                    <th>Actual</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedTasks.length === 0 ? (
                    <tr>
                      <td colSpan={9}>
                        <div className="adminTasksTableEmpty">
                          <ClipboardList size={28} />

                          <strong>No tasks found</strong>

                          <span>
                            {hasFilters
                              ? "Try changing or clearing your filters."
                              : "Create your first task to get started."}
                          </span>

                          {!hasFilters && (
                            <button
                              type="button"
                              className="adminTasksEmptyBtn"
                              onClick={openCreateModal}
                            >
                              <Plus size={15} />
                              Add Task
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    (paginatedTasks as any[]).map((task) => (
                      <tr
                        key={task.id}
                        className="adminTasksClickableRow"
                        onClick={() => openTaskDetails(task)}
                      >
                        <td>
                          <strong className="adminTasksNumber">
                            {task.taskNumber}
                          </strong>
                        </td>

                        <td>
                          <div className="adminTasksTaskTitle">
                            <strong>{task.title}</strong>

                            {task.description && (
                              <span>{task.description}</span>
                            )}
                          </div>
                        </td>

                        <td>
                          <div className="adminTasksEmployee">
                            <strong>{getAssignedEmployee(task)}</strong>

                            {task.assignedTo?.employeeId && (
                              <span>{task.assignedTo.employeeId}</span>
                            )}
                          </div>
                        </td>

                        <td>
                          <select
                            className={`adminTasksPrioritySelect adminTasksPriority-${String(
                              task.priority || "",
                            ).toLowerCase()}`}
                            value={task.priority || "MEDIUM"}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              priorityMutation.mutate({
                                id: task.id,
                                priority: e.target.value as TaskPriority,
                              });
                            }}
                            disabled={priorityMutation.isPending}
                            aria-label={`Change priority for ${task.taskNumber}`}
                          >
                            {PRIORITY_OPTIONS.map((priority) => (
                              <option key={priority} value={priority}>
                                {formatPriority(priority)}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td>
                          <select
                            className={`adminTasksStatusSelect adminTasksStatus-${String(
                              task.status || "",
                            ).toLowerCase()}`}
                            value={task.status}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              changeStatus(task, e.target.value as TaskStatus);
                            }}
                            disabled={statusMutation.isPending}
                          >
                            {STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>
                                {formatStatus(status)}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td>
                          <span className="adminTasksDate">
                            {formatDate(task.dueDate)}
                          </span>
                        </td>

                        <td>
                          {task.estimatedMinutes
                            ? fmt(task.estimatedMinutes)
                            : "—"}
                        </td>

                        <td>
                          <strong className="adminTasksActual">
                            {fmt(task.actualMinutes || 0)}
                          </strong>
                        </td>

                        <td>
                          <button
                            type="button"
                            className="adminTasksDeleteBtn"
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmDelete(task);
                            }}
                            disabled={deleteMutation.isPending}
                            title="Delete task"
                            aria-label={`Delete ${task.taskNumber}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {filteredTasks.length > 0 && (
              <div className="adminTasksPagination">
                <div className="adminTasksPaginationInfo">
                  Showing <strong>{pageStartIndex + 1}</strong> to{" "}
                  <strong>{pageEndIndex}</strong> of{" "}
                  <strong>{filteredTasks.length}</strong> tasks
                </div>

                <div
                  className="adminTasksPaginationControls"
                  aria-label="Task pagination"
                >
                  <button
                    type="button"
                    className="adminTasksPageBtn adminTasksPageArrow"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={15} />
                  </button>

                  {Array.from(
                    { length: totalPages },
                    (_, index) => index + 1,
                  ).map((page) => (
                    <button
                      key={page}
                      type="button"
                      className={`adminTasksPageBtn ${
                        page === currentPage ? "active" : ""
                      }`}
                      onClick={() => goToPage(page)}
                      aria-current={page === currentPage ? "page" : undefined}
                    >
                      {page}
                    </button>
                  ))}

                  <button
                    type="button"
                    className="adminTasksPageBtn adminTasksPageArrow"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    aria-label="Next page"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* =================================================
          CREATE TASK MODAL
      ================================================= */}

      {showCreateModal && (
        <div
          className="adminTasksModalOverlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              closeCreateModal();
            }
          }}
        >
          <div className="adminTasksModal" role="dialog" aria-modal="true">
            <div className="adminTasksModalHeader">
              <div>
                <h2>Create New Task</h2>

                <p>Assign a task to an employee.</p>
              </div>

              <button
                type="button"
                className="adminTasksModalClose"
                onClick={closeCreateModal}
                disabled={createMutation.isPending}
              >
                <X size={18} />
              </button>
            </div>

            <form className="adminTasksForm" onSubmit={submitCreate} noValidate>
              {formError && (
                <div
                  ref={formErrorRef}
                  className="adminTasksFormError"
                  role="alert"
                  tabIndex={-1}
                >
                  {formError}
                </div>
              )}

              {/* TITLE */}

              <div className="adminTasksFormGroup">
                <label>
                  Task Title <span>*</span>
                </label>

                <input
                  type="text"
                  value={form.title}
                  maxLength={150}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      title: e.target.value,
                    })
                  }
                  placeholder="Enter task title"
                  autoFocus
                />
              </div>

              {/* DESCRIPTION */}

              <div className="adminTasksFormGroup">
                <label>Description</label>

                <textarea
                  value={form.description}
                  rows={4}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      description: e.target.value,
                    })
                  }
                  placeholder="Enter task description"
                />
              </div>

              {/* ASSIGN + PROJECT */}

              <div className="adminTasksFormGrid">
                <div className="adminTasksFormGroup">
                  <label>
                    Assign To <span>*</span>
                  </label>

                  <select
                    value={form.assignedToId}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        assignedToId: e.target.value,
                      })
                    }
                    disabled={employeesLoading}
                  >
                    <option value="">
                      {employeesLoading
                        ? "Loading employees..."
                        : "Select employee"}
                    </option>

                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.fullName}
                        {employee.employeeId ? ` (${employee.employeeId})` : ""}
                      </option>
                    ))}
                  </select>

                  {!employeesLoading && employees.length === 0 && (
                    <small>No active employees are available.</small>
                  )}
                </div>

                <div className="adminTasksFormGroup">
                  <label>Project</label>

                  <select
                    value={form.projectId}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        projectId: e.target.value,
                      })
                    }
                    disabled={projectsLoading}
                  >
                    <option value="">
                      {projectsLoading ? "Loading projects..." : "No project"}
                    </option>

                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>

                  {!projectsLoading && projects.length === 0 && (
                    <small>No active projects are available.</small>
                  )}
                </div>
              </div>

              {/* PRIORITY + DUE DATE */}

              <div className="adminTasksFormGrid">
                <div className="adminTasksFormGroup">
                  <label>Priority</label>

                  <select
                    value={form.priority}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        priority: e.target.value as TaskPriority,
                      })
                    }
                  >
                    {PRIORITY_OPTIONS.map((priority) => (
                      <option key={priority} value={priority}>
                        {formatPriority(priority)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="adminTasksFormGroup">
                  <label>Due Date</label>

                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        dueDate: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              {/* ESTIMATED TIME */}

              <div className="adminTasksFormGroup">
                <label>
                  Estimated Time <span>*</span>
                </label>

                <div className="adminTasksTimeGrid">
                  <div className="adminTasksTimeField">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={form.estimatedHours}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          estimatedHours: e.target.value,
                        })
                      }
                      placeholder="0"
                    />

                    <span>Hours</span>
                  </div>

                  <div className="adminTasksTimeField">
                    <input
                      type="number"
                      min={0}
                      max={59}
                      step={1}
                      value={form.estimatedMinutes}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          estimatedMinutes: e.target.value,
                        })
                      }
                      placeholder="0"
                    />

                    <span>Minutes</span>
                  </div>
                </div>

                <small>Example: 2 Hours 30 Minutes = 150 minutes.</small>
              </div>

              {/* FOOTER */}

              <div className="adminTasksModalFooter">
                <button
                  type="button"
                  className="adminTasksCancelBtn"
                  onClick={closeCreateModal}
                  disabled={createMutation.isPending}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="adminTasksPrimaryBtn"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? "Creating..." : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================
          TASK DETAILS MODAL
      ================================================= */}

      {selectedDetailsTask && (
        <div
          className="adminTasksModalOverlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              closeTaskDetails();
            }
          }}
        >
          <div
            className="adminTasksModal adminTasksDetailsModal"
            role="dialog"
            aria-modal="true"
          >
            <div className="adminTasksModalHeader">
              <div className="adminTasksDetailsTitleArea">
                <div className="adminTasksDetailsModalIcon">
                  <ClipboardList size={18} />
                </div>

                <div>
                  <h2>Task Details</h2>
                  <p>{selectedDetailsTask.taskNumber || "Task information"}</p>
                </div>
              </div>

              <button
                type="button"
                className="adminTasksModalClose"
                onClick={closeTaskDetails}
                disabled={
                  priorityMutation.isPending || statusMutation.isPending
                }
                aria-label="Close task details"
              >
                <X size={18} />
              </button>
            </div>

            <div className="adminTasksDetailsBody">
              <div className="adminTasksDetailsSection">
                <h3 className="adminTasksDetailsSectionTitle">
                  Task Information
                </h3>

                <div className="adminTasksDetailsGrid">
                  <div className="adminTasksDetailsItem adminTasksDetailsWide">
                    <span>Task Title</span>
                    <strong>{selectedDetailsTask.title || "—"}</strong>
                  </div>

                  <div className="adminTasksDetailsItem">
                    <span>Assigned To</span>
                    <strong>{getAssignedEmployee(selectedDetailsTask)}</strong>
                  </div>

                  <div className="adminTasksDetailsItem">
                    <span>Project</span>
                    <strong>
                      {(selectedDetailsTask as any).project?.name ||
                        "No project"}
                    </strong>
                  </div>

                  <div className="adminTasksDetailsItem adminTasksDetailsWide">
                    <span>Description</span>
                    <strong className="adminTasksDetailsDescription">
                      {selectedDetailsTask.description ||
                        "No description provided."}
                    </strong>
                  </div>

                  <div className="adminTasksDetailsItem">
                    <span>Priority</span>
                    <select
                      className="adminTasksDetailsPrioritySelect"
                      value={selectedDetailsTask.priority || "MEDIUM"}
                      onChange={(e) =>
                        priorityMutation.mutate({
                          id: selectedDetailsTask.id,
                          priority: e.target.value as TaskPriority,
                        })
                      }
                      disabled={priorityMutation.isPending}
                      aria-label="Change task priority"
                    >
                      {PRIORITY_OPTIONS.map((priority) => (
                        <option key={priority} value={priority}>
                          {formatPriority(priority)}
                        </option>
                      ))}
                    </select>
                    <small>Admin can change task priority.</small>
                  </div>

                  <div className="adminTasksDetailsItem">
                    <span>Status</span>
                    <select
                      className={`adminTasksDetailsStatusSelect adminTasksStatus-${String(
                        selectedDetailsTask.status || "",
                      ).toLowerCase()}`}
                      value={selectedDetailsTask.status || "TODO"}
                      onChange={(e) =>
                        changeStatus(
                          selectedDetailsTask,
                          e.target.value as TaskStatus,
                        )
                      }
                      disabled={statusMutation.isPending}
                      aria-label="Change task status"
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {formatStatus(status)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="adminTasksDetailsItem">
                    <span>Due Date</span>
                    <strong>{formatDate(selectedDetailsTask.dueDate)}</strong>
                  </div>

                  <div className="adminTasksDetailsItem">
                    <span>Created</span>
                    <strong>
                      {formatDate((selectedDetailsTask as any).createdAt)}
                    </strong>
                  </div>

                  <div className="adminTasksDetailsItem">
                    <span>Assigned By</span>
                    <strong>
                      {(selectedDetailsTask as any).assignedBy?.fullName ||
                        (selectedDetailsTask as any).assignedBy?.email ||
                        "Administrator"}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="adminTasksDetailsSection">
                <h3 className="adminTasksDetailsSectionTitle">Time Summary</h3>

                <div className="adminTasksDetailsGrid adminTasksDetailsMetricsGrid">
                  <div className="adminTasksDetailsItem">
                    <span>Estimated Time</span>
                    <strong>
                      {selectedDetailsTask.estimatedMinutes
                        ? fmt(selectedDetailsTask.estimatedMinutes)
                        : "—"}
                    </strong>
                  </div>

                  <div className="adminTasksDetailsItem">
                    <span>Actual Time</span>
                    <strong>
                      {fmt(selectedDetailsTask.actualMinutes || 0)}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="adminTasksModalFooter">
              <button
                type="button"
                className="adminTasksCancelBtn"
                onClick={closeTaskDetails}
                disabled={
                  priorityMutation.isPending || statusMutation.isPending
                }
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================
          DELETE CONFIRMATION
      ================================================= */}

      {showDeleteConfirm && selectedTask && (
        <div
          className="adminTasksModalOverlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setShowDeleteConfirm(false);
              setSelectedTask(null);
            }
          }}
        >
          <div
            className="adminTasksConfirmModal"
            role="dialog"
            aria-modal="true"
          >
            <div className="adminTasksConfirmIcon">
              <Trash2 size={21} />
            </div>

            <h2>Delete Task?</h2>

            <p>
              Are you sure you want to delete{" "}
              <strong>{selectedTask.taskNumber}</strong>? This action cannot be
              undone.
            </p>

            <div className="adminTasksConfirmActions">
              <button
                type="button"
                className="adminTasksCancelBtn"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setSelectedTask(null);
                }}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </button>

              <button
                type="button"
                className="adminTasksDangerBtn"
                onClick={deleteSelectedTask}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete Task"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
