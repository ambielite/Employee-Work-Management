import React, { useEffect, useRef, useState } from "react";
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
  Pencil,
  Save,
  X,
} from "lucide-react";
import { get, patch } from "../api/client";
import "../profile-ui.css";

type ProfileData = {
  id?: string;
  email?: string;
  role?: string;
  accountStatus?: string;

  fullName?: string | null;
  phone?: string | null;
  designation?: string | null;
  dateOfJoining?: string | null;

  lastLoginAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;

  employee?: {
    id?: string;
    userId?: string;
    employeeId?: string;
    fullName?: string | null;
    profilePhoto?: string | null;
    phone?: string | null;
    dateOfJoining?: string | null;
    designation?: string | null;
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

type ProfileProps = {
  allowEdit?: boolean;
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

export default function Profile({ allowEdit = false }: ProfileProps) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
  });

  async function loadProfile() {
    try {
      setIsLoading(true);
      setError("");

      const data = await get<ProfileData>("/auth/me");
      setProfile(data);

      setForm({
        fullName: data.fullName || data.employee?.fullName || "",
        email: data.email || "",
        phone: data.phone || data.employee?.phone || "",
      });
    } catch (err: any) {
      const message = err?.response?.data?.message || "Failed to load profile";
      setError(Array.isArray(message) ? message.join(", ") : message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadProfile();

    return () => {
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  function showModalError(message: string) {
    setError(message);

    window.requestAnimationFrame(() => {
      modalRef.current?.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    });
  }

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
    setError("");
  }

  function openEditModal() {
    setError("");
    setSuccess("");

    setForm({
      fullName: profile?.fullName || profile?.employee?.fullName || "",
      email: profile?.email || "",
      phone: profile?.phone || profile?.employee?.phone || "",
    });

    setEditOpen(true);
  }

  function closeEditModal() {
    if (saving) return;
    setEditOpen(false);
    setError("");
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");

    const fullName = form.fullName.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();

    if (!fullName) {
      showModalError("Full name is required.");
      return;
    }

    if (fullName.length < 2) {
      showModalError("Full name must contain at least 2 characters.");
      return;
    }

    if (!email) {
      showModalError("Email address is required.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showModalError("Please enter a valid email address.");
      return;
    }

    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      showModalError(
        "Contact number must be exactly 10 digits and start with 6, 7, 8 or 9.",
      );
      return;
    }

    try {
      setSaving(true);

      const updated = await patch<ProfileData>("/auth/me", {
        fullName,
        email,
        phone: phone || "",
      });

      setProfile(updated);

      setForm({
        fullName: updated.fullName || updated.employee?.fullName || fullName,
        email: updated.email || email,
        phone: updated.phone || updated.employee?.phone || phone,
      });

      // Close the modal immediately after a successful save.
      // The success toast remains visible for 2.5 seconds.
      setEditOpen(false);
      setError("");
      setSuccess("Profile updated successfully.");

      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current);
      }

      successTimerRef.current = window.setTimeout(() => {
        setSuccess("");
        successTimerRef.current = null;
      }, 2500);
    } catch (err: any) {
      const message =
        err?.response?.data?.message || "Unable to update profile.";

      showModalError(Array.isArray(message) ? message.join(", ") : message);
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="employeeProfilePage">
        <div className="employeeProfileLoading">Loading profile...</div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="employeeProfilePage">
        <div className="employeeProfileError">{error}</div>
      </div>
    );
  }

  const employee = profile?.employee;
  const name =
    profile?.fullName || employee?.fullName || profile?.email || "Profile";
  const email = profile?.email || "—";
  const phone = profile?.phone || employee?.phone || "—";
  const role = profile?.role || "USER";
  const accountStatus =
    profile?.accountStatus || employee?.accountStatus || "ACTIVE";

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
            <span className="employeeProfileEyebrow">{role} Profile</span>
            <h1>{name}</h1>
            <p>{employee?.designation || profile?.designation || role}</p>
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

          {allowEdit && (
            <button
              type="button"
              className="profilePageEditButton"
              onClick={openEditModal}
            >
              <Pencil size={15} />
              Edit Profile
            </button>
          )}
        </div>
      </div>

      {success && (
        <div className="profileToast" role="status">
          <ShieldCheck size={16} />
          {success}
        </div>
      )}

      {error && profile && !editOpen && (
        <div className="profilePageInlineError" role="alert">
          {error}
        </div>
      )}

      <section className="employeeProfilePanel">
        <div className="employeeProfilePanelHeader">
          <div className="employeeProfilePanelIcon">
            <UserRound size={17} />
          </div>
          <div>
            <h2>Personal & Account Information</h2>
            <p>Basic information associated with your profile.</p>
          </div>
        </div>

        <div className="employeeProfileDetailsGrid">
          <DetailCard icon={UserRound} label="Full Name" value={name} />
          <DetailCard icon={Mail} label="Email" value={email} />
          <DetailCard icon={Phone} label="Contact Number" value={phone} />
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

      <section className="employeeProfilePanel">
        <div className="employeeProfilePanelHeader">
          <div className="employeeProfilePanelIcon">
            <BriefcaseBusiness size={17} />
          </div>
          <div>
            <h2>Employment Information</h2>
            <p>Employment information is read-only.</p>
          </div>
        </div>

        <div className="employeeProfileDetailsGrid">
          <DetailCard
            icon={BriefcaseBusiness}
            label="Designation"
            value={profile?.designation || employee?.designation}
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
            value={formatDate(
              profile?.dateOfJoining || employee?.dateOfJoining,
            )}
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
            label="Employee ID"
            value={employee?.employeeId}
          />
          <DetailCard
            icon={KeyRound}
            label="Department ID"
            value={employee?.departmentId}
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
            <p>Work configuration is read-only.</p>
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

      {!allowEdit && (
        <div className="employeeProfileReadonlyNote">
          <ShieldCheck size={16} />
          <span>
            Profile details are read-only here. Contact an administrator for
            changes to employee information.
          </span>
        </div>
      )}

      {editOpen && allowEdit && (
        <div
          className="profileEditOverlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              closeEditModal();
            }
          }}
        >
          <div
            ref={modalRef}
            className="profileEditModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profileEditTitle"
          >
            <div className="profileEditHeader">
              <div>
                <span className="employeeProfileEyebrow">Profile</span>
                <h2 id="profileEditTitle">Edit Profile Details</h2>
                <p>Only personal contact details can be changed.</p>
              </div>

              <button
                type="button"
                className="profilePopoverClose"
                onClick={closeEditModal}
                disabled={saving}
                aria-label="Close edit profile"
              >
                <X size={18} />
              </button>
            </div>

            {error && (
              <div className="profileEditInlineError" role="alert">
                <ShieldCheck size={15} />
                <span>{error}</span>
              </div>
            )}

            <form className="profileEditForm" onSubmit={saveProfile}>
              <div className="profileEditSectionTitle">
                Editable Information
              </div>

              <div className="profileEditGrid">
                <label>
                  <span>Full Name *</span>
                  <input
                    type="text"
                    value={form.fullName}
                    onChange={(event) =>
                      updateField("fullName", event.target.value)
                    }
                    disabled={saving}
                    maxLength={100}
                    autoComplete="name"
                  />
                </label>

                <label>
                  <span>Email Address *</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      updateField("email", event.target.value)
                    }
                    disabled={saving}
                    maxLength={150}
                    autoComplete="email"
                  />
                </label>

                <label>
                  <span>Contact Number</span>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(event) => {
                      const value = event.target.value
                        .replace(/\D/g, "")
                        .slice(0, 10);

                      updateField("phone", value);
                    }}
                    disabled={saving}
                    maxLength={10}
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="10 digit mobile number"
                  />
                  <small>Example: 9876543210</small>
                </label>
              </div>

              <div className="profileEditSectionTitle readonlyTitle">
                Read-only Information
              </div>

              <div className="profileEditGrid">
                <label>
                  <span>Role</span>
                  <input value={role} readOnly disabled />
                </label>

                <label>
                  <span>Account Status</span>
                  <input value={accountStatus} readOnly disabled />
                </label>

                <label>
                  <span>Designation</span>
                  <input
                    value={profile?.designation || employee?.designation || "—"}
                    readOnly
                    disabled
                  />
                </label>

                <label>
                  <span>Department</span>
                  <input
                    value={employee?.department?.name || "—"}
                    readOnly
                    disabled
                  />
                </label>

                <label>
                  <span>Manager</span>
                  <input
                    value={employee?.manager?.fullName || "Not assigned"}
                    readOnly
                    disabled
                  />
                </label>

                <label>
                  <span>Date of Joining</span>
                  <input
                    value={formatDate(
                      profile?.dateOfJoining || employee?.dateOfJoining,
                    )}
                    readOnly
                    disabled
                  />
                </label>

                <label>
                  <span>Office Location</span>
                  <input
                    value={employee?.officeLocation || "—"}
                    readOnly
                    disabled
                  />
                </label>

                <label>
                  <span>Last Login</span>
                  <input
                    value={formatDateTime(profile?.lastLoginAt)}
                    readOnly
                    disabled
                  />
                </label>

                <label>
                  <span>Profile Updated</span>
                  <input
                    value={formatDateTime(profile?.updatedAt)}
                    readOnly
                    disabled
                  />
                </label>
              </div>

              <div className="profileEditReadonlyNote">
                <ShieldCheck size={15} />
                <span>
                  Only Full Name, Email Address and Contact Number are editable.
                  All other information is read-only.
                </span>
              </div>

              <div className="profileEditFooter">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={closeEditModal}
                  disabled={saving}
                >
                  <X size={15} />
                  Cancel
                </button>

                <button type="submit" className="btn primary" disabled={saving}>
                  <Save size={15} />
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
