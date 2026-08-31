import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Lock, Plus, Trash2 } from "lucide-react";
import { useSuperadminHeaderTitle } from "../../SuperadminLayout";
import { InterviewInstructions } from "../../../admin/components/forApprovalDetailUi";
import { useScopeSettings } from "../../../shared/context/SettingsContext";
import {
  createBarangay,
  deleteBarangay,
  fetchBarangays,
  normalizeBarangayName,
  updateBarangay,
} from "../../../shared/lib/barangays";
import { sanitizeCmsHtml } from "../../../shared/lib/sanitizeHtml";
import {
  INTERVIEW_SCHEDULING_DEFAULTS,
  INTERVIEW_SCHEDULING_KEY,
  INTERVIEW_SCHEDULING_SAMPLE_APPLICATION_NUMBER,
  addInterviewStep,
  isApplicationNumberStep,
  moveInterviewStep,
  normalizeInterviewScheduling,
  removeInterviewStep,
  saveInterviewScheduling,
  validateInterviewScheduling,
} from "../../../shared/lib/interviewScheduling";
import {
  LEGAL_DEFAULTS,
  LEGAL_KEY,
  LEGAL_PAGES,
  normalizeLegalSettings,
  saveLegalSettings,
} from "../../../shared/lib/legalSettings";

const LEGAL_PAGE_HINTS = {
  "terms-and-conditions": "Configure the Terms and Conditions that apply to this system.",
  "user-acceptance": "Configure the User Acceptance text that users will see.",
};

const SERVICE_SETTINGS_PATH = "/superadmin/global-settings/service";

const MODULES = [
  {
    id: "interview-scheduling",
    title: "Interview Scheduling",
    emoji: "📅",
    description:
      "Mini CMS for the briefing shown in Admin → For Approval → Scheduling. Steps and office hours are configurable; the Application Number cannot be removed.",
  },
  {
    id: "legal",
    title: "Legal",
    emoji: "📜",
    description: "Hardcoded Legal pages. Only section copy is stored; each page is always shown on the website.",
  },
  {
    id: "barangays",
    title: "Barangays",
    emoji: "🏘️",
    description:
      "Official barangay catalog for new selections. Deleting a barangay removes it from this list only. Existing voter and user records keep the barangay name they already have.",
  },
];

const LABEL_CLS = "block text-[11px] font-semibold uppercase tracking-[0.12em] text-ocean-700";
const INPUT_CLS =
  "mt-1.5 w-full rounded-lg border border-ocean-200 bg-ocean-50/60 px-3 py-2 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/70 focus:border-ocean-400";
const TOOL_BTN =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-semibold text-slate-700 transition hover:bg-ocean-50 hover:text-ocean-900";
const INTERVIEW_INPUT_CLS =
  "mt-1.5 w-full rounded-lg border border-ocean-200 bg-white px-3 py-2 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/70 focus:border-ocean-400";

function SkeletonPulse({ className = "" }) {
  return <div className={`animate-pulse rounded-md bg-ocean-100/80 ${className}`} aria-hidden />;
}

function SettingsSaveBarSkeleton() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ocean-100 pt-4">
      <SkeletonPulse className="h-4 w-28" />
      <div className="flex gap-2">
        <SkeletonPulse className="h-9 w-16 rounded-lg" />
        <SkeletonPulse className="h-9 w-16 rounded-lg" />
      </div>
    </div>
  );
}

function InterviewSchedulingSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading interview scheduling">
      <SkeletonPulse className="h-10 max-w-2xl" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <SkeletonPulse className="h-16" />
            <SkeletonPulse className="h-16" />
          </div>
          <div className="space-y-2">
            <SkeletonPulse className="h-3 w-16" />
            <SkeletonPulse className="h-3 w-64" />
            {[0, 1, 2].map((index) => (
              <div key={index} className="rounded-xl border border-ocean-200 bg-ocean-50/40 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <SkeletonPulse className="h-4 w-24" />
                  <div className="flex gap-1">
                    <SkeletonPulse className="size-8 rounded-lg" />
                    <SkeletonPulse className="size-8 rounded-lg" />
                    <SkeletonPulse className="size-8 rounded-lg" />
                  </div>
                </div>
                <SkeletonPulse className="h-16" />
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <SkeletonPulse className="h-16" />
            <SkeletonPulse className="h-16" />
            <SkeletonPulse className="h-16" />
          </div>
        </div>
        <div>
          <SkeletonPulse className="h-3 w-16" />
          <SkeletonPulse className="mt-2 h-72 rounded-2xl" />
        </div>
      </div>
      <SettingsSaveBarSkeleton />
    </div>
  );
}

function LegalSettingsSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading legal settings">
      {LEGAL_PAGES.map((page) => (
        <div key={page.slug} className="rounded-xl border border-ocean-200 bg-white p-4">
          <SkeletonPulse className="h-4 w-48" />
          <SkeletonPulse className="mt-2 h-3 w-72 max-w-full" />
          <div className="mt-4 space-y-3">
            <SkeletonPulse className="h-10" />
            <SkeletonPulse className="h-28" />
            <SkeletonPulse className="h-10" />
            <SkeletonPulse className="h-28" />
          </div>
        </div>
      ))}
      <SettingsSaveBarSkeleton />
    </div>
  );
}

function BarangaySettingsSkeleton() {
  return (
    <div
      className="rounded-xl border border-ocean-200 bg-white p-4"
      role="status"
      aria-busy="true"
      aria-label="Loading barangays"
    >
      <SkeletonPulse className="h-4 w-32" />
      <SkeletonPulse className="mt-2 h-8 max-w-2xl" />
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <SkeletonPulse className="h-16 min-w-[12rem] flex-1" />
        <SkeletonPulse className="h-9 w-16 rounded-lg" />
      </div>
      <SkeletonPulse className="mt-4 h-3 w-16" />
      <SkeletonPulse className="mt-1.5 h-9" />
      <div className="mt-3 overflow-hidden rounded-xl border border-ocean-100">
        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_11rem] gap-2 border-b border-ocean-100 bg-ocean-50/70 px-3 py-2">
          <SkeletonPulse className="h-3 w-12" />
          <SkeletonPulse className="ml-auto h-3 w-10" />
          <SkeletonPulse className="ml-auto h-3 w-14" />
        </div>
        <ul className="divide-y divide-ocean-100">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <li
              key={index}
              className="grid grid-cols-[minmax(0,1fr)_5.5rem_11rem] items-center gap-2 px-3 py-2"
            >
              <SkeletonPulse className="h-4 w-40 max-w-full" />
              <SkeletonPulse className="ml-auto h-3 w-8" />
              <div className="flex justify-end gap-1">
                <SkeletonPulse className="h-8 w-16 rounded-md" />
                <SkeletonPulse className="h-8 w-16 rounded-md" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function formatBarangayCount(value) {
  return Number(value || 0).toLocaleString("en-US");
}

const escapeHtml = (text = "") =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const isHtmlRichText = (text = "") => /<\/?[a-z][\s\S]*>/i.test(text);

const markdownToHtml = (text = "") =>
  escapeHtml(text)
    .replaceAll(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replaceAll(/_(.+?)_/g, "<em>$1</em>")
    .replaceAll(/~~(.+?)~~/g, "<del>$1</del>")
    .replaceAll(/`(.+?)`/g, "<code>$1</code>")
    .replaceAll(
      /\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>'
    )
    .replaceAll(/\n/g, "<br />");

const normalizeRichTextHtml = (text = "") => {
  if (!text) return "";
  return isHtmlRichText(text) ? sanitizeCmsHtml(text) : markdownToHtml(text);
};

function applyWrap(textarea, before, after = before) {
  if (!textarea) return null;
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const value = textarea.value ?? "";
  const selected = value.slice(start, end);
  const next = value.slice(0, start) + before + selected + after + value.slice(end);
  const cursor = start + before.length + selected.length + after.length;
  return { next, cursor };
}

function applyLinePrefix(textarea, prefix, numbered = false) {
  if (!textarea) return null;
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const value = textarea.value ?? "";
  const before = value.slice(0, start);
  const selection = value.slice(start, end) || "";
  const after = value.slice(end);
  const lines = selection.split("\n");
  const nextSelection = lines
    .map((line, idx) => {
      const pref = numbered ? `${idx + 1}. ` : prefix;
      return line.startsWith(pref) ? line : `${pref}${line}`;
    })
    .join("\n");
  return { next: before + nextSelection + after, cursor: start + nextSelection.length };
}

function TextField({ label, value, onChange, placeholder, hint }) {
  return (
    <label className="block">
      {label ? <span className={LABEL_CLS}>{label}</span> : null}
      <input
        type="text"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={INPUT_CLS}
      />
      {hint ? <span className="mt-1 block text-[11px] text-ocean-700">{hint}</span> : null}
    </label>
  );
}

function RichTextField({ label, value, onChange, placeholder, rows = 5 }) {
  const ref = useRef(null);
  const [showPreview, setShowPreview] = useState(false);

  const run = (fn) => {
    const result = fn(ref.current);
    if (!result) return;
    onChange(result.next);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) {
        el.focus();
        el.setSelectionRange(result.cursor, result.cursor);
      }
    });
  };

  const tools = [
    { t: "Bold", label: "B", fn: (el) => applyWrap(el, "**") },
    { t: "Italic", label: "I", fn: (el) => applyWrap(el, "_") },
    { t: "Strikethrough", label: "S", fn: (el) => applyWrap(el, "~~") },
    { t: "Underline", label: "U", fn: (el) => applyWrap(el, "<u>", "</u>") },
    { t: "Link", label: "Link", fn: (el) => applyWrap(el, "[", "](https://)") },
    { t: "Inline code", label: "</>", fn: (el) => applyWrap(el, "`") },
    { t: "Bullet list", label: "• List", fn: (el) => applyLinePrefix(el, "- ") },
    { t: "Numbered list", label: "1.", fn: (el) => applyLinePrefix(el, "", true) },
  ];

  return (
    <div>
      {label ? <span className={LABEL_CLS}>{label}</span> : null}
      <div className="mt-1.5 overflow-hidden rounded-lg border border-ocean-200 bg-white">
        <div className="flex flex-wrap items-center gap-0.5 border-b border-ocean-100 bg-ocean-50/40 px-1.5 py-1">
          {tools.map((tool) => (
            <button key={tool.t} type="button" title={tool.t} className={TOOL_BTN} onClick={() => run(tool.fn)}>
              {tool.label}
            </button>
          ))}
          <span className="ml-auto" />
          <button
            type="button"
            className={`${TOOL_BTN} ${showPreview ? "bg-ocean-100 text-ocean-900" : ""}`}
            onClick={() => setShowPreview((prev) => !prev)}
            title="Toggle preview"
          >
            Preview
          </button>
        </div>
        <textarea
          ref={ref}
          rows={rows}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full resize-y bg-ocean-50/40 px-3 py-2 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/70"
        />
        {showPreview ? (
          <div className="border-t border-ocean-100 bg-white px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ocean-700">Preview</p>
            <div
              className="prose-sm mt-1 text-sm leading-relaxed text-ocean-800 [&_a]:text-ocean-700 [&_a]:underline"
              dangerouslySetInnerHTML={{
                __html: normalizeRichTextHtml(value) || '<span class="text-ocean-700">Nothing to preview</span>',
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ConfirmRemoveButton({ title = "Remove this section?", onConfirm }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
      >
        Remove
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="legal-remove-title"
            className="w-full max-w-sm rounded-2xl border border-ocean-200 bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="legal-remove-title" className="text-base font-semibold text-ocean-950">
              {title}
            </h3>
            <p className="mt-1.5 text-sm text-ocean-700">This cannot be undone until you discard or save.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 items-center rounded-lg border border-ocean-200 bg-white px-3 text-sm font-semibold text-ocean-700 transition hover:bg-ocean-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onConfirm?.();
                }}
                className="inline-flex h-9 items-center rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white transition hover:bg-rose-700"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function LegalSectionRepeater({ value, onChange }) {
  const items = Array.isArray(value) ? value : [];
  const [openSet, setOpenSet] = useState(() => new Set());

  const toggleOpen = (idx) => {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const update = (idx, patch) => onChange(items.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  const remove = (idx) => {
    onChange(items.filter((_, i) => i !== idx));
    setOpenSet((prev) => {
      const next = new Set();
      for (const i of prev) {
        if (i < idx) next.add(i);
        else if (i > idx) next.add(i - 1);
      }
      return next;
    });
  };
  const add = () => {
    onChange([...items, { heading: "", body: "" }]);
    setOpenSet((prev) => new Set([...prev, items.length]));
  };
  const move = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const copy = [...items];
    [copy[idx], copy[j]] = [copy[j], copy[idx]];
    onChange(copy);
  };

  return (
    <div>
      <span className={LABEL_CLS}>Sections</span>
      <div className="mt-1.5 space-y-2">
        {items.map((item, idx) => {
          const open = openSet.has(idx);
          return (
            <div key={idx} className="overflow-hidden rounded-xl border border-ocean-200 bg-white">
              <div className="flex items-center gap-2 bg-ocean-50/60 px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggleOpen(idx)}
                  className="flex flex-1 items-center gap-2 text-left text-sm font-semibold text-ocean-900"
                >
                  <span className={`transition ${open ? "rotate-90" : ""}`}>▸</span>
                  <span className="truncate">{item.heading || `Section ${idx + 1}`}</span>
                </button>
                <button type="button" onClick={() => move(idx, -1)} className={TOOL_BTN} title="Move up" disabled={idx === 0}>
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  className={TOOL_BTN}
                  title="Move down"
                  disabled={idx === items.length - 1}
                >
                  ↓
                </button>
                <ConfirmRemoveButton onConfirm={() => remove(idx)} />
              </div>
              {open ? (
                <div className="grid gap-3 border-t border-ocean-100 p-3">
                  <TextField label="Heading" value={item.heading} onChange={(heading) => update(idx, { heading })} />
                  <RichTextField label="Body" value={item.body} onChange={(body) => update(idx, { body })} rows={5} />
                </div>
              ) : null}
            </div>
          );
        })}
        <button
          type="button"
          onClick={add}
          className="inline-flex h-9 items-center rounded-lg border border-dashed border-ocean-300 bg-white px-3 text-xs font-semibold text-ocean-700 transition hover:border-ocean-400 hover:bg-ocean-50"
        >
          + Add section
        </button>
      </div>
    </div>
  );
}

function LegalSettings() {
  const { settings, loading, loaded, reload } = useScopeSettings("system");
  const stored = useMemo(
    () => normalizeLegalSettings(settings?.[LEGAL_KEY] ?? LEGAL_DEFAULTS),
    [settings]
  );
  const [draft, setDraft] = useState(stored);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loaded) return;
    setDraft((previous) => (JSON.stringify(previous) === JSON.stringify(stored) ? previous : stored));
  }, [loaded, stored]);

  const isDirty = useMemo(
    () => JSON.stringify(normalizeLegalSettings(draft)) !== JSON.stringify(stored),
    [draft, stored]
  );

  const handleReset = () => {
    setDraft(stored);
    setMessage("");
    setError("");
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await saveLegalSettings(draft);
      await reload();
      setMessage("Legal pages saved.");
    } catch (saveError) {
      setError(saveError?.message || "Failed to save Legal pages.");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !loaded) {
    return <LegalSettingsSkeleton />;
  }

  return (
    <div className="space-y-4">
      {LEGAL_PAGES.map((page) => (
        <div key={page.slug} className="rounded-xl border border-ocean-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-ocean-950">{page.title}</h3>
              <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-ocean-700">
                {LEGAL_PAGE_HINTS[page.slug] ?? "Configure the copy for this legal page."}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <LegalSectionRepeater
              value={draft[page.slug]?.sections}
              onChange={(sections) => {
                setDraft((previous) => ({
                  ...previous,
                  [page.slug]: { sections },
                }));
                setMessage("");
                setError("");
              }}
            />
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ocean-100 pt-4">
        <div className="min-h-5 text-[11px] font-semibold">
          {error ? <span className="text-rose-600">{error}</span> : null}
          {!error && message ? <span className="text-emerald-700">{message}</span> : null}
          {!error && !message && isDirty ? <span className="text-amber-700">Unsaved changes</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={saving || !isDirty}
            className="inline-flex h-9 items-center rounded-lg border border-ocean-200 bg-white px-3 text-xs font-semibold text-ocean-700 transition hover:bg-ocean-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="inline-flex h-9 items-center rounded-lg bg-ocean-600 px-3 text-xs font-semibold text-white transition hover:bg-ocean-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InterviewSchedulingSettings() {
  const { settings, loading, loaded, reload } = useScopeSettings("admin");
  const stored = useMemo(
    () => normalizeInterviewScheduling(settings?.[INTERVIEW_SCHEDULING_KEY] ?? INTERVIEW_SCHEDULING_DEFAULTS),
    [settings]
  );
  const [draft, setDraft] = useState(stored);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loaded) return;
    setDraft((previous) => (JSON.stringify(previous) === JSON.stringify(stored) ? previous : stored));
  }, [loaded, stored]);

  const isDirty = useMemo(
    () => JSON.stringify(normalizeInterviewScheduling(draft)) !== JSON.stringify(stored),
    [draft, stored]
  );

  const patch = (next) => {
    setDraft(next);
    setMessage("");
    setError("");
  };

  const handleReset = () => {
    setDraft(stored);
    setMessage("");
    setError("");
  };

  const handleSave = async () => {
    const invalid = validateInterviewScheduling(draft);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await saveInterviewScheduling(draft);
      await reload();
      setMessage("Interview scheduling briefing saved.");
    } catch (saveError) {
      setError(saveError?.message || "Failed to save interview scheduling.");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !loaded) {
    return <InterviewSchedulingSkeleton />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-[12px] leading-relaxed text-ocean-700">
          This is the briefing card admins see under For Approval → Scheduling. Steps and office
          hours are editable. The Application Number step is required and cannot be removed.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={LABEL_CLS}>
              Card title
              <input
                type="text"
                maxLength={80}
                value={draft.title}
                onChange={(event) => patch({ ...draft, title: event.target.value })}
                className={INTERVIEW_INPUT_CLS}
              />
            </label>
            <label className={LABEL_CLS}>
              Card subtitle
              <input
                type="text"
                maxLength={80}
                value={draft.subtitle}
                onChange={(event) => patch({ ...draft, subtitle: event.target.value })}
                className={INTERVIEW_INPUT_CLS}
              />
            </label>
          </div>

          <div>
            <p className={LABEL_CLS}>Steps</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ocean-700">
              Step numbers update automatically. Locked steps stay in the briefing for every
              application.
            </p>
            <div className="mt-2 space-y-2">
              {draft.steps.map((step, index) => {
                const locked = isApplicationNumberStep(step);
                return (
                  <div
                    key={step.id}
                    className="rounded-xl border border-ocean-200 bg-ocean-50/40 p-3"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-ocean-900">
                        Step {index + 1}
                        {locked ? (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-ocean-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ocean-700">
                            <Lock className="h-3 w-3" aria-hidden />
                            Application Number
                          </span>
                        ) : null}
                      </p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => patch({ ...draft, steps: moveInterviewStep(draft.steps, index, -1) })}
                          disabled={saving || index === 0}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ocean-200 bg-white text-ocean-700 hover:bg-ocean-50 disabled:opacity-40"
                          aria-label={`Move step ${index + 1} up`}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => patch({ ...draft, steps: moveInterviewStep(draft.steps, index, 1) })}
                          disabled={saving || index === draft.steps.length - 1}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ocean-200 bg-white text-ocean-700 hover:bg-ocean-50 disabled:opacity-40"
                          aria-label={`Move step ${index + 1} down`}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => patch({ ...draft, steps: removeInterviewStep(draft.steps, index) })}
                          disabled={saving || locked}
                          title={locked ? "The Application Number step cannot be removed." : "Remove step"}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={locked ? "Application Number step is locked" : `Remove step ${index + 1}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <textarea
                      rows={3}
                      maxLength={400}
                      value={step.body}
                      onChange={(event) => {
                        const steps = draft.steps.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, body: event.target.value } : item
                        );
                        patch({ ...draft, steps });
                      }}
                      placeholder={locked ? "Present your Application Number:" : "Instruction for this step"}
                      className={`${INTERVIEW_INPUT_CLS} min-h-[4.5rem] resize-y`}
                    />
                    {locked ? (
                      <p className="mt-1.5 text-[11px] text-ocean-700">
                        The live application number is always shown after this text and cannot be turned off.
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => patch({ ...draft, steps: addInterviewStep(draft.steps) })}
              disabled={saving || draft.steps.length >= 10}
              className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-ocean-300 bg-white px-3 text-xs font-semibold text-ocean-700 transition hover:border-ocean-400 hover:bg-ocean-50 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add step
            </button>
          </div>

          <div>
            <p className={LABEL_CLS}>Office hours</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <label className={`${LABEL_CLS} sm:col-span-1`}>
                Days
                <input
                  type="text"
                  maxLength={80}
                  value={draft.officeHours.days}
                  onChange={(event) =>
                    patch({
                      ...draft,
                      officeHours: { ...draft.officeHours, days: event.target.value },
                    })
                  }
                  placeholder="Monday - Friday"
                  className={INTERVIEW_INPUT_CLS}
                />
              </label>
              <label className={LABEL_CLS}>
                Start
                <input
                  type="time"
                  value={draft.officeHours.start}
                  onChange={(event) =>
                    patch({
                      ...draft,
                      officeHours: { ...draft.officeHours, start: event.target.value },
                    })
                  }
                  className={INTERVIEW_INPUT_CLS}
                />
              </label>
              <label className={LABEL_CLS}>
                End
                <input
                  type="time"
                  value={draft.officeHours.end}
                  onChange={(event) =>
                    patch({
                      ...draft,
                      officeHours: { ...draft.officeHours, end: event.target.value },
                    })
                  }
                  className={INTERVIEW_INPUT_CLS}
                />
              </label>
            </div>
          </div>
        </div>

        <div>
          <p className={LABEL_CLS}>Preview</p>
          <div
            className="mt-2 rounded-2xl border border-ocean-200 bg-gray-50 p-3"
            style={{
              "--apoyo-primary": "var(--color-ocean-600)",
              "--apoyo-secondary": "var(--color-ocean-500)",
            }}
          >
            <InterviewInstructions
              applicationId={INTERVIEW_SCHEDULING_SAMPLE_APPLICATION_NUMBER}
              config={draft}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ocean-100 pt-3">
        <div className="min-h-5 text-[11px] font-semibold">
          {error ? <span className="text-rose-600">{error}</span> : null}
          {!error && message ? <span className="text-emerald-700">{message}</span> : null}
          {!error && !message && isDirty ? <span className="text-amber-700">Unsaved changes</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={saving || !isDirty}
            className="inline-flex h-9 items-center rounded-lg border border-ocean-200 bg-white px-3 text-xs font-semibold text-ocean-700 transition hover:bg-ocean-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !isDirty}
            className="inline-flex h-9 items-center rounded-lg bg-ocean-600 px-3 text-xs font-semibold text-white transition hover:bg-ocean-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BarangaySettings() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [draftName, setDraftName] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteStep, setDeleteStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await fetchBarangays();
      setRows(next);
    } catch (loadError) {
      setError(loadError?.message || "Failed to load barangays.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => row.name.toLowerCase().includes(needle));
  }, [query, rows]);

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditingName(row.name);
    setMessage("");
    setError("");
  };

  const cancelEdit = () => {
    setEditingId("");
    setEditingName("");
  };

  const handleAdd = async (event) => {
    event.preventDefault();
    const name = normalizeBarangayName(draftName);
    if (!name) {
      setError("Enter a barangay name.");
      return;
    }
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const created = await createBarangay(name);
      setRows((previous) =>
        [...previous.filter((row) => row.id !== created.id), created].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        )
      );
      setDraftName("");
      setMessage(`Added ${created.name}.`);
    } catch (saveError) {
      setError(saveError?.message || "Failed to add barangay.");
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (row) => {
    const name = normalizeBarangayName(editingName);
    if (!name) {
      setError("Enter a barangay name.");
      return;
    }
    if (name === row.name) {
      cancelEdit();
      return;
    }
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const updated = await updateBarangay(row.id, name);
      setRows((previous) =>
        previous
          .map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
      );
      cancelEdit();
      setMessage(`Renamed to ${updated.name}.`);
    } catch (saveError) {
      setError(saveError?.message || "Failed to rename barangay.");
    } finally {
      setBusy(false);
    }
  };

  const openDelete = (row) => {
    setPendingDelete(row);
    setDeleteStep(1);
    setMessage("");
    setError("");
  };

  const closeDelete = () => {
    if (busy) return;
    setPendingDelete(null);
    setDeleteStep(1);
  };

  const handleDelete = async (row) => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await deleteBarangay(row.id);
      setRows((previous) => previous.filter((item) => item.id !== row.id));
      setPendingDelete(null);
      setDeleteStep(1);
      setMessage(`Removed ${row.name} from the catalog. Existing voter and user records were left unchanged.`);
    } catch (saveError) {
      setError(saveError?.message || "Failed to remove barangay.");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !rows.length && !error) {
    return <BarangaySettingsSkeleton />;
  }

  return (
    <div className="rounded-xl border border-ocean-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-ocean-950">Barangay list</h3>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-ocean-700">
            This catalog is for new selections only. Deleting a barangay removes it from this
            list. Voter and user records already saved keep the barangay name they had.
          </p>
        </div>
      </div>

      <form onSubmit={handleAdd} className="mt-4 flex flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-ocean-700">
            Add barangay
          </span>
          <input
            type="text"
            value={draftName}
            onChange={(event) => {
              setDraftName(event.target.value);
              setError("");
              setMessage("");
            }}
            placeholder="e.g. Salawag"
            maxLength={80}
            disabled={busy}
            className="mt-1.5 h-9 w-full rounded-lg border border-ocean-200 bg-white px-3 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/70 focus:border-ocean-400"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !normalizeBarangayName(draftName)}
          className="inline-flex h-9 items-center rounded-lg bg-ocean-600 px-3 text-xs font-semibold text-white transition hover:bg-ocean-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Saving…" : "Add"}
        </button>
      </form>

      <div className="mt-4">
        <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-ocean-700">
          Search
        </label>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by name"
          className="mt-1.5 h-9 w-full rounded-lg border border-ocean-200 bg-ocean-50/60 px-3 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/70 focus:border-ocean-400"
        />
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-ocean-100">
        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_11rem] gap-2 border-b border-ocean-100 bg-ocean-50/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ocean-700">
          <span>Name</span>
          <span className="text-right">Voters</span>
          <span className="text-right">Actions</span>
        </div>
        {filtered.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-ocean-700">
            {rows.length ? "No barangays match this search." : "No barangays yet. Add the first one above."}
          </p>
        ) : (
          <ul className="divide-y divide-ocean-100">
            {filtered.map((row) => {
              const isEditing = editingId === row.id;
              return (
                <li key={row.id} className="grid grid-cols-[minmax(0,1fr)_5.5rem_11rem] items-center gap-2 px-3 py-2">
                  {isEditing ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      maxLength={80}
                      disabled={busy}
                      autoFocus
                      className="h-8 w-full rounded-md border border-ocean-200 px-2 text-sm font-medium text-ocean-900 outline-none focus:border-ocean-400"
                    />
                  ) : (
                    <p className="min-w-0 truncate text-sm font-semibold text-ocean-950">{row.name}</p>
                  )}
                  <p className="text-right text-xs font-semibold text-ocean-700">{formatBarangayCount(row.voterCount)}</p>
                  <div className="flex justify-end gap-1">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleRename(row)}
                          disabled={busy}
                          className="inline-flex h-8 items-center rounded-md bg-ocean-600 px-2 text-[11px] font-semibold text-white hover:bg-ocean-700 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={busy}
                          className="inline-flex h-8 items-center rounded-md border border-ocean-200 bg-white px-2 text-[11px] font-semibold text-ocean-700 hover:bg-ocean-50"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          disabled={busy}
                          className="inline-flex h-8 items-center rounded-md border border-ocean-200 bg-white px-2 text-[11px] font-semibold text-ocean-700 hover:bg-ocean-50 disabled:opacity-50"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => openDelete(row)}
                          disabled={busy}
                          title="Delete from this catalog. Existing voter and user records keep their barangay name."
                          className="inline-flex h-8 items-center rounded-md border border-rose-200 bg-white px-2 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-3 min-h-5 text-[11px] font-semibold">
        {error ? <span className="text-rose-600">{error}</span> : null}
        {!error && message ? <span className="text-emerald-700">{message}</span> : null}
        {!error && !message ? (
          <span className="font-medium text-ocean-700">
            {formatBarangayCount(rows.length)} barangay{rows.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      {pendingDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={closeDelete}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="barangay-delete-title"
            className="w-full max-w-sm rounded-2xl border border-rose-200 bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="barangay-delete-title" className="text-base font-semibold text-rose-900">
              Remove {pendingDelete.name}?
            </h3>
            {deleteStep === 1 ? (
              <>
                <p className="mt-1.5 text-sm text-ocean-700">
                  This deletes <span className="font-semibold">{pendingDelete.name}</span> from the
                  barangay catalog. It will no longer appear for new voter imports or user profile
                  picks.
                </p>
                <p className="mt-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
                  {formatBarangayCount(pendingDelete.voterCount)} linked voter record
                  {Number(pendingDelete.voterCount) === 1 ? "" : "s"}
                </p>
                <p className="mt-2 text-xs text-ocean-700">
                  Existing voter and user records keep the barangay name they already have.
                  Applicant accounts and assistance requests are not deleted.
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeDelete}
                    disabled={busy}
                    className="inline-flex h-9 items-center rounded-lg border border-ocean-200 bg-white px-3 text-sm font-semibold text-ocean-700 transition hover:bg-ocean-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteStep(2)}
                    disabled={busy}
                    className="inline-flex h-9 items-center rounded-lg border border-rose-300 bg-rose-50 px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                  >
                    Continue
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-1.5 text-sm text-rose-800">
                  Final confirmation: permanently delete{" "}
                  <span className="font-semibold">{pendingDelete.name}</span> from the catalog?
                </p>
                <p className="mt-2 text-xs text-rose-700">
                  This cannot be undone. You can add the same name later as a new list item;
                  existing records will not be rewritten.
                </p>
                {error ? (
                  <p className="mt-2 text-xs font-medium text-rose-700" role="alert">
                    {error}
                  </p>
                ) : null}
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteStep(1)}
                    disabled={busy}
                    className="inline-flex h-9 items-center rounded-lg border border-ocean-200 bg-white px-3 text-sm font-semibold text-ocean-700 transition hover:bg-ocean-50 disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(pendingDelete)}
                    disabled={busy}
                    className="inline-flex h-9 items-center rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
                  >
                    {busy ? "Removing…" : "Remove permanently"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SectionCard({ id, title, description, children }) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(var(--system-primary-rgb),0.55)]"
    >
      <div className="border-b border-ocean-100 pb-3">
        <h2 className="text-lg font-semibold tracking-tight text-ocean-950">{title}</h2>
        {description ? <p className="mt-1 text-sm text-ocean-700">{description}</p> : null}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function SettingsBackLink({ to, label }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-sm font-semibold text-ocean-700 hover:text-ocean-900"
    >
      <ChevronLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}

function SettingsModulePicker({ modules, basePath }) {
  return (
    <div className="grid gap-3">
      {modules.map((item) => (
        <Link
          key={item.id}
          to={`${basePath}/${item.id}`}
          className="group flex items-center gap-3 rounded-2xl border border-ocean-200 bg-ocean-50/50 px-4 py-4 text-left shadow-[0_12px_30px_-24px_rgba(var(--system-primary-rgb),0.55)] transition hover:border-ocean-300 hover:bg-white"
        >
          <span
            className="grid size-12 shrink-0 place-items-center rounded-xl border border-ocean-100 bg-white text-2xl shadow-sm"
            aria-hidden
          >
            {item.emoji}
          </span>
          <span className="min-w-0 flex-1 text-base font-semibold tracking-tight text-ocean-950">
            {item.title}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-ocean-400 transition group-hover:text-ocean-700" aria-hidden />
        </Link>
      ))}
    </div>
  );
}

function renderServiceModule(module) {
  if (module.id === "interview-scheduling") {
    return (
      <SectionCard
        id="interview-scheduling"
        title="Interview Scheduling"
        description={module.description}
      >
        <InterviewSchedulingSettings />
      </SectionCard>
    );
  }
  if (module.id === "legal") {
    return (
      <SectionCard id="legal" title="Legal" description={module.description}>
        <LegalSettings />
      </SectionCard>
    );
  }
  if (module.id === "barangays") {
    return (
      <SectionCard id="barangays" title="Barangays" description={module.description}>
        <BarangaySettings />
      </SectionCard>
    );
  }
  return null;
}

export function ServiceSettings() {
  const { moduleId } = useParams();
  const location = useLocation();
  const module = MODULES.find((item) => item.id === moduleId) || null;

  useSuperadminHeaderTitle(module ? `Settings · Service · ${module.title}` : "");

  const hashId = String(location.hash || "").replace(/^#/, "").trim();
  if (hashId && MODULES.some((item) => item.id === hashId)) {
    return (
      <Navigate
        to={{
          pathname: `${SERVICE_SETTINGS_PATH}/${hashId}`,
          search: location.search,
          hash: "",
        }}
        replace
      />
    );
  }
  if (hashId) {
    return (
      <Navigate
        to={{ pathname: location.pathname, search: location.search, hash: "" }}
        replace
      />
    );
  }
  if (moduleId && !module) {
    return <Navigate to={SERVICE_SETTINGS_PATH} replace />;
  }

  if (module) {
    return (
      <div className="space-y-5">
        <SettingsBackLink to={SERVICE_SETTINGS_PATH} label="Back to Service settings" />
        {renderServiceModule(module)}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(var(--system-primary-rgb),0.7)]">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-700">Settings</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ocean-950">
          Service settings
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-ocean-700">
          Controls for interview scheduling, public Legal pages, and the barangay list.
        </p>
      </section>
      <SettingsModulePicker modules={MODULES} basePath={SERVICE_SETTINGS_PATH} />
    </div>
  );
}

export default ServiceSettings;
