import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  RefreshCw,
  Send,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get, post } from "../api/client";
import "./employee-leaves.css";

type LeaveType = {
  id: string;
  name: string;
  description?: string | null;
};

type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

type LeaveRequest = {
  id: string;
  leaveTypeId?: string;
  fromDate: string;
  toDate: string;
  reason: string;
  halfDay?: boolean;
  status: LeaveStatus | string;
  reviewComment?: string | null;
  reviewedAt?: string | null;
  createdAt?: string | null;
  reviewedById?: string | null;
  reviewedBy?: {
    id?: string;
    email?: string;
    role?: string;
    employee?: {
      id?: string;
      employeeId?: string;
      fullName?: string;
    } | null;
  } | null;
  leaveType?: {
    id?: string;
    name?: string;
    description?: string | null;
  } | null;
};

type LeaveForm = {
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  reason: string;
  halfDay: boolean;
};

function getTodayInputDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createInitialForm(): LeaveForm {
  const today = getTodayInputDate();

  return {
    leaveTypeId: "",
    fromDate: today,
    toDate: "",
    reason: "",
    halfDay: false,
  };
}

function normalizeArray<T>(response: any): T[] {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.rows)) return response.rows;
  return [];
}

function formatDate(value?: string) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function dateOnly(value?: string) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDuration(fromDate?: string, toDate?: string, halfDay = false) {
  if (!fromDate || !toDate) return "—";
  if (halfDay) return "0.5 day";

  const from = new Date(`${dateOnly(fromDate)}T00:00:00`).getTime();
  const to = new Date(`${dateOnly(toDate)}T00:00:00`).getTime();

  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
    return "—";
  }

  const days = Math.floor((to - from) / 86400000) + 1;
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function statusLabel(status?: string) {
  switch (status) {
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "Pending";
  }
}

function statusClass(status?: string) {
  switch (status) {
    case "APPROVED":
      return "approved";
    case "REJECTED":
      return "rejected";
    case "CANCELLED":
      return "cancelled";
    default:
      return "pending";
  }
}

function labelRole(role?: string) {
  if (!role) return "—";
  return role.replaceAll("_", " ");
}

export default function Leaves() {
  const queryClient = useQueryClient();

  const [form, setForm] = useState<LeaveForm>(createInitialForm);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!success && !error) return;

    const timer = window.setTimeout(() => {
      setSuccess("");
      setError("");
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [success, error]);

  const leavesQuery = useQuery<LeaveRequest[]>({
    queryKey: ["leaves"],
    queryFn: async () => normalizeArray<LeaveRequest>(await get("/leaves")),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  const leaveTypesQuery = useQuery<LeaveType[]>({
    queryKey: ["leaveTypes"],
    queryFn: async () => normalizeArray<LeaveType>(await get("/leave-types")),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const leaves = leavesQuery.data ?? [];
  const leaveTypes = leaveTypesQuery.data ?? [];

  const summary = useMemo(
    () => ({
      total: leaves.length,
      pending: leaves.filter((leave) => leave.status === "PENDING").length,
      approved: leaves.filter((leave) => leave.status === "APPROVED").length,
      rejected: leaves.filter((leave) => leave.status === "REJECTED").length,
    }),
    [leaves],
  );

  function updateForm<K extends keyof LeaveForm>(key: K, value: LeaveForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
    setSuccess("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!form.leaveTypeId) {
      setError("Please select a leave type.");
      return;
    }

    if (!form.fromDate) {
      setError("Please select the start date.");
      return;
    }

    if (!form.toDate) {
      setError("Please select the end date.");
      return;
    }

    if (form.toDate < form.fromDate) {
      setError("The end date cannot be before the start date.");
      return;
    }

    if (!form.reason.trim()) {
      setError("Please enter a reason for the leave.");
      return;
    }

    try {
      setSubmitting(true);

      await post("/leaves", {
        leaveTypeId: form.leaveTypeId,
        fromDate: form.fromDate,
        toDate: form.toDate,
        reason: form.reason.trim(),
        halfDay: form.halfDay,
      });

      setForm(createInitialForm());
      setSuccess("Leave request submitted successfully.");

      await queryClient.invalidateQueries({
        queryKey: ["leaves"],
        refetchType: "active",
      });
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Unable to submit the leave request.";

      setError(Array.isArray(message) ? message.join(", ") : message);
    } finally {
      setSubmitting(false);
    }
  }

  async function refreshAll() {
    if (refreshing) return;

    try {
      setRefreshing(true);

      await Promise.all([leavesQuery.refetch(), leaveTypesQuery.refetch()]);

      setError("");
    } catch {
      setError("Unable to refresh the leave data. Please try again.");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!selectedLeave) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedLeave(null);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedLeave]);

  function openLeaveDetails(leave: LeaveRequest) {
    const matchedType = leaveTypes.find(
      (type) => type.id === leave.leaveTypeId,
    );
    const resolvedName =
      leave.leaveType?.name || matchedType?.name || "Leave Request";
    const resolvedDescription =
      leave.leaveType?.description || matchedType?.description || null;

    setSelectedLeave({
      ...leave,
      leaveType: {
        ...(leave.leaveType || {}),
        name: resolvedName,
        description: resolvedDescription,
      },
    });
  }

  return (
    <div className="employeeLeavesPage">
      <div className="employeeLeavesHeader">
        <div>
          <h1>Leave Management</h1>
          <p>Apply for leave and track the status of your requests.</p>
        </div>

        <button
          type="button"
          className="btn employeeLeavesRefreshBtn"
          onClick={refreshAll}
          disabled={
            refreshing || leavesQuery.isFetching || leaveTypesQuery.isFetching
          }
        >
          <RefreshCw
            size={16}
            className={refreshing ? "employeeLeavesSpin" : ""}
          />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="employeeLeavesSummary">
        <div className="employeeLeavesSummaryCard total">
          <div className="employeeLeavesSummaryIcon">
            <CalendarDays size={19} />
          </div>
          <div>
            <span>Total Requests</span>
            <strong>{summary.total}</strong>
          </div>
        </div>

        <div className="employeeLeavesSummaryCard pending">
          <div className="employeeLeavesSummaryIcon">
            <Clock3 size={19} />
          </div>
          <div>
            <span>Pending</span>
            <strong>{summary.pending}</strong>
          </div>
        </div>

        <div className="employeeLeavesSummaryCard approved">
          <div className="employeeLeavesSummaryIcon">
            <CheckCircle2 size={19} />
          </div>
          <div>
            <span>Approved</span>
            <strong>{summary.approved}</strong>
          </div>
        </div>

        <div className="employeeLeavesSummaryCard rejected">
          <div className="employeeLeavesSummaryIcon">
            <XCircle size={19} />
          </div>
          <div>
            <span>Rejected</span>
            <strong>{summary.rejected}</strong>
          </div>
        </div>
      </div>

      <div className="employeeLeavesMainGrid">
        <form className="card employeeLeavesFormCard" onSubmit={submit}>
          <div className="employeeLeavesCardHeader">
            <div>
              <h2>Apply Leave</h2>
              <p>Submit a new leave request for approval.</p>
            </div>
            <div className="employeeLeavesCardIcon">
              <CalendarDays size={18} />
            </div>
          </div>

          {(error || success) && (
            <div
              className={`employeeLeavesAlert ${error ? "error" : "success"}`}
              role={error ? "alert" : "status"}
            >
              {error ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
              <span>{error || success}</span>
            </div>
          )}

          <div className="employeeLeavesFormBody">
            <label className="employeeLeavesField">
              <span>
                Leave Type <b>*</b>
              </span>
              <select
                value={form.leaveTypeId}
                onChange={(event) =>
                  updateForm("leaveTypeId", event.target.value)
                }
                disabled={submitting || leaveTypesQuery.isLoading}
              >
                <option value="">
                  {leaveTypesQuery.isLoading
                    ? "Loading leave types..."
                    : leaveTypes.length
                      ? "Select leave type"
                      : "No leave types configured"}
                </option>

                {leaveTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>

            {leaveTypesQuery.isError && (
              <div className="employeeLeavesInlineError">
                Unable to load leave types. Please refresh and try again.
              </div>
            )}

            <div className="employeeLeavesDateGrid">
              <label className="employeeLeavesField">
                <span>
                  From <b>*</b>
                </span>
                <div className="employeeLeavesDateInput">
                  <input
                    type="date"
                    value={form.fromDate}
                    onChange={(event) =>
                      updateForm("fromDate", event.target.value)
                    }
                    disabled={submitting}
                  />
                </div>
              </label>

              <label className="employeeLeavesField">
                <span>
                  To <b>*</b>
                </span>
                <div className="employeeLeavesDateInput">
                  <input
                    type="date"
                    value={form.toDate}
                    min={form.fromDate || undefined}
                    onChange={(event) =>
                      updateForm("toDate", event.target.value)
                    }
                    disabled={submitting}
                  />
                </div>
              </label>
            </div>

            <label className="employeeLeavesField">
              <span>
                Reason <b>*</b>
              </span>
              <textarea
                value={form.reason}
                onChange={(event) => updateForm("reason", event.target.value)}
                placeholder="Briefly explain the reason for your leave"
                rows={5}
                maxLength={500}
                disabled={submitting}
              />
              <small>{form.reason.length}/500 characters</small>
            </label>

            <label className="employeeLeavesHalfDay">
              <input
                type="checkbox"
                checked={form.halfDay}
                onChange={(event) =>
                  updateForm("halfDay", event.target.checked)
                }
                disabled={submitting}
              />
              <span>
                <strong>Half-day leave</strong>
                <small>Submit this request as a half-day.</small>
              </span>
            </label>
          </div>

          <div className="employeeLeavesFormFooter">
            <span>
              <b>*</b> Required fields
            </span>

            <button
              type="submit"
              className="btn employeeLeavesSubmitBtn"
              disabled={
                submitting ||
                leaveTypesQuery.isLoading ||
                leaveTypes.length === 0
              }
            >
              <Send size={15} />
              {submitting ? "Submitting..." : "Apply Leave"}
            </button>
          </div>
        </form>

        <section className="card employeeLeavesRequestsCard">
          <div className="employeeLeavesTableHeader">
            <div>
              <h2>My Leave Requests</h2>
              <span>
                Showing {leaves.length}{" "}
                {leaves.length === 1 ? "request" : "requests"}
              </span>
            </div>
          </div>

          {leavesQuery.isLoading ? (
            <div className="employeeLeavesState">
              <RefreshCw size={20} className="employeeLeavesSpin" />
              <strong>Loading leave requests...</strong>
            </div>
          ) : leavesQuery.isError ? (
            <div className="employeeLeavesState error">
              <XCircle size={21} />
              <strong>Unable to load leave requests.</strong>
              <button
                type="button"
                className="btn"
                onClick={() => leavesQuery.refetch()}
              >
                Try Again
              </button>
            </div>
          ) : leaves.length === 0 ? (
            <div className="employeeLeavesState">
              <FileText size={23} />
              <strong>No leave requests found.</strong>
              <span>
                Your submitted requests will appear here after you apply.
              </span>
            </div>
          ) : (
            <div className="employeeLeavesTableWrap">
              <table className="employeeLeavesTable">
                <thead>
                  <tr>
                    <th>LEAVE TYPE</th>
                    <th>FROM DATE</th>
                    <th>TO DATE</th>
                    <th>DURATION</th>
                    <th>STATUS</th>
                    <th>REASON</th>
                  </tr>
                </thead>

                <tbody>
                  {leaves.map((leave) => {
                    const leaveTypeName =
                      leave.leaveType?.name ||
                      leaveTypes.find((type) => type.id === leave.leaveTypeId)
                        ?.name ||
                      "-";

                    return (
                      <tr
                        key={leave.id}
                        className="employeeLeavesRequestRow"
                        onClick={() => openLeaveDetails(leave)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openLeaveDetails(leave);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        title="View leave request details"
                      >
                        <td>
                          <span className="employeeLeavesType">
                            <CalendarDays size={14} />
                            {leaveTypeName}
                          </span>
                        </td>

                        <td>{formatDate(leave.fromDate)}</td>

                        <td>{formatDate(leave.toDate)}</td>

                        <td>
                          <span className="employeeLeavesDuration">
                            {getDuration(
                              leave.fromDate,
                              leave.toDate,
                              leave.halfDay,
                            )}
                          </span>
                        </td>

                        <td>
                          <span
                            className={`employeeLeavesStatus ${statusClass(
                              leave.status,
                            )}`}
                          >
                            {statusLabel(leave.status)}
                          </span>
                        </td>

                        <td>
                          <span
                            className="employeeLeavesReason"
                            title={leave.reason}
                          >
                            {leave.reason || "-"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {selectedLeave && (
        <div
          className="employeeLeavesModalOverlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedLeave(null);
            }
          }}
          role="presentation"
        >
          <section
            className="employeeLeavesDetailsModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-leave-details-title"
          >
            <div className="employeeLeavesDetailsHeader">
              <div>
                <span className="employeeLeavesDetailsEyebrow">
                  Leave Request Details
                </span>
                <h2 id="employee-leave-details-title">
                  {selectedLeave.leaveType?.name || "Leave Request"}
                </h2>
                <p>
                  Request ID: <strong>{selectedLeave.id}</strong>
                </p>
              </div>

              <button
                type="button"
                className="employeeLeavesDetailsClose"
                onClick={() => setSelectedLeave(null)}
                aria-label="Close leave request details"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="employeeLeavesDetailsBody">
              <div className="employeeLeavesDetailsStatusBar">
                <div>
                  <span>Status</span>
                  <strong
                    className={`employeeLeavesStatus ${statusClass(
                      selectedLeave.status,
                    )}`}
                  >
                    {statusLabel(selectedLeave.status)}
                  </strong>
                </div>

                <div>
                  <span>Duration</span>
                  <strong>
                    {getDuration(
                      selectedLeave.fromDate,
                      selectedLeave.toDate,
                      selectedLeave.halfDay,
                    )}
                  </strong>
                </div>
              </div>

              <div className="employeeLeavesDetailsGrid">
                <div className="employeeLeavesDetailsItem">
                  <span>Leave Type</span>
                  <strong>{selectedLeave.leaveType?.name || "—"}</strong>
                </div>

                <div className="employeeLeavesDetailsItem">
                  <span>Half Day</span>
                  <strong>{selectedLeave.halfDay ? "Yes" : "No"}</strong>
                </div>

                <div className="employeeLeavesDetailsItem">
                  <span>From Date</span>
                  <strong>{formatDate(selectedLeave.fromDate)}</strong>
                </div>

                <div className="employeeLeavesDetailsItem">
                  <span>To Date</span>
                  <strong>{formatDate(selectedLeave.toDate)}</strong>
                </div>

                <div className="employeeLeavesDetailsItem full">
                  <span>Leave Type Description</span>
                  <div className="employeeLeavesDetailsText">
                    {selectedLeave.leaveType?.description ||
                      "No description available."}
                  </div>
                </div>

                <div className="employeeLeavesDetailsItem full">
                  <span>Reason</span>
                  <div className="employeeLeavesDetailsText">
                    {selectedLeave.reason || "No reason provided."}
                  </div>
                </div>

                <div className="employeeLeavesDetailsItem">
                  <span>Requested On</span>
                  <strong>
                    {formatDate(selectedLeave.createdAt || undefined)}
                  </strong>
                </div>

                <div className="employeeLeavesDetailsItem">
                  <span>Reviewed On</span>
                  <strong>
                    {formatDate(selectedLeave.reviewedAt || undefined)}
                  </strong>
                </div>
              </div>

              <div className="employeeLeavesDetailsReview">
                <div className="employeeLeavesDetailsSectionTitle">
                  <CheckCircle2 size={16} />
                  <span>Approval / Review</span>
                </div>

                {selectedLeave.reviewedBy ? (
                  <div className="employeeLeavesReviewerCard">
                    <div>
                      <span>
                        {selectedLeave.status === "APPROVED"
                          ? "Approved By"
                          : selectedLeave.status === "REJECTED"
                            ? "Rejected By"
                            : "Reviewed By"}
                      </span>
                      <strong>
                        {selectedLeave.reviewedBy.employee?.fullName ||
                          selectedLeave.reviewedBy.email ||
                          "Reviewer"}
                      </strong>
                    </div>

                    <div>
                      <span>Role</span>
                      <strong>
                        {labelRole(selectedLeave.reviewedBy.role)}
                      </strong>
                    </div>

                    <div>
                      <span>Email</span>
                      <strong>{selectedLeave.reviewedBy.email || "—"}</strong>
                    </div>

                    <div>
                      <span>Employee ID</span>
                      <strong>
                        {selectedLeave.reviewedBy.employee?.employeeId || "—"}
                      </strong>
                    </div>
                  </div>
                ) : selectedLeave.reviewedById ? (
                  <div className="employeeLeavesReviewerPending">
                    <Clock3 size={15} />
                    <span>Reviewer details are unavailable.</span>
                  </div>
                ) : (
                  <div className="employeeLeavesReviewerPending">
                    <Clock3 size={15} />
                    <span>This request has not been reviewed yet.</span>
                  </div>
                )}

                {selectedLeave.reviewComment && (
                  <div className="employeeLeavesReviewComment">
                    <span>Review Comment</span>
                    <p>{selectedLeave.reviewComment}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="employeeLeavesDetailsFooter">
              <button
                type="button"
                className="btn employeeLeavesDetailsCloseBtn"
                onClick={() => setSelectedLeave(null)}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
