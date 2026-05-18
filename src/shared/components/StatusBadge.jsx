/**
 * Tailwind status pill that surfaces a normalized status string.
 * Mirrors the mobile shared/components/StatusBadge.tsx behaviour.
 */

import React from "react";
import { normalizeStatus } from "../domain/status";

const STYLES = {
  Pending: "bg-amber-100 text-amber-800",
  "In Progress": "bg-blue-50 text-blue-400",
  "Action Required": "bg-rose-100 text-rose-800",
  Resubmitted: "bg-slate-100 text-slate-700",
  "For Approval": "bg-emerald-100 text-emerald-800",
  Scheduled: "bg-blue-100 text-blue-800",
  "Case Study": "bg-violet-100 text-violet-800",
  Approved: "bg-green-100 text-green-800",
};

export default function StatusBadge({ status, className = "" }) {
  const label = normalizeStatus(status);
  const cls = STYLES[label] ?? "bg-slate-100 text-slate-700";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls} ${className}`}
    >
      {label}
    </span>
  );
}
