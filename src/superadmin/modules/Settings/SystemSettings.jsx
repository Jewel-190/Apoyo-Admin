import { useEffect, useMemo, useRef, useState } from "react";
import { useScopeSettings } from "../../../shared/context/SettingsContext";
import {
  LOGO_BANNER_DEFAULTS,
  LOGO_BANNER_FIELDS,
  LOGO_BANNER_KEY,
  pickDasmaFields,
  saveLogoAndBanner,
  uploadBrandingAsset,
} from "../../../shared/lib/brandingAssets";
import {
  SYSTEM_THEME_DEFAULTS,
  SYSTEM_THEME_KEY,
  buildOceanScale,
  buildSystemThemeCssVars,
  normalizeHexColor,
  saveSystemTheme,
  tryParseHexColor,
} from "../../../shared/lib/systemTheme";

const SECTIONS = [
  { id: "general", title: "General" },
];

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
      {hint ? <p className="mt-1 text-[11px] leading-snug text-ocean-700">{hint}</p> : null}
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
          <p className="mt-1 text-[11px] text-ocean-700">
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
  const stored = pickDasmaFields(settings?.[LOGO_BANNER_KEY] ?? LOGO_BANNER_DEFAULTS);
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
    () => JSON.stringify(pickDasmaFields(draft)) !== JSON.stringify(stored),
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
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-ocean-700">
            Upload Dasmariñas branding used across Admin, Superadmin, and Login. Apoyo assets stay
            fixed in the app. Changes apply live after Save (and on reload via a local cache).
          </p>
        </div>
        {loading && !loaded ? (
          <p className="text-[11px] font-semibold text-ocean-700">Loading…</p>
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

function SystemThemeModule() {
  const { settings, loading, loaded, reload } = useScopeSettings("system");
  const stored = settings?.[SYSTEM_THEME_KEY] ?? SYSTEM_THEME_DEFAULTS;
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

  const hexDigits = String(draft.primary_color || "").replace(/#/g, "");
  const committed = tryParseHexColor(draft.primary_color);
  const parsed = hexDigits.length === 6 ? committed : null;
  const primary = parsed || normalizeHexColor(stored.primary_color);
  const hexInvalid = hexDigits.length > 0 && hexDigits.length !== 3 && hexDigits.length !== 6;
  const previewVars = useMemo(() => buildSystemThemeCssVars(primary), [primary]);
  const oceanPreview = useMemo(() => buildOceanScale(primary), [primary]);
  const storedPrimary = normalizeHexColor(stored.primary_color);
  const isDirty = (committed || hexDigits.toLowerCase()) !== storedPrimary;

  const setPrimary = (next, { commit = false } = {}) => {
    const typed = String(next ?? "");
    const nextParsed = tryParseHexColor(typed);
    setDraft({
      primary_color: commit && nextParsed ? nextParsed : typed,
    });
    setMessage("");
    setError("");
  };

  const handleHexChange = (raw) => {
    const cleaned = String(raw || "").replace(/[^#0-9a-fA-F]/g, "");
    const digits = cleaned.replace(/#/g, "");
    setPrimary(`#${digits.slice(0, 6)}`);
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
      if (!committed) {
        setError("Enter a valid hex color (e.g. #0B8F8B).");
        return;
      }
      await saveSystemTheme({ primary_color: committed });
      await reload();
      setMessage("System theme saved.");
    } catch (saveError) {
      setError(saveError?.message || "Failed to save system theme.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-ocean-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-ocean-950">Theme</h3>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-ocean-700">
            Set one primary color. Superadmin and Login share the same derived palette
            and a tight same-hue gradient — nothing is hardcoded in the UI chrome.
          </p>
        </div>
        {loading && !loaded ? (
          <p className="text-[11px] font-semibold text-ocean-700">Loading…</p>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <div className="rounded-xl border border-ocean-100 bg-ocean-50/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ocean-700">
            Primary color
          </p>
          <p className="mt-1 text-[11px] leading-snug text-ocean-700">
            Pick a color or type a hex code. This is the only value stored; shades and
            gradients are computed in the app.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <label className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-ocean-200 bg-white shadow-sm">
              <input
                type="color"
                value={primary}
                onChange={(event) => setPrimary(event.target.value, { commit: true })}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="Pick primary color"
              />
              <span className="block size-full" style={{ background: primary }} />
            </label>
            <div className="min-w-0 flex-1">
              <input
                type="text"
                value={draft.primary_color || ""}
                onChange={(event) => handleHexChange(event.target.value)}
                onBlur={() => {
                  const next = tryParseHexColor(draft.primary_color) || primary;
                  setPrimary(next, { commit: true });
                }}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                maxLength={7}
                placeholder="#0B8F8B"
                aria-label="Primary color hex"
                aria-invalid={hexInvalid}
                className="h-9 w-full rounded-lg border border-ocean-200 bg-white px-2.5 font-mono text-xs font-semibold uppercase text-ocean-900 outline-none transition focus:border-ocean-400 focus:ring-2 focus:ring-ocean-200/70"
              />
              <p className="mt-1 text-[11px] text-ocean-700">
                {hexInvalid
                  ? "Keep typing a 3- or 6-digit hex code (e.g. #0B8F8B)."
                  : "Choose through color picker or type or paste a hex code."}
              </p>
            </div>
          </div>
        </div>

        <div
          className="rounded-xl border border-ocean-100 bg-white p-3"
          style={previewVars}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ocean-700">
            Live preview
          </p>
          <div
            className="mt-3 h-10 rounded-lg"
            style={{ background: "var(--system-brand-gradient)" }}
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.entries(oceanPreview).map(([step, hex]) => (
              <div key={step} className="min-w-[3.25rem] flex-1">
                <div
                  className="h-8 rounded-md border border-black/5"
                  style={{ background: hex }}
                  title={`ocean-${step}: ${hex}`}
                />
                <p className="mt-1 text-center text-[10px] font-semibold text-ocean-700">{step}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-ocean-700">
            Preview uses the same derivation as Superadmin and Login.
          </p>
        </div>
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
            disabled={saving || !isDirty || hexDigits.length !== 6 || !committed}
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
          <p className="shrink-0 px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ocean-700">
            On this page
          </p>
          <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">{renderTocItems("desk")}</ul>
        </nav>
      </aside>

      <div className="space-y-5">
        <nav
          aria-label="On this page"
          className="rounded-2xl border border-ocean-200 bg-white p-2.5 shadow-[0_12px_30px_-24px_rgba(var(--system-primary-rgb),0.55)] lg:hidden"
        >
          <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ocean-700">
            On this page
          </p>
          <ul className="space-y-0.5">{renderTocItems("mobile")}</ul>
        </nav>

        <section className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(var(--system-primary-rgb),0.7)]">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-700">Settings</p>
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
            <SystemThemeModule />
          </SectionCard>
        </div>
      </div>
    </>
  );
}

export default SystemSettings;
