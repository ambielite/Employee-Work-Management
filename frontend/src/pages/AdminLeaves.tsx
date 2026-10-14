import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import "./admin-leaves.css";
import {
  Search,
  RefreshCw,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Filter,
  Check,
  X,
  CalendarDays,
  Clock3,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { get, patch } from "../api/client";

type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

interface LeaveRequest {
  id: string;
  employeeId?: string;
  leaveTypeId?: string;
  fromDate: string;
  toDate: string;
  reason: string;
  halfDay?: boolean;
  status: LeaveStatus;
  reviewedAt?: string | null;
  reviewComment?: string | null;
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
  employee?: {
    id?: string;
    employeeId?: string;
    fullName?: string;
    department?: {
      name?: string;
    };
  };
  leaveType?: {
    id?: string;
    name?: string;
  };
}

const PAGE_SIZE = 10;

export default function AdminLeaves() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | LeaveStatus>("ALL");
  const [page, setPage] = useState(1);

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState("");

  const [confirmAction, setConfirmAction] = useState<{
    id: string;
    action: "APPROVE" | "REJECT";
    employeeName: string;
  } | null>(null);

  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);

  const {
    data: leavesData,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["admin-leaves"],
    queryFn: async () => {
      const response = await get("/leaves");

      if (Array.isArray(response)) {
        return response as LeaveRequest[];
      }

      if (Array.isArray(response?.data)) {
        return response.data as LeaveRequest[];
      }

      return [];
    },
  });

  const leaves = leavesData ?? [];

  /* -----------------------------------------
     SUMMARY
  ----------------------------------------- */

  const summary = useMemo(() => {
    return {
      total: leaves.length,
      pending: leaves.filter((x) => x.status === "PENDING").length,
      approved: leaves.filter((x) => x.status === "APPROVED").length,
      rejected: leaves.filter((x) => x.status === "REJECTED").length,
    };
  }, [leaves]);

  /* -----------------------------------------
     FILTER
  ----------------------------------------- */

  const filteredLeaves = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return leaves.filter((leave) => {
      const employeeName =
        leave.employee?.fullName || leave.employee?.employeeId || "";

      const leaveType = leave.leaveType?.name || "";

      const reason = leave.reason || "";

      const matchesSearch =
        !keyword ||
        employeeName.toLowerCase().includes(keyword) ||
        leaveType.toLowerCase().includes(keyword) ||
        reason.toLowerCase().includes(keyword);

      const matchesStatus =
        statusFilter === "ALL" || leave.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [leaves, search, statusFilter]);

  /* -----------------------------------------
     PAGINATION
  ----------------------------------------- */

  const totalPages = Math.max(1, Math.ceil(filteredLeaves.length / PAGE_SIZE));

  const safePage = Math.min(page, totalPages);

  const paginatedLeaves = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;

    return filteredLeaves.slice(start, start + PAGE_SIZE);
  }, [filteredLeaves, safePage]);

  const showingFrom =
    filteredLeaves.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;

  const showingTo = Math.min(safePage * PAGE_SIZE, filteredLeaves.length);

  /* -----------------------------------------
     FILTER HANDLERS
  ----------------------------------------- */

  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleStatusChange(value: "ALL" | LeaveStatus) {
    setStatusFilter(value);
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("ALL");
    setPage(1);
  }

  const hasFilters = search.trim() !== "" || statusFilter !== "ALL";

  /* -----------------------------------------
     STATUS
  ----------------------------------------- */

  function getStatusLabel(status: LeaveStatus) {
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

  function getEmployeeName(leave: LeaveRequest) {
    return (
      leave.employee?.fullName ||
      leave.employee?.employeeId ||
      "Unknown Employee"
    );
  }

  function getReviewerName(leave: LeaveRequest) {
    return (
      leave.reviewedBy?.employee?.fullName ||
      leave.reviewedBy?.employee?.employeeId ||
      leave.reviewedBy?.email ||
      "-"
    );
  }

  function formatDate(value?: string) {
    if (!value) {
      return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function getHalfDayLabel(leave: LeaveRequest) {
    return leave.halfDay ? "Yes" : "No";
  }

  function openLeaveDetails(leave: LeaveRequest) {
    setSelectedLeave(leave);
  }

  function closeLeaveDetails() {
    setSelectedLeave(null);
  }

  function askForDetailsAction(
    leave: LeaveRequest,
    action: "APPROVE" | "REJECT",
  ) {
    setSelectedLeave(null);
    askForAction(leave, action);
  }

  /* -----------------------------------------
     APPROVE / REJECT
  ----------------------------------------- */

  function askForAction(leave: LeaveRequest, action: "APPROVE" | "REJECT") {
    setReviewComment(leave.reviewComment?.trim() || "");
    setConfirmAction({
      id: leave.id,
      action,
      employeeName: getEmployeeName(leave),
    });
  }

  async function performAction() {
    if (!confirmAction) {
      return;
    }

    const { id, action } = confirmAction;
    const comment = reviewComment.trim();

    if (action === "REJECT" && !comment) {
      window.alert(
        "Please enter a review comment before rejecting the leave request.",
      );
      return;
    }

    try {
      setActionLoadingId(id);

      if (action === "APPROVE") {
        await patch(`/leaves/${id}/approve`, {
          reviewComment: comment,
        });
      } else {
        await patch(`/leaves/${id}/reject`, {
          reviewComment: comment,
        });
      }

      setConfirmAction(null);
      setReviewComment("");

      await queryClient.invalidateQueries({
        queryKey: ["admin-leaves"],
      });
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        `Unable to ${action.toLowerCase()} leave request.`;

      const finalMessage = Array.isArray(message)
        ? message.join(", ")
        : message;

      window.alert(finalMessage);
    } finally {
      setActionLoadingId(null);
    }
  }

  /* -----------------------------------------
     RENDER
  ----------------------------------------- */

  return (
    <div className="adminLeavesPage">
      {/* PAGE HEADER */}
      <div className="adminLeavesHeader">
        <div>
          <h1>All Leave Requests</h1>
          <p>
            {leaves.length} {leaves.length === 1 ? "record" : "records"}
          </p>
        </div>

        <button
          type="button"
          className="btn adminLeavesRefreshBtn"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            size={16}
            className={isFetching ? "adminLeavesSpin" : ""}
          />
          {isFetching ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* SUMMARY */}
      <div className="adminLeavesSummary">
        <div className="adminLeavesSummaryCard total">
          <div className="adminLeavesSummaryIcon">
            <CalendarDays size={19} />
          </div>

          <div>
            <span>Total Requests</span>
            <strong>{summary.total}</strong>
          </div>
        </div>

        <div className="adminLeavesSummaryCard pending">
          <div className="adminLeavesSummaryIcon">
            <Clock3 size={19} />
          </div>

          <div>
            <span>Pending</span>
            <strong>{summary.pending}</strong>
          </div>
        </div>

        <div className="adminLeavesSummaryCard approved">
          <div className="adminLeavesSummaryIcon">
            <CheckCircle2 size={19} />
          </div>

          <div>
            <span>Approved</span>
            <strong>{summary.approved}</strong>
          </div>
        </div>

        <div className="adminLeavesSummaryCard rejected">
          <div className="adminLeavesSummaryIcon">
            <XCircle size={19} />
          </div>

          <div>
            <span>Rejected</span>
            <strong>{summary.rejected}</strong>
          </div>
        </div>
      </div>

      {/* FILTER CARD */}
      <div className="card adminLeavesFilterCard">
        <div className="adminLeavesFilterHeader">
          <span>
            <Filter size={15} />
            Leave Filters
          </span>

          <button
            type="button"
            className="btn secondary adminLeavesResetBtn"
            onClick={clearFilters}
            disabled={!hasFilters}
          >
            Clear Filter
          </button>
        </div>

        <div className="adminLeavesFilters">
          <div className="adminLeavesSearch">
            <Search size={17} />

            <input
              type="text"
              placeholder="Search employee, leave type or reason..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>

          <div className="adminLeavesFilterField">
            <label>Status</label>

            <select
              value={statusFilter}
              onChange={(e) =>
                handleStatusChange(e.target.value as "ALL" | LeaveStatus)
              }
            >
              <option value="ALL">All</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* TABLE CARD */}
      <div className="card adminLeavesTableCard">
        <div className="adminLeavesTableHeader">
          <div>
            <h2>Leave Requests</h2>

            <span>
              Showing {showingFrom}–{showingTo} of {filteredLeaves.length}
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="adminLeavesState">Loading leave requests...</div>
        ) : isError ? (
          <div className="adminLeavesState error">
            <strong>Unable to load leave requests.</strong>

            <button type="button" className="btn" onClick={() => refetch()}>
              Try Again
            </button>
          </div>
        ) : (
          <div className="adminLeavesTableWrap">
            <table className="adminLeavesTable">
              <thead>
                <tr>
                  <th>EMPLOYEE</th>
                  <th>LEAVE TYPE</th>
                  <th>FROM DATE</th>
                  <th>TO DATE</th>
                  <th>STATUS</th>
                  <th>APPROVED / REVIEWED BY</th>
                  <th>REASON</th>
                  <th>ACTION</th>
                </tr>
              </thead>

              <tbody>
                {paginatedLeaves.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="adminLeavesState">
                        No leave requests found.
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedLeaves.map((leave) => {
                    const isPending = leave.status === "PENDING";
                    const isProcessing = actionLoadingId === leave.id;

                    return (
                      <tr
                        key={leave.id}
                        className="adminLeavesClickableRow"
                        onClick={() => openLeaveDetails(leave)}
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openLeaveDetails(leave);
                          }
                        }}
                      >
                        <td>
                          <div className="adminLeavesEmployee">
                            <div className="adminLeavesAvatar">
                              {getEmployeeName(leave).charAt(0).toUpperCase()}
                            </div>

                            <div>
                              <strong>{getEmployeeName(leave)}</strong>

                              {leave.employee?.employeeId && (
                                <small>{leave.employee.employeeId}</small>
                              )}
                            </div>
                          </div>
                        </td>

                        <td>{leave.leaveType?.name || "-"}</td>

                        <td>{formatDate(leave.fromDate)}</td>

                        <td>{formatDate(leave.toDate)}</td>

                        <td>
                          <span
                            className={`adminLeavesStatus ${leave.status.toLowerCase()}`}
                          >
                            {getStatusLabel(leave.status)}
                          </span>
                        </td>

                        <td>
                          {leave.reviewedBy ? (
                            <div className="adminLeavesReviewerCell">
                              <div className="adminLeavesReviewerAvatar">
                                {getReviewerName(leave).charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <strong>{getReviewerName(leave)}</strong>
                                <small>
                                  {leave.reviewedBy.role
                                    ? leave.reviewedBy.role
                                    : "Reviewer"}
                                </small>
                              </div>
                            </div>
                          ) : (
                            <span className="adminLeavesNoReviewer">—</span>
                          )}
                        </td>

                        <td>
                          <span
                            className="adminLeavesReason"
                            title={leave.reason}
                          >
                            {leave.reason || "-"}
                          </span>
                        </td>

                        <td>
                          {isPending ? (
                            <div className="adminLeavesActions">
                              <button
                                type="button"
                                className="adminLeavesActionBtn approve"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  askForAction(leave, "APPROVE");
                                }}
                                disabled={isProcessing}
                                title="Approve Leave"
                              >
                                <Check size={15} />
                                Approve
                              </button>

                              <button
                                type="button"
                                className="adminLeavesActionBtn reject"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  askForAction(leave, "REJECT");
                                }}
                                disabled={isProcessing}
                                title="Reject Leave"
                              >
                                <X size={15} />
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="adminLeavesNoAction">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* PAGINATION */}
        {!isLoading && !isError && filteredLeaves.length > 0 && (
          <div className="adminLeavesPagination">
            <span>
              Showing {showingFrom}–{showingTo} of {filteredLeaves.length}
            </span>

            <div className="adminLeavesPaginationControls">
              <button
                type="button"
                className="adminLeavesPageBtn"
                disabled={safePage === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft size={16} />
              </button>

              {Array.from({ length: totalPages }, (_, index) => index + 1).map(
                (pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    className={`adminLeavesPageNumber ${
                      safePage === pageNumber ? "active" : ""
                    }`}
                    onClick={() => setPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                ),
              )}

              <button
                type="button"
                className="adminLeavesPageBtn"
                disabled={safePage === totalPages}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* LEAVE DETAILS MODAL */}
      {selectedLeave && (
        <div
          className="adminLeavesDetailsOverlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeLeaveDetails();
            }
          }}
        >
          <div
            className="adminLeavesDetailsModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="adminLeavesDetailsTitle"
          >
            <div className="adminLeavesDetailsHeader">
              <div className="adminLeavesDetailsTitleArea">
                <div className="adminLeavesDetailsIcon">
                  <CalendarDays size={19} />
                </div>

                <div>
                  <h2 id="adminLeavesDetailsTitle">Leave Details</h2>
                  <p>
                    {getEmployeeName(selectedLeave)}
                    {selectedLeave.employee?.employeeId
                      ? ` • ${selectedLeave.employee.employeeId}`
                      : ""}
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="adminLeavesDetailsClose"
                onClick={closeLeaveDetails}
                aria-label="Close leave details"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="adminLeavesDetailsBody">
              <div className="adminLeavesDetailsSectionTitle">
                <span />
                Employee Information
              </div>

              <div className="adminLeavesDetailsGrid">
                <div className="adminLeavesDetailsItem">
                  <span>Employee Name</span>
                  <strong>{getEmployeeName(selectedLeave)}</strong>
                </div>

                <div className="adminLeavesDetailsItem">
                  <span>Employee ID</span>
                  <strong>{selectedLeave.employee?.employeeId || "-"}</strong>
                </div>

                <div className="adminLeavesDetailsItem">
                  <span>Department</span>
                  <strong>
                    {selectedLeave.employee?.department?.name || "-"}
                  </strong>
                </div>
              </div>

              <div className="adminLeavesDetailsSectionTitle">
                <span />
                Leave Information
              </div>

              <div className="adminLeavesDetailsGrid">
                <div className="adminLeavesDetailsItem">
                  <span>Leave Type</span>
                  <strong>{selectedLeave.leaveType?.name || "-"}</strong>
                </div>

                <div className="adminLeavesDetailsItem">
                  <span>Status</span>
                  <strong>
                    <span
                      className={`adminLeavesStatus ${selectedLeave.status.toLowerCase()}`}
                    >
                      {getStatusLabel(selectedLeave.status)}
                    </span>
                  </strong>
                </div>

                <div className="adminLeavesDetailsItem">
                  <span>From Date</span>
                  <strong>{formatDate(selectedLeave.fromDate)}</strong>
                </div>

                <div className="adminLeavesDetailsItem">
                  <span>To Date</span>
                  <strong>{formatDate(selectedLeave.toDate)}</strong>
                </div>

                <div className="adminLeavesDetailsItem">
                  <span>Half Day</span>
                  <strong>{getHalfDayLabel(selectedLeave)}</strong>
                </div>

                <div className="adminLeavesDetailsItem">
                  <span>
                    {selectedLeave.status === "APPROVED"
                      ? "Approved By"
                      : selectedLeave.status === "REJECTED"
                        ? "Rejected By"
                        : "Reviewed By"}
                  </span>
                  <strong>
                    {selectedLeave.reviewedBy
                      ? getReviewerName(selectedLeave)
                      : "-"}
                  </strong>
                </div>

                <div className="adminLeavesDetailsItem adminLeavesDetailsFull">
                  <span>Reason</span>
                  <strong className="adminLeavesDetailsReason">
                    {selectedLeave.reason || "-"}
                  </strong>
                </div>
              </div>

              {(selectedLeave.reviewComment || selectedLeave.reviewedAt) && (
                <>
                  <div className="adminLeavesDetailsSectionTitle">
                    <span />
                    Review Information
                  </div>

                  <div className="adminLeavesDetailsGrid">
                    {selectedLeave.reviewedAt && (
                      <div className="adminLeavesDetailsItem">
                        <span>Reviewed At</span>
                        <strong>{formatDate(selectedLeave.reviewedAt)}</strong>
                      </div>
                    )}

                    {selectedLeave.reviewedBy?.role && (
                      <div className="adminLeavesDetailsItem">
                        <span>Reviewer Role</span>
                        <strong>{selectedLeave.reviewedBy.role}</strong>
                      </div>
                    )}

                    {selectedLeave.reviewedBy?.email && (
                      <div className="adminLeavesDetailsItem">
                        <span>Reviewer Email</span>
                        <strong>{selectedLeave.reviewedBy.email}</strong>
                      </div>
                    )}

                    {selectedLeave.reviewComment && (
                      <div className="adminLeavesDetailsItem adminLeavesDetailsFull">
                        <span>Review Comment</span>
                        <strong className="adminLeavesDetailsReason">
                          {selectedLeave.reviewComment}
                        </strong>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="adminLeavesDetailsFooter">
              {selectedLeave.status === "PENDING" ? (
                <>
                  <button
                    type="button"
                    className="btn adminLeavesDetailsSecondaryBtn"
                    onClick={closeLeaveDetails}
                  >
                    Close
                  </button>

                  <div className="adminLeavesDetailsActionGroup">
                    <button
                      type="button"
                      className="btn adminLeavesDetailsApproveBtn"
                      onClick={() =>
                        askForDetailsAction(selectedLeave, "APPROVE")
                      }
                      disabled={actionLoadingId === selectedLeave.id}
                    >
                      <Check size={15} />
                      Approve
                    </button>

                    <button
                      type="button"
                      className="btn adminLeavesDetailsRejectBtn"
                      onClick={() =>
                        askForDetailsAction(selectedLeave, "REJECT")
                      }
                      disabled={actionLoadingId === selectedLeave.id}
                    >
                      <X size={15} />
                      Reject
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  className="btn adminLeavesDetailsSecondaryBtn"
                  onClick={closeLeaveDetails}
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL */}
      {confirmAction && (
        <div className="adminLeavesModalOverlay">
          <div className="adminLeavesConfirmModal">
            <div
              className={`adminLeavesConfirmIcon ${
                confirmAction.action === "APPROVE" ? "approve" : "reject"
              }`}
            >
              {confirmAction.action === "APPROVE" ? (
                <Check size={22} />
              ) : (
                <X size={22} />
              )}
            </div>

            <h3>
              {confirmAction.action === "APPROVE"
                ? "Approve Leave Request?"
                : "Reject Leave Request?"}
            </h3>

            <p>
              Are you sure you want to{" "}
              {confirmAction.action === "APPROVE" ? "approve" : "reject"} the
              leave request of <strong>{confirmAction.employeeName}</strong>?
            </p>

            <div className="adminLeavesReviewComment">
              <label htmlFor="adminLeaveReviewComment">
                Review Comment{" "}
                {confirmAction.action === "REJECT" && <span>*</span>}
              </label>
              <textarea
                id="adminLeaveReviewComment"
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
                placeholder={
                  confirmAction.action === "REJECT"
                    ? "Enter reason for rejection..."
                    : "Add an optional review comment..."
                }
                rows={4}
                maxLength={500}
                disabled={actionLoadingId !== null}
              />
              <small>{reviewComment.length}/500 characters</small>
            </div>

            <div className="adminLeavesConfirmActions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setConfirmAction(null);
                  setReviewComment("");
                }}
                disabled={actionLoadingId !== null}
              >
                Cancel
              </button>

              <button
                type="button"
                className={`btn ${
                  confirmAction.action === "APPROVE"
                    ? "adminLeavesConfirmApprove"
                    : "adminLeavesConfirmReject"
                }`}
                onClick={performAction}
                disabled={actionLoadingId !== null}
              >
                {actionLoadingId ? (
                  "Processing..."
                ) : confirmAction.action === "APPROVE" ? (
                  <>
                    <Check size={15} />
                    Approve
                  </>
                ) : (
                  <>
                    <X size={15} />
                    Reject
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
