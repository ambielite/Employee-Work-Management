import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { get } from "../api/client";
import Stat from "../components/Stat";
import DataTable, { type Column } from "../components/DataTable";
import FilterBar from "../components/FilterBar";

function normalize(data: any) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}
function label(k: string) {
  return k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}
function nested(v: any) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return v.name ?? v.fullName ?? v.email ?? "—";
  return String(v);
}

export function TablePage({
  title,
  url,
  columns,
}: {
  title: string;
  url: string;
  columns: string[];
}) {
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: [url],
    queryFn: () => get(url),
  });
  const rows = normalize(data);
  const [search, setSearch] = useState("");
  const filterKeys = useMemo(
    () =>
      columns.filter((c) =>
        [
          "status",
          "workMode",
          "priority",
          "employmentStatus",
          "accountStatus",
        ].includes(c),
      ),
    [columns],
  );
  const [filters, setFilters] = useState<Record<string, string>>({});
  const defs: Column<any>[] = columns.map((key) => ({
    key,
    label: label(key),
    render: (v: any) => nested(v),
  }));
  const reset = () => {
    setSearch("");
    setFilters({});
  };

  return (
    <>
      <div className="title">
        <div>
          <h1>{title}</h1>
          <p className="muted">{rows.length} records</p>
        </div>
        <button
          className="btn primary refreshBtn"
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw size={15} className={isFetching ? "spin" : ""} />
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {isError ? (
        <div className="card errorState">
          <b>Unable to load data.</b>
          <button className="btn" type="button" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <div className="card">
          <FilterBar
            search={search}
            onSearch={setSearch}
            filters={filterKeys.map((k) => ({
              label: label(k),
              value: filters[k] || "",
              onChange: (v) => setFilters((f) => ({ ...f, [k]: v })),
              options: Array.from(
                new Set<string>(rows.map((r: any) => String(r?.[k] ?? ""))),
              )
                .filter((value): value is string => Boolean(value))
                .map((value) => ({
                  label: value.replaceAll("_", " "),
                  value,
                })),
            }))}
            onReset={reset}
          />
          <DataTable
            rows={rows}
            columns={defs}
            loading={isLoading}
            search={search}
            filters={filters}
          />
        </div>
      )}
    </>
  );
}

export function Dashboard({ role }: { role: string }) {
  const endpoint = "/reports/attendance";
  const { data, isLoading } = useQuery({
    queryKey: [endpoint],
    queryFn: () => get(endpoint),
  });
  const rows = normalize(data);
  const present = rows.filter((x: any) =>
    ["PRESENT", "LATE", "PRESENT_WITH_INSUFFICIENT_HOURS"].includes(x.status),
  ).length;
  const wfh = rows.filter((x: any) => x.workMode === "WFH").length;
  const late = rows.filter((x: any) => x.status === "LATE").length;
  const insufficient = rows.filter(
    (x: any) => x.status === "PRESENT_WITH_INSUFFICIENT_HOURS",
  ).length;
  return (
    <>
      <div className="title">
        <div>
          <h1>{role === "ADMIN" ? "Company" : "Team"} Dashboard</h1>
          <p className="muted">Live data from PostgreSQL-backed APIs.</p>
        </div>
      </div>
      <div className="grid">
        <Stat label="Records loaded" value={rows.length} />
        <Stat label="Present" value={present} />
        <Stat label="WFH" value={wfh} />
        <Stat label="Late" value={late} />
        <Stat label="Insufficient Hours" value={insufficient} />
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>Recent attendance</h3>
        <DataTable
          rows={rows.slice(0, 20)}
          loading={isLoading}
          pageSize={10}
          columns={[
            { key: "employee.fullName", label: "Employee" },
            { key: "workMode", label: "Mode" },
            { key: "status", label: "Status" },
            {
              key: "loginTime",
              label: "Login",
              render: (v) => (v ? new Date(v).toLocaleTimeString() : "—"),
            },
            {
              key: "activeMinutes",
              label: "Active",
              render: (v) => `${v ?? 0}m`,
            },
            {
              key: "breakMinutes",
              label: "Break",
              render: (v) => `${v ?? 0}m`,
            },
            {
              key: "shortageMinutes",
              label: "Shortage",
              render: (v) => `${v ?? 0}m`,
            },
          ]}
        />
      </div>
    </>
  );
}
