import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Building2,
  CalendarDays,
  Clock3,
  Coffee,
  Info,
  Save,
  Timer,
  Wifi,
  RefreshCw,
} from "lucide-react";
import "./settings.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { get, patch } from "../api/client";

type SettingsForm = {
  companyName: string;
  timezone: string;
  currency: string;
  workingDays: string[];
  startTime: string;
  endTime: string;
  requiredMinutes: number;
  gracePeriodMinutes: number;
  breakLimitMinutes: number;
  breakWarningThresholdMinutes: number;
  idleThresholdMinutes: number;
  idleWarningSeconds: number;
  maximumSessionDurationMinutes: number;
  allowWFH: boolean;
  allowWFO: boolean;
};

const DEFAULT_SETTINGS: SettingsForm = {
  companyName: "Employee Work Management System",
  timezone: "Asia/Kolkata",
  currency: "INR",
  workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  startTime: "09:30",
  endTime: "18:30",
  requiredMinutes: 480,
  gracePeriodMinutes: 10,
  breakLimitMinutes: 60,
  breakWarningThresholdMinutes: 50,
  idleThresholdMinutes: 5,
  idleWarningSeconds: 60,
  maximumSessionDurationMinutes: 720,
  allowWFH: true,
  allowWFO: true,
};

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const TIMEZONES = [
  { value: "Asia/Kolkata", label: "India Standard Time (Asia/Kolkata)" },
  { value: "UTC", label: "UTC" },
  { value: "Asia/Dubai", label: "Gulf Standard Time (Asia/Dubai)" },
  { value: "Asia/Singapore", label: "Singapore Time (Asia/Singapore)" },
  { value: "Europe/London", label: "London Time (Europe/London)" },
  { value: "America/New_York", label: "Eastern Time (America/New_York)" },
];

const CURRENCIES = [
  { value: "INR", label: "Indian Rupee (₹)" },
  { value: "USD", label: "US Dollar ($)" },
  { value: "EUR", label: "Euro (€)" },
  { value: "GBP", label: "British Pound (£)" },
];

function toNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeSettings(data: any): SettingsForm {
  return {
    companyName: data?.companyName ?? DEFAULT_SETTINGS.companyName,
    timezone: data?.timezone ?? DEFAULT_SETTINGS.timezone,
    currency: data?.currency ?? DEFAULT_SETTINGS.currency,
    workingDays: Array.isArray(data?.workingDays)
      ? data.workingDays
      : DEFAULT_SETTINGS.workingDays,
    startTime: data?.startTime ?? DEFAULT_SETTINGS.startTime,
    endTime: data?.endTime ?? DEFAULT_SETTINGS.endTime,
    requiredMinutes: toNumber(
      data?.requiredMinutes,
      DEFAULT_SETTINGS.requiredMinutes,
    ),
    gracePeriodMinutes: toNumber(
      data?.gracePeriodMinutes,
      DEFAULT_SETTINGS.gracePeriodMinutes,
    ),
    breakLimitMinutes: toNumber(
      data?.breakLimitMinutes,
      DEFAULT_SETTINGS.breakLimitMinutes,
    ),
    breakWarningThresholdMinutes: toNumber(
      data?.breakWarningThresholdMinutes,
      DEFAULT_SETTINGS.breakWarningThresholdMinutes,
    ),
    idleThresholdMinutes: toNumber(
      data?.idleThresholdMinutes,
      DEFAULT_SETTINGS.idleThresholdMinutes,
    ),
    idleWarningSeconds: toNumber(
      data?.idleWarningSeconds,
      DEFAULT_SETTINGS.idleWarningSeconds,
    ),
    maximumSessionDurationMinutes: toNumber(
      data?.maximumSessionDurationMinutes,
      DEFAULT_SETTINGS.maximumSessionDurationMinutes,
    ),
    allowWFH: data?.allowWFH ?? DEFAULT_SETTINGS.allowWFH,
    allowWFO: data?.allowWFO ?? DEFAULT_SETTINGS.allowWFO,
  };
}

export default function Settings() {
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => get("/settings"),
  });

  const [form, setForm] = useState<SettingsForm>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const successMessageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (settingsQuery.data) {
      setForm(normalizeSettings(settingsQuery.data));
    }
  }, [settingsQuery.data]);
  useEffect(() => {
    if (saved) {
      successMessageRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [saved]);

  function updateField<K extends keyof SettingsForm>(
    key: K,
    value: SettingsForm[K],
  ) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setSaved(false);
    setError("");
  }

  function toggleWorkingDay(day: string) {
    setForm((previous) => {
      const exists = previous.workingDays.includes(day);

      return {
        ...previous,
        workingDays: exists
          ? previous.workingDays.filter((item) => item !== day)
          : [...previous.workingDays, day],
      };
    });

    setSaved(false);
    setError("");
  }

  function validate(): string | null {
    if (!form.companyName.trim()) return "Company name is required.";
    if (!form.timezone) return "Timezone is required.";
    if (!form.currency) return "Currency is required.";
    if (form.workingDays.length === 0)
      return "Select at least one working day.";
    if (!form.startTime || !form.endTime) {
      return "Start time and end time are required.";
    }
    if (form.endTime <= form.startTime) {
      return "End time must be later than start time.";
    }
    if (form.requiredMinutes <= 0) {
      return "Required working time must be greater than 0.";
    }
    if (form.gracePeriodMinutes < 0) {
      return "Grace period cannot be negative.";
    }
    if (form.breakLimitMinutes <= 0) {
      return "Break limit must be greater than 0.";
    }
    if (form.breakWarningThresholdMinutes < 0) {
      return "Break warning threshold cannot be negative.";
    }
    if (form.breakWarningThresholdMinutes > form.breakLimitMinutes) {
      return "Break warning threshold cannot be greater than the break limit.";
    }
    if (form.idleThresholdMinutes <= 0) {
      return "Idle threshold must be greater than 0.";
    }
    if (form.idleWarningSeconds < 0) {
      return "Idle warning seconds cannot be negative.";
    }
    if (form.maximumSessionDurationMinutes <= 0) {
      return "Maximum session duration must be greater than 0.";
    }

    return null;
  }

  async function refreshSettings() {
    setError("");
    setSaved(false);

    await settingsQuery.refetch();
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaved(false);
    setError("");

    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);

    try {
      await patch("/settings", {
        companyName: form.companyName.trim(),
        timezone: form.timezone,
        currency: form.currency,
        workingDays: form.workingDays,
        startTime: form.startTime,
        endTime: form.endTime,
        requiredMinutes: Number(form.requiredMinutes),
        gracePeriodMinutes: Number(form.gracePeriodMinutes),
        breakLimitMinutes: Number(form.breakLimitMinutes),
        breakWarningThresholdMinutes: Number(form.breakWarningThresholdMinutes),
        idleThresholdMinutes: Number(form.idleThresholdMinutes),
        idleWarningSeconds: Number(form.idleWarningSeconds),
        maximumSessionDurationMinutes: Number(
          form.maximumSessionDurationMinutes,
        ),
        allowWFH: Boolean(form.allowWFH),
        allowWFO: Boolean(form.allowWFO),
      });

      // Refresh the saved backend values.
      await queryClient.invalidateQueries({
        queryKey: ["settings"],
      });

      // Explicit success confirmation after the backend save succeeds.
      setSaved(true);

      // Keep the success message visible for a few seconds.
      window.setTimeout(() => {
        setSaved(false);
      }, 4000);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to save company settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (settingsQuery.isLoading) {
    return (
      <div className="settingsPage">
        <div className="settingsPageHeader">
          <div className="settingsTitleRow">
            <div className="settingsTitleIcon">
              <Building2 size={21} />
            </div>
            <div>
              <h1>Company Settings</h1>
              <p>Configure company-wide attendance, break and work rules.</p>
            </div>
          </div>
        </div>

        <div className="settingsLoadingCard">
          <RefreshCw size={18} className="settingsSpin" />
          <span>Loading company settings...</span>
        </div>
      </div>
    );
  }

  if (settingsQuery.isError) {
    return (
      <div className="settingsPage">
        <div className="settingsPageHeader">
          <div className="settingsTitleRow">
            <div className="settingsTitleIcon">
              <Building2 size={21} />
            </div>
            <div>
              <h1>Company Settings</h1>
              <p>Configure company-wide system rules.</p>
            </div>
          </div>

          <button
            type="button"
            className="settingsRefreshBtn"
            onClick={refreshSettings}
            disabled={settingsQuery.isFetching}
          >
            <RefreshCw
              size={16}
              className={settingsQuery.isFetching ? "settingsSpin" : ""}
            />
            {settingsQuery.isFetching ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="settingsErrorCard">
          <AlertCircle size={17} />
          <span>Unable to load company settings.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="settingsPage">
      <div className="settingsPageHeader">
        <div className="settingsTitleRow">
          <div className="settingsTitleIcon">
            <Building2 size={21} />
          </div>

          <div>
            <h1>Company Settings</h1>
            <p>
              Configure attendance, working hours, breaks, idle detection and
              work modes.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="settingsRefreshBtn"
          onClick={refreshSettings}
          disabled={settingsQuery.isFetching || saving}
        >
          <RefreshCw
            size={16}
            className={settingsQuery.isFetching ? "settingsSpin" : ""}
          />
          {settingsQuery.isFetching ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <form className="settingsForm" onSubmit={save}>
        {error && (
          <div className="settingsErrorCard" role="alert" aria-live="assertive">
            <AlertCircle size={17} />
            <span>{error}</span>
          </div>
        )}

        {saved && (
          <div
            ref={successMessageRef}
            className="settingsSuccessCard"
            role="status"
            aria-live="polite"
            tabIndex={-1}
          >
            <div className="settingsSuccessIcon">✓</div>
            <div>
              <strong>Settings saved successfully</strong>
              <span>Your company settings have been updated successfully.</span>
            </div>
          </div>
        )}

        <section className="settingsCard settingsSection">
          <div className="settingsSectionHeader">
            <div className="settingsSectionIcon">
              <Building2 size={18} />
            </div>
            <div>
              <h2>Company Information</h2>
              <p className="muted">Basic company and regional configuration.</p>
            </div>
          </div>

          <div className="two">
            <label className="field">
              <span>Company Name</span>
              <input
                type="text"
                value={form.companyName}
                onChange={(event) =>
                  updateField("companyName", event.target.value)
                }
                placeholder="Enter company name"
              />
            </label>

            <label className="field">
              <span>Timezone</span>
              <select
                value={form.timezone}
                onChange={(event) =>
                  updateField("timezone", event.target.value)
                }
              >
                {TIMEZONES.map((timezone) => (
                  <option key={timezone.value} value={timezone.value}>
                    {timezone.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Currency</span>
              <select
                value={form.currency}
                onChange={(event) =>
                  updateField("currency", event.target.value)
                }
              >
                {CURRENCIES.map((currency) => (
                  <option key={currency.value} value={currency.value}>
                    {currency.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="settingsCard settingsSection">
          <div className="settingsSectionHeader">
            <div className="settingsSectionIcon">
              <CalendarDays size={18} />
            </div>
            <div>
              <h2>Working Schedule</h2>
              <p className="muted">
                Configure normal working days and company working hours.
              </p>
            </div>
          </div>

          <div className="two">
            <label className="field">
              <span>Start Time</span>
              <input
                type="time"
                value={form.startTime}
                onChange={(event) =>
                  updateField("startTime", event.target.value)
                }
              />
            </label>

            <label className="field">
              <span>End Time</span>
              <input
                type="time"
                value={form.endTime}
                onChange={(event) => updateField("endTime", event.target.value)}
              />
            </label>
          </div>

          <div className="settingsDaysField">
            <span>Working Days</span>

            <div className="settingsDays">
              {WEEKDAYS.map((day) => {
                const selected = form.workingDays.includes(day);

                return (
                  <button
                    key={day}
                    type="button"
                    className={selected ? "settingsDay active" : "settingsDay"}
                    onClick={() => toggleWorkingDay(day)}
                  >
                    {day.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="settingsCard settingsSection">
          <div className="settingsSectionHeader">
            <div className="settingsSectionIcon">
              <Clock3 size={18} />
            </div>
            <div>
              <h2>Attendance Rules</h2>
              <p className="muted">
                Configure required daily work time and late-arrival grace
                period.
              </p>
            </div>
          </div>

          <div className="two">
            <label className="field">
              <span>Required Working Minutes</span>
              <input
                type="number"
                min={1}
                value={form.requiredMinutes}
                onChange={(event) =>
                  updateField("requiredMinutes", Number(event.target.value))
                }
              />
              <small className="settingsHelp">
                Example: 480 minutes = 8 hours.
              </small>
            </label>

            <label className="field">
              <span>Grace Period Minutes</span>
              <input
                type="number"
                min={0}
                value={form.gracePeriodMinutes}
                onChange={(event) =>
                  updateField("gracePeriodMinutes", Number(event.target.value))
                }
              />
              <small className="settingsHelp">
                Allowed late-arrival grace period.
              </small>
            </label>
          </div>
        </section>

        <section className="settingsCard settingsSection">
          <div className="settingsSectionHeader">
            <div className="settingsSectionIcon">
              <Coffee size={18} />
            </div>
            <div>
              <h2>Break Rules</h2>
              <p className="muted">
                Configure break duration and warning notification behavior.
              </p>
            </div>
          </div>

          <div className="two">
            <label className="field">
              <span>Break Limit Minutes</span>
              <input
                type="number"
                min={1}
                value={form.breakLimitMinutes}
                onChange={(event) =>
                  updateField("breakLimitMinutes", Number(event.target.value))
                }
              />
              <small className="settingsHelp">
                Maximum configured break time.
              </small>
            </label>

            <label className="field">
              <span>Break Warning Threshold</span>
              <input
                type="number"
                min={0}
                max={form.breakLimitMinutes}
                value={form.breakWarningThresholdMinutes}
                onChange={(event) =>
                  updateField(
                    "breakWarningThresholdMinutes",
                    Number(event.target.value),
                  )
                }
              />
              <small className="settingsHelp">
                Warning time before the break limit.
              </small>
            </label>
          </div>

          <div className="settingsInfoBox">
            <Info size={16} />
            <span>
              When the configured break limit is reached, the system can notify
              the employee and administrators without automatically ending the
              break.
            </span>
          </div>
        </section>

        <section className="settingsCard settingsSection">
          <div className="settingsSectionHeader">
            <div className="settingsSectionIcon">
              <Timer size={18} />
            </div>
            <div>
              <h2>Idle & Session Rules</h2>
              <p className="muted">
                Configure inactive-time detection and maximum work session
                duration.
              </p>
            </div>
          </div>

          <div className="two">
            <label className="field">
              <span>Idle Threshold Minutes</span>
              <input
                type="number"
                min={1}
                value={form.idleThresholdMinutes}
                onChange={(event) =>
                  updateField(
                    "idleThresholdMinutes",
                    Number(event.target.value),
                  )
                }
              />
              <small className="settingsHelp">
                Inactivity duration before idle time is detected.
              </small>
            </label>

            <label className="field">
              <span>Idle Warning Seconds</span>
              <input
                type="number"
                min={0}
                value={form.idleWarningSeconds}
                onChange={(event) =>
                  updateField("idleWarningSeconds", Number(event.target.value))
                }
              />
              <small className="settingsHelp">
                Warning period used by idle detection.
              </small>
            </label>

            <label className="field">
              <span>Maximum Session Duration Minutes</span>
              <input
                type="number"
                min={1}
                value={form.maximumSessionDurationMinutes}
                onChange={(event) =>
                  updateField(
                    "maximumSessionDurationMinutes",
                    Number(event.target.value),
                  )
                }
              />
              <small className="settingsHelp">
                Maximum allowed duration for a work session.
              </small>
            </label>
          </div>
        </section>

        <section className="settingsCard settingsSection">
          <div className="settingsSectionHeader">
            <div className="settingsSectionIcon">
              <Wifi size={18} />
            </div>
            <div>
              <h2>Work Mode</h2>
              <p className="muted">
                Choose which work modes employees can use.
              </p>
            </div>
          </div>

          <div className="settingsModeGrid">
            <label
              className={form.allowWFO ? "settingsMode active" : "settingsMode"}
            >
              <input
                type="checkbox"
                checked={form.allowWFO}
                onChange={(event) =>
                  updateField("allowWFO", event.target.checked)
                }
              />

              <div>
                <strong>Work From Office</strong>
                <small>Allow employees to check in using WFO.</small>
              </div>
            </label>

            <label
              className={form.allowWFH ? "settingsMode active" : "settingsMode"}
            >
              <input
                type="checkbox"
                checked={form.allowWFH}
                onChange={(event) =>
                  updateField("allowWFH", event.target.checked)
                }
              />

              <div>
                <strong>Work From Home</strong>
                <small>Allow employees to check in using WFH.</small>
              </div>
            </label>
          </div>
        </section>

        <div className="settingsSaveBar">
          <div className="settingsSaveHint">
            <Info size={15} />
            <span>
              Changes apply to company-wide attendance and work rules.
            </span>
          </div>

          <button type="submit" className="settingsSaveBtn" disabled={saving}>
            <Save size={16} />
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
