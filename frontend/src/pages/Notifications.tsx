import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get, patch } from "../api/client";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  Check,
  CheckCheck,
  Clock3,
  ExternalLink,
  FileText,
  RefreshCw,
  XCircle,
} from "lucide-react";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
};

type AppRole = "ADMIN" | "MANAGER" | "EMPLOYEE";

type NotificationDestination = {
  path: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
};

function getCurrentRoleFromPathname(pathname: string): AppRole {
  if (pathname.startsWith("/admin/")) {
    return "ADMIN";
  }

  if (pathname.startsWith("/manager/")) {
    return "MANAGER";
  }

  return "EMPLOYEE";
}

function getNotificationDestination(
  notification: NotificationItem,
  role: AppRole,
): NotificationDestination | null {
  const haystack =
    `${notification.type} ${notification.title} ${notification.message}`.toUpperCase();

  /*
   * The destination is role-aware.
   *
   * Employee:
   *   Leave       -> /employee/leaves
   *   Task        -> /employee/tasks
   *   Attendance  -> /employee/attendance
   *   Break       -> /employee/time-tracking
   *
   * Manager:
   *   Leave       -> /manager/leaves
   *   Task        -> /manager/tasks
   *   Attendance  -> /manager/attendance
   *   Break       -> /manager/attendance
   *
   * Admin:
   *   Leave       -> /admin/leaves
   *   Task        -> /admin/tasks
   *   Attendance  -> /admin/attendance
   *   Break       -> /admin/attendance
   */

  if (haystack.includes("LEAVE")) {
    return {
      path:
        role === "ADMIN"
          ? "/admin/leaves"
          : role === "MANAGER"
            ? "/manager/leaves"
            : "/employee/leaves",
      label: "Open Leave Management",
      icon: FileText,
    };
  }

  if (haystack.includes("TASK")) {
    return {
      path:
        role === "ADMIN"
          ? "/admin/tasks"
          : role === "MANAGER"
            ? "/manager/tasks"
            : "/employee/tasks",
      label: "Open Tasks",
      icon: CheckCheck,
    };
  }

  if (
    haystack.includes("ATTENDANCE") ||
    haystack.includes("CHECK-IN") ||
    haystack.includes("CHECK IN") ||
    haystack.includes("CHECK-OUT") ||
    haystack.includes("CHECK OUT")
  ) {
    return {
      path:
        role === "ADMIN"
          ? "/admin/attendance"
          : role === "MANAGER"
            ? "/manager/attendance"
            : "/employee/attendance",
      label: "Open Attendance",
      icon: Clock3,
    };
  }

  if (haystack.includes("BREAK")) {
    return {
      path:
        role === "EMPLOYEE"
          ? "/employee/time-tracking"
          : role === "MANAGER"
            ? "/manager/attendance"
            : "/admin/attendance",
      label: role === "EMPLOYEE" ? "Open Time Management" : "Open Attendance",
      icon: Clock3,
    };
  }

  return null;
}

function formatNotificationDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getNotificationTone(notification: NotificationItem) {
  const haystack = `${notification.type} ${notification.title}`.toUpperCase();

  if (haystack.includes("APPROVED")) {
    return {
      background: "#f0fdf4",
      border: "#bbf7d0",
      accent: "#15803d",
      icon: Check,
    };
  }

  if (haystack.includes("REJECTED") || haystack.includes("REJECT")) {
    return {
      background: "#fef2f2",
      border: "#fecaca",
      accent: "#b91c1c",
      icon: XCircle,
    };
  }

  if (haystack.includes("BREAK")) {
    return {
      background: "#fffaf0",
      border: "#fed7aa",
      accent: "#c2410c",
      icon: Clock3,
    };
  }

  if (haystack.includes("TASK")) {
    return {
      background: "#f5f3ff",
      border: "#ddd6fe",
      accent: "#6d28d9",
      icon: CheckCheck,
    };
  }

  if (haystack.includes("LEAVE")) {
    return {
      background: "#eff6ff",
      border: "#bfdbfe",
      accent: "#2563eb",
      icon: FileText,
    };
  }

  return {
    background: "#f8fafc",
    border: "#e2e8f0",
    accent: "#475569",
    icon: Bell,
  };
}

export default function Notifications() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();

  const currentRole = getCurrentRoleFromPathname(location.pathname);

  const {
    data: notifications = [],
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery<NotificationItem[]>({
    queryKey: ["notifications"],
    queryFn: () => get<NotificationItem[]>("/notifications"),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const unreadCount = notifications.filter(
    (notification) => !notification.read,
  ).length;

  async function markAsRead(id: string) {
    try {
      await patch(`/notifications/${id}/read`);
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch {
      // Keep the page usable even if marking the notification fails.
    }
  }

  async function openNotification(notification: NotificationItem) {
    const destination = getNotificationDestination(notification, currentRole);

    if (!notification.read) {
      await markAsRead(notification.id);
    }

    if (destination) {
      navigate(destination.path);
    }
  }

  if (isLoading) {
    return (
      <div className="notificationsPage">
        <div className="title">
          <div>
            <h1>Notifications</h1>
            <p className="muted">Your latest alerts and activity updates.</p>
          </div>
        </div>

        <div className="card" style={styles.stateCard}>
          <RefreshCw size={18} className="notificationsSpin" />
          <span>Loading notifications...</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="notificationsPage">
        <div className="title">
          <div>
            <h1>Notifications</h1>
            <p className="muted">Your latest alerts and activity updates.</p>
          </div>
        </div>

        <div className="alert" style={styles.errorState}>
          <div>
            <strong>Unable to load notifications.</strong>
            <span className="muted">Please refresh and try again.</span>
          </div>
          <button className="btn secondary" onClick={() => refetch()}>
            <RefreshCw size={15} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="notificationsPage">
      <div className="title" style={styles.pageHeader}>
        <div>
          <h1>Notifications</h1>
          <p className="muted" style={{ marginTop: 5 }}>
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
              : "You're all caught up."}
          </p>
        </div>

        <button
          type="button"
          className="btn secondary"
          onClick={() => refetch()}
          disabled={isFetching}
          style={styles.refreshButton}
        >
          <RefreshCw
            size={15}
            className={isFetching ? "notificationsSpin" : ""}
          />
          {isFetching ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="notificationsSummaryRow" style={styles.summaryRow}>
        <div className="card" style={styles.summaryCard}>
          <div style={styles.summaryIcon}>
            <Bell size={18} />
          </div>
          <div>
            <span style={styles.summaryLabel}>Total</span>
            <strong style={styles.summaryValue}>{notifications.length}</strong>
          </div>
        </div>

        <div className="card" style={styles.summaryCard}>
          <div style={{ ...styles.summaryIcon, ...styles.unreadIcon }}>
            <Bell size={18} />
          </div>
          <div>
            <span style={styles.summaryLabel}>Unread</span>
            <strong style={styles.summaryValue}>{unreadCount}</strong>
          </div>
        </div>

        <div className="card" style={styles.summaryCard}>
          <div style={{ ...styles.summaryIcon, ...styles.readIcon }}>
            <CheckCheck size={18} />
          </div>
          <div>
            <span style={styles.summaryLabel}>Read</span>
            <strong style={styles.summaryValue}>
              {notifications.length - unreadCount}
            </strong>
          </div>
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="card" style={styles.emptyState}>
          <div style={styles.emptyIcon}>
            <Bell size={23} />
          </div>
          <strong>No notifications yet</strong>
          <span className="muted">
            New leave, task, break and other activity updates will appear here.
          </span>
        </div>
      ) : (
        <div style={styles.list}>
          {notifications.map((notification) => {
            const destination = getNotificationDestination(
              notification,
              currentRole,
            );
            const tone = getNotificationTone(notification);
            const ToneIcon = tone.icon;
            const DestinationIcon = destination?.icon || ExternalLink;

            return (
              <article
                key={notification.id}
                className="card"
                role={destination ? "button" : undefined}
                tabIndex={destination ? 0 : undefined}
                onClick={() => openNotification(notification)}
                onKeyDown={(event) => {
                  if (!destination) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    void openNotification(notification);
                  }
                }}
                style={{
                  ...styles.notificationCard,
                  ...(notification.read ? styles.readCard : styles.unreadCard),
                  cursor: destination ? "pointer" : "default",
                }}
                onMouseEnter={(event) => {
                  if (!destination) return;
                  event.currentTarget.style.transform = "translateY(-1px)";
                  event.currentTarget.style.boxShadow =
                    "0 6px 18px rgba(15, 23, 42, 0.08)";
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.transform = "translateY(0)";
                  event.currentTarget.style.boxShadow = notification.read
                    ? "0 2px 8px rgba(15, 23, 42, 0.04)"
                    : "0 3px 10px rgba(37, 99, 235, 0.06)";
                }}
              >
                <div
                  style={{
                    ...styles.notificationAccent,
                    background: notification.read ? "#e5e7eb" : tone.accent,
                  }}
                />

                <div
                  style={{
                    ...styles.notificationIcon,
                    color: tone.accent,
                    background: tone.background,
                  }}
                >
                  <ToneIcon size={18} />
                </div>

                <div style={styles.notificationBody}>
                  <div style={styles.notificationTopRow}>
                    <div style={{ minWidth: 0 }}>
                      <div style={styles.notificationTitleRow}>
                        {!notification.read && (
                          <span style={styles.unreadDot} />
                        )}
                        <h3 style={styles.notificationTitle}>
                          {notification.title}
                        </h3>
                        {!notification.read && (
                          <span style={styles.newBadge}>NEW</span>
                        )}
                      </div>
                      <span className="muted" style={styles.notificationType}>
                        {notification.type.replaceAll("_", " ")}
                      </span>
                    </div>

                    <span className="muted" style={styles.timeLabel}>
                      {formatNotificationDate(notification.createdAt)}
                    </span>
                  </div>

                  <p style={styles.notificationMessage}>
                    {notification.message}
                  </p>

                  <div style={styles.notificationFooter}>
                    <div style={styles.actionHint}>
                      <DestinationIcon size={14} />
                      {destination ? destination.label : "Notification"}
                    </div>

                    {!notification.read && (
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={(event) => {
                          event.stopPropagation();
                          void markAsRead(notification.id);
                        }}
                        style={styles.markReadButton}
                      >
                        <Check size={14} />
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <style>{`
        .notificationsPage { width: 100%; }
        .notificationsPage .title h1 { margin-bottom: 0; }
        .notificationsSpin { animation: notificationsSpin 0.9s linear infinite; }
        @keyframes notificationsSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .notificationsPage article:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
        @media (max-width: 760px) {
          .notificationsPage .notificationsSummaryRow { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 20,
  },
  refreshButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 38,
    flexShrink: 0,
  },
  summaryRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 14,
    marginBottom: 20,
  },
  summaryCard: {
    minHeight: 78,
    display: "flex",
    alignItems: "center",
    gap: 11,
    padding: "14px 16px",
    borderRadius: 9,
    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
  },
  summaryIcon: {
    width: 38,
    height: 38,
    display: "grid",
    placeItems: "center",
    borderRadius: 8,
    background: "#eff6ff",
    color: "#2563eb",
    flexShrink: 0,
  },
  unreadIcon: {
    background: "#fef2f2",
    color: "#dc2626",
  },
  readIcon: {
    background: "#f0fdf4",
    color: "#15803d",
  },
  summaryLabel: {
    display: "block",
    color: "#6b7280",
    fontSize: 11,
    fontWeight: 600,
    marginBottom: 2,
  },
  summaryValue: {
    display: "block",
    color: "#111827",
    fontSize: 20,
    fontWeight: 700,
    lineHeight: 1.1,
  },
  list: {
    display: "grid",
    gap: 11,
  },
  notificationCard: {
    position: "relative",
    display: "flex",
    gap: 13,
    padding: 15,
    marginBottom: 0,
    overflow: "hidden",
    borderRadius: 9,
    border: "1px solid #e5e7eb",
    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
    transition:
      "transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease",
  },
  unreadCard: {
    background: "#f8fbff",
    borderColor: "#dbeafe",
  },
  readCard: {
    background: "#ffffff",
  },
  notificationAccent: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 99,
    flexShrink: 0,
  },
  notificationIcon: {
    width: 38,
    height: 38,
    display: "grid",
    placeItems: "center",
    borderRadius: 9,
    background: "#f8fafc",
    color: "#475569",
    flexShrink: 0,
  },
  notificationBody: {
    minWidth: 0,
    flex: 1,
  },
  notificationTopRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 15,
  },
  notificationTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    minWidth: 0,
  },
  notificationTitle: {
    margin: 0,
    color: "#111827",
    fontSize: 14,
    lineHeight: 1.35,
    fontWeight: 700,
  },
  notificationType: {
    display: "block",
    marginTop: 4,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  timeLabel: {
    flexShrink: 0,
    fontSize: 10.5,
    whiteSpace: "nowrap",
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#2563eb",
    flexShrink: 0,
  },
  newBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 20,
    padding: "0 7px",
    borderRadius: 999,
    background: "#dbeafe",
    color: "#2563eb",
    fontSize: 9.5,
    fontWeight: 800,
  },
  notificationMessage: {
    margin: "9px 0 11px",
    color: "#374151",
    fontSize: 12.5,
    lineHeight: 1.6,
  },
  notificationFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  actionHint: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color: "#6b7280",
    fontSize: 11.5,
    fontWeight: 600,
  },
  markReadButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 32,
    padding: "6px 10px",
    fontSize: 11.5,
  },
  stateCard: {
    minHeight: 150,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    color: "#6b7280",
  },
  errorState: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  emptyState: {
    minHeight: 230,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    gap: 7,
    textAlign: "center",
  },
  emptyIcon: {
    width: 50,
    height: 50,
    display: "grid",
    placeItems: "center",
    marginBottom: 2,
    borderRadius: "50%",
    background: "#eff6ff",
    color: "#2563eb",
  },
};
