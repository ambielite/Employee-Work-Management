import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Filter,
  RefreshCw,
  X,
  Users,
  UserCheck,
  UserX,
  Eye,
  Mail,
  Phone,
  CalendarDays,
  Building2,
  BriefcaseBusiness,
} from "lucide-react";

import { get } from "../api/client";

import "./admin-employees.css";
import "./manager-team.css";

/* =========================================================
   TYPES
========================================================= */

type AccountStatus = "ACTIVE" | "INACTIVE";

type Employee = {
  id: string;
  employeeId: string;
  fullName: string;

  phone?: string | null;

  dateOfJoining?: string | null;

  designation: string;

  employmentStatus?: string | null;

  accountStatus?: AccountStatus | null;

  department?: {
    id: string;
    name: string;
  } | null;

  manager?: {
    id?: string;
    fullName: string;
    employeeId?: string;
  } | null;

  user?: {
    id?: string;
    email?: string;
    role?: string;
    accountStatus?: AccountStatus | null;
  } | null;

  workModeEligibility?: string | null;

  standardWorkingMinutes?: number | null;

  shift?: string | null;

  officeLocation?: string | null;
};

/* =========================================================
   HELPERS
========================================================= */

function getEmployeeStatus(employee: Employee): AccountStatus {
  return employee.accountStatus || employee.user?.accountStatus || "ACTIVE";
}

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

function formatWorkingMinutes(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return "-";
  }

  const total = Number(value);

  const hours = Math.floor(total / 60);
  const minutes = total % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }

  if (minutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${minutes} min`;
}

/* =========================================================
   COMPONENT
========================================================= */

export default function ManagerTeam() {
  /* =======================================================
     FILTERS
  ======================================================== */

  const [search, setSearch] = useState("");

  const [department, setDepartment] = useState("ALL");

  const [statusFilter, setStatusFilter] = useState("ALL");

  /* =======================================================
     DETAILS MODAL
  ======================================================== */

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    null,
  );

  /* =======================================================
     PAGINATION
  ======================================================== */

  const [currentPage, setCurrentPage] = useState(1);

  const pageSize = 10;

  /* =======================================================
     EMPLOYEES
  ======================================================== */

  const {
    data: employees = [],
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery<Employee[]>({
    queryKey: ["manager-team"],
    queryFn: () => get<Employee[]>("/employees"),
  });

  /* =======================================================
     DEPARTMENTS
  ======================================================== */

  const departments = useMemo(() => {
    const departmentMap = new Map<string, string>();

    employees.forEach((employee) => {
      if (employee.department?.id && employee.department?.name) {
        departmentMap.set(employee.department.id, employee.department.name);
      }
    });

    return Array.from(departmentMap.entries())
      .map(([id, name]) => ({
        id,
        name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees]);

  /* =======================================================
     FILTERED EMPLOYEES
  ======================================================== */

  const filteredEmployees = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return employees.filter((employee) => {
      const matchesSearch =
        !searchText ||
        employee.employeeId.toLowerCase().includes(searchText) ||
        employee.fullName.toLowerCase().includes(searchText) ||
        (employee.user?.email || "").toLowerCase().includes(searchText) ||
        (employee.phone || "").toLowerCase().includes(searchText) ||
        employee.designation.toLowerCase().includes(searchText) ||
        (employee.department?.name || "").toLowerCase().includes(searchText);

      const matchesDepartment =
        department === "ALL" || employee.department?.id === department;

      const matchesStatus =
        statusFilter === "ALL" || getEmployeeStatus(employee) === statusFilter;

      return matchesSearch && matchesDepartment && matchesStatus;
    });
  }, [employees, search, department, statusFilter]);

  /* =======================================================
     PAGINATION
  ======================================================== */

  const totalPages = Math.max(
    1,
    Math.ceil(filteredEmployees.length / pageSize),
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * pageSize;

    return filteredEmployees.slice(start, start + pageSize);
  }, [filteredEmployees, currentPage]);

  /* =======================================================
     COUNTS
  ======================================================== */

  const activeCount = employees.filter(
    (employee) => getEmployeeStatus(employee) === "ACTIVE",
  ).length;

  const inactiveCount = employees.filter(
    (employee) => getEmployeeStatus(employee) === "INACTIVE",
  ).length;

  /* =======================================================
     PAGINATION DISPLAY
  ======================================================== */

  const startEntry =
    filteredEmployees.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;

  const endEntry = Math.min(currentPage * pageSize, filteredEmployees.length);

  /* =======================================================
     CLEAR FILTERS
  ======================================================== */

  function clearFilters() {
    setSearch("");
    setDepartment("ALL");
    setStatusFilter("ALL");
    setCurrentPage(1);
  }

  /* =======================================================
     CLOSE MODAL
  ======================================================== */

  function closeEmployeeDetails() {
    setSelectedEmployee(null);
  }

  /* =======================================================
     JSX
  ======================================================== */

  return (
    <>
      {/* =====================================================
          PAGE HEADER
      ====================================================== */}

      <div className="title adminEmployeesHeader">
        <div>
          <h1>My Team</h1>

          <p className="pageSubtitle">
            View and monitor employees assigned to your team.
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

            {isFetching ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* =====================================================
          SUMMARY CARDS
      ====================================================== */}

      <div className="employeeSummaryGrid">
        <div className="employeeSummaryCard totalCard">
          <div className="summaryIcon total">
            <Users size={19} />
          </div>

          <div>
            <span>Team Members</span>

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

      {/* =====================================================
          TEAM FILTERS
      ====================================================== */}

      <div className="card employeeFilterCard managerTeamFilterCard">
        <div className="employeeFilterHeader">
          <span className="adminTasksFilterTitle">
            <Filter size={15} />
            Team Filters
          </span>

          <button
            type="button"
            className="btn primaryBtn employeeClearBtn"
            onClick={clearFilters}
            disabled={!search && department === "ALL" && statusFilter === "ALL"}
          >
            Clear Filters
          </button>
        </div>

        <div className="employeeFilter">
          {/* SEARCH */}

          <div className="employeeSearch">
            <Search size={17} />

            <input
              type="text"
              placeholder="Search employee, ID, email or designation..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);

                setCurrentPage(1);
              }}
            />
          </div>

          {/* DEPARTMENT */}

          <select
            value={department}
            onChange={(event) => {
              setDepartment(event.target.value);

              setCurrentPage(1);
            }}
          >
            <option value="ALL">All Departments</option>

            {departments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>

          {/* STATUS */}

          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);

              setCurrentPage(1);
            }}
          >
            <option value="ALL">All Status</option>

            <option value="ACTIVE">Active</option>

            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>

      {/* =====================================================
          TEAM TABLE
      ====================================================== */}

      <div className="card employeeTableCard managerTeamTableCard">
        {isLoading ? (
          <div className="employeeState">Loading team members...</div>
        ) : isError ? (
          <div className="employeeState errorState">
            Unable to load team members.
          </div>
        ) : (
          <>
            <div className="tableWrap managerTeamTableWrap">
              <table className="table employeeTable managerTeamTable">
                <thead>
                  <tr>
                    <th className="managerTeamEmployeeColumn">Employee</th>

                    <th>Employee ID</th>

                    <th>Email</th>

                    <th>Department</th>

                    <th>Designation</th>

                    <th>Joining Date</th>

                    <th>Status</th>

                    <th className="managerTeamActionColumn">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <div className="employeeState">
                          No team members found.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedEmployees.map((employee) => {
                      const status = getEmployeeStatus(employee);

                      const isActive = status === "ACTIVE";

                      return (
                        <tr
                          key={employee.id}
                          className="employeeClickableRow managerTeamRow"
                          onClick={() => setSelectedEmployee(employee)}
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();

                              setSelectedEmployee(employee);
                            }
                          }}
                        >
                          {/* EMPLOYEE */}

                          <td>
                            <div className="employeeNameCell managerTeamEmployeeCell">
                              <div className="employeeAvatar">
                                {employee.fullName.charAt(0).toUpperCase()}
                              </div>

                              <div className="managerTeamEmployeeText">
                                <strong>{employee.fullName}</strong>

                                <span>{employee.designation}</span>
                              </div>
                            </div>
                          </td>

                          {/* EMPLOYEE ID */}

                          <td className="nowrapCell">{employee.employeeId}</td>

                          {/* EMAIL */}

                          <td className="managerTeamEmailCell">
                            {employee.user?.email || "-"}
                          </td>

                          {/* DEPARTMENT */}

                          <td className="nowrapCell">
                            {employee.department?.name || "-"}
                          </td>

                          {/* DESIGNATION */}

                          <td className="managerTeamDesignationCell">
                            {employee.designation}
                          </td>

                          {/* JOINING DATE */}

                          <td className="nowrapCell">
                            {formatDate(employee.dateOfJoining)}
                          </td>

                          {/* STATUS */}

                          <td>
                            <span
                              className={`employeeStatus ${
                                isActive ? "active" : "inactive"
                              }`}
                            >
                              {status}
                            </span>
                          </td>

                          {/* ACTION */}

                          <td>
                            <div className="employeeActions managerTeamActions">
                              <button
                                type="button"
                                className="iconActionBtn"
                                title="View employee details"
                                aria-label="View employee details"
                                onClick={(event) => {
                                  event.stopPropagation();

                                  setSelectedEmployee(employee);
                                }}
                              >
                                <Eye size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* =================================================
                PAGINATION
            ================================================== */}

            <div className="employeePagination managerTeamPagination">
              <div className="employeePaginationInfo">
                Showing <strong>{startEntry}</strong> to{" "}
                <strong>{endEntry}</strong> of{" "}
                <strong>{filteredEmployees.length}</strong> team members
              </div>

              <div className="employeePaginationControls">
                <button
                  type="button"
                  className="paginationBtn"
                  disabled={currentPage === 1}
                  onClick={() =>
                    setCurrentPage((page) => Math.max(1, page - 1))
                  }
                >
                  Previous
                </button>

                <span className="paginationCurrent">
                  Page {currentPage} of {totalPages}
                </span>

                <button
                  type="button"
                  className="paginationBtn"
                  disabled={currentPage >= totalPages}
                  onClick={() =>
                    setCurrentPage((page) => Math.min(totalPages, page + 1))
                  }
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* =====================================================
          EMPLOYEE DETAILS MODAL
      ====================================================== */}

      {selectedEmployee && (
        <div
          className="employeeDetailsOverlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeEmployeeDetails();
            }
          }}
        >
          <div
            className="employeeDetailsModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manager-team-details-title"
          >
            {/* HEADER */}

            <div className="employeeDetailsHeader">
              <div className="employeeDetailsIdentity">
                <div className="employeeDetailsAvatar">
                  {selectedEmployee.fullName.charAt(0).toUpperCase()}
                </div>

                <div>
                  <h2 id="manager-team-details-title">
                    {selectedEmployee.fullName}
                  </h2>

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

            {/* BODY */}

            <div className="employeeDetailsBody">
              {/* STATUS */}

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

              {/* EMPLOYEE INFORMATION */}

              <div className="employeeDetailsSectionTitle">
                Employee Information
              </div>

              <div className="employeeDetailsGrid">
                <div className="employeeDetailsItem">
                  <span>Employee ID</span>

                  <strong>{selectedEmployee.employeeId}</strong>
                </div>

                <div className="employeeDetailsItem">
                  <span>Full Name</span>

                  <strong>{selectedEmployee.fullName}</strong>
                </div>

                <div className="employeeDetailsItem">
                  <span>Designation</span>

                  <strong>{selectedEmployee.designation || "-"}</strong>
                </div>

                <div className="employeeDetailsItem">
                  <span>Department</span>

                  <strong>{selectedEmployee.department?.name || "-"}</strong>
                </div>

                <div className="employeeDetailsItem">
                  <span>Email</span>

                  <strong>{selectedEmployee.user?.email || "-"}</strong>
                </div>

                <div className="employeeDetailsItem">
                  <span>Phone</span>

                  <strong>{selectedEmployee.phone || "-"}</strong>
                </div>

                <div className="employeeDetailsItem">
                  <span>Manager</span>

                  <strong>{selectedEmployee.manager?.fullName || "-"}</strong>
                </div>

                <div className="employeeDetailsItem">
                  <span>Date of Joining</span>

                  <strong>{formatDate(selectedEmployee.dateOfJoining)}</strong>
                </div>

                <div className="employeeDetailsItem">
                  <span>Employment Status</span>

                  <strong>
                    {selectedEmployee.employmentStatus || "ACTIVE"}
                  </strong>
                </div>

                <div className="employeeDetailsItem">
                  <span>Work Mode</span>

                  <strong>{selectedEmployee.workModeEligibility || "-"}</strong>
                </div>

                <div className="employeeDetailsItem">
                  <span>Shift</span>

                  <strong>{selectedEmployee.shift || "-"}</strong>
                </div>

                <div className="employeeDetailsItem">
                  <span>Working Hours</span>

                  <strong>
                    {formatWorkingMinutes(
                      selectedEmployee.standardWorkingMinutes,
                    )}
                  </strong>
                </div>

                <div className="employeeDetailsItem">
                  <span>Office Location</span>

                  <strong>{selectedEmployee.officeLocation || "-"}</strong>
                </div>
              </div>

              {/* QUICK INFORMATION */}

              <div className="employeeDetailsSectionTitle">
                Quick Information
              </div>

              <div className="employeeDetailsGrid">
                <div className="employeeDetailsItem">
                  <span>
                    <Mail size={12} />
                    Email
                  </span>

                  <strong>{selectedEmployee.user?.email || "-"}</strong>
                </div>

                <div className="employeeDetailsItem">
                  <span>
                    <Phone size={12} />
                    Phone
                  </span>

                  <strong>{selectedEmployee.phone || "-"}</strong>
                </div>

                <div className="employeeDetailsItem">
                  <span>
                    <Building2 size={12} />
                    Department
                  </span>

                  <strong>{selectedEmployee.department?.name || "-"}</strong>
                </div>

                <div className="employeeDetailsItem">
                  <span>
                    <CalendarDays size={12} />
                    Joined
                  </span>

                  <strong>{formatDate(selectedEmployee.dateOfJoining)}</strong>
                </div>

                <div className="employeeDetailsItem">
                  <span>
                    <BriefcaseBusiness size={12} />
                    Designation
                  </span>

                  <strong>{selectedEmployee.designation || "-"}</strong>
                </div>

                <div className="employeeDetailsItem">
                  <span>
                    <Users size={12} />
                    Manager
                  </span>

                  <strong>{selectedEmployee.manager?.fullName || "-"}</strong>
                </div>
              </div>
            </div>

            {/* FOOTER */}

            <div className="employeeDetailsFooter">
              <button
                type="button"
                className="btn employeeDetailsEditBtn"
                onClick={closeEmployeeDetails}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
