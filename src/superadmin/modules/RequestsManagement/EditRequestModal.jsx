/**
 * Edit-a-request modal used by RequestsManagementPage. Surfaces the
 * skeleton fields exposed by `requests_v` and writes through the
 * `admin_request_op` RPC.
 *
 * The modal stays intentionally minimal — it does NOT replicate the
 * full per-table review UI that the regular admin pipeline offers
 * (`Applications/ReviewApplications.jsx`). Its job is the
 * cross-cutting "make any field on any request look like X" story.
 */

import { useEffect, useState } from "react";

import FormShell from "../../../shared/components/FormShell.jsx";
import {
  REQUEST_STATUS_DB_VALUES,
  normalizeStatus,
} from "../../../shared/domain/status";

export function EditRequestModal({ request, open, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(initialFromRequest(request));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setForm(initialFromRequest(request));
    setError(null);
  }, [request]);

  if (!open || !request) return null;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const patch = {};
      if (form.status !== request.status) patch.status = form.status;
      if (form.additional_info !== (request.additional_info ?? "")) {
        patch.additional_info = form.additional_info;
      }
      if (form.case_study_date !== (request.case_study_date ?? "")) {
        patch.case_study_date = form.case_study_date || null;
      }
      if (form.request_code !== (request.request_code ?? "")) {
        patch.request_code = form.request_code;
      }
      if (Object.keys(patch).length === 0) {
        onClose();
        return;
      }
      await onSave(patch);
    } catch (err) {
      setError(err.message || "Failed to save changes.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onDelete();
    } catch (err) {
      setError(err.message || "Failed to delete the request.");
      setSubmitting(false);
    }
  };

  return (
    <FormShell
      open={open}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel="Save changes"
      title={`Edit request ${request.request_code || request.id.slice(0, 8)}`}
      subtitle={request.service_type || request.service_id || "Request"}
    >
      <div className="space-y-5">
        {error ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Request code">
            <input
              type="text"
              value={form.request_code}
              onChange={(e) => setForm((f) => ({ ...f, request_code: e.target.value }))}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-500"
            />
          </Field>

          <Field label="Status">
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-500"
            >
              {REQUEST_STATUS_DB_VALUES.map((s) => (
                <option key={s} value={s}>
                  {normalizeStatus(s)} ({s})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Case study date">
            <input
              type="datetime-local"
              value={toDateTimeLocal(form.case_study_date)}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  case_study_date: e.target.value
                    ? new Date(e.target.value).toISOString()
                    : "",
                }))
              }
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-500"
            />
          </Field>

          <Field label="User id">
            <input
              type="text"
              value={request.user_id ?? ""}
              readOnly
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
            />
          </Field>
        </div>

        <Field label="Additional info">
          <textarea
            value={form.additional_info}
            onChange={(e) =>
              setForm((f) => ({ ...f, additional_info: e.target.value }))
            }
            rows={4}
            className="w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-500"
          />
        </Field>

        <div className="rounded-md border border-rose-100 bg-rose-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">
            Danger zone
          </p>
          <p className="mt-1 text-sm text-rose-700">
            Permanently delete this request and its audit trail entry. This
            cannot be undone.
          </p>
          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting}
            className="mt-3 rounded-md border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
          >
            Delete request
          </button>
        </div>
      </div>
    </FormShell>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
      {label}
      {children}
    </label>
  );
}

function initialFromRequest(request) {
  if (!request) {
    return {
      status: "pending",
      additional_info: "",
      case_study_date: "",
      request_code: "",
    };
  }
  return {
    status: request.status ?? "pending",
    additional_info: request.additional_info ?? "",
    case_study_date: request.case_study_date ?? "",
    request_code: request.request_code ?? "",
  };
}

function toDateTimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
