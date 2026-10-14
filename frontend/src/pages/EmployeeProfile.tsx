import { useEffect, useState } from "react";
import React from "react";
import {
  UserRound,
  Mail,
  ShieldCheck,
  Building2,
  BriefcaseBusiness,
  Phone,
  CalendarDays,
  MapPin,
  Clock4,
  UsersRound,
  KeyRound,
} from "lucide-react";
import { get } from "../api/client";
import "../profile-ui.css";

type ProfileData = {
  id?: string;
  email?: string;
  role?: string;
  accountStatus?: string;
  lastLoginAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  employee?: {
    id?: string;
    userId?: string;
    employeeId?: string;
    fullName?: string;
    profilePhoto?: string | null;
    phone?: string | null;
    dateOfJoining?: string | null;
    designation?: string;
    departmentId?: string;
    employmentStatus?: string;
    workModeEligibility?: string;
    standardWorkingMinutes?: number;
    shift?: string | null;
    officeLocation?: string | null;
    accountStatus?: string;
    department?: {
      id?: string;
      name?: string;
      description?: string | null;
    } | null;
    manager?: {
      id?: string;
      employeeId?: string;
      fullName?: string;
      designation?: string;
    } | null;
  } | null;
};

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

function formatMinutes(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return "—";
  }

  const minutes = Number(value);
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  return `${hours}h ${String(remaining).padStart(2, "0")}m`;
}

function statusClass(value?: string | null) {
  const normalized = String(value || "").toUpperCase();
  if (normalized === "ACTIVE") return "profileBadge success";
  if (normalized === "INACTIVE" || normalized === "TERMINATED") {
    return "profileBadge danger";
  }
  return "profileBadge neutral";
}

function DetailCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  value?: React.ReactNode;
}) {
  return (
    <div className="employeeProfileDetailCard">
      <div className="employeeProfileDetailIcon">
        <Icon size={16} />
      </div>
      <div className="employeeProfileDetailText">
        <span>{label}</span>
        <strong>{value || "—"}</strong>
      </div>
    </div>
  );
}

export default function EmployeeProfile() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      try {
        setIsLoading(true);
        setError("");

        const data = await get<ProfileData>("/auth/me");

        if (mounted) setProfile(data);
      } catch (err: any) {
        if (mounted) {
          setError(
            err?.response?.data?.message || "Failed to load employee profile",
          );
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadProfile();

    return () => {
      mounted = false;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="employeeProfilePage">
        <div className="employeeProfileLoading">Loading profile...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="employeeProfilePage">
        <div className="employeeProfileError">{error}</div>
      </div>
    );
  }

  const employee = profile?.employee;
  const name = employee?.fullName || profile?.email || "Employee";
  const role = profile?.role || "EMPLOYEE";
  const accountStatus =
    employee?.accountStatus || profile?.accountStatus || "ACTIVE";
  const workEligibility = employee?.workModeEligibility
    ? employee.workModeEligibility
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .join(" / ")
    : "—";

  return (
    <div className="employeeProfilePage">
      <div className="employeeProfilePageHeader">
        <div className="employeeProfileHeaderIdentity">
          <div className="employeeProfileAvatar">
            {employee?.profilePhoto ? (
              <img src={employee.profilePhoto} alt="Profile" />
            ) : (
              <UserRound size={25} />
            )}
          </div>
          <div>
            <span className="employeeProfileEyebrow">
              {employee?.employeeId || "Employee Profile"}
            </span>
            <h1>{name}</h1>
            <p>{employee?.designation || role}</p>
          </div>
        </div>

        <div className="employeeProfileHeaderBadges">
          <span className={statusClass(accountStatus)}>
            <ShieldCheck size={13} />
            {accountStatus}
          </span>
          <span className="profileBadge info">
            <BriefcaseBusiness size={13} />
            {role}
          </span>
        </div>
      </div>

      <section className="employeeProfilePanel">
        <div className="employeeProfilePanelHeader">
          <div className="employeeProfilePanelIcon">
            <UserRound size={17} />
          </div>
          <div>
            <h2>Personal & Account Information</h2>
            <p>Your account details. Editing is managed by authorized staff.</p>
          </div>
        </div>

        <div className="employeeProfileDetailsGrid">
          <DetailCard icon={UserRound} label="Full Name" value={name} />
          <DetailCard icon={KeyRound} label="User ID" value={profile?.id} />
          <DetailCard
            icon={BadgeIcon}
            label="Employee ID"
            value={employee?.employeeId}
          />
          <DetailCard
            icon={Mail}
            label="Email Address"
            value={profile?.email}
          />
          <DetailCard icon={Phone} label="Phone" value={employee?.phone} />
          <DetailCard icon={BriefcaseBusiness} label="Role" value={role} />
          <DetailCard
            icon={ShieldCheck}
            label="Account Status"
            value={accountStatus}
          />
          <DetailCard
            icon={CalendarDays}
            label="Account Created"
            value={formatDate(profile?.createdAt)}
          />
        </div>
      </section>

      <section className="employeeProfilePanel">
        <div className="employeeProfilePanelHeader">
          <div className="employeeProfilePanelIcon">
            <BriefcaseBusiness size={17} />
          </div>
          <div>
            <h2>Employment Information</h2>
            <p>
              Organization and employment details associated with your account.
            </p>
          </div>
        </div>

        <div className="employeeProfileDetailsGrid">
          <DetailCard
            icon={BriefcaseBusiness}
            label="Designation"
            value={employee?.designation}
          />
          <DetailCard
            icon={Building2}
            label="Department"
            value={employee?.department?.name}
          />
          <DetailCard
            icon={UsersRound}
            label="Manager"
            value={
              employee?.manager
                ? `${employee.manager.fullName}${
                    employee.manager.employeeId
                      ? ` · ${employee.manager.employeeId}`
                      : ""
                  }`
                : "Not assigned"
            }
          />
          <DetailCard
            icon={CalendarDays}
            label="Date of Joining"
            value={formatDate(employee?.dateOfJoining)}
          />
          <DetailCard
            icon={ShieldCheck}
            label="Employment Status"
            value={employee?.employmentStatus}
          />
          <DetailCard
            icon={KeyRound}
            label="Employee Record ID"
            value={employee?.id}
          />
          <DetailCard
            icon={KeyRound}
            label="Department ID"
            value={employee?.departmentId}
          />
          <DetailCard
            icon={KeyRound}
            label="User Reference ID"
            value={employee?.userId}
          />
        </div>
      </section>

      <section className="employeeProfilePanel">
        <div className="employeeProfilePanelHeader">
          <div className="employeeProfilePanelIcon">
            <Clock4 size={17} />
          </div>
          <div>
            <h2>Work & Office Information</h2>
            <p>
              Read-only settings currently associated with your employee
              profile.
            </p>
          </div>
        </div>

        <div className="employeeProfileDetailsGrid">
          <DetailCard
            icon={BriefcaseBusiness}
            label="Work Mode Eligibility"
            value={workEligibility}
          />
          <DetailCard
            icon={Clock4}
            label="Standard Working Time"
            value={formatMinutes(employee?.standardWorkingMinutes)}
          />
          <DetailCard icon={Clock4} label="Shift" value={employee?.shift} />
          <DetailCard
            icon={MapPin}
            label="Office Location"
            value={employee?.officeLocation}
          />
          <DetailCard
            icon={Clock4}
            label="Last Login"
            value={formatDateTime(profile?.lastLoginAt)}
          />
          <DetailCard
            icon={CalendarDays}
            label="Profile Updated"
            value={formatDateTime(profile?.updatedAt)}
          />
        </div>
      </section>

      <div className="employeeProfileReadonlyNote">
        <ShieldCheck size={16} />
        <span>
          Profile details are read-only for employees. Contact your
          administrator for changes to employee information.
        </span>
      </div>
    </div>
  );
}

function BadgeIcon({ size = 16 }: { size?: number }) {
  return <UserRound size={size} />;
}
