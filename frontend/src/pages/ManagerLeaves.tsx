import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Filter,
  RefreshCw,
  Search,
  Send,
  UserRoundCheck,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { get, patch, post } from "../api/client";
import "./employee-leaves.css";
import "./manager-leaves.css";

type LeaveType = { id: string; name: string; description?: string | null };
type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
type Reviewer = {
  id?: string;
  email?: string;
  role?: string;
  employee?: { id?: string; employeeId?: string; fullName?: string } | null;
};
type LeaveRequest = {
  id: string;
  employee?: {
    id?: string;
    employeeId?: string;
    fullName?: string;
    designation?: string;
    department?: { name?: string } | null;
  } | null;
  leaveTypeId?: string;
  leaveType?: {
    id?: string;
    name?: string;
    description?: string | null;
  } | null;
  fromDate: string;
  toDate: string;
  reason: string;
  halfDay?: boolean;
  status: LeaveStatus | string;
  reviewComment?: string | null;
  reviewedAt?: string | null;
  createdAt?: string | null;
  reviewedById?: string | null;
  reviewedBy?: Reviewer | null;
};
type LeaveForm = {
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  reason: string;
  halfDay: boolean;
};

type ViewMode = "OWN" | "TEAM";

function todayInput() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function initialForm(): LeaveForm {
  return {
    leaveTypeId: "",
    fromDate: todayInput(),
    toDate: "",
    reason: "",
    halfDay: false,
  };
}
function normalize<T>(data: any): T[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.rows)) return data.rows;
  return [];
}
function dateKey(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function duration(leave: LeaveRequest) {
  if (leave.halfDay) return "Half Day";
  const from = new Date(`${dateKey(leave.fromDate)}T00:00:00`).getTime();
  const to = new Date(`${dateKey(leave.toDate)}T00:00:00`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from)
    return "Full Day";
  const days = Math.floor((to - from) / 86400000) + 1;
  return days === 1 ? "Full Day" : `${days} Days`;
}
function statusLabel(status?: string) {
  const s = String(status || "PENDING").toUpperCase();
  return s.charAt(0) + s.slice(1).toLowerCase();
}
function statusClass(status?: string) {
  return String(status || "PENDING").toLowerCase();
}
function reviewerName(leave: LeaveRequest) {
  if (!leave.reviewedBy)
    return leave.reviewedById ? "Reviewer unavailable" : "—";
  return (
    leave.reviewedBy.employee?.fullName || leave.reviewedBy.email || "Reviewer"
  );
}
function reviewerRole(leave: LeaveRequest) {
  return leave.reviewedBy?.role
    ? leave.reviewedBy.role.replaceAll("_", " ")
    : "—";
}
function leaveTypeName(leave: LeaveRequest, types: LeaveType[]) {
  return (
    leave.leaveType?.name ||
    types.find((x) => x.id === leave.leaveTypeId)?.name ||
    "Leave"
  );
}

export default function ManagerLeaves() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialView: ViewMode =
    searchParams.get("view")?.toLowerCase() === "team" ? "TEAM" : "OWN";

  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [form, setForm] = useState<LeaveForm>(initialForm);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewConfirm, setReviewConfirm] = useState<
    "approve" | "reject" | null
  >(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const ownQuery = useQuery<LeaveRequest[]>({
    queryKey: ["manager-own-leaves"],
    queryFn: async () =>
      normalize<LeaveRequest>(await get("/leaves?scope=OWN")),
    staleTime: 15000,
    refetchOnWindowFocus: true,
  });
  const teamQuery = useQuery<LeaveRequest[]>({
    queryKey: ["manager-team-leaves"],
    queryFn: async () =>
      normalize<LeaveRequest>(await get("/leaves?scope=TEAM")),
    staleTime: 15000,
    refetchOnWindowFocus: true,
  });
  const typesQuery = useQuery<LeaveType[]>({
    queryKey: ["manager-leave-types"],
    queryFn: async () => normalize<LeaveType>(await get("/leave-types")),
    staleTime: 300000,
  });

  const ownLeaves = ownQuery.data ?? [];
  const teamLeaves = teamQuery.data ?? [];
  const leaveTypes = typesQuery.data ?? [];
  const sourceRows = viewMode === "OWN" ? ownLeaves : teamLeaves;

  const summary = useMemo(
    () => ({
      total: sourceRows.length,
      pending: sourceRows.filter(
        (x) => String(x.status).toUpperCase() === "PENDING",
      ).length,
      approved: sourceRows.filter(
        (x) => String(x.status).toUpperCase() === "APPROVED",
      ).length,
      rejected: sourceRows.filter(
        (x) => String(x.status).toUpperCase() === "REJECTED",
      ).length,
    }),
    [sourceRows],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sourceRows.filter((leave) => {
      const text = [
        leave.employee?.fullName,
        leave.employee?.employeeId,
        leaveTypeName(leave, leaveTypes),
        leave.reason,
        reviewerName(leave),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (q && !text.includes(q)) return false;
      if (
        statusFilter !== "ALL" &&
        String(leave.status).toUpperCase() !== statusFilter
      )
        return false;
      const start = dateKey(leave.fromDate);
      const end = dateKey(leave.toDate);
      if (dateFrom && end < dateFrom) return false;
      if (dateTo && start > dateTo) return false;
      return true;
    });
  }, [sourceRows, search, statusFilter, dateFrom, dateTo, leaveTypes]);

  useEffect(() => {
    const v =
      searchParams.get("view")?.toLowerCase() === "team" ? "TEAM" : "OWN";
    setViewMode(v);
  }, [searchParams]);

  useEffect(() => {
    if (!message) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    const t = window.setTimeout(() => setMessage(null), 4500);
    return () => window.clearTimeout(t);
  }, [message]);

  useEffect(() => {
    if (!selectedLeave) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeModal();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedLeave]);

  function switchView(mode: ViewMode) {
    setViewMode(mode);
    setSearchParams(mode === "TEAM" ? { view: "team" } : { view: "own" }, {
      replace: true,
    });
    setSelectedLeave(null);
    setSearch("");
    setStatusFilter("ALL");
    setDateFrom("");
    setDateTo("");
  }

  function closeModal() {
    setSelectedLeave(null);
    setReviewComment("");
    setReviewConfirm(null);
  }

  function openDetails(leave: LeaveRequest) {
    setSelectedLeave(leave);
    setReviewComment(leave.reviewComment || "");
  }

  async function submitLeave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.leaveTypeId)
      return setMessage({ type: "error", text: "Please select a leave type." });
    if (!form.fromDate || !form.toDate)
      return setMessage({
        type: "error",
        text: "Please select both leave dates.",
      });
    if (form.toDate < form.fromDate)
      return setMessage({
        type: "error",
        text: "To date cannot be before From date.",
      });
    if (!form.reason.trim())
      return setMessage({
        type: "error",
        text: "Please enter a leave reason.",
      });

    try {
      setSubmitting(true);
      await post("/leaves", { ...form, reason: form.reason.trim() });
      setForm(initialForm());
      setMessage({
        type: "success",
        text: "Leave request submitted successfully.",
      });
      await qc.invalidateQueries({ queryKey: ["manager-own-leaves"] });
    } catch (err: any) {
      const m =
        err?.response?.data?.message ||
        err?.message ||
        "Unable to submit leave request.";
      setMessage({ type: "error", text: Array.isArray(m) ? m.join(", ") : m });
    } finally {
      setSubmitting(false);
    }
  }

  function openReviewConfirmation(action: "approve" | "reject") {
    if (!selectedLeave || actionLoading) return;
    setReviewComment("");
    setReviewConfirm(action);
  }

  async function review(action: "approve" | "reject") {
    if (!selectedLeave || actionLoading) return;
    const comment = reviewComment.trim();
    if (!comment) {
      setMessage({
        type: "error",
        text: "Please enter a reason/comment before approving or rejecting the leave request.",
      });
      return;
    }
    try {
      setActionLoading(action);
      await patch(`/leaves/${selectedLeave.id}/${action}`, {
        reviewComment: comment,
      });
      setReviewConfirm(null);
      setSelectedLeave(null);
      setReviewComment("");
      setMessage({
        type: "success",
        text:
          action === "approve"
            ? "Leave request approved successfully."
            : "Leave request rejected successfully.",
      });
      await qc.invalidateQueries({ queryKey: ["manager-team-leaves"] });
    } catch (err: any) {
      const m =
        err?.response?.data?.message ||
        err?.message ||
        `Unable to ${action} leave request.`;
      setMessage({ type: "error", text: Array.isArray(m) ? m.join(", ") : m });
    } finally {
      setActionLoading("");
    }
  }

  async function refreshAll() {
    if (refreshing) return;
    try {
      setRefreshing(true);
      await Promise.all([
        ownQuery.refetch(),
        teamQuery.refetch(),
        typesQuery.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  const isLoading =
    viewMode === "OWN" ? ownQuery.isLoading : teamQuery.isLoading;
  const isError = viewMode === "OWN" ? ownQuery.isError : teamQuery.isError;
  const isPendingTeamLeave =
    viewMode === "TEAM" &&
    String(selectedLeave?.status).toUpperCase() === "PENDING";

  return (
    <div className="managerLeavesPage">
      <div className="managerLeavesHeader">
        <div>
          <h1>Leave Management</h1>
          <p>Manage your own leave and review leave requests from your team.</p>
        </div>
        <div className="managerLeavesHeaderActions">
          <div className="managerLeavesViewSwitch">
            <button
              className={viewMode === "OWN" ? "active" : ""}
              onClick={() => switchView("OWN")}
              type="button"
            >
              My Leaves
            </button>
            <button
              className={viewMode === "TEAM" ? "active" : ""}
              onClick={() => switchView("TEAM")}
              type="button"
            >
              Team Leaves{" "}
              {teamLeaves.filter(
                (x) => String(x.status).toUpperCase() === "PENDING",
              ).length > 0 && (
                <span>
                  {
                    teamLeaves.filter(
                      (x) => String(x.status).toUpperCase() === "PENDING",
                    ).length
                  }
                </span>
              )}
            </button>
          </div>
          <button
            type="button"
            className="btn primaryBtn managerLeavesRefresh"
            onClick={refreshAll}
            disabled={refreshing}
          >
            <RefreshCw
              size={15}
              className={refreshing ? "managerLeavesSpin" : ""}
            />{" "}
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {message && (
        <div className={`managerLeavesMessage ${message.type}`}>
          {message.type === "success" ? (
            <CheckCircle2 size={17} />
          ) : (
            <XCircle size={17} />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <div className="managerLeavesSummary">
        <div className="managerLeaveStat total">
          <span>
            <FileText size={18} />
          </span>
          <div>
            <small>Total Requests</small>
            <strong>{summary.total}</strong>
          </div>
        </div>
        <div className="managerLeaveStat pending">
          <span>
            <Clock3 size={18} />
          </span>
          <div>
            <small>Pending</small>
            <strong>{summary.pending}</strong>
          </div>
        </div>
        <div className="managerLeaveStat approved">
          <span>
            <CheckCircle2 size={18} />
          </span>
          <div>
            <small>Approved</small>
            <strong>{summary.approved}</strong>
          </div>
        </div>
        <div className="managerLeaveStat rejected">
          <span>
            <XCircle size={18} />
          </span>
          <div>
            <small>Rejected</small>
            <strong>{summary.rejected}</strong>
          </div>
        </div>
      </div>

      {viewMode === "OWN" && (
        <section className="card managerLeaveApplyCard">
          <div className="managerLeaveSectionHead">
            <div>
              <h2>Apply Leave</h2>
              <p>Submit your leave request for approval.</p>
            </div>
            <CalendarDays size={20} />
          </div>
          <form onSubmit={submitLeave}>
            <div className="managerLeaveFormGrid">
              <label>
                <span>Leave Type *</span>
                <select
                  value={form.leaveTypeId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, leaveTypeId: e.target.value }))
                  }
                >
                  <option value="">Select leave type</option>
                  {leaveTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>From Date *</span>
                <input
                  type="date"
                  value={form.fromDate}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      fromDate: e.target.value,
                      toDate:
                        f.toDate && f.toDate < e.target.value
                          ? e.target.value
                          : f.toDate,
                    }))
                  }
                />
              </label>
              <label>
                <span>To Date *</span>
                <input
                  type="date"
                  min={form.fromDate}
                  value={form.toDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, toDate: e.target.value }))
                  }
                />
              </label>
              <label className="managerLeaveHalfDay">
                <span>Leave Duration</span>
                <button
                  type="button"
                  className={form.halfDay ? "selected" : ""}
                  onClick={() =>
                    setForm((f) => ({ ...f, halfDay: !f.halfDay }))
                  }
                >
                  {form.halfDay
                    ? "Half Day Selected"
                    : "Full Day / Multiple Days"}
                </button>
              </label>
              <label className="managerLeaveReasonField">
                <span>Reason *</span>
                <textarea
                  rows={3}
                  maxLength={500}
                  placeholder="Enter leave reason"
                  value={form.reason}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, reason: e.target.value }))
                  }
                />
                <small>{form.reason.length}/500</small>
              </label>
            </div>
            <div className="managerLeaveFormFooter">
              <button
                className="btn primaryBtn"
                type="submit"
                disabled={submitting}
              >
                <Send size={15} />
                {submitting ? "Submitting..." : "Apply Leave"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="card managerLeaveTableCard">
        <div className="managerLeaveTableTitle">
          <div>
            <h2>
              {viewMode === "OWN" ? "My Leave Requests" : "Team Leave Requests"}
            </h2>
            <p>
              {viewMode === "OWN"
                ? "Only your personal leave requests are shown here."
                : "Only leave requests from employees reporting to you are shown here."}
            </p>
          </div>
        </div>

        <div className="managerLeaveFilters">
          <div className="managerLeaveFilterLabel">
            <Filter size={16} />
            <strong>Request Filters</strong>
          </div>
          <div className="managerLeaveFilterGrid">
            <label className="managerLeaveSearch">
              <Search size={15} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  viewMode === "OWN"
                    ? "Search leave type, reason or reviewer..."
                    : "Search employee, leave type, reason or reviewer..."
                }
              />
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Status</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <label className="managerLeaveDateFilter">
              <span>From</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </label>
            <label className="managerLeaveDateFilter">
              <span>To</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn managerLeaveClear"
              disabled={
                !search && statusFilter === "ALL" && !dateFrom && !dateTo
              }
              onClick={() => {
                setSearch("");
                setStatusFilter("ALL");
                setDateFrom("");
                setDateTo("");
              }}
            >
              Clear Filters
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="managerLeaveState">
            <RefreshCw className="managerLeavesSpin" />
            Loading leave requests...
          </div>
        ) : isError ? (
          <div className="managerLeaveState error">
            <XCircle />
            Unable to load leave requests.
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="managerLeaveState">
            <FileText />
            <strong>No matching leave requests.</strong>
            <span>Change the filters or date range and try again.</span>
          </div>
        ) : (
          <div className="managerLeaveTableWrap">
            <table className="managerLeaveTable">
              <thead>
                <tr>
                  {viewMode === "TEAM" && <th>EMPLOYEE</th>}
                  <th>LEAVE TYPE</th>
                  <th>REQUEST</th>
                  <th>FROM</th>
                  <th>TO</th>
                  <th>STATUS</th>
                  <th>REVIEWED BY</th>
                  <th>REASON</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((leave) => (
                  <tr key={leave.id} onClick={() => openDetails(leave)}>
                    {viewMode === "TEAM" && (
                      <td>
                        <div className="managerLeaveEmployee">
                          <span className="managerLeaveEmployeeAvatar">
                            {(leave.employee?.fullName || "?")
                              .charAt(0)
                              .toUpperCase()}
                          </span>
                          <div>
                            <strong>{leave.employee?.fullName || "—"}</strong>
                            <small>{leave.employee?.employeeId || "—"}</small>
                          </div>
                        </div>
                      </td>
                    )}
                    <td>
                      <strong>{leaveTypeName(leave, leaveTypes)}</strong>
                    </td>
                    <td>
                      <span
                        className={`managerLeaveDayType ${leave.halfDay ? "half" : "full"}`}
                      >
                        {duration(leave)}
                      </span>
                    </td>
                    <td>{formatDate(leave.fromDate)}</td>
                    <td>{formatDate(leave.toDate)}</td>
                    <td>
                      <span
                        className={`employeeLeavesStatus ${statusClass(leave.status)}`}
                      >
                        {statusLabel(leave.status)}
                      </span>
                    </td>
                    <td>
                      <div className="managerLeaveReviewerCell">
                        <strong>{reviewerName(leave)}</strong>
                        {leave.reviewedBy && (
                          <small>{reviewerRole(leave)}</small>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="managerLeaveReason" title={leave.reason}>
                        {leave.reason || "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="managerLeaveTableFooter">
          Showing <strong>{filteredRows.length}</strong> of{" "}
          <strong>{sourceRows.length}</strong> requests
        </div>
      </section>

      {selectedLeave && (
        <div
          className="managerLeaveModalOverlay"
          onMouseDown={(e) => e.target === e.currentTarget && closeModal()}
        >
          <section
            className="managerLeaveModal"
            role="dialog"
            aria-modal="true"
          >
            <header className="managerLeaveModalHeader">
              <div className="managerLeaveModalTitleIcon">
                <CalendarDays size={21} />
              </div>
              <div className="managerLeaveModalHeading">
                <h2>
                  {viewMode === "TEAM"
                    ? "Leave Request Details"
                    : "My Leave Request"}
                </h2>
                <p>
                  {selectedLeave.employee?.employeeId || "Manager request"} ·{" "}
                  {leaveTypeName(selectedLeave, leaveTypes)}
                </p>
              </div>
              <button
                type="button"
                className="managerLeaveModalClose"
                onClick={closeModal}
              >
                <X size={20} />
              </button>
            </header>
            <div className="managerLeaveModalBody">
              {viewMode === "TEAM" && (
                <div className="managerLeavePersonCard">
                  <span className="managerLeavePersonAvatar">
                    {(selectedLeave.employee?.fullName || "?")
                      .charAt(0)
                      .toUpperCase()}
                  </span>
                  <div>
                    <strong>
                      {selectedLeave.employee?.fullName || "Employee"}
                    </strong>
                    <small>
                      {selectedLeave.employee?.designation ||
                        selectedLeave.employee?.department?.name ||
                        "Team member"}
                    </small>
                  </div>
                  <span
                    className={`employeeLeavesStatus ${statusClass(selectedLeave.status)}`}
                  >
                    {statusLabel(selectedLeave.status)}
                  </span>
                </div>
              )}

              <div className="managerLeaveModalSectionTitle">
                LEAVE INFORMATION
              </div>
              <div className="managerLeaveDetailGrid">
                <div>
                  <span>Leave Type</span>
                  <strong>{leaveTypeName(selectedLeave, leaveTypes)}</strong>
                </div>
                <div>
                  <span>Request Type</span>
                  <strong>
                    {selectedLeave.halfDay ? "Half Day" : "Full Day"}
                  </strong>
                </div>
                <div>
                  <span>From Date</span>
                  <strong>{formatDate(selectedLeave.fromDate)}</strong>
                </div>
                <div>
                  <span>To Date</span>
                  <strong>{formatDate(selectedLeave.toDate)}</strong>
                </div>
                <div>
                  <span>Duration</span>
                  <strong>{duration(selectedLeave)}</strong>
                </div>
                <div>
                  <span>Requested On</span>
                  <strong>{formatDate(selectedLeave.createdAt)}</strong>
                </div>
              </div>
              <div className="managerLeaveReasonBox">
                <span>REASON</span>
                <p>{selectedLeave.reason || "No reason provided."}</p>
              </div>

              <div className="managerLeaveModalSectionTitle">
                APPROVAL / REVIEW
              </div>
              {selectedLeave.reviewedBy ? (
                <div className="managerLeaveApprovalCard">
                  <div className="managerLeaveApprovalIcon">
                    <UserRoundCheck size={19} />
                  </div>
                  <div>
                    <span>
                      {String(selectedLeave.status).toUpperCase() === "APPROVED"
                        ? "Approved By"
                        : "Rejected By"}
                    </span>
                    <strong>{reviewerName(selectedLeave)}</strong>
                    <small>
                      {reviewerRole(selectedLeave)}
                      {selectedLeave.reviewedBy.email
                        ? ` · ${selectedLeave.reviewedBy.email}`
                        : ""}
                    </small>
                  </div>
                  <div className="managerLeaveReviewedDate">
                    <span>Reviewed</span>
                    <strong>{formatDate(selectedLeave.reviewedAt)}</strong>
                  </div>
                </div>
              ) : (
                <div className="managerLeavePendingReview">
                  <Clock3 size={17} />
                  <div>
                    <strong>Waiting for review</strong>
                    <span>
                      This request has not been approved or rejected yet.
                    </span>
                  </div>
                </div>
              )}
              {selectedLeave.reviewComment && (
                <div className="managerLeaveReviewComment">
                  <span>REVIEW COMMENT</span>
                  <p>{selectedLeave.reviewComment}</p>
                </div>
              )}
            </div>
            <footer className="managerLeaveModalFooter">
              <button type="button" className="btn" onClick={closeModal}>
                Close
              </button>
              {isPendingTeamLeave && (
                <>
                  <button
                    type="button"
                    className="btn managerLeaveReject"
                    onClick={() => openReviewConfirmation("reject")}
                    disabled={Boolean(actionLoading)}
                  >
                    <X size={15} />
                    Reject
                  </button>
                  <button
                    type="button"
                    className="btn primaryBtn"
                    onClick={() => openReviewConfirmation("approve")}
                    disabled={Boolean(actionLoading)}
                  >
                    <CheckCircle2 size={15} />
                    Approve
                  </button>
                </>
              )}
            </footer>
          </section>
        </div>
      )}

      {reviewConfirm && selectedLeave && (
        <div
          className="managerLeaveReviewConfirmOverlay"
          onMouseDown={(e) =>
            e.target === e.currentTarget && setReviewConfirm(null)
          }
        >
          <section
            className="managerLeaveReviewConfirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manager-leave-review-title"
          >
            <div className={`managerLeaveReviewConfirmIcon ${reviewConfirm}`}>
              <CheckCircle2 size={22} />
            </div>
            <h3 id="manager-leave-review-title">
              {reviewConfirm === "approve"
                ? "Approve Leave Request?"
                : "Reject Leave Request?"}
            </h3>
            <p>
              {reviewConfirm === "approve"
                ? "Please add the reason or comment for approving this request."
                : "Please add the reason or comment for rejecting this request."}
            </p>
            <label>
              <span>Reason / Comment *</span>
              <textarea
                autoFocus
                rows={4}
                maxLength={500}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Enter why you are approving or rejecting this request..."
              />
              <small>{reviewComment.length}/500</small>
            </label>
            <div className="managerLeaveReviewConfirmActions">
              <button
                type="button"
                className="btn"
                onClick={() => setReviewConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn ${reviewConfirm === "reject" ? "managerLeaveReject" : "primaryBtn"}`}
                onClick={() => review(reviewConfirm)}
                disabled={Boolean(actionLoading)}
              >
                {actionLoading
                  ? reviewConfirm === "approve"
                    ? "Approving..."
                    : "Rejecting..."
                  : reviewConfirm === "approve"
                    ? "Confirm Approve"
                    : "Confirm Reject"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
