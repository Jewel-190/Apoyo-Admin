/**
 * Create / edit assistance categories (`assistance_categories`).
 * Live catalog visibility is controlled only by `active` (archive sets active = false).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatAssistanceLineTitle } from "../../../shared/lib/assistanceCategoryDisplay.js";
import { getSystemThemeSnapshot } from "../../../shared/lib/systemTheme.js";
import {
  cmsCategoryArchive,
  cmsCategoryCreate,
  cmsCategoryUpdate,
} from "../../../shared/lib/superAdminServicesApi.js";
import {
  buildBlendedAdminPaletteFromSeeds,
  normalizeThemeJsonHex,
} from "../../../shared/lib/themeJsonPalette.js";
import {
  buildAssistanceCategoryTheme,
  defaultAccentHexForSlug,
  parseThemeAccentFromDb,
} from "../../../shared/lib/assistanceCategoryTheme.js";
import { ArchiveConfirmDialog } from "./ServiceManagement.jsx";

class ModalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
          <p className="text-sm font-semibold text-rose-900">Something went wrong</p>
          <p className="mt-1 text-xs text-rose-800">
            {this.state.error?.message || "Unexpected error while opening the modal."}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

function CatalogSaveProgressDialog({ open, title, verb, entityName }) {
  if (!open) return null;
  const safeName = (entityName || "").trim() || "Untitled assistance";

  return (
    <div
      className="fixed inset-0 z-[106] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assistance-save-progress-title"
      aria-busy="true"
    >
      <div className="w-full max-w-md rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_20px_45px_-24px_rgba(var(--system-primary-rgb),0.6)]">
        <div className="flex flex-col items-center px-2 py-6 text-center">
          <div
            className="size-11 animate-spin rounded-full border-[3px] border-ocean-200 border-t-ocean-600"
            aria-hidden
          />
          <h3 id="assistance-save-progress-title" className="mt-4 text-lg font-semibold text-ocean-950">
            {title}
            </h3>
          <p className="mt-2 text-sm leading-relaxed text-ocean-700">
            {verb}{" "}
            <span className="font-semibold text-ocean-900">&ldquo;{safeName}&rdquo;</span> to the catalog.
            Please keep this window open.
          </p>
        </div>
      </div>
    </div>
  );
}

const slugify = (text) =>
  String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 64);

function emptyForm() {
  return {
    assistanceName: "",
    description: "",
    themeColor: getSystemThemeSnapshot().primaryColor,
  };
}

function buildThemeJsonPayload(slug, singleColor) {
  const base = normalizeThemeJsonHex(singleColor);
  if (!base) return {};

  const palette = buildBlendedAdminPaletteFromSeeds([base]) ?? {};
  const mobile = buildAssistanceCategoryTheme(slug, base);

  return {
    ...palette,
    accent: base,
    homeCardStripeGradient: mobile.homeCardStripeGradient,
    statusCardHeaderGradient: mobile.statusCardHeaderGradient,
    homeChipActiveGradient: mobile.homeChipActiveGradient,
    home_card_stripe_gradient: mobile.homeCardStripeGradient,
    status_card_header_gradient: mobile.statusCardHeaderGradient,
    home_chip_active_gradient: mobile.homeChipActiveGradient,
  };
}

function pickThemeColor(themeJson, slug) {
  return (
    parseThemeAccentFromDb(themeJson) ||
    defaultAccentHexForSlug(slug) ||
    getSystemThemeSnapshot().primaryColor
  );
}

function formFromCategory(category) {
  return {
    assistanceName: category?.assistanceName ?? "",
    description: category?.description ?? "",
    themeColor: pickThemeColor(category?.themeJson, category?.slug),
  };
}

export function AssistanceManagement({
  open,
  category = null,
  serviceCount = 0,
  onClose,
  onSaved,
}) {
  const isEdit = Boolean(category?.uuid);

  const [form, setForm] = useState(emptyForm());
  const [isSaving, setIsSaving] = useState(false);
  const [savePhase, setSavePhase] = useState(null);
  const [error, setError] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);

  const reset = useCallback(() => setForm(emptyForm()), []);

  useEffect(() => {
    if (!open) return;
    setForm(isEdit ? formFromCategory(category) : emptyForm());
    setError("");
    setArchiveOpen(false);
    setSavePhase(null);
  }, [open, isEdit, category?.uuid, category?.assistanceName, category?.description, category?.slug, category?.themeJson]);

  const slugPreview = useMemo(() => {
    if (isEdit && category?.slug) return category.slug;
    return slugify(form.assistanceName) || "category";
  }, [isEdit, category?.slug, form.assistanceName]);

  const displayTitlePreview = formatAssistanceLineTitle(form.assistanceName);
  const assistanceNameTrimmed = form.assistanceName.trim();
  const disabled = isSaving || !assistanceNameTrimmed;
  const safeName = assistanceNameTrimmed || (isEdit ? category?.assistanceName : "") || "Untitled assistance";

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    if (disabled) return;

    setError("");
    setSavePhase(isEdit ? "update" : "create");
    setIsSaving(true);
    try {
      const themeSlug = isEdit ? category.slug : slugify(assistanceNameTrimmed) || "category";
      const themeJson = buildThemeJsonPayload(themeSlug, form.themeColor);
      const description = form.description.trim() || null;

      if (isEdit) {
        await cmsCategoryUpdate({
          categoryId: category.uuid,
          assistance_name: assistanceNameTrimmed,
          description,
          theme_json: themeJson,
        });
        await Promise.resolve(onSaved?.(category.slug));
      } else {
        const result = await cmsCategoryCreate({
          assistance_name: assistanceNameTrimmed,
          description,
          theme_json: themeJson,
        });
        await Promise.resolve(onSaved?.(result?.slug || themeSlug));
      }

      onClose?.();
      reset();
    } catch (e) {
      setError(
        e?.message ||
          (isEdit ? "Failed to update assistance." : "Failed to create assistance."),
      );
    } finally {
      setIsSaving(false);
      setSavePhase(null);
    }
  };

  const handleArchive = async () => {
    if (!isEdit || !category?.uuid) return;

    setError("");
    setSavePhase("archive");
    setIsSaving(true);
    try {
      await cmsCategoryArchive(category.uuid);
      await Promise.resolve(onSaved?.(null));
      setArchiveOpen(false);
      onClose?.();
      reset();
    } catch (e) {
      setError(e?.message || "Failed to archive assistance category.");
    } finally {
      setIsSaving(false);
      setSavePhase(null);
    }
  };

  const handleClose = () => {
    if (isSaving) return;
    onClose?.();
    reset();
  };

  if (!open) return null;

  const showSaveProgress = isSaving && savePhase && savePhase !== "archive";
  const progressTitle = savePhase === "update" ? "Saving assistance…" : "Creating assistance…";
  const progressVerb = savePhase === "update" ? "Saving" : "Adding";

  return (
    <>
      <div className="fixed inset-0 z-[75] flex h-[100dvh] w-screen items-center justify-center overflow-hidden bg-ocean-950/45 p-4 backdrop-blur-[2px]">
        <div
          className="flex max-h-[min(92vh,900px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-ocean-200 bg-white shadow-[0_24px_60px_-24px_rgba(var(--system-primary-rgb),0.85)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="assistance-modal-title"
          aria-busy={isSaving}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ocean-100 px-5 py-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ocean-700">Catalog</p>
              <h3 id="assistance-modal-title" className="truncate text-lg font-semibold leading-tight text-ocean-950">
                {isEdit ? "Edit assistance" : "Create assistance"}
          </h3>
        </div>
        <button
          type="button"
              onClick={handleClose}
              disabled={isSaving}
              className="inline-flex h-8 shrink-0 items-center rounded-lg border border-ocean-200 bg-ocean-50 px-2.5 text-xs font-semibold text-ocean-800 transition hover:border-ocean-300 hover:bg-ocean-100 disabled:opacity-60"
        >
          Close
        </button>
      </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <ModalErrorBoundary>
              <div className="w-full space-y-2">
                <label className="block space-y-1.5 text-sm font-semibold text-ocean-900">
                  Assistance name
                  <input
                    type="text"
                    value={form.assistanceName}
                    onChange={(event) => update("assistanceName", event.target.value)}
                    placeholder="e.g. Medical"
                    disabled={isSaving}
                    className="h-10 w-full rounded-xl border border-ocean-200 bg-ocean-50/60 px-4 text-sm font-medium text-ocean-900 outline-none focus:border-ocean-400 disabled:opacity-60"
                  />
                </label>
                <p className="text-xs text-ocean-700">
                  Shown as <span className="font-semibold">{displayTitlePreview}</span>
                </p>

                <div className="rounded-2xl border border-ocean-100 bg-ocean-50/40 p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ocean-700">Identifier</p>
                  <p className="mt-1 text-sm font-semibold text-ocean-950">{slugPreview}</p>
                  <p className="mt-1 text-xs text-ocean-700">
                    {isEdit
                      ? "Slug is fixed after creation."
                      : "Generated automatically from the assistance name."}
                  </p>
                </div>

                <label className="block space-y-1.5 text-sm font-semibold text-ocean-900">
                  Description
                  <textarea
                    value={form.description}
                    onChange={(event) => update("description", event.target.value)}
                    placeholder="Description of the assistance."
                    disabled={isSaving}
                    rows={4}
                    className="w-full resize-none rounded-xl border border-ocean-200 bg-ocean-50/60 px-4 py-3 text-sm font-medium text-ocean-900 outline-none focus:border-ocean-400 disabled:opacity-60"
                  />
                </label>

                <div className="rounded-2xl border border-ocean-100 bg-ocean-50/40 p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ocean-700">Theme</p>
                  <p className="mt-1 text-xs text-ocean-700">Choose one base color.</p>
                  <div className="mt-3">
                    <label className="block space-y-1 text-xs font-semibold text-ocean-800">
                      Base color
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={form.themeColor}
                          onChange={(event) => update("themeColor", event.target.value)}
                          disabled={isSaving}
                          className="size-11 shrink-0 cursor-pointer rounded-xl border border-ocean-200 bg-white p-0.5"
                        />
                        <input
                          type="text"
                          value={form.themeColor}
                          onChange={(event) => update("themeColor", event.target.value)}
                          disabled={isSaving}
                          className="h-11 min-w-0 flex-1 rounded-xl border border-ocean-200 bg-white px-3 font-mono text-xs text-ocean-900 outline-none focus:border-ocean-400"
                        />
                      </div>
                    </label>
                  </div>
                  </div>

                {isEdit ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-3.5">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-rose-700">
                      Danger zone
                    </p>
                    <p className="mt-1 text-sm text-rose-800">
                      Archive sets <span className="font-semibold">active</span> to false for this category and
                      all of its services. Archived items are hidden from the CMS and from new mobile
                      applications. Existing requests, logs, and notifications keep the names they already have.
                    </p>
                    <button
                      type="button"
                      onClick={() => setArchiveOpen(true)}
                      disabled={isSaving}
                      className="mt-3 inline-flex h-10 items-center rounded-lg border border-rose-300 bg-rose-50 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                    >
                      Archive entire category…
                    </button>
                  </div>
                ) : null}
              </div>
            </ModalErrorBoundary>
            </div>

          {!isSaving ? (
            <div className="shrink-0 border-t border-ocean-100 px-5 py-3">
              {error ? <p className="mb-2 text-xs font-medium text-rose-600">{error}</p> : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs font-medium text-ocean-700">
                  {isEdit
                    ? "Saved changes update the live catalog used by the mobile app."
                    : "After creating, add services inside this category."}
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isSaving}
                    className="inline-flex h-9 items-center rounded-lg border border-ocean-200 bg-white px-3.5 text-sm font-semibold text-ocean-700 transition hover:bg-ocean-50 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                <button
                  type="button"
                    onClick={handleSubmit}
                    disabled={disabled}
                    className={`inline-flex h-9 items-center rounded-lg px-3.5 text-sm font-semibold text-white transition ${
                      disabled ? "cursor-not-allowed bg-ocean-300" : "bg-ocean-600 hover:bg-ocean-700"
                    }`}
                  >
                    {isEdit ? "Save changes" : "Create Assistance"}
                </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <CatalogSaveProgressDialog
        open={showSaveProgress}
        title={progressTitle}
        verb={progressVerb}
        entityName={safeName}
      />

      {isEdit ? (
        <ArchiveConfirmDialog
          open={archiveOpen}
          onClose={() => !isSaving && setArchiveOpen(false)}
          onConfirm={handleArchive}
          entityType="category"
          entityName={assistanceNameTrimmed || category?.assistanceName}
          serviceCount={serviceCount}
          isProcessing={isSaving && savePhase === "archive"}
        />
      ) : null}
    </>
  );
}
