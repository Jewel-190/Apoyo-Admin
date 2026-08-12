import { useEffect, useMemo, useRef, useState } from "react";
import { useScopeSettings } from "../../../shared/context/SettingsContext";
import {
  LOGO_BANNER_DEFAULTS,
  LOGO_BANNER_FIELDS,
  LOGO_BANNER_KEY,
  saveLogoAndBanner,
  uploadBrandingAsset,
} from "../../../shared/lib/brandingAssets";

const SECTIONS = [
  { id: "general", title: "General" },
  { id: "mobile", title: "Mobile" },
  { id: "admin", title: "Admin" },
  { id: "super-admin", title: "Super Admin" },
];

function SectionCard({ id, title, description, children }) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(10,70,111,0.55)]"
    >
      <div className="border-b border-ocean-100 pb-3">
        <h2 className="text-lg font-semibold tracking-tight text-ocean-950">{title}</h2>
        {description ? <p className="mt-1 text-sm text-ocean-600">{description}</p> : null}
      </div>
      <div className={`mt-4 space-y-4 ${children ? "" : "min-h-[70vh]"}`}>{children}</div>
    </section>
  );
}

function BrandingImageField({ label, hint, value, onChange }) {
  const [broken, setBroken] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const canPreview = Boolean(value && /^https?:\/\//i.test(String(value).trim()));

  useEffect(() => setBroken(false), [value]);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const url = await uploadBrandingAsset(file);
      onChange(url);
    } catch (error) {
      setUploadError(error?.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-xl border border-ocean-100 bg-ocean-50/40 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ocean-700">{label}</p>
      {hint ? <p className="mt-1 text-[11px] leading-snug text-ocean-500">{hint}</p> : null}
      <div className="mt-3 flex items-center gap-3">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-ocean-200 bg-white">
          {value && !broken && canPreview ? (
            <img
              src={value}
              alt=""
              className="max-h-full max-w-full object-contain object-center"
              onError={() => setBroken(true)}
            />
          ) : (
            <svg
              className="size-6 text-ocean-300"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <label
              className={`inline-flex h-9 cursor-pointer items-center rounded-lg border border-ocean-200 bg-white px-3 text-xs font-semibold text-ocean-700 transition hover:border-ocean-300 hover:bg-ocean-50 ${
                uploading ? "cursor-wait opacity-60" : ""
              }`}
            >
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg"
                className="hidden"
                onChange={handleFile}
                disabled={uploading}
              />
              {uploading ? "Uploading…" : value ? "Replace image" : "Upload image"}
            </label>
            {value ? (
              <button
                type="button"
                onClick={() => onChange("")}
                className="inline-flex h-9 items-center rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
              >
                Remove
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] text-ocean-500">
            PNG, JPG, WEBP, or SVG up to 10 MB. Shown at a fixed height without stretching.
          </p>
          {uploadError ? (
            <p className="mt-1 text-[11px] font-semibold text-rose-600">{uploadError}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LogoAndBannerModule() {
  const { settings, loading, loaded, reload } = useScopeSettings("system");
  const stored = settings?.[LOGO_BANNER_KEY] ?? LOGO_BANNER_DEFAULTS;
  const [draft, setDraft] = useState(stored);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loaded) return;
    setDraft((previous) =>
      JSON.stringify(previous) === JSON.stringify(stored) ? previous : stored
    );
  }, [loaded, stored]);

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(stored),
    [draft, stored]
  );

  const setField = (key, value) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setMessage("");
    setError("");
  };

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
      await saveLogoAndBanner(draft);
      await reload();
      setMessage("Logo and banner settings saved.");
    } catch (saveError) {
      setError(saveError?.message || "Failed to save logo and banner settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-ocean-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-ocean-950">Logo and Banner</h3>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-ocean-600">
            Upload platform branding images used across Admin, Super Admin, and the Login header.
          </p>
        </div>
        {loading && !loaded ? (
          <p className="text-[11px] font-semibold text-ocean-500">Loading…</p>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {LOGO_BANNER_FIELDS.map((field) => (
          <BrandingImageField
            key={field.key}
            label={field.label}
            hint={field.hint}
            value={draft[field.key] || ""}
            onChange={(next) => setField(field.key, next)}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-ocean-100 pt-4">
        <div className="min-h-5 text-[11px] font-semibold">
          {error ? <span className="text-rose-600">{error}</span> : null}
          {!error && message ? <span className="text-emerald-700">{message}</span> : null}
          {!error && !message && isDirty ? (
            <span className="text-amber-700">Unsaved changes</span>
          ) : null}
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

export function SystemSettings() {
  const contentRef = useRef(null);
  const [activeId, setActiveId] = useState(SECTIONS[0].id);

  const sectionIds = useMemo(() => SECTIONS.map((section) => section.id), []);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return undefined;
    const nodes = sectionIds
      .map((id) => root.querySelector(`#${CSS.escape(id)}`))
      .filter(Boolean);
    if (!nodes.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target?.id) setActiveId(visible[0].target.id);
      },
      { root: null, rootMargin: "-20% 0px -55% 0px", threshold: [0.08, 0.2, 0.4] }
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [sectionIds]);

  const handleTocClick = (event, id) => {
    event.preventDefault();
    const target = contentRef.current?.querySelector(`#${CSS.escape(id)}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#${id}`
    );
  };

  const renderTocItems = (keyPrefix) =>
    SECTIONS.map((section) => {
      const isActive = activeId === section.id;
      return (
        <li key={`${keyPrefix}-${section.id}`}>
          <a
            href={`#${section.id}`}
            onClick={(event) => handleTocClick(event, section.id)}
            className={`block truncate rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors ${
              isActive
                ? "bg-ocean-600 text-white shadow-sm"
                : "text-ocean-700 hover:bg-ocean-50 hover:text-ocean-950"
            }`}
          >
            {section.title}
          </a>
        </li>
      );
    });

  return (
    <>
      <aside
        className="fixed bottom-0 top-16 z-20 hidden w-[var(--settings-toc-w)] flex-col border-r border-ocean-200 bg-white lg:flex"
        style={{ left: "var(--superadmin-sidebar-w)" }}
      >
        <nav aria-label="On this page" className="flex h-full flex-col overflow-hidden p-3">
          <p className="shrink-0 px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ocean-500">
            On this page
          </p>
          <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">{renderTocItems("desk")}</ul>
        </nav>
      </aside>

      <div className="space-y-5">
        <nav
          aria-label="On this page"
          className="rounded-2xl border border-ocean-200 bg-white p-2.5 shadow-[0_12px_30px_-24px_rgba(10,70,111,0.55)] lg:hidden"
        >
          <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ocean-500">
            On this page
          </p>
          <ul className="space-y-0.5">{renderTocItems("mobile")}</ul>
        </nav>

        <section className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(10,70,111,0.7)]">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-600">Settings</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ocean-950">
            System settings
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-ocean-700">
            Platform-wide configuration.
          </p>
        </section>

        <div ref={contentRef} className="space-y-4">
          <SectionCard
            id="general"
            title="General"
            description="Shared platform branding and identity settings."
          >
            <LogoAndBannerModule />
          </SectionCard>
          <SectionCard id="mobile" title="Mobile" />
          <SectionCard id="admin" title="Admin" />
          <SectionCard id="super-admin" title="Super Admin" />
        </div>
      </div>
    </>
  );
}

export default SystemSettings;
