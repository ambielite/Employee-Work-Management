import type React from "react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Filter,
  RefreshCw,
  Plus,
  Pencil,
  X,
  UserPlus,
  Power,
  CheckCircle2,
  AlertCircle,
  Users,
  UserCheck,
  UserX,
  Eye,
  EyeOff,
} from "lucide-react";

import { get, post, patch } from "../api/client";
import "./admin-employees.css";

type AccountStatus = "ACTIVE" | "INACTIVE";

type Employee = {
  id: string;
  employeeId: string;
  fullName: string;
  phone?: string | null;
  dateOfJoining: string;
  designation: string;
  employmentStatus?: string;
  accountStatus?: AccountStatus;

  department?: {
    id: string;
    name: string;
  } | null;

  manager?: {
    id: string;
    fullName: string;
    employeeId: string;
  } | null;

  user?: {
    id: string;
    email: string;
    role: string;
    accountStatus?: AccountStatus;
  } | null;
};

type Department = {
  id: string;
  name: string;
};

type EmployeeForm = {
  employeeId: string;
  fullName: string;
  email: string;
  phone: string;
  dateOfJoining: string;
  designation: string;
  departmentId: string;
  managerId: string;
  role: string;
  password: string;
};

const initialForm: EmployeeForm = {
  employeeId: "",
  fullName: "",
  email: "",
  phone: "",
  dateOfJoining: "",
  designation: "",
  departmentId: "",
  managerId: "",
  role: "EMPLOYEE",
  password: "REMOVED_DEMO_PASSWORD",
};

function getNextEmployeeId(employees: Employee[]): string {
  const usedNumbers = employees
    .map((employee) => employee.employeeId?.trim().toUpperCase() || "")
    .map((id) => {
      const match = id.match(/^EMP(\d+)$/);
      return match ? Number(match[1]) : null;
    })
    .filter(
      (value): value is number =>
        value !== null && Number.isFinite(value) && value > 0,
    );

  const nextNumber = usedNumbers.length > 0 ? Math.max(...usedNumbers) + 1 : 1;

  return `EMP${String(nextNumber).padStart(3, "0")}`;
}

/* -----------------------------------------
   FORM VALIDATION
----------------------------------------- */

function validateEmployeeForm(
  form: EmployeeForm,
  isEdit = false,
): string | null {
  const employeeId = form.employeeId.trim();
  const fullName = form.fullName.trim();
  const email = form.email.trim();
  const phone = form.phone.trim();
  const designation = form.designation.trim();
  const password = form.password;

  if (!employeeId) return "Employee ID is required.";
  if (!/^[A-Za-z0-9_-]{2,20}$/.test(employeeId)) {
    return "Employee ID must be 2-20 characters and contain only letters, numbers, hyphen or underscore.";
  }

  if (!fullName) return "Full name is required.";
  if (fullName.length < 2 || fullName.length > 80) {
    return "Full name must be between 2 and 80 characters.";
  }
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ .'-]*$/.test(fullName)) {
    return "Full name can contain only letters, spaces, apostrophe, dot and hyphen.";
  }

  if (!email) return "Email address is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return "Please enter a valid email address.";
  }

  // if (phone) {
  //   const normalizedPhone = phone.replace(/[\s-]/g, "");
  //   if (!/^(?:\+91)?[6-9]\d{9}$/.test(normalizedPhone)) {
  //     return "Please enter a valid 10-digit Indian phone number.";
  //   }
  // }

  if (phone && !/^\d{10}$/.test(phone)) {
    return "Phone number must contain exactly 10 digits.";
  }

  if (!form.dateOfJoining) return "Date of joining is required.";
  if (Number.isNaN(new Date(form.dateOfJoining).getTime())) {
    return "Please enter a valid date of joining.";
  }

  if (!designation) return "Designation is required.";
  if (designation.length < 2 || designation.length > 100) {
    return "Designation must be between 2 and 100 characters.";
  }

  if (!form.departmentId) return "Please select a department.";

  if (!["EMPLOYEE", "MANAGER"].includes(form.role)) {
    return "Please select a valid role.";
  }

  if (!isEdit) {
    if (!password.trim()) return "Password is required.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password.length > 72) return "Password must not exceed 72 characters.";
    if (!/[A-Z]/.test(password)) {
      return "Password must contain at least one uppercase letter.";
    }
    if (!/[a-z]/.test(password)) {
      return "Password must contain at least one lowercase letter.";
    }
    if (!/\d/.test(password)) {
      return "Password must contain at least one number.";
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      return "Password must contain at least one special character.";
    }
  }

  return null;
}

export default function AdminEmployees() {
  const queryClient = useQueryClient();

  /* -----------------------------------------
     PAGE FILTERS
  ----------------------------------------- */

  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  /* -----------------------------------------
     ADD MODAL
  ----------------------------------------- */

  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState<EmployeeForm>(initialForm);
  const [formError, setFormError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const addFormRef = useRef<HTMLFormElement | null>(null);
  const editFormRef = useRef<HTMLFormElement | null>(null);

  /* -----------------------------------------
     EDIT MODAL
  ----------------------------------------- */

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editForm, setEditForm] = useState<EmployeeForm>(initialForm);
  const [editFormError, setEditFormError] = useState("");

  /* -----------------------------------------
     EMPLOYEE DETAILS MODAL
  ----------------------------------------- */

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    null,
  );

  function scrollFormToError(formRef: React.RefObject<HTMLFormElement | null>) {
    requestAnimationFrame(() => {
      formRef.current?.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    });
  }

  /* -----------------------------------------
     CONFIRMATION
  ----------------------------------------- */

  const [confirmEmployee, setConfirmEmployee] = useState<Employee | null>(null);
  const [removingEmployeeIds, setRemovingEmployeeIds] = useState<string[]>([]);

  /* -----------------------------------------
     NOTIFICATION
  ----------------------------------------- */

  const [notification, setNotification] = useState<{
    type: "success" | "error";
    title: string;
    message: string;
  } | null>(null);

  /* -----------------------------------------
     EMPLOYEES
  ----------------------------------------- */

  const {
    data: employees = [],
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery<Employee[]>({
    queryKey: ["admin-employees"],
    queryFn: () => get<Employee[]>("/employees"),
  });

  /* -----------------------------------------
     DEPARTMENTS
  ----------------------------------------- */

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["departments"],
    queryFn: () => get<Department[]>("/departments"),
  });

  /* -----------------------------------------
     MANAGERS
  ----------------------------------------- */

  const managers = useMemo(() => {
    return employees.filter(
      (employee) =>
        employee.user?.role === "MANAGER" &&
        getEmployeeStatus(employee) === "ACTIVE",
    );
  }, [employees]);

  /* -----------------------------------------
     FILTERED EMPLOYEES
  ----------------------------------------- */

  const filteredEmployees = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return employees.filter((employee) => {
      const matchesSearch =
        !searchText ||
        employee.employeeId?.toLowerCase().includes(searchText) ||
        employee.fullName?.toLowerCase().includes(searchText) ||
        employee.user?.email?.toLowerCase().includes(searchText) ||
        employee.designation?.toLowerCase().includes(searchText);

      const matchesDepartment =
        department === "ALL" || employee.department?.id === department;

      const matchesRole =
        roleFilter === "ALL" || employee.user?.role === roleFilter;

      const matchesStatus =
        statusFilter === "ALL" || getEmployeeStatus(employee) === statusFilter;

      return matchesSearch && matchesDepartment && matchesRole && matchesStatus;
    });
  }, [employees, search, department, roleFilter, statusFilter]);

  function clearFilters() {
    setSearch("");
    setDepartment("ALL");
    setRoleFilter("ALL");
    setStatusFilter("ALL");
  }

  /* -----------------------------------------
     STATUS HELPER
  ----------------------------------------- */

  function getEmployeeStatus(employee: Employee): AccountStatus {
    /*
     * Employee.accountStatus is the primary status.
     *
     * user.accountStatus is used as a fallback so the UI
     * remains safe if an older API response does not contain
     * the Employee-level field.
     */
    return employee.accountStatus || employee.user?.accountStatus || "ACTIVE";
  }

  /* -----------------------------------------
     NOTIFICATIONS
  ----------------------------------------- */

  function showSuccess(title: string, message: string) {
    setNotification({
      type: "success",
      title,
      message,
    });

    window.setTimeout(() => {
      setNotification(null);
    }, 3500);
  }

  function showError(title: string, message: string) {
    setNotification({
      type: "error",
      title,
      message,
    });

    window.setTimeout(() => {
      setNotification(null);
    }, 4500);
  }

  /* -----------------------------------------
     FORM HELPERS
  ----------------------------------------- */

  function updateFormField(field: keyof EmployeeForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateEditField(field: keyof EmployeeForm, value: string) {
    setEditForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  /* -----------------------------------------
     ADD EMPLOYEE
  ----------------------------------------- */

  const addEmployeeMutation = useMutation({
    mutationFn: (payload: EmployeeForm) => {
      return post("/employees", {
        employeeId: payload.employeeId.trim(),
        fullName: payload.fullName.trim(),
        email: payload.email.trim(),
        phone: payload.phone.trim() || undefined,
        dateOfJoining: payload.dateOfJoining,
        designation: payload.designation.trim(),
        departmentId: payload.departmentId,
        managerId: payload.managerId || undefined,
        role: payload.role,
        password: payload.password,
      });
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-employees"],
      });

      setShowAddModal(false);
      setForm(initialForm);
      setFormError("");

      showSuccess(
        "Employee Created",
        "The employee account has been created successfully.",
      );
    },

    onError: (error: any) => {
      const message =
        error?.response?.data?.message || "Unable to create employee.";

      const finalMessage = Array.isArray(message)
        ? message.join(", ")
        : message;

      setFormError(finalMessage);
      scrollFormToError(addFormRef);
      showError("Unable to Create Employee", finalMessage);
    },
  });

  /* -----------------------------------------
     EDIT EMPLOYEE
  ----------------------------------------- */

  const editEmployeeMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: EmployeeForm }) => {
      return patch(`/employees/${id}`, {
        employeeId: payload.employeeId.trim(),
        fullName: payload.fullName.trim(),
        email: payload.email.trim(),
        phone: payload.phone.trim() || undefined,
        dateOfJoining: payload.dateOfJoining,
        designation: payload.designation.trim(),
        departmentId: payload.departmentId,
        managerId: payload.managerId || null,
        role: payload.role,
      });
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-employees"],
      });

      setShowEditModal(false);
      setEditingEmployee(null);
      setEditForm(initialForm);
      setEditFormError("");

      showSuccess(
        "Employee Updated",
        "Employee information has been updated successfully.",
      );
    },

    onError: (error: any) => {
      const message =
        error?.response?.data?.message || "Unable to update employee.";

      const finalMessage = Array.isArray(message)
        ? message.join(", ")
        : message;

      setEditFormError(finalMessage);
      scrollFormToError(editFormRef);
      showError("Unable to Update Employee", finalMessage);
    },
  });

  /* -----------------------------------------
     ACTIVATE / DEACTIVATE
  ----------------------------------------- */

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AccountStatus }) => {
      return patch(`/employees/${id}`, {
        accountStatus: status,
      });
    },

    onSuccess: (_, variables) => {
      setConfirmEmployee(null);

      const currentEmployee = employees.find(
        (employee) => employee.id === variables.id,
      );

      const currentStatus = currentEmployee
        ? getEmployeeStatus(currentEmployee)
        : undefined;

      const shouldAnimateRemoval =
        !!currentEmployee &&
        currentStatus !== variables.status &&
        statusFilter === currentStatus;

      if (shouldAnimateRemoval) {
        setRemovingEmployeeIds((current) =>
          current.includes(variables.id) ? current : [...current, variables.id],
        );

        window.setTimeout(() => {
          queryClient.invalidateQueries({
            queryKey: ["admin-employees"],
          });

          setRemovingEmployeeIds((current) =>
            current.filter((id) => id !== variables.id),
          );
        }, 320);
      } else {
        queryClient.invalidateQueries({
          queryKey: ["admin-employees"],
        });
      }

      if (variables.status === "INACTIVE") {
        showSuccess(
          "Employee Deactivated",
          "The employee account has been deactivated successfully.",
        );
      } else {
        showSuccess(
          "Employee Activated",
          "The employee account has been activated successfully.",
        );
      }
    },

    onError: (error: any) => {
      const message =
        error?.response?.data?.message || "Unable to change employee status.";

      const finalMessage = Array.isArray(message)
        ? message.join(", ")
        : message;

      setConfirmEmployee(null);

      showError("Status Update Failed", finalMessage);
    },
  });

  /* -----------------------------------------
     ADD MODAL
  ----------------------------------------- */

  function openAddModal() {
    setForm({
      ...initialForm,
      employeeId: getNextEmployeeId(employees),
    });
    setFormError("");
    setShowPassword(false);
    setShowAddModal(true);
  }

  function closeAddModal() {
    if (addEmployeeMutation.isPending) {
      return;
    }

    setShowAddModal(false);
    setForm(initialForm);
    setFormError("");
    setShowPassword(false);
  }

  function submitAddEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    const validationError = validateEmployeeForm(form);

    if (validationError) {
      setFormError(validationError);
      scrollFormToError(addFormRef);
      return;
    }

    addEmployeeMutation.mutate({
      ...form,
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      employeeId: form.employeeId.trim(),
      fullName: form.fullName.trim(),
      designation: form.designation.trim(),
    });
  }

  /* -----------------------------------------
     EDIT MODAL
  ----------------------------------------- */

  function openEditModal(employee: Employee) {
    setEditingEmployee(employee);

    setEditForm({
      employeeId: employee.employeeId || "",
      fullName: employee.fullName || "",
      email: employee.user?.email || "",
      phone: employee.phone || "",
      dateOfJoining: employee.dateOfJoining
        ? employee.dateOfJoining.substring(0, 10)
        : "",
      designation: employee.designation || "",
      departmentId: employee.department?.id || "",
      managerId: employee.manager?.id || "",
      role: employee.user?.role || "EMPLOYEE",
      password: "",
    });

    setEditFormError("");
    setShowEditModal(true);
  }

  function closeEmployeeDetails() {
    setSelectedEmployee(null);
  }

  function openEditFromDetails() {
    if (!selectedEmployee) return;
    const employee = selectedEmployee;
    setSelectedEmployee(null);
    openEditModal(employee);
  }

  function openStatusFromDetails() {
    if (!selectedEmployee) return;
    const employee = selectedEmployee;
    setSelectedEmployee(null);
    requestStatusChange(employee);
  }

  function closeEditModal() {
    if (editEmployeeMutation.isPending) {
      return;
    }

    setShowEditModal(false);
    setEditingEmployee(null);
    setEditForm(initialForm);
    setEditFormError("");
  }

  function submitEditEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setEditFormError("");

    if (!editingEmployee) {
      return;
    }

    const validationError = validateEmployeeForm(editForm, true);

    if (validationError) {
      setEditFormError(validationError);
      scrollFormToError(editFormRef);
      return;
    }

    editEmployeeMutation.mutate({
      id: editingEmployee.id,
      payload: {
        ...editForm,
        email: editForm.email.trim().toLowerCase(),
        phone: editForm.phone.trim(),
        employeeId: editForm.employeeId.trim(),
        fullName: editForm.fullName.trim(),
        designation: editForm.designation.trim(),
      },
    });
  }

  /* -----------------------------------------
     STATUS CONFIRMATION
  ----------------------------------------- */

  function requestStatusChange(employee: Employee) {
    setConfirmEmployee(employee);
  }

  function confirmStatusChange() {
    if (!confirmEmployee) {
      return;
    }

    const currentStatus = getEmployeeStatus(confirmEmployee);

    const nextStatus: AccountStatus =
      currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";

    statusMutation.mutate({
      id: confirmEmployee.id,
      status: nextStatus,
    });
  }

  /* -----------------------------------------
     COUNTS
  ----------------------------------------- */

  const activeCount = employees.filter(
    (employee) => getEmployeeStatus(employee) === "ACTIVE",
  ).length;

  const inactiveCount = employees.filter(
    (employee) => getEmployeeStatus(employee) === "INACTIVE",
  ).length;

  /* -----------------------------------------
     JSX
  ----------------------------------------- */

  return (
    <>
      {/* =====================================
          PAGE HEADER
      ===================================== */}

      <div className="title adminEmployeesHeader">
        <div>
          <h1>Employees</h1>

          <p className="pageSubtitle">
            Manage employee accounts, roles and work information.
          </p>
        </div>

        <div className="employeeHeaderActions">
          <button
            type="button"
            className="btn primaryBtn refreshBtn"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw size={16} className={isFetching ? "spin" : ""} />
            Refresh
          </button>

          <button
            type="button"
            className="btn primaryBtn"
            onClick={openAddModal}
          >
            <Plus size={17} />
            Add Employee
          </button>
        </div>
      </div>

      {/* =====================================
          SUMMARY
      ===================================== */}

      <div className="employeeSummaryGrid">
        <div className="employeeSummaryCard totalCard">
          <div className="summaryIcon total">
            <Users size={19} />
          </div>

          <div>
            <span>Total Employees</span>
            <strong>{employees.length}</strong>
          </div>
        </div>

        <div className="employeeSummaryCard activeCard">
          <div className="summaryIcon active">
            <UserCheck size={19} />
          </div>

          <div>
            <span>Active</span>
            <strong>{activeCount}</strong>
          </div>
        </div>

        <div className="employeeSummaryCard inactiveCard">
          <div className="summaryIcon inactive">
            <UserX size={19} />
          </div>

          <div>
            <span>Inactive</span>
            <strong>{inactiveCount}</strong>
          </div>
        </div>
      </div>

      {/* =====================================
          FILTERS
      ===================================== */}

      <div className="card employeeFilterCard">
        <div className="employeeFilterHeader">
          <span className="adminTasksFilterTitle">
            <Filter size={15} />
            Employee Filters
          </span>

          <button
            type="button"
            className="btn primaryBtn employeeClearBtn"
            onClick={clearFilters}
            disabled={
              !search &&
              department === "ALL" &&
              roleFilter === "ALL" &&
              statusFilter === "ALL"
            }
          >
            Clear Filters
          </button>
        </div>

        <div className="employeeFilter">
          <div className="employeeSearch">
            <Search size={17} />

            <input
              type="text"
              placeholder="Search employee, ID, email or designation..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <select
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
          >
            <option value="ALL">All Departments</option>

            {departments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>

          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
          >
            <option value="ALL">All Roles</option>
            <option value="EMPLOYEE">Employee</option>
            <option value="MANAGER">Manager</option>
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>

      {/* =====================================
          TABLE
      ===================================== */}

      <div className="card employeeTableCard">
        {isLoading ? (
          <div className="employeeState">Loading employees...</div>
        ) : isError ? (
          <div className="employeeState errorState">
            Unable to load employees.
          </div>
        ) : (
          <div className="tableWrap">
            <table className="table employeeTable">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Employee ID</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Designation</th>
                  <th>Manager</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <div className="employeeState">No employees found.</div>
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((employee) => {
                    const status = getEmployeeStatus(employee);
                    const isActive = status === "ACTIVE";

                    return (
                      <tr
                        key={employee.id}
                        className={`employeeClickableRow ${
                          removingEmployeeIds.includes(employee.id)
                            ? "employeeRowExit"
                            : ""
                        }`}
                        onClick={() => setSelectedEmployee(employee)}
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedEmployee(employee);
                          }
                        }}
                      >
                        <td>
                          <div className="employeeNameCell">
                            <div className="employeeAvatar">
                              {employee.fullName?.charAt(0).toUpperCase()}
                            </div>

                            <div>
                              <strong>{employee.fullName}</strong>
                            </div>
                          </div>
                        </td>

                        <td>{employee.employeeId}</td>
                        <td>{employee.user?.email || "-"}</td>
                        <td>{employee.department?.name || "-"}</td>
                        <td>{employee.designation || "-"}</td>
                        <td>{employee.manager?.fullName || "-"}</td>

                        <td>
                          <span className="roleBadge">
                            {employee.user?.role || "EMPLOYEE"}
                          </span>
                        </td>

                        <td>
                          <span
                            className={`employeeStatus ${
                              isActive ? "active" : "inactive"
                            }`}
                          >
                            {status}
                          </span>
                        </td>

                        <td>
                          <div className="employeeActions">
                            <button
                              type="button"
                              className="iconActionBtn"
                              title="Edit employee"
                              onClick={(event) => {
                                event.stopPropagation();
                                openEditModal(employee);
                              }}
                            >
                              <Pencil size={16} />
                            </button>

                            {isActive ? (
                              <button
                                type="button"
                                className="iconActionBtn deactivateAction"
                                title="Deactivate employee"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  requestStatusChange(employee);
                                }}
                              >
                                <Power size={16} />
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="iconActionBtn activateAction"
                                title="Activate employee"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  requestStatusChange(employee);
                                }}
                              >
                                <CheckCircle2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =====================================
          EMPLOYEE DETAILS MODAL
      ===================================== */}

      {selectedEmployee && (
        <div
          className="employeeDetailsOverlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeEmployeeDetails();
            }
          }}
        >
          <div className="employeeDetailsModal" role="dialog" aria-modal="true">
            <div className="employeeDetailsHeader">
              <div className="employeeDetailsIdentity">
                <div className="employeeDetailsAvatar">
                  {selectedEmployee.fullName?.charAt(0).toUpperCase() || "?"}
                </div>

                <div>
                  <h2>{selectedEmployee.fullName}</h2>
                  <div className="employeeDetailsMeta">
                    <span>{selectedEmployee.employeeId}</span>
                    <span>•</span>
                    <span>{selectedEmployee.designation || "Employee"}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="employeeDetailsClose"
                onClick={closeEmployeeDetails}
                aria-label="Close employee details"
              >
                <X size={20} />
              </button>
            </div>

            <div className="employeeDetailsBody">
              <div className="employeeDetailsStatusRow">
                <div>
                  <span className="employeeDetailsLabel">Account Status</span>
                  <span
                    className={`employeeStatus ${
                      getEmployeeStatus(selectedEmployee) === "ACTIVE"
                        ? "active"
                        : "inactive"
                    }`}
                  >
                    {getEmployeeStatus(selectedEmployee)}
                  </span>
                </div>

                <div>
                  <span className="employeeDetailsLabel">Role</span>
                  <span className="roleBadge">
                    {selectedEmployee.user?.role || "EMPLOYEE"}
                  </span>
                </div>
              </div>

              <div className="employeeDetailsSectionTitle">
                Employee Information
              </div>

              <div className="employeeDetailsGrid">
                <div className="employeeDetailsItem">
                  <span>Email</span>
                  <strong>{selectedEmployee.user?.email || "-"}</strong>
                </div>

                <div className="employeeDetailsItem">
                  <span>Phone</span>
                  <strong>{selectedEmployee.phone || "-"}</strong>
                </div>

                <div className="employeeDetailsItem">
                  <span>Department</span>
                  <strong>{selectedEmployee.department?.name || "-"}</strong>
                </div>

                <div className="employeeDetailsItem">
                  <span>Manager</span>
                  <strong>{selectedEmployee.manager?.fullName || "-"}</strong>
                </div>

                <div className="employeeDetailsItem">
                  <span>Date of Joining</span>
                  <strong>
                    {selectedEmployee.dateOfJoining
                      ? new Date(
                          selectedEmployee.dateOfJoining,
                        ).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "-"}
                  </strong>
                </div>

                <div className="employeeDetailsItem">
                  <span>Employment Status</span>
                  <strong>
                    {getEmployeeStatus(selectedEmployee) === "INACTIVE"
                      ? "INACTIVE"
                      : selectedEmployee.employmentStatus || "ACTIVE"}
                  </strong>
                </div>
              </div>
            </div>

            <div className="employeeDetailsFooter">
              <button
                type="button"
                className="btn employeeDetailsEditBtn"
                onClick={openEditFromDetails}
              >
                <Pencil size={16} />
                Edit
              </button>

              <button
                type="button"
                className={`btn employeeDetailsStatusBtn ${
                  getEmployeeStatus(selectedEmployee) === "ACTIVE"
                    ? "deactivate"
                    : "activate"
                }`}
                onClick={openStatusFromDetails}
              >
                {getEmployeeStatus(selectedEmployee) === "ACTIVE" ? (
                  <Power size={16} />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                {getEmployeeStatus(selectedEmployee) === "ACTIVE"
                  ? "Deactivate"
                  : "Activate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================
          ADD EMPLOYEE MODAL
      ===================================== */}

      {showAddModal && (
        <div
          className="employeeModalOverlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeAddModal();
            }
          }}
        >
          <div className="employeeModal">
            <div className="employeeModalHeader">
              <div className="modalTitleArea">
                <div className="modalIcon">
                  <UserPlus size={21} />
                </div>

                <div>
                  <h2>Add Employee</h2>
                  <p>Create a new employee account and profile.</p>
                </div>
              </div>

              <button
                type="button"
                className="modalCloseBtn"
                onClick={closeAddModal}
                disabled={addEmployeeMutation.isPending}
              >
                <X size={20} />
              </button>
            </div>

            <form
              ref={addFormRef}
              className="employeeModalForm"
              onSubmit={submitAddEmployee}
            >
              {formError && (
                <div className="modalError">
                  <AlertCircle size={17} />
                  <span>{formError}</span>
                </div>
              )}

              <EmployeeFormFields
                form={form}
                departments={departments}
                managers={managers}
                onChange={updateFormField}
                showPassword={showPassword}
                onTogglePassword={() => setShowPassword((current) => !current)}
              />

              <div className="employeeModalFooter">
                <button
                  type="button"
                  className="btn modalCancelBtn"
                  onClick={closeAddModal}
                  disabled={addEmployeeMutation.isPending}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn primaryBtn modalSaveBtn"
                  disabled={addEmployeeMutation.isPending}
                >
                  {addEmployeeMutation.isPending
                    ? "Creating..."
                    : "Create Employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================
          EDIT EMPLOYEE MODAL
      ===================================== */}

      {showEditModal && editingEmployee && (
        <div
          className="employeeModalOverlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeEditModal();
            }
          }}
        >
          <div className="employeeModal">
            <div className="employeeModalHeader">
              <div className="modalTitleArea">
                <div className="modalIcon editIcon">
                  <Pencil size={21} />
                </div>

                <div>
                  <h2>Edit Employee</h2>
                  <p>Update employee profile and account information.</p>
                </div>
              </div>

              <button
                type="button"
                className="modalCloseBtn"
                onClick={closeEditModal}
                disabled={editEmployeeMutation.isPending}
              >
                <X size={20} />
              </button>
            </div>

            <form
              ref={editFormRef}
              className="employeeModalForm"
              onSubmit={submitEditEmployee}
            >
              {editFormError && (
                <div className="modalError">
                  <AlertCircle size={17} />
                  <span>{editFormError}</span>
                </div>
              )}

              <EmployeeFormFields
                form={editForm}
                departments={departments}
                managers={managers.filter(
                  (manager) => manager.id !== editingEmployee.id,
                )}
                onChange={updateEditField}
                isEdit
              />

              <div className="employeeModalFooter">
                <button
                  type="button"
                  className="btn modalCancelBtn"
                  onClick={closeEditModal}
                  disabled={editEmployeeMutation.isPending}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn primaryBtn modalSaveBtn"
                  disabled={editEmployeeMutation.isPending}
                >
                  {editEmployeeMutation.isPending
                    ? "Saving..."
                    : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================
          ACTIVATE / DEACTIVATE CONFIRM
      ===================================== */}

      {confirmEmployee && (
        <div className="employeeConfirmOverlay">
          <div className="employeeConfirmDialog">
            <div
              className={`confirmIcon ${
                getEmployeeStatus(confirmEmployee) === "ACTIVE"
                  ? "dangerConfirm"
                  : "successConfirm"
              }`}
            >
              {getEmployeeStatus(confirmEmployee) === "ACTIVE" ? (
                <Power size={22} />
              ) : (
                <CheckCircle2 size={22} />
              )}
            </div>

            <h3>
              {getEmployeeStatus(confirmEmployee) === "ACTIVE"
                ? "Deactivate Employee?"
                : "Activate Employee?"}
            </h3>

            <p>
              Are you sure you want to{" "}
              {getEmployeeStatus(confirmEmployee) === "ACTIVE"
                ? "deactivate"
                : "activate"}{" "}
              <strong>{confirmEmployee.fullName}</strong>?
            </p>

            {getEmployeeStatus(confirmEmployee) === "ACTIVE" ? (
              <div className="confirmHint">
                The employee will no longer be able to access their account, but
                their existing work history will remain preserved.
              </div>
            ) : (
              <div className="confirmHint">
                The employee will be able to access their account again after
                activation.
              </div>
            )}

            <div className="confirmActions">
              <button
                type="button"
                className="btn modalCancelBtn"
                onClick={() => setConfirmEmployee(null)}
                disabled={statusMutation.isPending}
              >
                Cancel
              </button>

              <button
                type="button"
                className={`btn ${
                  getEmployeeStatus(confirmEmployee) === "ACTIVE"
                    ? "dangerBtn"
                    : "successBtn"
                }`}
                onClick={confirmStatusChange}
                disabled={statusMutation.isPending}
              >
                {statusMutation.isPending
                  ? "Updating..."
                  : getEmployeeStatus(confirmEmployee) === "ACTIVE"
                    ? "Deactivate"
                    : "Activate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================
          TOP-RIGHT NOTIFICATION
      ===================================== */}

      {notification && (
        <div className={`employeeToast ${notification.type}`}>
          <div className="toastIcon">
            {notification.type === "success" ? (
              <CheckCircle2 size={19} />
            ) : (
              <AlertCircle size={19} />
            )}
          </div>

          <div className="toastContent">
            <strong>{notification.title}</strong>
            <span>{notification.message}</span>
          </div>

          <button
            type="button"
            onClick={() => setNotification(null)}
            aria-label="Close notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}

/* =========================================
   REUSABLE FORM
========================================= */

function EmployeeFormFields({
  form,
  departments,
  managers,
  onChange,
  isEdit = false,
  showPassword = false,
  onTogglePassword,
}: {
  form: EmployeeForm;
  departments: Department[];
  managers: Employee[];
  onChange: (field: keyof EmployeeForm, value: string) => void;
  isEdit?: boolean;
  showPassword?: boolean;
  onTogglePassword?: () => void;
}) {
  return (
    <>
      <div className="formSection">
        <div className="formSectionTitle">Basic Information</div>

        <div className="formGrid">
          <label className="modalField">
            <span>
              Employee ID <b>*</b>
            </span>

            <input
              value={form.employeeId}
              readOnly
              placeholder="Auto-generated"
              maxLength={20}
              autoComplete="off"
              aria-readonly="true"
              className="autoEmployeeIdInput"
            />
            <small>Employee ID is generated automatically.</small>
          </label>

          <label className="modalField">
            <span>
              Full Name <b>*</b>
            </span>

            <input
              value={form.fullName}
              onChange={(event) => onChange("fullName", event.target.value)}
              placeholder="Enter full name"
              maxLength={80}
              autoComplete="name"
            />
          </label>

          <label className="modalField">
            <span>
              Email Address <b>*</b>
            </span>

            <input
              type="email"
              value={form.email}
              onChange={(event) => onChange("email", event.target.value)}
              placeholder="employee@example.com"
              maxLength={254}
              autoComplete="email"
            />
          </label>

          <label className="modalField">
            <span>Phone</span>

            <input
              value={form.phone}
              onChange={(event) =>
                onChange(
                  "phone",
                  event.target.value.replace(/\D/g, "").slice(0, 10),
                )
              }
              placeholder="Enter 10-digit phone number"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={10}
              autoComplete="tel"
            />
          </label>
        </div>
      </div>

      <div className="formSection">
        <div className="formSectionTitle">Work Information</div>

        <div className="formGrid">
          <label className="modalField">
            <span>
              Designation <b>*</b>
            </span>

            <input
              value={form.designation}
              onChange={(event) => onChange("designation", event.target.value)}
              placeholder="Software Developer"
              maxLength={100}
            />
          </label>

          <label className="modalField">
            <span>
              Department <b>*</b>
            </span>

            <select
              value={form.departmentId}
              onChange={(event) => onChange("departmentId", event.target.value)}
            >
              <option value="">Select department</option>

              {departments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="modalField">
            <span>
              Date of Joining <b>*</b>
            </span>

            <input
              type="date"
              value={form.dateOfJoining}
              onChange={(event) =>
                onChange("dateOfJoining", event.target.value)
              }
            />
          </label>

          <label className="modalField">
            <span>Manager</span>

            <select
              value={form.managerId}
              onChange={(event) => onChange("managerId", event.target.value)}
            >
              <option value="">No manager</option>

              {managers.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.fullName} ({manager.employeeId})
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="formSection">
        <div className="formSectionTitle">Account Information</div>

        <div className="formGrid">
          <label className="modalField">
            <span>
              Role <b>*</b>
            </span>

            <select
              value={form.role}
              onChange={(event) => onChange("role", event.target.value)}
            >
              <option value="EMPLOYEE">Employee</option>
              <option value="MANAGER">Manager</option>
            </select>
          </label>

          {!isEdit && (
            <label className="modalField">
              <span>
                Initial Password <b>*</b>
              </span>

              <div className="passwordInputWrap">
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(event) => onChange("password", event.target.value)}
                  placeholder="Enter initial password"
                  maxLength={72}
                  autoComplete="new-password"
                />

                <button
                  type="button"
                  className="passwordToggle"
                  onClick={onTogglePassword}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <small>This password can be changed later by the employee.</small>
            </label>
          )}
        </div>
      </div>
    </>
  );
}
