import { Link, useLocation, useNavigate } from "react-router-dom";

import {
  LayoutDashboard,
  Clock3,
  CheckSquare,
  CalendarDays,
  Bell,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  UserRound,
  Mail,
  ShieldCheck,
  Building2,
  BriefcaseBusiness,
  Phone,
  CalendarDays as CalendarIcon,
  MapPin,
  Clock4,
  KeyRound,
} from "lucide-react";

import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { get } from "../api/client";

import type { User } from "../types";

import "../profile-ui.css";

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",

    month: "short",

    year: "numeric",
  }).format(date);
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",

    month: "short",

    year: "numeric",

    hour: "2-digit",

    minute: "2-digit",
  }).format(date);
}

function formatWorkingMinutes(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return "—";
  }

  const minutes = Number(value);

  const hours = Math.floor(minutes / 60);

  const remaining = minutes % 60;

  return `${hours}h ${String(remaining).padStart(2, "0")}m`;
}

function Detail({
  icon: Icon,

  label,

  value,
}: {
  icon: React.ComponentType<{ size?: number }>;

  label: string;

  value: React.ReactNode;
}) {
  return (
    <div className="profilePopoverDetail">
      <span className="profilePopoverDetailIcon">
        <Icon size={15} />
      </span>

      <div>
        <small>{label}</small>

        <strong>{value || "—"}</strong>
      </div>
    </div>
  );
}

export default function Layout({
  user,

  children,
}: {
  user: User;

  children: React.ReactNode;
}) {
  const loc = useLocation();

  const nav = useNavigate();

  const [open, setOpen] = useState(false);

  const [profileOpen, setProfileOpen] = useState(false);

  const role = user.role;

  const currentUser = user as any;

  const employee = currentUser.employee || {};

  const profileName = employee.fullName || currentUser.email;

  const departmentName = employee.department?.name || "Company";

  const { data: companySettings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => get("/settings"),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const companyName = companySettings?.companyName || "Ambi Elite Pvt. Ltd.";

  const { data: notifications = [] } = useQuery<
    Array<{ id: string; read: boolean }>
  >({
    queryKey: ["notifications"],

    queryFn: () => get<Array<{ id: string; read: boolean }>>("/notifications"),

    refetchInterval: 15000,

    refetchOnWindowFocus: true,

    staleTime: 0,
  });

  const unreadNotificationCount = notifications.filter(
    (notification) => !notification.read,
  ).length;

  const links =
    role === "EMPLOYEE"
      ? [
          ["Dashboard", "/employee/dashboard", LayoutDashboard],

          ["Profile", "/employee/profile", UserRound],

          ["Attendance", "/employee/attendance", Clock3],

          ["Time Management", "/employee/time-tracking", Clock4],

          ["Tasks", "/employee/tasks", CheckSquare],

          ["Leaves", "/employee/leaves", CalendarDays],

          ["Notifications", "/employee/notifications", Bell],
        ]
      : role === "MANAGER"
        ? [
            ["Dashboard", "/manager/dashboard", LayoutDashboard],

            ["Profile", "/manager/profile", UserRound],

            ["Team", "/manager/team", Users],

            ["Attendance", "/manager/attendance", Clock3],

            ["Time Management", "/manager/time-management", Clock4],

            ["Tasks", "/manager/tasks", CheckSquare],

            ["Leaves", "/manager/leaves", CalendarDays],

            ["Reports", "/manager/reports", BarChart3],

            ["Notifications", "/manager/notifications", Bell],
          ]
        : [
            ["Dashboard", "/admin/dashboard", LayoutDashboard],

            ["Profile", "/admin/profile", UserRound],

            ["Employees", "/admin/employees", Users],

            ["Attendance", "/admin/attendance", Clock3],

            ["Tasks", "/admin/tasks", CheckSquare],

            ["Leaves", "/admin/leaves", CalendarDays],

            ["Reports", "/admin/reports", BarChart3],

            ["Management", "/admin/management", Building2],

            ["Settings", "/admin/settings", Settings],

            ["Notifications", "/admin/notifications", Bell],
          ];

  useEffect(() => {
    if (!profileOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [profileOpen]);

  return (
    <div className="app">
      <aside className={open ? "sidebar open" : "sidebar"}>
        <div className="sidebarTop">
          <div className="brand">
            {companyName}

            <span>●</span>
          </div>

          <button
            type="button"
            className="userMini userMiniClickable"
            onClick={() => setProfileOpen(true)}
            title="Open profile details"
            aria-haspopup="dialog"
            aria-expanded={profileOpen}
          >
            <span className="userMiniAvatar" aria-hidden="true">
              <UserRound size={17} />
            </span>

            <span className="userMiniText">
              <b>{profileName}</b>

              <small>{role}</small>
            </span>

            <span className="userMiniArrow" aria-hidden="true">
              →
            </span>
          </button>
        </div>

        <nav className="sidebarNav" aria-label="Primary navigation">
          {links.map(([name, path, Icon]: any) => (
            <Link
              onClick={() => setOpen(false)}
              className={loc.pathname === path ? "nav active" : "nav"}
              key={path}
              to={path}
            >
              <Icon size={18} />

              <span className="navLabel">{name}</span>

              {name === "Notifications" && unreadNotificationCount > 0 && (
                <span
                  className="navNotificationBadge"
                  aria-label={`${unreadNotificationCount} unread notifications`}
                >
                  {unreadNotificationCount > 99
                    ? "99+"
                    : unreadNotificationCount}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="sidebarBottom">
          <button
            className="nav logout"
            onClick={() => {
              localStorage.clear();

              nav("/login");
            }}
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      <main>
        <header>
          <button
            className="menu"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Close navigation" : "Open navigation"}
          >
            {open ? <X /> : <Menu />}
          </button>

          <div>
            <b>{departmentName}</b>

            <span className="muted"> · {user.role}</span>
          </div>
        </header>

        <section className="content">{children}</section>
      </main>

      {profileOpen && (
        <div
          className="profilePopoverOverlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setProfileOpen(false);
          }}
        >
          <div
            className="profilePopover"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profilePopoverTitle"
          >
            <div className="profilePopoverHeader">
              <div className="profilePopoverIdentity">
                <div className="profilePopoverAvatar">
                  <UserRound size={23} />
                </div>

                <div>
                  <span className="profilePopoverEyebrow">
                    {employee.employeeId || "Employee"}
                  </span>

                  <h2 id="profilePopoverTitle">{profileName}</h2>

                  <p>{employee.designation || role}</p>
                </div>
              </div>

              <button
                type="button"
                className="profilePopoverClose"
                onClick={() => setProfileOpen(false)}
                aria-label="Close profile details"
              >
                <X size={18} />
              </button>
            </div>

            <div className="profilePopoverBadges">
              <span className="profileStatusBadge">
                <ShieldCheck size={13} />

                {String(
                  employee.accountStatus ||
                    currentUser.accountStatus ||
                    "ACTIVE",
                )}
              </span>

              <span className="profileRoleBadge">
                <BriefcaseBusiness size={13} />

                {role}
              </span>
            </div>

            <div className="profilePopoverGrid">
              <Detail icon={UserRound} label="User ID" value={currentUser.id} />

              <Detail
                icon={BadgeIcon}
                label="Employee ID"
                value={employee.employeeId}
              />

              <Detail icon={Mail} label="Email" value={currentUser.email} />

              <Detail icon={Phone} label="Phone" value={employee.phone} />

              <Detail
                icon={BriefcaseBusiness}
                label="Designation"
                value={employee.designation}
              />

              <Detail
                icon={Building2}
                label="Department"
                value={employee.department?.name}
              />

              <Detail
                icon={UserRound}
                label="Manager"
                value={employee.manager?.fullName || "Not assigned"}
              />

              <Detail
                icon={CalendarIcon}
                label="Date of Joining"
                value={formatDate(employee.dateOfJoining)}
              />

              <Detail
                icon={MapPin}
                label="Office Location"
                value={employee.officeLocation}
              />

              <Detail
                icon={Clock4}
                label="Standard Working Time"
                value={formatWorkingMinutes(employee.standardWorkingMinutes)}
              />

              <Detail
                icon={BriefcaseBusiness}
                label="Work Mode Eligibility"
                value={employee.workModeEligibility}
              />

              <Detail icon={Clock4} label="Shift" value={employee.shift} />

              <Detail
                icon={ShieldCheck}
                label="Employment Status"
                value={employee.employmentStatus}
              />

              <Detail
                icon={KeyRound}
                label="Employee Record ID"
                value={employee.id}
              />

              <Detail
                icon={KeyRound}
                label="Department ID"
                value={employee.departmentId}
              />

              <Detail
                icon={KeyRound}
                label="User Reference ID"
                value={employee.userId}
              />

              <Detail
                icon={Clock4}
                label="Last Login"
                value={formatDateTime(currentUser.lastLoginAt)}
              />
            </div>

            <div className="profilePopoverFooter">
              <span>Account created · Profile updated</span>

              <div className="profilePopoverFooterActions">
                <button
                  type="button"
                  className="profilePopoverProfileButton"
                  onClick={() => {
                    setProfileOpen(false);

                    nav(
                      role === "ADMIN"
                        ? "/admin/profile"
                        : role === "MANAGER"
                          ? "/manager/profile"
                          : "/employee/profile",
                    );
                  }}
                >
                  {role === "ADMIN" ? "View / Edit Profile" : "View Profile"}
                </button>

                <strong>
                  {formatDateTime(currentUser.createdAt)} ·{" "}
                  {formatDateTime(currentUser.updatedAt)}
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BadgeIcon({ size = 15 }: { size?: number }) {
  return <UserRound size={size} />;
}
