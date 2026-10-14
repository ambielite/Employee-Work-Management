import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  Building2,
  CalendarDays,
  Coffee,
  Monitor,
  Edit3,
  FolderKanban,
  Plus,
  RefreshCw,
  Save,
  Search,
  Users,
  X,
} from "lucide-react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { get, patch, post, del } from "../api/client";

import ConfirmDialog from "../components/ConfirmDialog";

import "./admin-management.css";

type TabKey =
  | "departments"
  | "projects"
  | "leaveTypes"
  | "holidays"
  | "breakTypes"
  | "software";

type Department = {
  id: string;

  name: string;

  description?: string | null;

  _count?: {
    employees?: number;
  };
};

type Employee = {
  id: string;

  fullName: string;

  employeeId?: string;

  user?: {
    role?: string;

    email?: string;
  };

  department?: {
    id?: string;

    name?: string;
  };
};

type Project = {
  id: string;

  name: string;

  description?: string | null;

  status: string;

  managerId?: string | null;

  departmentId?: string | null;

  startDate?: string | null;

  endDate?: string | null;

  manager?: {
    fullName?: string;
  } | null;

  department?: {
    name?: string;
  } | null;

  _count?: {
    tasks?: number;
  };
};

type LeaveType = {
  id: string;

  name: string;

  description?: string | null;
};

type Holiday = {
  id: string;

  name: string;

  date: string;

  description?: string | null;
};

type ProjectForm = {
  name: string;

  description: string;

  departmentId: string;

  managerId: string;

  startDate: string;

  endDate: string;

  status: string;
};

type DepartmentForm = {
  name: string;

  description: string;
};

type LeaveTypeForm = {
  name: string;

  description: string;
};

type HolidayForm = {
  name: string;

  date: string;

  description: string;
};

const EMPTY_DEPARTMENT: DepartmentForm = {
  name: "",

  description: "",
};

const EMPTY_LEAVE_TYPE: LeaveTypeForm = {
  name: "",

  description: "",
};

const EMPTY_HOLIDAY: HolidayForm = {
  name: "",

  date: "",

  description: "",
};

const EMPTY_PROJECT: ProjectForm = {
  name: "",

  description: "",

  departmentId: "",

  managerId: "",

  startDate: "",

  endDate: "",

  status: "ACTIVE",
};

const TABS: {
  key: TabKey;

  label: string;

  icon: typeof Users;
}[] = [
  {
    key: "departments",

    label: "Departments",

    icon: Users,
  },

  {
    key: "projects",

    label: "Projects",

    icon: FolderKanban,
  },

  {
    key: "leaveTypes",

    label: "Leave Types",

    icon: CalendarDays,
  },

  {
    key: "holidays",

    label: "Holidays",

    icon: CalendarDays,
  },

  {
    key: "breakTypes",
    label: "Break Types",
    icon: Coffee,
  },
  {
    key: "software",
    label: "Software Management",
    icon: Monitor,
  },
];

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",

    month: "short",

    year: "numeric",
  });
}

function toInputDate(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

type BreakTypeRecord = {
  id: string;
  name: string;
  description?: string | null;
  timeLimitMinutes: number;
  enabled?: boolean;
};

type SoftwareRecord = {
  id: string;
  name: string;
  processName?: string | null;
  description?: string | null;
  enabled?: boolean;
};

function BreakTypeManagement() {
  const client = useQueryClient();
  const [filterSearch, setFilterSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [timeLimitMinutes, setTimeLimitMinutes] = useState("15");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BreakTypeRecord | null>(null);
  const {
    data: items = [],
    isLoading,
    isError,
  } = useQuery<BreakTypeRecord[]>({
    queryKey: ["admin-break-types"],
    queryFn: () => get<BreakTypeRecord[]>("/break-types"),
  });
  const filteredItems = useMemo(() => {
    const query = filterSearch.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch =
        !query ||
        `${item.name} ${item.description ?? ""} ${item.timeLimitMinutes}`
          .toLowerCase()
          .includes(query);
      const active = item.enabled !== false;
      return (
        matchesSearch &&
        (statusFilter === "all" || (statusFilter === "active") === active)
      );
    });
  }, [items, filterSearch, statusFilter]);

  function openAdd() {
    setEditing(null);
    setName("");
    setDescription("");
    setTimeLimitMinutes("15");
    setError("");
    setModalOpen(true);
  }

  function openEdit(item: BreakTypeRecord) {
    setEditing(item);
    setName(item.name);
    setDescription(item.description ?? "");
    setTimeLimitMinutes(String(item.timeLimitMinutes));
    setError("");
    setModalOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const minutes = Number(timeLimitMinutes);
    if (!name.trim()) return setError("Break type name is required.");
    if (!Number.isInteger(minutes) || minutes < 1)
      return setError("Time limit must be at least 1 minute.");
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        timeLimitMinutes: minutes,
      };
      if (editing) await patch(`/break-types/${editing.id}`, payload);
      else await post("/break-types", payload);
      await client.invalidateQueries({ queryKey: ["admin-break-types"] });
      setModalOpen(false);
      setEditing(null);
    } catch (e: any) {
      setError(
        e?.response?.data?.message ||
          e?.message ||
          "Could not save break type.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggle(item: BreakTypeRecord) {
    setError("");
    try {
      await patch(`/break-types/${item.id}`, {
        enabled: !(item.enabled ?? true),
      });
      await client.invalidateQueries({ queryKey: ["admin-break-types"] });
    } catch (e: any) {
      setError(
        e?.response?.data?.message || "Could not update break type status.",
      );
    }
  }

  async function remove(item: BreakTypeRecord) {
    if (!window.confirm(`Delete break type "${item.name}"?`)) return;
    try {
      await del(`/break-types/${item.id}`);
      await client.invalidateQueries({ queryKey: ["admin-break-types"] });
      setError("");
    } catch (e: any) {
      setError(e?.response?.data?.message || "Could not delete break type.");
    }
  }

  const countText =
    filteredItems.length === items.length
      ? `${items.length} ${items.length === 1 ? "type" : "types"}`
      : `Showing ${filteredItems.length} of ${items.length} types`;

  return (
    <>
      {error && !modalOpen && (
        <p className="adminManagementFeatureError" role="alert">
          {error}
        </p>
      )}
      <div className="adminManagementFilterCard">
        <div className="adminManagementFilterHeader">
          <div className="adminManagementFilterTitle">
            <Search size={15} />
            <span>Management Filter</span>
          </div>
          <button
            type="button"
            className="adminManagementClearBtn"
            onClick={() => {
              setFilterSearch("");
              setStatusFilter("all");
            }}
            disabled={!filterSearch && statusFilter === "all"}
          >
            Clear Filter
          </button>
        </div>
        <div className="adminManagementFilterGrid adminManagementFilterGridWithStatus">
          <label className="adminManagementSearch">
            <Search size={16} />
            <input
              aria-label="Search break types"
              value={filterSearch}
              onChange={(event) => setFilterSearch(event.target.value)}
              placeholder="Search break types..."
            />
          </label>
          <select
            aria-label="Filter break types by status"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as typeof statusFilter)
            }
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
      <div className="adminManagementTableCard">
        <div className="adminManagementTableHeader">
          <div>
            <h2>Break Type Management</h2>
            <p>{countText}</p>
          </div>
          <div className="adminManagementTableHeaderActions">
            <button
              type="button"
              className="adminManagementPrimaryBtn"
              onClick={openAdd}
            >
              <Plus size={16} /> Add Break Type
            </button>
          </div>
        </div>
        <div className="adminManagementTableWrap">
          <table className="adminManagementTable">
            <thead>
              <tr>
                <th>Break Type</th>
                <th>Description</th>
                <th>Time Limit</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5}>Loading break types...</td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={5}>
                    Could not load break types. Use Refresh to try again.
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5}>No break types configured.</td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5}>No break types match these filters.</td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                    </td>
                    <td>{item.description || "-"}</td>
                    <td>{item.timeLimitMinutes} min</td>
                    <td>
                      <span
                        className={`adminManagementFeatureStatus ${item.enabled !== false ? "isActive" : "isInactive"}`}
                      >
                        {item.enabled !== false ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="adminManagementRowActions">
                        <button
                          type="button"
                          className="adminManagementRowEditBtn"
                          onClick={() => openEdit(item)}
                        >
                          <Edit3 size={14} /> Edit
                        </button>
                        <button
                          type="button"
                          className="adminManagementRowEditBtn"
                          onClick={() => void toggle(item)}
                        >
                          {item.enabled !== false ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          className="adminManagementRowDeleteBtn"
                          onClick={() => void remove(item)}
                        >
                          <X size={14} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {modalOpen && (
        <div
          className="adminManagementModalOverlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving)
              setModalOpen(false);
          }}
        >
          <div
            className="adminManagementModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="break-type-modal-title"
          >
            <div className="adminManagementModalHeader">
              <div>
                <h2 id="break-type-modal-title">
                  {editing ? "Edit Break Type" : "Add Break Type"}
                </h2>
                <p>Set the break category and its time allowance.</p>
              </div>
              <button
                type="button"
                className="adminManagementModalClose"
                onClick={() => setModalOpen(false)}
                disabled={saving}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <form className="adminManagementForm" onSubmit={save}>
              {error && (
                <div className="adminManagementFormError" role="alert">
                  {error}
                </div>
              )}
              <label className="adminManagementField">
                <span>Break Type Name *</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Tea Break"
                  required
                  autoFocus
                />
              </label>
              <label className="adminManagementField">
                <span>Time Limit (minutes) *</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={timeLimitMinutes}
                  onChange={(event) => setTimeLimitMinutes(event.target.value)}
                  required
                />
              </label>
              <label className="adminManagementField">
                <span>Description</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Optional description"
                  rows={3}
                />
              </label>
              <div className="adminManagementFormActions">
                <button
                  type="button"
                  className="adminManagementCancelBtn"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="adminManagementSaveBtn"
                  disabled={saving}
                >
                  <Save size={15} />
                  {saving
                    ? "Saving..."
                    : editing
                      ? "Update Break Type"
                      : "Save Break Type"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function SoftwareManagement() {
  const client = useQueryClient();
  const [filterSearch, setFilterSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [name, setName] = useState("");
  const [processName, setProcessName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SoftwareRecord | null>(null);
  const {
    data: items = [],
    isLoading,
    isError,
  } = useQuery<SoftwareRecord[]>({
    queryKey: ["admin-software"],
    queryFn: () => get<SoftwareRecord[]>("/software"),
  });
  const filteredItems = useMemo(() => {
    const query = filterSearch.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch =
        !query ||
        `${item.name} ${item.processName ?? ""} ${item.description ?? ""}`
          .toLowerCase()
          .includes(query);
      const active = item.enabled !== false;
      return (
        matchesSearch &&
        (statusFilter === "all" || (statusFilter === "active") === active)
      );
    });
  }, [items, filterSearch, statusFilter]);

  function openAdd() {
    setEditing(null);
    setName("");
    setProcessName("");
    setDescription("");
    setError("");
    setModalOpen(true);
  }

  function openEdit(item: SoftwareRecord) {
    setEditing(item);
    setName(item.name);
    setProcessName(item.processName ?? "");
    setDescription(item.description ?? "");
    setError("");
    setModalOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return setError("Software name is required.");
    if (!processName.trim()) return setError("Process name is required.");
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: name.trim(),
        processName: processName.trim(),
        description: description.trim() || undefined,
      };
      if (editing) await patch(`/software/${editing.id}`, payload);
      else await post("/software", payload);
      await client.invalidateQueries({ queryKey: ["admin-software"] });
      setModalOpen(false);
      setEditing(null);
    } catch (e: any) {
      setError(
        e?.response?.data?.message || e?.message || "Could not save software.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggle(item: SoftwareRecord) {
    setError("");
    try {
      await patch(`/software/${item.id}`, { enabled: !(item.enabled ?? true) });
      await client.invalidateQueries({ queryKey: ["admin-software"] });
    } catch (e: any) {
      setError(
        e?.response?.data?.message || "Could not update software status.",
      );
    }
  }

  async function remove(item: SoftwareRecord) {
    if (!window.confirm(`Delete "${item.name}" from the allowlist?`)) return;
    try {
      await del(`/software/${item.id}`);
      await client.invalidateQueries({ queryKey: ["admin-software"] });
      setError("");
    } catch (e: any) {
      setError(e?.response?.data?.message || "Could not delete software.");
    }
  }

  const countText =
    filteredItems.length === items.length
      ? `${items.length} ${items.length === 1 ? "application" : "applications"}`
      : `Showing ${filteredItems.length} of ${items.length} applications`;

  return (
    <>
      {error && !modalOpen && (
        <p className="adminManagementFeatureError" role="alert">
          {error}
        </p>
      )}
      <div className="adminManagementFilterCard">
        <div className="adminManagementFilterHeader">
          <div className="adminManagementFilterTitle">
            <Search size={15} />
            <span>Management Filter</span>
          </div>
          <button
            type="button"
            className="adminManagementClearBtn"
            onClick={() => {
              setFilterSearch("");
              setStatusFilter("all");
            }}
            disabled={!filterSearch && statusFilter === "all"}
          >
            Clear Filter
          </button>
        </div>
        <div className="adminManagementFilterGrid adminManagementFilterGridWithStatus">
          <label className="adminManagementSearch">
            <Search size={16} />
            <input
              aria-label="Search software"
              value={filterSearch}
              onChange={(event) => setFilterSearch(event.target.value)}
              placeholder="Search software or process name..."
            />
          </label>
          <select
            aria-label="Filter software by status"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as typeof statusFilter)
            }
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
      <div className="adminManagementTableCard">
        <div className="adminManagementTableHeader">
          <div>
            <h2>Software Management</h2>
            <p>{countText}</p>
          </div>
          <div className="adminManagementTableHeaderActions">
            <button
              type="button"
              className="adminManagementPrimaryBtn"
              onClick={openAdd}
            >
              <Plus size={16} /> Add Software
            </button>
          </div>
        </div>
        <div className="adminManagementTableWrap">
          <table className="adminManagementTable">
            <thead>
              <tr>
                <th>Software</th>
                <th>Process Name</th>
                <th>Description</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5}>Loading software...</td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={5}>
                    Could not load software. Use Refresh to try again.
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5}>No software configured.</td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5}>No software match these filters.</td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                    </td>
                    <td>{item.processName || "-"}</td>
                    <td>{item.description || "-"}</td>
                    <td>
                      <span
                        className={`adminManagementFeatureStatus ${item.enabled !== false ? "isActive" : "isInactive"}`}
                      >
                        {item.enabled !== false ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="adminManagementRowActions">
                        <button
                          type="button"
                          className="adminManagementRowEditBtn"
                          onClick={() => openEdit(item)}
                        >
                          <Edit3 size={14} /> Edit
                        </button>
                        <button
                          type="button"
                          className="adminManagementRowEditBtn"
                          onClick={() => void toggle(item)}
                        >
                          {item.enabled !== false ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          className="adminManagementRowDeleteBtn"
                          onClick={() => void remove(item)}
                        >
                          <X size={14} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {modalOpen && (
        <div
          className="adminManagementModalOverlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving)
              setModalOpen(false);
          }}
        >
          <div
            className="adminManagementModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="software-modal-title"
          >
            <div className="adminManagementModalHeader">
              <div>
                <h2 id="software-modal-title">
                  {editing ? "Edit Software" : "Add Software"}
                </h2>
                <p>Manage the application name and process identifier.</p>
              </div>
              <button
                type="button"
                className="adminManagementModalClose"
                onClick={() => setModalOpen(false)}
                disabled={saving}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <form className="adminManagementForm" onSubmit={save}>
              {error && (
                <div className="adminManagementFormError" role="alert">
                  {error}
                </div>
              )}
              <label className="adminManagementField">
                <span>Software Name *</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Visual Studio Code"
                  required
                  autoFocus
                />
              </label>
              <label className="adminManagementField">
                <span>Process Name *</span>
                <input
                  value={processName}
                  onChange={(event) => setProcessName(event.target.value)}
                  placeholder="e.g. Code.exe"
                  required
                />
              </label>
              <label className="adminManagementField">
                <span>Description</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Optional description"
                  rows={3}
                />
              </label>
              <div className="adminManagementFormActions">
                <button
                  type="button"
                  className="adminManagementCancelBtn"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="adminManagementSaveBtn"
                  disabled={saving}
                >
                  <Save size={15} />
                  {saving
                    ? "Saving..."
                    : editing
                      ? "Update Software"
                      : "Save Software"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
export default function AdminManagement() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>("departments");

  const [search, setSearch] = useState("");

  const [tabFilter, setTabFilter] = useState("all");

  const [showModal, setShowModal] = useState(false);

  const [editingDepartment, setEditingDepartment] = useState<Department | null>(
    null,
  );

  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const [editingLeaveType, setEditingLeaveType] = useState<LeaveType | null>(
    null,
  );

  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);

  const [departmentForm, setDepartmentForm] =
    useState<DepartmentForm>(EMPTY_DEPARTMENT);

  const [projectForm, setProjectForm] = useState<ProjectForm>(EMPTY_PROJECT);

  const [leaveTypeForm, setLeaveTypeForm] =
    useState<LeaveTypeForm>(EMPTY_LEAVE_TYPE);

  const [holidayForm, setHolidayForm] = useState<HolidayForm>(EMPTY_HOLIDAY);

  const [formError, setFormError] = useState("");

  const [saving, setSaving] = useState(false);

  const [notification, setNotification] = useState<{
    type: "success" | "error";

    message: string;
  } | null>(null);

  const [deleteDepartmentTarget, setDeleteDepartmentTarget] =
    useState<Department | null>(null);

  const [deleteProjectTarget, setDeleteProjectTarget] =
    useState<Project | null>(null);

  const notificationRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!notification) return;

    const frame = window.requestAnimationFrame(() => {
      notificationRef.current?.scrollIntoView({
        behavior: "smooth",

        block: "center",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [notification]); /*



   * ---------------------------------------------------------



   * DEPARTMENTS



   * ---------------------------------------------------------



   */

  const {
    data: departments = [],
    isLoading: departmentsLoading,
    isFetching: departmentsFetching,
    isError: departmentsError,
  } = useQuery<Department[]>({
    queryKey: ["departments"],

    queryFn: () => get<Department[]>("/departments"),
  }); /*



   * ---------------------------------------------------------



   * PROJECTS



   * ---------------------------------------------------------



   */

  const {
    data: projects = [],
    isLoading: projectsLoading,
    isFetching: projectsFetching,
    isError: projectsError,
  } = useQuery<Project[]>({
    queryKey: ["projects"],

    queryFn: () => get<Project[]>("/projects"),
  }); /*



   * ---------------------------------------------------------



   * EMPLOYEES



   * Used to populate project managers.



   * ---------------------------------------------------------



   */

  const {
    data: employees = [],
    isLoading: employeesLoading,
    isError: employeesError,
  } = useQuery<Employee[]>({
    queryKey: ["admin-employees"],

    queryFn: () => get<Employee[]>("/employees"),
  });

  const managers = useMemo(() => {
    return employees.filter((employee) => employee.user?.role === "MANAGER");
  }, [employees]); /*



   * ---------------------------------------------------------



   * LEAVE TYPES



   * ---------------------------------------------------------



   */

  const {
    data: leaveTypes = [],
    isLoading: leaveTypesLoading,
    isFetching: leaveTypesFetching,
    isError: leaveTypesError,
  } = useQuery<LeaveType[]>({
    queryKey: ["leave-types"],

    queryFn: () => get<LeaveType[]>("/leave-types"),
  }); /*



   * ---------------------------------------------------------



   * HOLIDAYS



   * ---------------------------------------------------------



   */

  const {
    data: holidays = [],
    isLoading: holidaysLoading,
    isFetching: holidaysFetching,
    isError: holidaysError,
  } = useQuery<Holiday[]>({
    queryKey: ["holidays"],

    queryFn: () => get<Holiday[]>("/holidays"),
  });

  const {
    data: breakTypes,
    isLoading: breakTypesLoading,
    isFetching: breakTypesFetching,
    isError: breakTypesError,
  } = useQuery<BreakTypeRecord[]>({
    queryKey: ["admin-break-types"],
    queryFn: () => get<BreakTypeRecord[]>("/break-types"),
  });

  const {
    data: softwareItems,
    isLoading: softwareLoading,
    isFetching: softwareFetching,
    isError: softwareError,
  } = useQuery<SoftwareRecord[]>({
    queryKey: ["admin-software"],
    queryFn: () => get<SoftwareRecord[]>("/software"),
  });

  function showNotification(type: "success" | "error", message: string) {
    setNotification({
      type,

      message,
    });

    window.setTimeout(() => {
      setNotification(null);
    }, 3500);
  } /*



   * ---------------------------------------------------------



   * OPEN ADD MODAL



   * ---------------------------------------------------------



   */

  function openAddModal() {
    setEditingDepartment(null);

    setEditingProject(null);

    setEditingLeaveType(null);

    setEditingHoliday(null);

    setFormError("");

    if (activeTab === "departments") {
      setDepartmentForm(EMPTY_DEPARTMENT);
    }

    if (activeTab === "projects") {
      setProjectForm(EMPTY_PROJECT);
    }

    if (activeTab === "leaveTypes") {
      setLeaveTypeForm(EMPTY_LEAVE_TYPE);
    }

    if (activeTab === "holidays") {
      setHolidayForm(EMPTY_HOLIDAY);
    }

    setShowModal(true);
  } /*



   * ---------------------------------------------------------



   * OPEN PROJECT EDIT



   * ---------------------------------------------------------



   */

  function openDepartmentEdit(department: Department) {
    setEditingDepartment(department);

    setEditingProject(null);

    setEditingLeaveType(null);

    setEditingHoliday(null);

    setFormError("");

    setDepartmentForm({
      name: department.name ?? "",

      description: department.description ?? "",
    });

    setShowModal(true);
  }

  function openProjectEdit(project: Project) {
    setEditingDepartment(null);

    setEditingProject(project);

    setEditingLeaveType(null);

    setEditingHoliday(null);

    setFormError("");

    setProjectForm({
      name: project.name ?? "",

      description: project.description ?? "",

      departmentId: project.departmentId ?? "",

      managerId: project.managerId ?? "",

      startDate: toInputDate(project.startDate),

      endDate: toInputDate(project.endDate),

      status: project.status ?? "ACTIVE",
    });

    setShowModal(true);
  } /*



   * ---------------------------------------------------------



   * OPEN HOLIDAY EDIT



   * ---------------------------------------------------------



   */

  function openLeaveTypeEdit(leaveType: LeaveType) {
    setEditingDepartment(null);

    setEditingProject(null);

    setEditingLeaveType(leaveType);

    setEditingHoliday(null);

    setFormError("");

    setLeaveTypeForm({
      name: leaveType.name ?? "",

      description: leaveType.description ?? "",
    });

    setShowModal(true);
  }

  function openHolidayEdit(holiday: Holiday) {
    setEditingDepartment(null);

    setEditingProject(null);

    setEditingLeaveType(null);

    setEditingHoliday(holiday);

    setFormError("");

    setHolidayForm({
      name: holiday.name ?? "",

      date: toInputDate(holiday.date),

      description: holiday.description ?? "",
    });

    setShowModal(true);
  } /*



   * ---------------------------------------------------------



   * CLOSE MODAL



   * ---------------------------------------------------------



   */

  function closeModal(force = false) {
    if (saving && !force) {
      return;
    }

    setShowModal(false);

    setEditingDepartment(null);

    setEditingProject(null);

    setEditingLeaveType(null);

    setEditingHoliday(null);

    setFormError("");
  } /*



   * ---------------------------------------------------------



   * SAVE DEPARTMENT



   * ---------------------------------------------------------



   */

  async function saveDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = departmentForm.name.trim();

    if (!name) {
      setFormError("Department name is required.");

      return;
    }

    setSaving(true);

    setFormError("");

    try {
      const payload = {
        name,

        description: departmentForm.description.trim() || undefined,
      };

      if (editingDepartment) {
        await patch(`/departments/${editingDepartment.id}`, payload);
      } else {
        await post("/departments", payload);
      }

      await queryClient.invalidateQueries({
        queryKey: ["departments"],
      });

      closeModal(true);

      showNotification(
        "success",

        editingDepartment
          ? "Department updated successfully."
          : "Department created successfully.",
      );
    } catch (error: any) {
      setFormError(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to create department.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteDepartment() {
    if (!deleteDepartmentTarget) return;

    setSaving(true);

    try {
      await del(`/departments/${deleteDepartmentTarget.id}`);

      await queryClient.invalidateQueries({
        queryKey: ["departments"],
      });

      setDeleteDepartmentTarget(null);

      showNotification("success", "Department deleted successfully.");
    } catch (error: any) {
      const message = error?.response?.data?.message; // Close the confirmation popup when deletion fails

      setDeleteDepartmentTarget(null);

      showNotification(
        "error",

        Array.isArray(message)
          ? message.join(", ")
          : message || "Failed to delete department.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteProject() {
    if (!deleteProjectTarget) return;

    setSaving(true);

    try {
      await del(`/projects/${deleteProjectTarget.id}`);

      await queryClient.invalidateQueries({
        queryKey: ["projects"],
      });

      setDeleteProjectTarget(null);

      showNotification("success", "Project deleted successfully.");
    } catch (error: any) {
      const message = error?.response?.data?.message;

      setDeleteProjectTarget(null);

      showNotification(
        "error",

        Array.isArray(message)
          ? message.join(", ")
          : message || "Failed to delete project.",
      );
    } finally {
      setSaving(false);
    }
  } /*



   * ---------------------------------------------------------



   * SAVE PROJECT



   * ---------------------------------------------------------



   */

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = projectForm.name.trim();

    if (!name) {
      setFormError("Project name is required.");

      return;
    }

    if (!projectForm.departmentId) {
      setFormError("Department is required.");

      return;
    }

    if (!projectForm.managerId) {
      setFormError("Manager is required.");

      return;
    }

    if (
      projectForm.startDate &&
      projectForm.endDate &&
      projectForm.endDate < projectForm.startDate
    ) {
      setFormError("Project end date cannot be earlier than start date.");

      return;
    }

    setSaving(true);

    setFormError("");

    try {
      const payload = {
        name,

        description: projectForm.description.trim() || undefined,

        departmentId: projectForm.departmentId,

        managerId: projectForm.managerId,

        startDate: editingProject
          ? projectForm.startDate || null
          : projectForm.startDate || undefined,

        endDate: editingProject
          ? projectForm.endDate || null
          : projectForm.endDate || undefined,

        status: projectForm.status,
      };

      if (editingProject) {
        await patch(`/projects/${editingProject.id}`, payload);
      } else {
        await post("/projects", payload);
      }

      await queryClient.invalidateQueries({
        queryKey: ["projects"],
      });

      closeModal(true);

      showNotification(
        "success",

        editingProject
          ? "Project updated successfully."
          : "Project created successfully.",
      );
    } catch (error: any) {
      setFormError(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to save project.",
      );
    } finally {
      setSaving(false);
    }
  } /*



   * ---------------------------------------------------------



   * SAVE LEAVE TYPE



   * ---------------------------------------------------------



   */

  async function saveLeaveType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = leaveTypeForm.name.trim();

    if (!name) {
      setFormError("Leave type name is required.");

      return;
    }

    setSaving(true);

    setFormError("");

    try {
      const payload = {
        name,

        description: leaveTypeForm.description.trim() || undefined,
      };

      if (editingLeaveType) {
        await patch(`/leave-types/${editingLeaveType.id}`, payload);
      } else {
        await post("/leave-types", payload);
      }

      await queryClient.invalidateQueries({
        queryKey: ["leave-types"],
      });

      closeModal(true);

      showNotification(
        "success",

        editingLeaveType
          ? "Leave type updated successfully."
          : "Leave type created successfully.",
      );
    } catch (error: any) {
      setFormError(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to create leave type.",
      );
    } finally {
      setSaving(false);
    }
  } /*



   * ---------------------------------------------------------



   * SAVE HOLIDAY



   * ---------------------------------------------------------



   */

  async function saveHoliday(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = holidayForm.name.trim();

    if (!name) {
      setFormError("Holiday name is required.");

      return;
    }

    if (!holidayForm.date) {
      setFormError("Holiday date is required.");

      return;
    }

    setSaving(true);

    setFormError("");

    try {
      const payload = {
        name,

        date: holidayForm.date,

        description: holidayForm.description.trim() || undefined,
      };

      if (editingHoliday) {
        await patch(`/holidays/${editingHoliday.id}`, payload);
      } else {
        await post("/holidays", payload);
      }

      await queryClient.invalidateQueries({
        queryKey: ["holidays"],
      });

      closeModal(true);

      showNotification(
        "success",

        editingHoliday
          ? "Holiday updated successfully."
          : "Holiday created successfully.",
      );
    } catch (error: any) {
      setFormError(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to save holiday.",
      );
    } finally {
      setSaving(false);
    }
  } /*



   * ---------------------------------------------------------



   * REFRESH



   * ---------------------------------------------------------



   */

  async function refreshCurrentTab() {
    if (activeTab === "departments") {
      await queryClient.invalidateQueries({
        queryKey: ["departments"],
      });
    }

    if (activeTab === "projects") {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-employees"] }),
      ]);
    }

    if (activeTab === "leaveTypes") {
      await queryClient.invalidateQueries({
        queryKey: ["leave-types"],
      });
    }

    if (activeTab === "holidays") {
      await queryClient.invalidateQueries({
        queryKey: ["holidays"],
      });
    }

    if (activeTab === "breakTypes") {
      await queryClient.invalidateQueries({ queryKey: ["admin-break-types"] });
    }

    if (activeTab === "software") {
      await queryClient.invalidateQueries({ queryKey: ["admin-software"] });
    }
  } /*



   * ---------------------------------------------------------



   * FILTERED DATA



   * ---------------------------------------------------------



   */

  const searchText = search.trim().toLowerCase();

  const filteredDepartments = useMemo(() => {
    return departments.filter((department) => {
      const matchesSearch =
        !searchText ||
        department.name?.toLowerCase().includes(searchText) ||
        department.description?.toLowerCase().includes(searchText);
      const hasEmployees = (department._count?.employees ?? 0) > 0;
      return (
        matchesSearch &&
        (tabFilter === "all" ||
          (tabFilter === "withEmployees") === hasEmployees)
      );
    });
  }, [departments, searchText, tabFilter]);

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesSearch =
        !searchText ||
        project.name?.toLowerCase().includes(searchText) ||
        project.description?.toLowerCase().includes(searchText) ||
        project.manager?.fullName?.toLowerCase().includes(searchText) ||
        project.department?.name?.toLowerCase().includes(searchText) ||
        project.status
          ?.toLowerCase()
          .replaceAll("_", " ")
          .includes(searchText) ||
        project.startDate?.slice(0, 10).includes(searchText) ||
        project.endDate?.slice(0, 10).includes(searchText);
      return (
        matchesSearch && (tabFilter === "all" || project.status === tabFilter)
      );
    });
  }, [projects, searchText, tabFilter]);

  const filteredLeaveTypes = useMemo(() => {
    return leaveTypes.filter((leaveType) => {
      const matchesSearch =
        !searchText ||
        leaveType.name?.toLowerCase().includes(searchText) ||
        leaveType.description?.toLowerCase().includes(searchText);
      const hasDescription = Boolean(leaveType.description?.trim());
      return (
        matchesSearch &&
        (tabFilter === "all" ||
          (tabFilter === "withDescription") === hasDescription)
      );
    });
  }, [leaveTypes, searchText, tabFilter]);

  const filteredHolidays = useMemo(() => {
    const todayDate = new Date();
    const today = `${todayDate.getFullYear()}-${String(
      todayDate.getMonth() + 1,
    ).padStart(2, "0")}-${String(todayDate.getDate()).padStart(2, "0")}`;
    return holidays.filter((holiday) => {
      const matchesSearch =
        !searchText ||
        holiday.name?.toLowerCase().includes(searchText) ||
        holiday.description?.toLowerCase().includes(searchText) ||
        holiday.date?.slice(0, 10).includes(searchText) ||
        formatDate(holiday.date).toLowerCase().includes(searchText);
      const upcoming = holiday.date?.slice(0, 10) >= today;
      return (
        matchesSearch &&
        (tabFilter === "all" || (tabFilter === "upcoming") === upcoming)
      );
    });
  }, [holidays, searchText, tabFilter]);

  function clearFilters() {
    setSearch("");
    setTabFilter("all");
  }

  async function deleteLeaveType(leaveType: LeaveType) {
    if (
      !window.confirm(
        `Delete leave type "${leaveType.name}"? This action cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      await del(`/leave-types/${leaveType.id}`);
      await queryClient.invalidateQueries({ queryKey: ["leave-types"] });
      showNotification("success", "Leave type deleted successfully.");
    } catch (error: any) {
      const message = error?.response?.data?.message;
      showNotification(
        "error",
        Array.isArray(message)
          ? message.join(", ")
          : message || "Failed to delete leave type.",
      );
    }
  }

  async function deleteHoliday(holiday: Holiday) {
    if (
      !window.confirm(
        `Delete holiday "${holiday.name}"? This action cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      await del(`/holidays/${holiday.id}`);
      await queryClient.invalidateQueries({ queryKey: ["holidays"] });
      showNotification("success", "Holiday deleted successfully.");
    } catch (error: any) {
      const message = error?.response?.data?.message;
      showNotification(
        "error",
        Array.isArray(message)
          ? message.join(", ")
          : message || "Failed to delete holiday.",
      );
    }
  }

  const currentLoading =
    activeTab === "departments"
      ? departmentsLoading
      : activeTab === "projects"
        ? projectsLoading
        : activeTab === "leaveTypes"
          ? leaveTypesLoading
          : activeTab === "holidays"
            ? holidaysLoading
            : activeTab === "breakTypes"
              ? breakTypesLoading
              : softwareLoading;

  const currentFetching =
    activeTab === "departments"
      ? departmentsFetching
      : activeTab === "projects"
        ? projectsFetching
        : activeTab === "leaveTypes"
          ? leaveTypesFetching
          : activeTab === "holidays"
            ? holidaysFetching
            : activeTab === "breakTypes"
              ? breakTypesFetching
              : softwareFetching;

  const currentError =
    activeTab === "departments"
      ? departmentsError
      : activeTab === "projects"
        ? projectsError
        : activeTab === "leaveTypes"
          ? leaveTypesError
          : activeTab === "holidays"
            ? holidaysError
            : activeTab === "breakTypes"
              ? breakTypesError
              : softwareError;

  const currentErrorMessage =
    activeTab === "departments"
      ? "Could not load departments."
      : activeTab === "projects"
        ? "Could not load projects."
        : activeTab === "leaveTypes"
          ? "Could not load leave types."
          : activeTab === "holidays"
            ? "Could not load holidays."
            : activeTab === "breakTypes"
              ? "Could not load break types."
              : "Could not load software.";

  const currentCount =
    activeTab === "departments"
      ? filteredDepartments.length
      : activeTab === "projects"
        ? filteredProjects.length
        : activeTab === "leaveTypes"
          ? filteredLeaveTypes.length
          : activeTab === "holidays"
            ? filteredHolidays.length
            : activeTab === "breakTypes"
              ? (breakTypes?.length ?? 0)
              : (softwareItems?.length ?? 0);

  const tabFilterOptions =
    activeTab === "departments"
      ? [
          ["all", "All Departments"],
          ["withEmployees", "With Employees"],
          ["withoutEmployees", "No Employees"],
        ]
      : activeTab === "projects"
        ? [
            ["all", "All Status"],
            ["ACTIVE", "Active"],
            ["COMPLETED", "Completed"],
            ["ON_HOLD", "On Hold"],
            ["ARCHIVED", "Archived"],
          ]
        : activeTab === "leaveTypes"
          ? [
              ["all", "All Leave Types"],
              ["withDescription", "With Description"],
              ["withoutDescription", "No Description"],
            ]
          : [
              ["all", "All Holidays"],
              ["upcoming", "Upcoming"],
              ["past", "Past"],
            ];

  return (
    <div className="adminManagementPage">
      <div className="adminManagementHeader">
        <div className="adminManagementTitleRow">
          <div className="adminManagementTitleIcon">
            <Building2 size={21} />
          </div>
          <div>
            <h1>Admin Management</h1>
            <p>
              Manage departments, projects, leave types, holidays, break types
              and software.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="adminManagementHeaderRefreshBtn"
          onClick={refreshCurrentTab}
          disabled={currentFetching}
        >
          <RefreshCw
            size={16}
            className={currentFetching ? "adminManagementSpin" : ""}
          />
          {currentFetching ? "Refreshing..." : "Refresh"}
        </button>
      </div>
      {notification && (
        <div
          className="adminManagementNotification"
          ref={notificationRef}
          role="status"
          aria-live="polite"
          style={{
            marginBottom: 16,

            borderColor:
              notification.type === "success" ? "#b7ebc6" : "#f5b7b1",

            background: notification.type === "success" ? "#f0fff4" : "#fff5f5",

            color: notification.type === "success" ? "#176b36" : "#a42626",
          }}
        >
          {notification.message}{" "}
        </div>
      )}{" "}
      <div className="adminManagementSummaryGrid">
        {[
          {
            label: "Departments",
            value: departments.length,
            icon: Users,
            tone: "departments",
          },
          {
            label: "Projects",
            value: projects.length,
            icon: FolderKanban,
            tone: "projects",
          },
          {
            label: "Leave Types",
            value: leaveTypes.length,
            icon: CalendarDays,
            tone: "leaveTypes",
          },
          {
            label: "Holidays",
            value: holidays.length,
            icon: CalendarDays,
            tone: "holidays",
          },
          {
            label: "Break Types",
            value: breakTypes?.length ?? "—",
            icon: Coffee,
            tone: "breakTypes",
          },
          {
            label: "Software",
            value: softwareItems?.length ?? "—",
            icon: Monitor,
            tone: "software",
          },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div
            className={`adminManagementSummaryCard adminManagementSummaryCard-${tone}`}
            key={tone}
          >
            <div
              className={`adminManagementSummaryIcon adminManagementSummaryIcon-${tone}`}
            >
              <Icon size={18} />
            </div>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          </div>
        ))}
      </div>
      <div className="adminManagementTabsCard">
        <div className="adminManagementTabs">
          {TABS.map((tab) => {
            const Icon = tab.icon;

            const active = activeTab === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                className={`adminManagementTabBtn ${active ? "active" : "inactive"}`}
                aria-pressed={active}
                onClick={() => {
                  setActiveTab(tab.key);

                  setSearch("");
                  setTabFilter("all");

                  setFormError("");
                }}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      {activeTab === "breakTypes" ? (
        <BreakTypeManagement />
      ) : activeTab === "software" ? (
        <SoftwareManagement />
      ) : (
        <>
          <div
            className={`adminManagementFilterCard ${activeTab === "departments" ? "adminManagementDepartmentFilter" : ""}`}
          >
            {" "}
            <div className="adminManagementFilterHeader">
              {" "}
              <div className="adminManagementFilterTitle">
                <Search size={15} /> <span>Management Filter</span>{" "}
              </div>{" "}
              <button
                type="button"
                className="adminManagementClearBtn"
                onClick={clearFilters}
                disabled={!search && tabFilter === "all"}
              >
                Clear Filter{" "}
              </button>{" "}
            </div>{" "}
            <div className="adminManagementFilterGrid adminManagementFilterGridWithStatus">
              {" "}
              <label className="adminManagementSearch">
                <Search size={16} />
                <input
                  type="text"
                  aria-label="Search management records"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={`Search ${TABS.find((tab) => tab.key === activeTab)?.label.toLowerCase()}...`}
                />
              </label>{" "}
              <select
                aria-label={`Filter ${TABS.find(
                  (tab) => tab.key === activeTab,
                )?.label.toLowerCase()}`}
                value={tabFilter}
                onChange={(event) => setTabFilter(event.target.value)}
              >
                {tabFilterOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>{" "}
            </div>{" "}
          </div>{" "}
          <div className="adminManagementTableCard">
            {" "}
            <div className="adminManagementTableHeader">
              {" "}
              <div>
                {" "}
                <h2>{TABS.find((tab) => tab.key === activeTab)?.label}</h2>{" "}
                <p>
                  Showing {currentCount}{" "}
                  {currentCount === 1 ? "record" : "records"}
                </p>{" "}
              </div>{" "}
              <div className="adminManagementTableHeaderActions">
                {" "}
                <button
                  type="button"
                  className={`adminManagementPrimaryBtn ${activeTab === "departments" ? "adminManagementDepartmentAddBtn" : ""}`}
                  onClick={openAddModal}
                >
                  <Plus size={16} /> Add{" "}
                  {TABS.find((tab) => tab.key === activeTab)?.label.replace(
                    /s$/,

                    "",
                  )}{" "}
                </button>{" "}
              </div>{" "}
            </div>{" "}
            {currentError ? (
              <div className="adminManagementLoadError" role="alert">
                <span>{currentErrorMessage}</span>
                <button
                  type="button"
                  className="adminManagementPrimaryBtn"
                  onClick={() => void refreshCurrentTab()}
                >
                  <RefreshCw size={14} /> Try again
                </button>
              </div>
            ) : currentLoading ? (
              <div
                style={{
                  padding: "40px 20px",

                  textAlign: "center",
                }}
              >
                Loading...{" "}
              </div>
            ) : (
              <>
                {" "}
                {activeTab === "departments" && (
                  <div className="adminManagementTableWrap">
                    {" "}
                    <table className="adminManagementTable">
                      <thead>
                        <tr>
                          <th>Department</th>
                          <th>Description</th>
                          <th>Employees</th>
                          <th>Action</th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredDepartments.length === 0 ? (
                          <tr>
                            <td
                              colSpan={4}
                              className="adminManagementEmptyCell"
                            >
                              No departments found.
                            </td>
                          </tr>
                        ) : (
                          filteredDepartments.map((department) => (
                            <tr key={department.id}>
                              <td>
                                <strong>{department.name}</strong>
                              </td>

                              <td>{department.description || "-"}</td>

                              <td>{department._count?.employees ?? 0}</td>

                              <td>
                                <div className="adminManagementRowActions">
                                  <button
                                    type="button"
                                    className="adminManagementRowEditBtn"
                                    onClick={() =>
                                      openDepartmentEdit(department)
                                    }
                                  >
                                    <Edit3 size={14} />
                                    Edit
                                  </button>

                                  <button
                                    type="button"
                                    className="adminManagementRowDeleteBtn"
                                    onClick={() =>
                                      setDeleteDepartmentTarget(department)
                                    }
                                  >
                                    <X size={14} />
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>{" "}
                  </div>
                )}{" "}
                {activeTab === "projects" && (
                  <div className="adminManagementTableWrap">
                    {" "}
                    <table className="adminManagementTable">
                      <thead>
                        <tr>
                          <th>Project</th>
                          <th>Department</th>
                          <th>Manager</th> <th>Status</th> <th>Start Date</th>
                          <th>End Date</th> <th>Tasks</th>
                          <th>Action</th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredProjects.length === 0 ? (
                          <tr>
                            <td
                              colSpan={8}
                              className="adminManagementEmptyCell"
                            >
                              No projects found.
                            </td>
                          </tr>
                        ) : (
                          filteredProjects.map((project) => (
                            <tr key={project.id}>
                              <td>
                                <strong>{project.name}</strong>

                                {project.description && (
                                  <div
                                    className="adminManagementMuted"
                                    style={{
                                      marginTop: 3,

                                      fontSize: 12,
                                    }}
                                  >
                                    {project.description}
                                  </div>
                                )}
                              </td>

                              <td>{project.department?.name || "-"}</td>

                              <td>{project.manager?.fullName || "-"}</td>

                              <td>
                                <span
                                  className={`adminManagementProjectStatus is${project.status}`}
                                >
                                  {project.status.replaceAll("_", " ")}
                                </span>
                              </td>

                              <td>{formatDate(project.startDate)}</td>

                              <td>{formatDate(project.endDate)}</td>

                              <td>{project._count?.tasks ?? 0}</td>

                              <td>
                                <div className="adminManagementRowActions">
                                  <button
                                    type="button"
                                    className="adminManagementRowEditBtn"
                                    onClick={() => openProjectEdit(project)}
                                  >
                                    <Edit3 size={14} /> Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="adminManagementRowDeleteBtn"
                                    onClick={() =>
                                      setDeleteProjectTarget(project)
                                    }
                                  >
                                    <X size={14} /> Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>{" "}
                  </div>
                )}{" "}
                {activeTab === "leaveTypes" && (
                  <div className="adminManagementTableWrap">
                    {" "}
                    <table className="adminManagementTable">
                      <thead>
                        <tr>
                          <th>Leave Type</th>
                          <th>Description</th>
                          <th>Action</th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredLeaveTypes.length === 0 ? (
                          <tr>
                            <td
                              colSpan={3}
                              className="adminManagementEmptyCell"
                            >
                              No leave types found.
                            </td>
                          </tr>
                        ) : (
                          filteredLeaveTypes.map((leaveType) => (
                            <tr key={leaveType.id}>
                              <td>
                                <strong>{leaveType.name}</strong>
                              </td>

                              <td>{leaveType.description || "-"}</td>

                              <td>
                                <div className="adminManagementRowActions">
                                  <button
                                    type="button"
                                    className="adminManagementRowEditBtn"
                                    onClick={() => openLeaveTypeEdit(leaveType)}
                                  >
                                    <Edit3 size={14} /> Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="adminManagementRowDeleteBtn"
                                    onClick={() =>
                                      void deleteLeaveType(leaveType)
                                    }
                                  >
                                    <X size={14} /> Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>{" "}
                  </div>
                )}{" "}
                {activeTab === "holidays" && (
                  <div className="adminManagementTableWrap">
                    {" "}
                    <table className="adminManagementTable">
                      <thead>
                        <tr>
                          <th>Holiday</th> <th>Date</th>
                          <th>Description</th>
                          <th>Action</th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredHolidays.length === 0 ? (
                          <tr>
                            <td
                              colSpan={4}
                              className="adminManagementEmptyCell"
                            >
                              No holidays found.
                            </td>
                          </tr>
                        ) : (
                          filteredHolidays.map((holiday) => (
                            <tr key={holiday.id}>
                              <td>
                                <strong>{holiday.name}</strong>
                              </td>

                              <td>{formatDate(holiday.date)}</td>
                              <td>{holiday.description || "-"}</td>

                              <td>
                                <div className="adminManagementRowActions">
                                  <button
                                    type="button"
                                    className="adminManagementRowEditBtn"
                                    onClick={() => openHolidayEdit(holiday)}
                                  >
                                    <Edit3 size={14} /> Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="adminManagementRowDeleteBtn"
                                    onClick={() => void deleteHoliday(holiday)}
                                  >
                                    <X size={14} /> Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>{" "}
                  </div>
                )}{" "}
              </>
            )}{" "}
          </div>{" "}
        </>
      )}
      {showModal && activeTab !== "breakTypes" && activeTab !== "software" && (
        <div
          className="adminManagementModalOverlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              closeModal();
            }
          }}
        >
          {" "}
          <div className="adminManagementModal">
            {" "}
            <div className="adminManagementModalHeader">
              {" "}
              <div>
                {" "}
                <h2
                  style={{
                    margin: 0,
                  }}
                >
                  {" "}
                  {activeTab === "departments" &&
                    (editingDepartment
                      ? "Edit Department"
                      : "Add Department")}{" "}
                  {activeTab === "projects" &&
                    (editingProject ? "Edit Project" : "Add Project")}{" "}
                  {activeTab === "leaveTypes" &&
                    (editingLeaveType
                      ? "Edit Leave Type"
                      : "Add Leave Type")}{" "}
                  {activeTab === "holidays" &&
                    (editingHoliday ? "Edit Holiday" : "Add Holiday")}{" "}
                </h2>{" "}
                <p
                  className="adminManagementMuted"
                  style={{
                    margin: "5px 0 0",
                  }}
                >
                  {" "}
                  {activeTab === "departments" &&
                    (editingDepartment
                      ? "Update department information."
                      : "Create a department for organizing employees.")}{" "}
                  {activeTab === "projects" &&
                    "Configure project ownership, department and dates."}{" "}
                  {activeTab === "leaveTypes" &&
                    (editingLeaveType
                      ? "Update the leave type information."
                      : "Create a reusable leave type for employees.")}{" "}
                  {activeTab === "holidays" &&
                    "Add a company holiday to the calendar."}{" "}
                </p>{" "}
              </div>{" "}
              <button
                type="button"
                className="adminManagementModalClose"
                onClick={() => closeModal()}
                disabled={saving}
                aria-label="Close"
              >
                <X size={16} />{" "}
              </button>{" "}
            </div>{" "}
            {formError && (
              <div
                className="adminManagementFormError"
                role="alert"
                aria-live="polite"
              >
                <span>{formError}</span>{" "}
              </div>
            )}{" "}
            {activeTab === "departments" && (
              <form className="adminManagementForm" onSubmit={saveDepartment}>
                {" "}
                <div className="adminManagementField">
                  {" "}
                  <span>Department Name *</span>{" "}
                  <input
                    type="text"
                    value={departmentForm.name}
                    onChange={(event) =>
                      setDepartmentForm((previous) => ({
                        ...previous,

                        name: event.target.value,
                      }))
                    }
                    placeholder="e.g. Human Resources"
                    autoFocus
                  />{" "}
                </div>{" "}
                <div
                  className="adminManagementField"
                  style={{
                    marginTop: 14,
                  }}
                >
                  <span>Description</span>{" "}
                  <textarea
                    value={departmentForm.description}
                    onChange={(event) =>
                      setDepartmentForm((previous) => ({
                        ...previous,

                        description: event.target.value,
                      }))
                    }
                    placeholder="Enter department description"
                    rows={4}
                  />{" "}
                </div>{" "}
                <div
                  className="adminManagementFormActions"
                  style={{
                    marginTop: 20,
                  }}
                >
                  {" "}
                  <button
                    type="button"
                    className="adminManagementCancelBtn"
                    onClick={() => closeModal()}
                    disabled={saving}
                  >
                    Cancel{" "}
                  </button>{" "}
                  <button
                    type="submit"
                    className="adminManagementSaveBtn"
                    disabled={saving}
                  >
                    <Save size={15} />{" "}
                    {saving
                      ? "Saving..."
                      : editingDepartment
                        ? "Update Department"
                        : "Save Department"}{" "}
                  </button>{" "}
                </div>{" "}
              </form>
            )}{" "}
            {activeTab === "projects" && (
              <form className="adminManagementForm" onSubmit={saveProject}>
                {" "}
                <div className="adminManagementFormGrid">
                  {" "}
                  <label className="adminManagementField">
                    {" "}
                    <span>Project Name *</span>{" "}
                    <input
                      type="text"
                      value={projectForm.name}
                      onChange={(event) =>
                        setProjectForm((previous) => ({
                          ...previous,

                          name: event.target.value,
                        }))
                      }
                      placeholder="Enter project name"
                      autoFocus
                    />{" "}
                  </label>{" "}
                  <label className="adminManagementField">
                    {" "}
                    <span>Status *</span>{" "}
                    <select
                      value={projectForm.status}
                      onChange={(event) =>
                        setProjectForm((previous) => ({
                          ...previous,

                          status: event.target.value,
                        }))
                      }
                    >
                      {" "}
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="COMPLETED">COMPLETED</option>
                      <option value="ON_HOLD">ON_HOLD</option>
                      <option value="ARCHIVED">ARCHIVED</option>{" "}
                    </select>{" "}
                  </label>{" "}
                  <label className="adminManagementField">
                    {" "}
                    <span>Department *</span>{" "}
                    <select
                      value={projectForm.departmentId}
                      onChange={(event) =>
                        setProjectForm((previous) => ({
                          ...previous,

                          departmentId: event.target.value,
                        }))
                      }
                    >
                      {" "}
                      <option value="">Select department</option>{" "}
                      {departments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {" "}
                          {department.name}{" "}
                        </option>
                      ))}{" "}
                    </select>{" "}
                  </label>{" "}
                  <label className="adminManagementField">
                    {" "}
                    <span>Manager *</span>{" "}
                    <select
                      value={projectForm.managerId}
                      onChange={(event) =>
                        setProjectForm((previous) => ({
                          ...previous,

                          managerId: event.target.value,
                        }))
                      }
                    >
                      {" "}
                      <option value="">
                        {employeesLoading
                          ? "Loading managers..."
                          : employeesError
                            ? "Managers could not be loaded"
                            : managers.length === 0
                              ? "No managers available"
                              : "Select manager"}
                      </option>
                      {editingProject?.managerId === projectForm.managerId &&
                        projectForm.managerId &&
                        !managers.some(
                          (manager) => manager.id === projectForm.managerId,
                        ) && (
                          <option value={projectForm.managerId}>
                            {editingProject.manager?.fullName ||
                              "Current project manager"}
                          </option>
                        )}
                      {managers.map((manager) => (
                        <option key={manager.id} value={manager.id}>
                          {" "}
                          {manager.fullName}{" "}
                        </option>
                      ))}{" "}
                    </select>
                    {employeesError && (
                      <small className="adminManagementFieldHint isError">
                        Manager choices could not be loaded. Refresh and try
                        again.
                      </small>
                    )}
                    {!employeesLoading &&
                      !employeesError &&
                      managers.length === 0 && (
                        <small className="adminManagementFieldHint isError">
                          Add an employee with the Manager role before assigning
                          this project.
                        </small>
                      )}{" "}
                  </label>{" "}
                  <label className="adminManagementField">
                    {" "}
                    <span>Start Date</span>{" "}
                    <input
                      type="date"
                      value={projectForm.startDate}
                      onChange={(event) =>
                        setProjectForm((previous) => ({
                          ...previous,

                          startDate: event.target.value,
                        }))
                      }
                    />{" "}
                  </label>{" "}
                  <label className="adminManagementField">
                    {" "}
                    <span>End Date</span>{" "}
                    <input
                      type="date"
                      value={projectForm.endDate}
                      onChange={(event) =>
                        setProjectForm((previous) => ({
                          ...previous,

                          endDate: event.target.value,
                        }))
                      }
                    />{" "}
                  </label>{" "}
                </div>{" "}
                <label
                  className="adminManagementField"
                  style={{
                    marginTop: 14,
                  }}
                >
                  <span>Description</span>{" "}
                  <textarea
                    value={projectForm.description}
                    onChange={(event) =>
                      setProjectForm((previous) => ({
                        ...previous,

                        description: event.target.value,
                      }))
                    }
                    placeholder="Enter project description"
                    rows={4}
                  />{" "}
                </label>{" "}
                <div
                  className="adminManagementFormActions"
                  style={{
                    marginTop: 20,
                  }}
                >
                  {" "}
                  <button
                    type="button"
                    className="adminManagementCancelBtn"
                    onClick={() => closeModal()}
                    disabled={saving}
                  >
                    Cancel{" "}
                  </button>{" "}
                  <button
                    type="submit"
                    className="adminManagementSaveBtn"
                    disabled={saving}
                  >
                    <Save size={15} />{" "}
                    {saving
                      ? "Saving..."
                      : editingProject
                        ? "Update Project"
                        : "Save Project"}{" "}
                  </button>{" "}
                </div>{" "}
              </form>
            )}{" "}
            {activeTab === "leaveTypes" && (
              <form className="adminManagementForm" onSubmit={saveLeaveType}>
                {" "}
                <div className="adminManagementField">
                  {" "}
                  <span>Leave Type Name *</span>{" "}
                  <input
                    type="text"
                    value={leaveTypeForm.name}
                    onChange={(event) =>
                      setLeaveTypeForm((previous) => ({
                        ...previous,

                        name: event.target.value,
                      }))
                    }
                    placeholder="e.g. Casual Leave"
                    autoFocus
                  />{" "}
                </div>{" "}
                <div
                  className="adminManagementField"
                  style={{
                    marginTop: 14,
                  }}
                >
                  <span>Description</span>{" "}
                  <textarea
                    value={leaveTypeForm.description}
                    onChange={(event) =>
                      setLeaveTypeForm((previous) => ({
                        ...previous,

                        description: event.target.value,
                      }))
                    }
                    placeholder="Enter leave type description"
                    rows={4}
                  />{" "}
                </div>{" "}
                <div
                  className="adminManagementFormActions"
                  style={{
                    marginTop: 20,
                  }}
                >
                  {" "}
                  <button
                    type="button"
                    className="adminManagementCancelBtn"
                    onClick={() => closeModal()}
                    disabled={saving}
                  >
                    Cancel{" "}
                  </button>{" "}
                  <button
                    type="submit"
                    className="adminManagementSaveBtn"
                    disabled={saving}
                  >
                    <Save size={15} />{" "}
                    {saving
                      ? "Saving..."
                      : editingLeaveType
                        ? "Update Leave Type"
                        : "Save Leave Type"}{" "}
                  </button>{" "}
                </div>{" "}
              </form>
            )}{" "}
            {activeTab === "holidays" && (
              <form className="adminManagementForm" onSubmit={saveHoliday}>
                {" "}
                <div className="adminManagementFormGrid">
                  {" "}
                  <label className="adminManagementField">
                    {" "}
                    <span>Holiday Name *</span>{" "}
                    <input
                      type="text"
                      value={holidayForm.name}
                      onChange={(event) =>
                        setHolidayForm((previous) => ({
                          ...previous,

                          name: event.target.value,
                        }))
                      }
                      placeholder="e.g. Independence Day"
                      autoFocus
                    />{" "}
                  </label>{" "}
                  <label className="adminManagementField">
                    <span>Date *</span>{" "}
                    <input
                      type="date"
                      value={holidayForm.date}
                      onChange={(event) =>
                        setHolidayForm((previous) => ({
                          ...previous,

                          date: event.target.value,
                        }))
                      }
                    />{" "}
                  </label>{" "}
                </div>{" "}
                <label
                  className="adminManagementField"
                  style={{
                    marginTop: 14,
                  }}
                >
                  <span>Description</span>{" "}
                  <textarea
                    value={holidayForm.description}
                    onChange={(event) =>
                      setHolidayForm((previous) => ({
                        ...previous,

                        description: event.target.value,
                      }))
                    }
                    placeholder="Enter holiday description"
                    rows={4}
                  />{" "}
                </label>{" "}
                <div
                  className="adminManagementFormActions"
                  style={{
                    marginTop: 20,
                  }}
                >
                  {" "}
                  <button
                    type="button"
                    className="adminManagementCancelBtn"
                    onClick={() => closeModal()}
                    disabled={saving}
                  >
                    Cancel{" "}
                  </button>{" "}
                  <button
                    type="submit"
                    className="adminManagementSaveBtn"
                    disabled={saving}
                  >
                    <Save size={15} />{" "}
                    {saving
                      ? "Saving..."
                      : editingHoliday
                        ? "Update Holiday"
                        : "Save Holiday"}{" "}
                  </button>{" "}
                </div>{" "}
              </form>
            )}{" "}
          </div>{" "}
        </div>
      )}{" "}
      <ConfirmDialog
        open={Boolean(deleteDepartmentTarget)}
        title="Delete Department?"
        message={
          deleteDepartmentTarget
            ? `Are you sure you want to delete the department "${deleteDepartmentTarget.name}"? This action cannot be undone.`
            : "Are you sure you want to delete this department?"
        }
        confirmText="Delete Department"
        cancelText="Cancel"
        danger
        loading={saving}
        onConfirm={deleteDepartment}
        onCancel={() => {
          if (!saving) setDeleteDepartmentTarget(null);
        }}
      />{" "}
      <ConfirmDialog
        open={Boolean(deleteProjectTarget)}
        title="Delete Project?"
        message={
          deleteProjectTarget
            ? `Are you sure you want to delete the project "${deleteProjectTarget.name}"? This action cannot be undone.`
            : "Are you sure you want to delete this project?"
        }
        confirmText="Delete Project"
        cancelText="Cancel"
        danger
        loading={saving}
        onConfirm={deleteProject}
        onCancel={() => {
          if (!saving) setDeleteProjectTarget(null);
        }}
      />{" "}
    </div>
  );
}
