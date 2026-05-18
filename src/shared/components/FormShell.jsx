/**
 * Modal-style form shell for superadmin modules.
 *
 * Shape mirrors the look of `superadmin/modules/ContentManagement/`
 * modals (full-viewport overlay, ocean header, scrollable body, fixed
 * footer with Cancel + Submit). Designed to host arbitrary form
 * children — the planned RequestsManagement module uses this for the
 * "Edit request" panel.
 */

import React from "react";

export default function FormShell({
  title,
  subtitle,
  open,
  onClose,
  onSubmit,
  submitting = false,
  submitDisabled = false,
  submitLabel = "Save changes",
  children,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="flex h-[88vh] w-[min(900px,92vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="border-b border-slate-200 bg-gradient-to-r from-sky-50 to-cyan-50 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              {subtitle ? (
                <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        <footer className="flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || submitDisabled}
            className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting ? "Saving..." : submitLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
