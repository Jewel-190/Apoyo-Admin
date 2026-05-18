/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Trash2, X } from "lucide-react";
import { getHomeCardStripeGradient } from "../../../shared/lib/assistanceCategoryTheme.js";

export const editorFonts = [
  { label: "Inter", value: "Inter, ui-sans-serif, system-ui, sans-serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times", value: '"Times New Roman", serif' },
  { label: "Courier", value: '"Courier New", monospace' },
];

export const defaultEditorFont = editorFonts[0].value;

export const createEmptyTip = () => ({ title: "", description: "" });
export const createEmptyRequirement = () => ({
  title: "",
  tips: [createEmptyTip()],
  sampleDocumentImage: "",
  sampleDocumentName: "",
});

/** Fixed mobile attachment slot — not editable in CMS. */
export const DEFAULT_ADDITIONAL_ATTACHMENT = {
  title: "Additional attachment",
  slotKey: "attachment",
  fileType: "attachment_file",
};

export const normalizeTips = (tips) => {
  const normalized = (tips ?? []).map((tip) =>
    typeof tip === "string"
      ? { title: tip, description: "" }
      : { title: tip?.title ?? "", description: tip?.description ?? "" }
  );
  return normalized.length ? normalized : [createEmptyTip()];
};

export const normalizeRequirements = (requirements) => {
  const normalized = (requirements ?? []).map((req) => ({
    title: req?.title ?? "",
    tips: normalizeTips(req?.tips),
    sampleDocumentImage: req?.sampleDocumentImage ?? "",
    sampleDocumentName: req?.sampleDocumentName ?? "",
  }));
  return normalized.length ? normalized : [createEmptyRequirement()];
};

export const RADIO_SELECTION_VERSION = 1;

export const createEmptyRadioOption = () => ({ label: "" });

export const createEmptyRadioStep = () => ({
  prompt: "",
  options: [createEmptyRadioOption()],
});

/** Form state for `assistance_services.radio_selection` (JSONB). */
export const createEmptyRadioSelectionForm = () => ({
  enabled: false,
  reminderHtml: "",
  steps: [],
});

/** DB JSON → CMS form. */
export function parseRadioSelectionForm(raw) {
  if (!raw || typeof raw !== "object") return createEmptyRadioSelectionForm();
  const o = raw;
  if (o.version !== RADIO_SELECTION_VERSION || !Array.isArray(o.steps)) {
    return createEmptyRadioSelectionForm();
  }

  const steps = o.steps
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const options = (item.options ?? [])
        .map((opt) => {
          if (typeof opt === "string") return { label: opt };
          if (!opt || typeof opt !== "object") return null;
          const label =
            (typeof opt.label === "string" ? opt.label : "") ||
            (typeof opt.value === "string" ? opt.value : "");
          return label ? { label } : null;
        })
        .filter(Boolean);
      if (!options.length) return null;
      return {
        prompt: typeof item.prompt === "string" ? item.prompt : "",
        options,
      };
    })
    .filter(Boolean);

  if (!steps.length) return createEmptyRadioSelectionForm();

  return {
    enabled: true,
    reminderHtml: typeof o.reminder_html === "string" ? o.reminder_html : "",
    steps,
  };
}

/** CMS form → DB JSON (null when disabled or invalid). */
export function buildRadioSelectionPayload(form) {
  const cfg = form?.radioSelection ?? form;
  if (!cfg?.enabled) return null;

  const steps = (cfg.steps ?? [])
    .map((step) => {
      const prompt = (step?.prompt ?? "").trim();
      const options = (step?.options ?? [])
        .map((opt) => {
          const label = (opt?.label ?? opt?.value ?? "").trim();
          return label || null;
        })
        .filter(Boolean);
      if (!prompt || !options.length) return null;
      return { prompt, options };
    })
    .filter(Boolean);

  if (!steps.length) return null;

  const payload = { version: RADIO_SELECTION_VERSION, steps };
  const reminder = (cfg.reminderHtml ?? "").trim();
  if (reminder) payload.reminder_html = reminder;
  return payload;
}

export function hasUploadedServiceIcon(src) {
  return Boolean(typeof src === "string" && src.trim());
}

/** Neutral placeholder when a service has no uploaded icon yet. */
export function ServiceIconPlaceholder({ className = "size-full", iconClassName = "size-7" }) {
  return (
    <div
      className={`flex items-center justify-center rounded-lg border border-ocean-200/80 bg-gradient-to-br from-ocean-50 via-white to-ocean-100/90 text-ocean-500 ${className}`}
      aria-hidden
    >
      <svg
        className={iconClassName}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      >
        <path
          d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
          strokeLinejoin="round"
        />
        <path d="M9 9h6M9 12.5h4M9 16h5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function ServiceIconDisplay({
  src,
  alt = "",
  imgClassName = "size-full object-contain",
  placeholderClassName = "size-full",
  placeholderIconClassName = "size-7",
}) {
  if (hasUploadedServiceIcon(src)) {
    return <img src={src} alt={alt} className={imgClassName} />;
  }
  return (
    <ServiceIconPlaceholder
      className={placeholderClassName}
      iconClassName={placeholderIconClassName}
    />
  );
}

/** DB jsonb `who_bullets` → CMS string list. */
export function parseWhoBulletsForm(raw) {
  if (!raw) return [""];
  if (Array.isArray(raw)) {
    const items = raw
      .filter((x) => typeof x === "string" && x.trim())
      .map((x) => x.trim());
    return items.length ? items : [""];
  }
  return [""];
}

/** CMS string list → DB jsonb `who_bullets`. */
export function buildWhoBulletsPayload(bullets) {
  return (bullets ?? []).map((b) => (b ?? "").trim()).filter(Boolean);
}

/** Uppercase alphanumeric prefix (2–6 chars) for assistance_services.request_code. */
export function normalizeRequestCodePrefix(input) {
  const cleaned = String(input ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
  return cleaned.length >= 2 ? cleaned : "";
}

/** Suggest a short prefix from a service title when none is set yet. */
export function suggestRequestCodePrefix(serviceName) {
  const words = String(serviceName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "";
  if (words.length === 1) {
    return normalizeRequestCodePrefix(words[0].slice(0, 6));
  }
  return normalizeRequestCodePrefix(words.map((word) => word[0]).join(""));
}

export function makeEmptyServiceForm() {
  return {
    serviceName: "",
    requestCode: "",
    serviceImage: "",
    description: "",
    descriptionFontFamily: defaultEditorFont,
    about: "",
    aboutFontFamily: defaultEditorFont,
    whoBullets: [""],
    requirements: [createEmptyRequirement()],
    additionalAttachment: { ...DEFAULT_ADDITIONAL_ATTACHMENT },
    reminderText: "",
    reminderFontFamily: defaultEditorFont,
    webHeroImage: "",
    webMapLink: "",
    webIntroText: "",
    webOfficeTitle: "",
    radioSelection: createEmptyRadioSelectionForm(),
  };
}

const PlusIcon = () => (
  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
);

const UploadIcon = () => (
  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M12 16V6m0 0-4 4m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20 16.5A3.5 3.5 0 0 1 16.5 20h-9A3.5 3.5 0 0 1 4 16.5" strokeLinecap="round" />
  </svg>
);

const toSafeString = (value) => (value == null ? "" : String(value));

const isHtmlRichText = (text = "") => /<\/?[a-z][\s\S]*>/i.test(toSafeString(text));

const escapeHtml = (text = "") =>
  toSafeString(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const markdownToHtml = (text = "") =>
  escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, "<u>$1</u>")
    .replace(/`([^`]+)`/g, '<code class="rounded bg-slate-100 px-1 font-mono">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="font-semibold text-teal-700 underline">$1</span>')
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");

const normalizeRichTextHtml = (text = "") => {
  const safeText = toSafeString(text);
  if (!safeText) return "";
  return isHtmlRichText(safeText) ? safeText : markdownToHtml(safeText);
};

export const stripRichText = (text = "") => {
  const safeText = toSafeString(text);
  if (!safeText) return "";
  if (typeof document === "undefined") return safeText.replace(/<[^>]*>/g, "");
  const div = document.createElement("div");
  div.innerHTML = normalizeRichTextHtml(safeText);
  return div.textContent || div.innerText || "";
};

const MOBILE_TEAL = "#0B8F8B";
const MOBILE_TEXT_DARK = "#2B2B2B";
const MOBILE_TEXT_MUTED = "#6B7A7A";
const MOBILE_DANGER = "#E45454";

const FIT_SAMPLE_ZOOM_LEVEL = 100;
const SAMPLE_ZOOM_LEVELS = [50, 75, 90, 100, 105, 110, 115, 120, 130, 140, 150, 160, 175, 200];

/** Service icon / hero uploads — raster images and SVG. */
export const ICON_IMAGE_UPLOAD_ACCEPT = "image/*,.svg,image/svg+xml";

export function isUploadableIconImageFile(file) {
  if (!file) return false;
  const type = (file.type || "").toLowerCase();
  if (type === "image/svg+xml" || type.startsWith("image/")) return true;
  return (file.name || "").toLowerCase().endsWith(".svg");
}

function isImageSampleFile(file) {
  if (!file) return false;
  const type = (file.type || "").toLowerCase();
  if (type.startsWith("image/") && type !== "image/svg+xml") return true;
  return false;
}

function SampleAttachmentImage({ doc, onImageClick }) {
  const [displaySrc, setDisplaySrc] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const latestLoadTokenRef = useRef(0);

  useEffect(() => {
    const nextImageUrl = typeof doc?.imageUrl === "string" ? doc.imageUrl : "";
    const loadToken = latestLoadTokenRef.current + 1;
    latestLoadTokenRef.current = loadToken;
    /* eslint-disable react-hooks/set-state-in-effect -- reset preview when URL changes */
    setHasError(false);
    setDisplaySrc("");
    /* eslint-enable react-hooks/set-state-in-effect */

    if (!nextImageUrl) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const preloadedImage = new Image();
    preloadedImage.decoding = "async";
    preloadedImage.src = nextImageUrl;
    preloadedImage.onload = () => {
      if (latestLoadTokenRef.current !== loadToken) return;
      setDisplaySrc(nextImageUrl);
      setIsLoading(false);
    };
    preloadedImage.onerror = () => {
      if (latestLoadTokenRef.current !== loadToken) return;
      setHasError(true);
      setIsLoading(false);
    };
    return () => {
      preloadedImage.onload = null;
      preloadedImage.onerror = null;
    };
  }, [doc?.id, doc?.imageUrl]);

  if (!doc?.imageUrl || hasError) {
    return (
      <div className="flex h-full w-full items-center justify-center px-4 text-center text-sm text-gray-400">
        Image preview is unavailable for this sample.
      </div>
    );
  }

  if (isLoading || !displaySrc) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
        Loading image...
      </div>
    );
  }

  return (
    <img
      key={`${doc?.id || "sample"}-${displaySrc}`}
      src={displaySrc}
      alt={doc.label || doc.fileName || "Sample image"}
      onClick={onImageClick}
      onError={() => setHasError(true)}
      className="h-full w-full cursor-pointer object-contain transition-all duration-200"
    />
  );
}

function RequirementSamplePreviewPanel({ imageUrl, fileName, label, requirementKey, onExpand }) {
  if (!imageUrl) return null;

  const doc = {
    id: requirementKey,
    imageUrl,
    fileName,
    label: label || "Sample image",
  };

  return (
    <div className="h-48 w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
      <div className="flex h-full min-h-0 items-center justify-center">
        <SampleAttachmentImage
          doc={doc}
          onImageClick={(event) => {
            event.stopPropagation();
            onExpand?.();
          }}
        />
      </div>
    </div>
  );
}

function ExpandedSampleImageViewer({ sample, zoom, onZoomChange, onClose }) {
  if (!sample?.url) return null;

  const adjustZoom = (direction) => {
    onZoomChange((prev) => {
      const currentIndex = SAMPLE_ZOOM_LEVELS.indexOf(prev);
      if (currentIndex === -1) return FIT_SAMPLE_ZOOM_LEVEL;
      const nextIndex =
        direction > 0
          ? Math.min(SAMPLE_ZOOM_LEVELS.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex - 1);
      return SAMPLE_ZOOM_LEVELS[nextIndex];
    });
  };

  const handleZoomSelect = (value) => {
    const numericValue = Number(value);
    if (!SAMPLE_ZOOM_LEVELS.includes(numericValue)) {
      onZoomChange(FIT_SAMPLE_ZOOM_LEVEL);
      return;
    }
    onZoomChange(numericValue);
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-1"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative h-[98vh] w-[99vw] rounded-xl border border-white/20 bg-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="absolute left-4 top-4 z-10 max-w-[70vw] rounded-lg border border-white/20 bg-black/55 px-3 py-2">
          <p className="truncate text-sm font-semibold text-white">
            {sample.label || "Sample image"}
          </p>
          {sample.fileName ? (
            <p className="mt-0.5 truncate text-xs text-white/80">{sample.fileName}</p>
          ) : null}
        </div>

        <div className="absolute left-4 top-20 z-10 flex items-center gap-1 rounded-lg border border-white/20 bg-black/55 px-2 py-1.5">
          <button
            type="button"
            onClick={() => adjustZoom(-1)}
            className="rounded p-1 text-white hover:bg-white/10"
            aria-label="Zoom out"
          >
            <Minus className="size-4" />
          </button>
          <select
            value={zoom}
            onChange={(event) => handleZoomSelect(event.target.value)}
            className="rounded border border-white/30 bg-transparent px-2 py-1 text-sm text-white outline-none"
            aria-label="Select zoom level"
          >
            {[FIT_SAMPLE_ZOOM_LEVEL, ...SAMPLE_ZOOM_LEVELS.filter((l) => l !== FIT_SAMPLE_ZOOM_LEVEL)].map(
              (level) => (
                <option key={level} value={level} className="text-black">
                  {level === FIT_SAMPLE_ZOOM_LEVEL ? "Fit (100%)" : `${level}%`}
                </option>
              )
            )}
          </select>
          <button
            type="button"
            onClick={() => adjustZoom(1)}
            className="rounded p-1 text-white hover:bg-white/10"
            aria-label="Zoom in"
          >
            <Plus className="size-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 rounded-full p-2 text-white hover:bg-white/10"
          aria-label="Close fullscreen image"
        >
          <X className="size-5" />
        </button>

        <div className="relative h-full w-full overflow-auto">
          {zoom <= FIT_SAMPLE_ZOOM_LEVEL ? (
            <div className="absolute inset-0 flex items-center justify-center px-6 py-6">
              <img
                src={sample.url}
                alt={sample.label || "Sample image"}
                style={{
                  display: "block",
                  width: "auto",
                  height: "auto",
                  maxWidth: "100%",
                  maxHeight: "100%",
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: "center center",
                }}
                className="block object-contain transition-all duration-150"
              />
            </div>
          ) : (
            <div className="relative min-h-full w-max min-w-full px-6 py-6">
              <img
                src={sample.url}
                alt={sample.label || "Sample image"}
                style={{
                  display: "block",
                  width: `${zoom}%`,
                  maxWidth: "none",
                  height: "auto",
                }}
                className="block origin-top-left transition-all duration-150"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RadioSelectionConfigCard({ config, onChange }) {
  const safe = config ?? createEmptyRadioSelectionForm();

  const patch = (partial) => onChange({ ...safe, ...partial });

  const patchStep = (stepIndex, partial) => {
    const steps = [...(safe.steps ?? [])];
    steps[stepIndex] = { ...steps[stepIndex], ...partial };
    patch({ steps });
  };

  const patchOption = (stepIndex, optionIndex, partial) => {
    const steps = [...(safe.steps ?? [])];
    const options = [...(steps[stepIndex]?.options ?? [])];
    options[optionIndex] = { ...options[optionIndex], ...partial };
    steps[stepIndex] = { ...steps[stepIndex], options };
    patch({ steps });
  };

  const handleToggle = (enabled) => {
    if (!enabled) {
      patch({ enabled: false });
      return;
    }
    patch({
      enabled: true,
      steps: safe.steps?.length ? safe.steps : [createEmptyRadioStep()],
    });
  };

  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-violet-950">Radio selections (mobile preflight)</p>
          <p className="mt-1 text-xs leading-relaxed text-violet-800/90">
            Optional steps shown on the mobile request screen before the user continues. Each choice is saved once
            (same text for display and storage). Stored in{" "}
            <span className="font-mono text-violet-900">assistance_services.radio_selection</span>.
          </p>
        </div>
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-violet-900">
          <input
            type="checkbox"
            checked={!!safe.enabled}
            onChange={(event) => handleToggle(event.target.checked)}
            className="size-4 rounded border-violet-300 text-violet-600 focus:ring-violet-400"
          />
          Enable
        </label>
      </div>

      {safe.enabled ? (
        <div className="mt-4 space-y-4">
          <label className="block space-y-1.5 text-sm font-semibold text-violet-950">
            Preflight reminder (optional HTML)
            <textarea
              rows={3}
              value={safe.reminderHtml ?? ""}
              onChange={(event) => patch({ reminderHtml: event.target.value })}
              placeholder="Shown above the radio steps when set. Supports simple HTML."
              className="w-full resize-none rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-medium text-violet-950 outline-none placeholder:text-violet-500/70 focus:border-violet-400"
            />
          </label>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-violet-800">
              Selection steps
            </p>
            {(safe.steps ?? []).map((step, stepIndex) => (
              <div
                key={`radio-step-${stepIndex}`}
                className="rounded-lg border border-violet-200/80 bg-white p-3"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-violet-900">Step {stepIndex + 1}</p>
                  <button
                    type="button"
                    onClick={() => {
                      const steps = (safe.steps ?? []).filter((_, idx) => idx !== stepIndex);
                      patch({ steps: steps.length ? steps : [createEmptyRadioStep()] });
                    }}
                    className="inline-flex size-8 items-center justify-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                    aria-label={`Remove step ${stepIndex + 1}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>

                <label className="block space-y-1 text-xs font-semibold text-violet-900">
                  Question / prompt
                  <input
                    type="text"
                    value={step.prompt ?? ""}
                    onChange={(event) => patchStep(stepIndex, { prompt: event.target.value })}
                    placeholder="What type of assistance do you need?"
                    className="h-9 w-full rounded-lg border border-violet-200 px-3 text-sm font-medium text-violet-950 outline-none placeholder:text-violet-500/70 focus:border-violet-400"
                  />
                </label>

                <div className="mt-3 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-violet-800">
                    Radio choices
                  </p>
                  {(step.options ?? []).map((opt, optionIndex) => (
                    <div key={`radio-opt-${stepIndex}-${optionIndex}`} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={opt.label ?? opt.value ?? ""}
                        onChange={(event) =>
                          patchOption(stepIndex, optionIndex, { label: event.target.value })
                        }
                        placeholder="Choice label (e.g. Emergency Need)"
                        className="h-9 min-w-0 flex-1 rounded-lg border border-violet-200 bg-violet-50/30 px-3 text-sm font-medium text-violet-950 outline-none placeholder:text-violet-500/70 focus:border-violet-400"
                      />
                      {(step.options?.length ?? 0) > 1 ? (
                        <button
                          type="button"
                          onClick={() => {
                            const options = (step.options ?? []).filter((_, idx) => idx !== optionIndex);
                            patchStep(stepIndex, {
                              options: options.length ? options : [createEmptyRadioOption()],
                            });
                          }}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-violet-200 text-sm font-bold text-violet-700"
                          aria-label={`Remove choice ${optionIndex + 1}`}
                        >
                          -
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      patchStep(stepIndex, {
                        options: [...(step.options ?? []), createEmptyRadioOption()],
                      })
                    }
                    className="inline-flex h-8 w-full items-center justify-center rounded-lg border border-violet-200 bg-violet-50/60 text-xs font-semibold text-violet-800 hover:bg-violet-100"
                  >
                    + Add choice
                  </button>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => patch({ steps: [...(safe.steps ?? []), createEmptyRadioStep()] })}
              className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-violet-300 bg-white px-3 text-xs font-semibold text-violet-800 transition hover:border-violet-400 hover:bg-violet-50"
            >
              + Add selection step
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-violet-800/80">
          When disabled, <span className="font-mono">radio_selection</span> is saved as null and the mobile app skips
          preflight radios for this service.
        </p>
      )}
    </section>
  );
}

function SaveServiceConfirmDialog({
  open,
  serviceName,
  isProcessing,
  variant = "update",
  onClose,
  onConfirm,
}) {
  if (!open) return null;
  const safeName = (serviceName || "").trim() || "Untitled service";
  const isCreate = variant === "create";
  const title = isCreate ? "Add service?" : "Update service?";
  const loadingTitle = isCreate ? "Adding service…" : "Updating service…";
  const confirmLabel = isCreate ? "Add service" : "Update service";

  return (
    <div
      className="fixed inset-0 z-[106] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-service-confirm-title"
      aria-busy={isProcessing}
      onClick={() => !isProcessing && onClose?.()}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_20px_45px_-24px_rgba(10,70,111,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        {isProcessing ? (
          <div className="flex flex-col items-center px-2 py-6 text-center">
            <div
              className="size-11 animate-spin rounded-full border-[3px] border-ocean-200 border-t-ocean-600"
              aria-hidden
            />
            <h3 id="save-service-confirm-title" className="mt-4 text-lg font-semibold text-ocean-950">
              {loadingTitle}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ocean-700">
              {isCreate ? "Adding" : "Saving"}{" "}
              <span className="font-semibold text-ocean-900">&ldquo;{safeName}&rdquo;</span> to the catalog.
              Requirements, samples, and settings can take a little while — please keep this window open.
            </p>
          </div>
        ) : (
          <>
            <h3 id="save-service-confirm-title" className="text-lg font-semibold text-ocean-950">
              {title}
            </h3>
            <p className="mt-2 text-sm text-ocean-700">
              {isCreate ? (
                <>
                  Add <span className="font-semibold text-ocean-900">&ldquo;{safeName}&rdquo;</span> as a new
                  service under this category. It will appear in the live catalog used by the mobile app.
                </>
              ) : (
                <>
                  Apply your changes to{" "}
                  <span className="font-semibold text-ocean-900">&ldquo;{safeName}&rdquo;</span>. This updates the
                  live catalog used by the mobile app.
                </>
              )}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 items-center rounded-lg border border-ocean-200 bg-white px-3 text-sm font-semibold text-ocean-700 hover:bg-ocean-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="inline-flex h-9 items-center rounded-lg bg-ocean-600 px-3 text-sm font-semibold text-white hover:bg-ocean-700"
              >
                {confirmLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DeleteRequirementDialog({ open, requirementTitle, onClose, onConfirm }) {
  if (!open) return null;
  const safeTitle = (requirementTitle || "").trim() || "Untitled requirement";

  return (
    <div
      className="fixed inset-0 z-[105] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-requirement-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_20px_45px_-24px_rgba(10,70,111,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="delete-requirement-title" className="text-lg font-semibold text-ocean-950">
          Delete requirement?
        </h3>
        <p className="mt-2 text-sm text-ocean-700">
          Remove <span className="font-semibold text-ocean-900">&ldquo;{safeTitle}&rdquo;</span> and its tips from
          this service. This cannot be undone until you save.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-lg border border-ocean-200 bg-white px-3 text-sm font-semibold text-ocean-700 hover:bg-ocean-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex h-9 items-center rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-700"
          >
            Delete requirement
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileCheckIcon() {
  return (
    <svg className="size-[18px] shrink-0 text-[#2FA44F]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MobileChevron({ expanded }) {
  return (
    <svg
      className={`size-[18px] shrink-0 text-[#A0A7A7] transition-transform ${expanded ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="m12 16-6-6h12l-6 6Z" />
    </svg>
  );
}

function WhoBulletsField({ bullets, onChange }) {
  const list = bullets?.length ? bullets : [""];

  const patch = (next) => onChange(next.length ? next : [""]);

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold text-ocean-900">Who may avail</p>
        <p className="mt-0.5 text-xs text-ocean-600">
          Shown as bullets on mobile under &ldquo;Who may Avail&rdquo;.
        </p>
      </div>
      <div className="space-y-2">
        {list.map((bullet, index) => (
          <div key={`who-bullet-${index}`} className="flex items-center gap-2">
            <input
              type="text"
              value={bullet}
              onChange={(event) => {
                const next = [...list];
                next[index] = event.target.value;
                patch(next);
              }}
              placeholder="e.g. Residents of Dasmariñas City"
              className="h-9 min-w-0 flex-1 rounded-lg border border-ocean-200 bg-ocean-50/60 px-3 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/80 focus:border-ocean-400"
            />
            {list.length > 1 ? (
              <button
                type="button"
                onClick={() => patch(list.filter((_, idx) => idx !== index))}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ocean-200 bg-white text-sm font-bold text-ocean-700"
                aria-label={`Remove bullet ${index + 1}`}
              >
                -
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => patch([...list, ""])}
        className="inline-flex h-8 w-full items-center justify-center rounded-lg border border-ocean-200 bg-ocean-50/60 text-xs font-semibold text-ocean-800 hover:bg-ocean-100"
      >
        + Add bullet
      </button>
    </div>
  );
}

function RequestInfoMobilePreview({
  formData,
  requirements,
  additionalAttachment,
  categoryTitle,
  categorySlug = "",
  categoryThemeJson = null,
  selectedRequirementIndex,
  selectedTipIndex,
  onSelectRequirement,
  onSelectTip,
  onSampleExpand,
}) {
  const [openReq, setOpenReq] = useState({});

  const cardStripe = useMemo(
    () => getHomeCardStripeGradient(categorySlug, categoryThemeJson),
    [categorySlug, categoryThemeJson]
  );

  const topTitle = categoryTitle || formData.assistanceName || "Assistance";
  const serviceTitle = formData.serviceName || "Service Title";
  const serviceDesc = stripRichText(formData.description || "").trim();
  const aboutBody = stripRichText(formData.about || "").trim();
  const whoList = (formData.whoBullets ?? []).map((b) => (b ?? "").trim()).filter(Boolean);
  const radioForm = formData?.radioSelection;
  const radioReminderHtml = (radioForm?.reminderHtml ?? "").trim();
  const reminderHtml =
    stripRichText(formData.reminderText || "").trim() || radioReminderHtml;
  const hasReminder = !!reminderHtml;

  const visibleRequirements = requirements.filter((r) => r.title?.trim());
  const attachmentTitle = additionalAttachment?.title || DEFAULT_ADDITIONAL_ATTACHMENT.title;

  const radioSteps =
    radioForm?.enabled && Array.isArray(radioForm.steps)
      ? radioForm.steps.filter(
          (step) =>
            (step?.prompt ?? "").trim() &&
            (step?.options ?? []).some((opt) => (opt?.label ?? opt?.value ?? "").trim())
        )
      : [];

  const toggleReq = (index) => {
    setOpenReq((prev) => ({ ...prev, [index]: !prev[index] }));
    onSelectRequirement?.(selectedRequirementIndex === index ? null : index);
  };

  return (
    <div className="mx-auto w-full max-w-[390px]">
      <div className="rounded-[42px] border-[10px] border-[#1b1b1d] bg-[#121316] p-2.5 shadow-2xl">
        <div
          className="relative flex flex-col overflow-hidden rounded-[34px] bg-white"
          style={{ height: "780px", fontFamily: '"SF Pro Rounded", ui-rounded, system-ui, sans-serif' }}
        >
          <div className="absolute left-1/2 top-0 z-10 h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-[#111217]" />

          <div
            className="flex h-[52px] shrink-0 items-center border-b px-2.5"
            style={{ borderColor: "#E9EDED" }}
          >
            <div className="flex size-11 items-center justify-center text-[#2B2B2B]">
              <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p
              className="flex-1 truncate text-center text-base font-bold"
              style={{ color: MOBILE_TEXT_DARK }}
            >
              {topTitle}
            </p>
            <div className="size-11" />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-3">
            <div
              className="relative mb-2 flex items-center gap-3 overflow-hidden rounded-xl border p-3"
              style={{ borderColor: "#D8F1F1" }}
            >
              <div
                className="absolute inset-x-0 top-0 h-[5px]"
                style={{
                  background: `linear-gradient(to right, ${cardStripe[0]}, ${cardStripe[1]})`,
                }}
                aria-hidden
              />
              <div
                className="flex size-[46px] shrink-0 items-center justify-center overflow-hidden rounded-xl border"
                style={{ borderColor: "#D8F1F1", backgroundColor: "#EAFBFB" }}
              >
                <ServiceIconDisplay
                  src={formData.serviceImage}
                  alt=""
                  imgClassName="size-7 object-contain"
                  placeholderClassName="size-full rounded-xl"
                  placeholderIconClassName="size-6"
                />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-sm font-bold leading-tight" style={{ color: MOBILE_TEXT_DARK }}>
                  {serviceTitle}
                </p>
                {serviceDesc ? (
                  <p className="mt-0.5 text-[11.5px] leading-snug" style={{ color: MOBILE_TEXT_MUTED }}>
                    {serviceDesc}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[11.5px] italic leading-snug" style={{ color: MOBILE_TEXT_MUTED }}>
                    Service description preview.
                  </p>
                )}
              </div>
            </div>

            {aboutBody ? (
              <>
                <p className="mt-4 text-[13px] font-bold" style={{ color: MOBILE_TEXT_DARK }}>
                  About Service
                </p>
                <p className="mt-2 text-[11px] leading-4" style={{ color: MOBILE_TEXT_MUTED }}>
                  {aboutBody}
                </p>
              </>
            ) : null}

            {whoList.length > 0 ? (
              <>
                <p className="mt-3.5 text-[13px] font-bold" style={{ color: MOBILE_TEXT_DARK }}>
                  Who may Avail
                </p>
                {whoList.map((bullet, idx) => (
                  <div key={`who-preview-${idx}`} className="mt-2 flex items-start gap-2.5">
                    <span
                      className="mt-1.5 size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: MOBILE_TEAL }}
                      aria-hidden
                    />
                    <p className="flex-1 text-xs leading-snug" style={{ color: MOBILE_TEXT_DARK }}>
                      {bullet}
                    </p>
                  </div>
                ))}
              </>
            ) : null}

            {hasReminder ? (
              <>
                <p
                  className="mt-4 text-center text-xl font-semibold"
                  style={{ color: MOBILE_DANGER }}
                >
                  Reminder
                </p>
                <div className="mt-2.5 rounded-xl px-3.5 py-3.5" style={{ backgroundColor: "#FBE1E1" }}>
                  <RichTextPreview
                    text={reminderHtml}
                    fallback=""
                    fontFamily={formData.reminderFontFamily}
                    className="text-center text-[11px] leading-relaxed"
                    style={{ color: "#D94B4B" }}
                  />
                </div>
              </>
            ) : null}

            <div className="mt-3 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
              <div
                className="overflow-hidden rounded-xl border"
                style={{ borderColor: "#E7EEEE", backgroundColor: "#FFF" }}
              >
                <div className="px-3.5 py-3" style={{ backgroundColor: "#F6FEFE" }}>
                  <p className="text-[13px] font-extrabold" style={{ color: MOBILE_TEXT_DARK }}>
                    Requirements
                  </p>
                </div>

                {visibleRequirements.map((item, index) => {
                  const tips = (item.tips ?? []).filter((tip) =>
                    typeof tip === "string" ? tip.trim() : (tip?.title ?? "").trim()
                  );
                  const hasDrop = tips.length > 0 || !!item.sampleDocumentImage;
                  const expanded = !!openReq[index] || selectedRequirementIndex === index;

                  return (
                    <div key={`mobile-req-${index}`}>
                      <button
                        type="button"
                        disabled={!hasDrop}
                        onClick={() => hasDrop && toggleReq(index)}
                        className="flex w-full items-center justify-between px-3.5 py-3 text-left disabled:cursor-default"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          <MobileCheckIcon />
                          <span
                            className="truncate text-[13px] font-semibold"
                            style={{ color: MOBILE_TEXT_DARK }}
                          >
                            {item.title}
                          </span>
                        </div>
                        {hasDrop ? <MobileChevron expanded={expanded} /> : <span className="w-[18px]" />}
                      </button>

                      {hasDrop && expanded ? (
                        <div className="px-3.5 pb-3" style={{ backgroundColor: "#FAFAFA" }}>
                          {tips.map((tip, tipIndex) => {
                            const tipTitle = typeof tip === "string" ? tip : tip?.title ?? "";
                            const tipDescription =
                              typeof tip === "string" ? "" : tip?.description ?? "";
                            const tipExpanded = selectedTipIndex === tipIndex;

                            return (
                              <div
                                key={`mobile-tip-${index}-${tipIndex}`}
                                className="mt-2 overflow-hidden rounded-[10px] border bg-white p-2.5"
                                style={{ borderColor: "#E4ECEC" }}
                              >
                                <button
                                  type="button"
                                  onClick={() => onSelectTip?.(tipExpanded ? null : tipIndex)}
                                  className="flex w-full items-center justify-between gap-2 text-left"
                                >
                                  <span
                                    className="text-xs font-bold"
                                    style={{ color: MOBILE_TEXT_DARK }}
                                  >
                                    {tipTitle}
                                  </span>
                                  <MobileChevron expanded={tipExpanded} />
                                </button>
                                {tipExpanded && tipDescription.trim() ? (
                                  <p
                                    className="mt-1.5 text-[11.5px] leading-relaxed"
                                    style={{ color: MOBILE_TEXT_MUTED }}
                                  >
                                    {tipDescription}
                                  </p>
                                ) : null}
                              </div>
                            );
                          })}

                          {item.sampleDocumentImage ? (
                            <button
                              type="button"
                              onClick={() =>
                                onSampleExpand?.({
                                  url: item.sampleDocumentImage,
                                  fileName: item.sampleDocumentName,
                                  label: item.title,
                                })
                              }
                              className="mt-2 block h-40 w-full overflow-hidden rounded-lg border border-[#E4ECEC] bg-gray-50"
                            >
                              <img
                                src={item.sampleDocumentImage}
                                alt="Sample"
                                className="h-full w-full object-contain"
                              />
                            </button>
                          ) : null}
                        </div>
                      ) : null}

                      {index < visibleRequirements.length - 1 || attachmentTitle ? (
                        <div className="ml-3.5 h-px" style={{ backgroundColor: "#EDF4F4" }} />
                      ) : null}
                    </div>
                  );
                })}

                {attachmentTitle ? (
                  <div className="flex items-center justify-between px-3.5 py-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <MobileCheckIcon />
                      <span
                        className="truncate text-[13px] font-semibold"
                        style={{ color: MOBILE_TEXT_DARK }}
                      >
                        {attachmentTitle}
                      </span>
                    </div>
                    <span className="w-[18px]" />
                  </div>
                ) : null}
              </div>
            </div>

            {radioSteps.length > 0
              ? radioSteps.map((step, stepIndex) => {
                  const options = (step.options ?? []).filter((opt) =>
                    (opt?.label ?? opt?.value ?? "").trim()
                  );
                  return (
                    <div
                      key={`mobile-radio-${stepIndex}`}
                      className="mt-3 rounded-xl border bg-white p-3.5"
                      style={{ borderColor: "#E4ECEC" }}
                    >
                      <p className="text-[11px] font-semibold" style={{ color: MOBILE_TEXT_MUTED }}>
                        Step {stepIndex + 1} of {radioSteps.length}
                      </p>
                      <p className="mt-1 text-[13px] font-bold" style={{ color: MOBILE_TEXT_DARK }}>
                        {step.prompt}
                      </p>
                      <div className="mt-2">
                        {options.map((opt, optionIndex) => (
                          <div
                            key={`mobile-radio-opt-${stepIndex}-${optionIndex}`}
                            className={`flex items-center gap-2.5 py-2.5 ${
                              optionIndex < options.length - 1 ? "border-b" : ""
                            }`}
                            style={{ borderColor: "#EDF4F4" }}
                          >
                            <div
                              className="size-[18px] shrink-0 rounded-full border-2"
                              style={{ borderColor: "#C5CECE" }}
                            />
                            <span className="text-[13px] font-medium" style={{ color: MOBILE_TEXT_DARK }}>
                              {opt.label ?? opt.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              : null}

            <div className="h-20" aria-hidden />
          </div>

          <div
            className="shrink-0 border-t px-4 pb-3.5 pt-2.5"
            style={{ borderColor: "#E9EDED", backgroundColor: "#FFF" }}
          >
            <div
              className="flex h-[50px] items-center justify-center rounded-[25px]"
              style={{ backgroundColor: MOBILE_TEAL }}
            >
              <span className="text-[15px] font-bold text-white">Continue</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const RichTextPreview = ({ text, fallback, fontFamily, className = "", style }) => {
  const safeText = toSafeString(text);
  const safeFallback = toSafeString(fallback);
  const content = safeText.trim() ? safeText : safeFallback;
  const html = normalizeRichTextHtml(content);

  return (
    <div
      style={{ fontFamily: fontFamily || defaultEditorFont, ...style }}
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

const RichTextField = ({
  label,
  value,
  onChange,
  fontFamily = defaultEditorFont,
  onFontChange,
  placeholder,
  rows = 4,
}) => {
  const editorRef = useRef(null);
  const isComposingRef = useRef(false);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || isComposingRef.current) return;
    if (document.activeElement === editor) return;
    const nextHtml = normalizeRichTextHtml(value);
    if (editor.innerHTML !== nextHtml) editor.innerHTML = nextHtml;
  }, [value]);

  const applyFormat = (type) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();

    if (type === "link") {
      const url = window.prompt("Enter link URL", "https://");
      if (!url) return;
      document.execCommand("createLink", false, url);
    } else if (type === "code") {
      document.execCommand(
        "insertHTML",
        false,
        '<code class="rounded bg-slate-100 px-1 font-mono">code</code>'
      );
    } else if (type === "bullet") {
      document.execCommand("insertUnorderedList");
    } else if (type === "number") {
      document.execCommand("insertOrderedList");
    } else if (type === "checklist") {
      document.execCommand("insertHTML", false, "<div><span>[ ]</span> Task item</div>");
    } else {
      const commands = {
        bold: "bold",
        italic: "italic",
        strike: "strikeThrough",
        underline: "underline",
      };
      document.execCommand(commands[type]);
    }

    onChange(editor.innerHTML);
  };

  const toolbarButtons = [
    { type: "bold", label: "B", title: "Bold" },
    { type: "italic", label: "I", title: "Italic" },
    { type: "strike", label: "S", title: "Strikethrough" },
    { type: "underline", label: "U", title: "Underline" },
    { type: "link", label: "Link", title: "Link" },
    { type: "code", label: "</>", title: "Code" },
    { type: "bullet", label: "List", title: "Bullet list" },
    { type: "number", label: "1.", title: "Numbered list" },
    { type: "checklist", label: "Check", title: "Checklist" },
  ];

  return (
    <div className="block space-y-1.5">
      <p className="text-sm font-semibold text-ocean-900">{label}</p>
      <div className="overflow-hidden rounded-xl border border-ocean-200 bg-ocean-50/60 focus-within:border-ocean-400">
        <div className="flex flex-wrap items-center gap-1 border-b border-ocean-100 bg-white px-2 py-2 shadow-sm">
          <select
            value={fontFamily}
            onChange={(event) => onFontChange?.(event.target.value)}
            className="h-9 rounded-lg border border-ocean-200 bg-ocean-50 px-2 text-xs font-semibold text-ocean-800 outline-none focus:border-ocean-400"
            aria-label={`${label} font family`}
          >
            {editorFonts.map((font) => (
              <option key={font.label} value={font.value}>
                {font.label}
              </option>
            ))}
          </select>
          <span className="mx-1 h-7 w-px bg-ocean-100" />
          {toolbarButtons.map((button) => (
            <button
              key={button.type}
              type="button"
              title={button.title}
              onClick={() => applyFormat(button.type)}
              className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-semibold text-slate-700 transition hover:bg-ocean-50 hover:text-ocean-900"
            >
              {button.label}
            </button>
          ))}
        </div>
        <div className="relative">
          {!stripRichText(value).trim() ? (
            <span className="pointer-events-none absolute left-3 top-3 text-base font-medium text-ocean-500/80">
              {placeholder}
            </span>
          ) : null}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label={label}
            onInput={(event) => onChange(event.currentTarget.innerHTML)}
            onBlur={(event) => onChange(event.currentTarget.innerHTML)}
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={(event) => {
              isComposingRef.current = false;
              onChange(event.currentTarget.innerHTML);
            }}
            style={{ fontFamily, minHeight: `${rows * 1.75}rem` }}
            className="relative z-[1] w-full resize-none bg-transparent px-3 py-3 text-base font-medium text-ocean-900 outline-none [&_a]:font-semibold [&_a]:text-teal-700 [&_a]:underline [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc"
          />
        </div>
      </div>
    </div>
  );
};

const ARCHIVE_TOKEN = "ARCHIVE";

/**
 * Three-step archive confirmation (warning → type name → type ARCHIVE + final ack).
 */
function ArchiveConfirmDialog({
  open,
  onClose,
  onConfirm,
  entityType,
  entityName,
  serviceCount = 0,
  isProcessing = false,
}) {
  const [step, setStep] = useState(1);
  const [ackRead, setAckRead] = useState(false);
  const [ackMobile, setAckMobile] = useState(false);
  const [ackIrreversible, setAckIrreversible] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [typedToken, setTypedToken] = useState("");
  const [finalAck, setFinalAck] = useState(false);

  const safeName = (entityName || "").trim();
  const nameMatches =
    typedName.trim().toLowerCase() === safeName.toLowerCase() && safeName.length > 0;
  const tokenMatches = typedToken.trim().toUpperCase() === ARCHIVE_TOKEN;

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setAckRead(false);
    setAckMobile(false);
    setAckIrreversible(false);
    setTypedName("");
    setTypedToken("");
    setFinalAck(false);
  }, [open, entityName]);

  if (!open) return null;

  const stepOneReady = ackRead && ackMobile && ackIrreversible;
  const isCategory = entityType === "category";

  const handleClose = () => {
    if (isProcessing) return;
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="archive-confirm-title"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_20px_45px_-24px_rgba(10,70,111,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-600">
              Archive confirmation · step {step} of 3
            </p>
            <h3 id="archive-confirm-title" className="mt-1 text-lg font-semibold text-ocean-950">
              {isCategory ? "Archive assistance category" : "Remove service"}
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isProcessing}
            className="inline-flex h-9 items-center rounded-lg border border-ocean-200 bg-ocean-50 px-3 text-sm font-semibold text-ocean-800 transition hover:border-ocean-300 hover:bg-ocean-100 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>

        {step === 1 ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-900">
              <p className="font-semibold">You are about to archive:</p>
              <p className="mt-1 text-base font-bold">{safeName || "(unnamed)"}</p>
              {isCategory && serviceCount > 0 ? (
                <p className="mt-2 text-rose-800">
                  This category has <strong>{serviceCount}</strong> active service
                  {serviceCount === 1 ? "" : "s"} that will also be hidden from the mobile app.
                </p>
              ) : null}
              <ul className="mt-3 list-disc space-y-1 pl-5 text-rose-800">
                <li>Archived items disappear from the public catalog and mobile app.</li>
                <li>Existing applications in the admin panel are not deleted, but new applicants cannot select this {isCategory ? "category" : "service"}.</li>
                <li>Super admins can restore only by re-activating records in the database.</li>
              </ul>
            </div>

            <div className="space-y-2 text-sm font-medium text-ocean-900">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={ackRead}
                  onChange={(e) => setAckRead(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-ocean-300"
                />
                <span>I have read the consequences above.</span>
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={ackMobile}
                  onChange={(e) => setAckMobile(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-ocean-300"
                />
                <span>I understand this affects the live mobile catalog immediately.</span>
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={ackIrreversible}
                  onChange={(e) => setAckIrreversible(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-ocean-300"
                />
                <span>I accept that this action is intentional and should not be done by mistake.</span>
              </label>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-ocean-800">
              Verification step 2 of 3: type the exact {isCategory ? "category label" : "service title"} below to
              prove you selected the correct item.
            </p>
            <p className="rounded-lg bg-ocean-50 px-3 py-2 text-sm font-semibold text-ocean-900">
              Required: <span className="font-mono text-rose-700">{safeName}</span>
            </p>
            <input
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="Type the name exactly"
              autoComplete="off"
              className="h-10 w-full rounded-lg border border-ocean-200 bg-white px-3 text-sm font-medium text-ocean-900 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-300/50"
            />
            {typedName.trim() && !nameMatches ? (
              <p className="text-xs font-medium text-rose-600">Name does not match. Check spelling and capitalization.</p>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-ocean-800">
              Final step 3 of 3: type <span className="font-mono font-bold text-rose-700">{ARCHIVE_TOKEN}</span> and
              confirm you accept responsibility.
            </p>
            <input
              type="text"
              value={typedToken}
              onChange={(e) => setTypedToken(e.target.value)}
              placeholder={`Type ${ARCHIVE_TOKEN}`}
              autoComplete="off"
              className="h-10 w-full rounded-lg border border-ocean-200 bg-white px-3 text-sm font-medium uppercase text-ocean-900 outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-300/50"
            />
            {typedToken.trim() && !tokenMatches ? (
              <p className="text-xs font-medium text-rose-600">
                Token must be exactly <span className="font-mono">{ARCHIVE_TOKEN}</span>.
              </p>
            ) : null}
            <label className="flex cursor-pointer items-start gap-2 text-sm font-medium text-ocean-900">
              <input
                type="checkbox"
                checked={finalAck}
                onChange={(e) => setFinalAck(e.target.checked)}
                className="mt-0.5 size-4 rounded border-ocean-300"
              />
              <span>
                I confirm I want to archive this {isCategory ? "assistance category" : "service"} and understand this
                cannot be undone from this screen.
              </span>
            </label>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-between gap-2">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={isProcessing}
              className="inline-flex h-10 items-center rounded-lg border border-ocean-200 bg-white px-4 text-sm font-semibold text-ocean-700 transition hover:bg-ocean-50 disabled:opacity-60"
            >
              Back
            </button>
          ) : (
            <span />
          )}
          {step === 1 ? (
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!stepOneReady}
              className={`inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold text-white transition ${
                stepOneReady ? "bg-ocean-600 hover:bg-ocean-700" : "cursor-not-allowed bg-ocean-300"
              }`}
            >
              Continue to verification
            </button>
          ) : null}
          {step === 2 ? (
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={!nameMatches}
              className={`inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold text-white transition ${
                nameMatches ? "bg-ocean-600 hover:bg-ocean-700" : "cursor-not-allowed bg-ocean-300"
              }`}
            >
              Continue to final confirmation
            </button>
          ) : null}
          {step === 3 ? (
            <button
              type="button"
              onClick={() => onConfirm?.()}
              disabled={!tokenMatches || !finalAck || isProcessing}
              className={`inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold text-white transition ${
                tokenMatches && finalAck && !isProcessing
                  ? "bg-rose-600 hover:bg-rose-700"
                  : "cursor-not-allowed bg-rose-300"
              }`}
            >
              {isProcessing
                ? isCategory
                  ? "Archiving…"
                  : "Removing…"
                : isCategory
                  ? "Archive category"
                  : "Remove service"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CategoryEditDialog({
  category,
  serviceCount = 0,
  isSaving,
  error,
  onClose,
  onSave,
  onArchive,
}) {
  const [label, setLabel] = useState(category.label || "");
  const [headline, setHeadline] = useState(category.headline || "");
  const [archiveOpen, setArchiveOpen] = useState(false);

  useEffect(() => {
    setLabel(category.label || "");
    setHeadline(category.headline || "");
    setArchiveOpen(false);
  }, [category]);

  const disabled = isSaving || !label.trim();

  return (
    <>
      <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_20px_45px_-24px_rgba(10,70,111,0.6)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-600">Edit Assistance</p>
              <h3 className="mt-1 text-lg font-semibold text-ocean-950">Category settings</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="inline-flex h-9 items-center rounded-lg border border-ocean-200 bg-ocean-50 px-3 text-sm font-semibold text-ocean-800 transition hover:border-ocean-300 hover:bg-ocean-100 disabled:opacity-60"
            >
              Close
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <label className="block space-y-1.5 text-sm font-semibold text-ocean-900">
              Label
              <input
                type="text"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                className="h-10 w-full rounded-lg border border-ocean-200 bg-ocean-50/60 px-3 text-sm font-medium text-ocean-900 outline-none focus:border-ocean-400"
              />
            </label>
            <label className="block space-y-1.5 text-sm font-semibold text-ocean-900">
              Headline (shown on the services panel)
              <input
                type="text"
                value={headline}
                onChange={(event) => setHeadline(event.target.value)}
                className="h-10 w-full rounded-lg border border-ocean-200 bg-ocean-50/60 px-3 text-sm font-medium text-ocean-900 outline-none focus:border-ocean-400"
              />
            </label>
          </div>

          {error ? <p className="mt-3 text-xs font-medium text-rose-600">{error}</p> : null}

          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-rose-700">Danger zone</p>
            <p className="mt-1 text-sm text-rose-800">
              Archiving hides this category and its services from the mobile app. A 3-step confirmation is required.
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

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="inline-flex h-10 items-center rounded-lg border border-ocean-200 bg-white px-4 text-sm font-semibold text-ocean-700 transition hover:bg-ocean-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSave({ label: label.trim(), headline: headline.trim() })}
              disabled={disabled}
              className={`inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold text-white transition ${
                disabled ? "cursor-not-allowed bg-ocean-300" : "bg-ocean-600 hover:bg-ocean-700"
              }`}
            >
              {isSaving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      </div>

      <ArchiveConfirmDialog
        open={archiveOpen}
        onClose={() => !isSaving && setArchiveOpen(false)}
        onConfirm={async () => {
          await onArchive?.();
          setArchiveOpen(false);
        }}
        entityType="category"
        entityName={label.trim() || category.label}
        serviceCount={serviceCount}
        isProcessing={isSaving}
      />
    </>
  );
}

const WebAssistancePreview = ({ formData, mode = "assistance", large = false }) => {
  const assistanceTitle =
    mode === "assistance" ? formData.assistanceName || "Financial Assistance" : "Available Service";
  const serviceTitle = formData.serviceName || "Emergency Financial Relief";
  const mapLabel = formData.webMapLink?.trim() ? "Visit CSWDO Dasmariñas" : "Add map link";
  const heroImage = formData.webHeroImage || "";
  const introText = (formData.webIntroText ?? "").trim();
  const officeTitle = (formData.webOfficeTitle ?? "").trim();
  const fallbackOfficeTitle = "City Social Welfare and Development Office - CSWDO";

  return (
    <div className={`w-full ${large ? "max-w-5xl" : "max-w-3xl"} rounded-3xl bg-white p-4`}>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr] lg:items-start">
        <div className="rounded-3xl bg-white p-4">
          <div className="flex items-start gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <ServiceIconDisplay
                src={formData.serviceImage}
                alt=""
                placeholderIconClassName="size-8"
              />
            </div>
            <h3 className="bg-gradient-to-r from-teal-700 via-cyan-600 to-lime-500 bg-clip-text text-4xl font-extrabold leading-tight text-transparent">
              {assistanceTitle}
            </h3>
          </div>
          {introText ? <p className="mt-4 text-sm font-medium leading-relaxed text-slate-600">{introText}</p> : null}

          <div className="mt-6 rounded-2xl border border-slate-200 bg-emerald-50/60 p-4">
            {formData.webMapLink?.trim() ? (
              <a
                href={formData.webMapLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-teal-700 shadow-sm transition hover:bg-slate-50"
              >
                {mapLabel}
                <span className="text-slate-400">↗</span>
              </a>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600">
                {mapLabel}
              </div>
            )}
          </div>

          <div className="mt-8">
            <p className="text-base font-semibold text-slate-900">Services</p>
            <div className="mt-4 space-y-1">
              {[serviceTitle].map((name) => (
                <div
                  key={name}
                  className="flex items-center justify-between rounded-2xl px-2 py-3 text-sm font-medium text-slate-700"
                >
                  <span className="truncate">{name}</span>
                  <span className="text-slate-400">↗</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl bg-slate-100 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.35)]">
          {heroImage ? (
            <img
              src={heroImage}
              alt="CSWDO preview"
              className={`${large ? "h-[520px]" : "h-[360px]"} w-full object-cover`}
            />
          ) : (
            <div className={`${large ? "h-[520px]" : "h-[360px]"} w-full bg-gradient-to-br from-slate-200 to-slate-100`} />
          )}

          <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/55 via-black/15 to-transparent p-4">
            <p className="text-lg font-semibold text-white drop-shadow">{officeTitle || fallbackOfficeTitle}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Full-viewport overlay — render via portal on document.body. */
export const LARGE_MODAL_OVERLAY_CLASS =
  "fixed inset-0 z-[70] flex h-[100dvh] w-screen items-center justify-center overflow-hidden bg-ocean-950/45 p-4 backdrop-blur-[2px]";

/** Tweak service modal width here (e.g. max-w-5xl, max-w-7xl, max-w-[1200px]). */
export const SERVICE_MODAL_MAX_WIDTH_CLASS = "max-w-7xl";

export const LARGE_MODAL_PANEL_CLASS =
  `flex max-h-[min(92vh,880px)] w-full ${SERVICE_MODAL_MAX_WIDTH_CLASS} flex-col overflow-hidden rounded-2xl border border-ocean-200 bg-white shadow-[0_24px_60px_-24px_rgba(10,70,111,0.85)]`;

export function AddAssistanceForm({
  mode = "assistance",
  layout = "standalone",
  formData,
  selectedRequirementIndex = null,
  selectedTipIndex = null,
  onSelectRequirement,
  onSelectTip,
  onChange,
  onImageUpload,
  onRequirementChange,
  onAddRequirement,
  onRemoveRequirement,
  onTipChange,
  onAddTip,
  onRemoveTip,
  onRequirementSampleUpload,
  onRequirementSampleClear,
  onSubmit,
  onClose,
  submitLabel,
  statusMessage,
  isSaving = false,
  saveConfirmMode = "create",
  isUpdateService = false,
  archiveTarget = null,
  previewCategoryTitle = "",
  previewCategorySlug = "",
  previewCategoryThemeJson = null,
}) {
  const isModalLayout = layout === "modal";
  const confirmVariant =
    saveConfirmMode === "update" || saveConfirmMode === "create"
      ? saveConfirmMode
      : isUpdateService
        ? "update"
        : "create";
  const serviceIconInputId = `service-icon-upload-${mode}`;
  const webHeroInputId = `web-hero-upload-${mode}`;
  const additionalAttachment = formData?.additionalAttachment ?? DEFAULT_ADDITIONAL_ATTACHMENT;

  const [previewMode, setPreviewMode] = useState("mobile");
  const [webPreviewOpen, setWebPreviewOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [sampleLightbox, setSampleLightbox] = useState(null);
  const [sampleZoom, setSampleZoom] = useState(FIT_SAMPLE_ZOOM_LEVEL);
  const [requirementPendingDelete, setRequirementPendingDelete] = useState(null);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const saveTriggeredRef = useRef(false);
  const requirements = Array.isArray(formData?.requirements)
    ? formData.requirements
    : [createEmptyRequirement()];
  const isSubmitDisabled =
    (mode === "assistance" && !(formData.assistanceName || "").trim()) ||
    !(formData.serviceName || "").trim() ||
    !stripRichText(formData.description || "").trim();

  const openSampleLightbox = useCallback((sample) => {
    setSampleZoom(FIT_SAMPLE_ZOOM_LEVEL);
    setSampleLightbox(sample);
  }, []);

  useEffect(() => {
    if (saveTriggeredRef.current && !isSaving && saveConfirmOpen) {
      saveTriggeredRef.current = false;
      setSaveConfirmOpen(false);
    }
  }, [isSaving, saveConfirmOpen]);

  const handleSubmitClick = () => {
    if (isSubmitDisabled || isSaving) return;
    if (mode === "service") {
      setSaveConfirmOpen(true);
      return;
    }
    onSubmit?.();
  };

  const handleConfirmSave = () => {
    if (isSubmitDisabled || isSaving) return;
    saveTriggeredRef.current = true;
    onSubmit?.();
  };

  const formGrid = (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(400px,0.95fr)] lg:items-start">
        <div className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-[1fr_170px]">
            {mode === "assistance" ? (
              <label className="space-y-1.5 text-sm font-semibold text-ocean-900">
                Assistance Name
                <input
                  type="text"
                  placeholder="e.g. Education Assistance"
                  value={formData.assistanceName}
                  onChange={(event) => onChange("assistanceName", event.target.value)}
                  className="h-10 w-full rounded-lg border border-ocean-200 bg-ocean-50/60 px-3 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/80 focus:border-ocean-400"
                />
              </label>
            ) : null}
            <label className="space-y-1.5 text-sm font-semibold text-ocean-900">
              Service Title
              <input
                type="text"
                placeholder="e.g. Tuition Support"
                value={formData.serviceName}
                onChange={(event) => {
                  const nextName = event.target.value;
                  onChange("serviceName", nextName);
                  if (!(formData.requestCode || "").trim()) {
                    onChange("requestCode", suggestRequestCodePrefix(nextName));
                  }
                }}
                className="h-10 w-full rounded-lg border border-ocean-200 bg-ocean-50/60 px-3 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/80 focus:border-ocean-400"
              />
            </label>
          </div>

          <label className="block max-w-xs space-y-1.5 text-sm font-semibold text-ocean-900">
            Request Code
            <input
              type="text"
              placeholder="e.g. FIN"
              value={formData.requestCode ?? ""}
              onChange={(event) =>
                onChange(
                  "requestCode",
                  event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)
                )
              }
              className="h-10 w-full rounded-lg border border-ocean-200 bg-ocean-50/60 px-3 text-sm font-medium uppercase tracking-wide text-ocean-900 outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-ocean-500/80 focus:border-ocean-400"
            />
            <span className="block text-xs font-normal text-ocean-600">
              Prefix only (2–6 letters or numbers). Month, year, and sequence are assigned automatically
              (e.g. FIN-0526-000042).
            </span>
          </label>

          <div className="max-w-md space-y-1.5 text-sm font-semibold text-ocean-900">
            <p>Service Icon</p>
            <div className="flex items-center gap-3">
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ocean-200 bg-white p-1">
                <ServiceIconDisplay
                  src={formData.serviceImage}
                  alt=""
                  placeholderIconClassName="size-6"
                />
              </div>
              <input
                type="file"
                accept={ICON_IMAGE_UPLOAD_ACCEPT}
                className="hidden"
                id={serviceIconInputId}
                onChange={(event) => onImageUpload("serviceImage", event)}
              />
              <label
                htmlFor={serviceIconInputId}
                className="flex h-10 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-ocean-200 bg-ocean-50/60 px-3 text-xs font-semibold text-ocean-800 transition hover:border-ocean-300 hover:bg-ocean-100"
              >
                <UploadIcon />
                Upload Icon (PNG, JPG, SVG)
              </label>
            </div>
          </div>

          <RichTextField
            label="Description"
            rows={5}
            placeholder="Short summary on the service card (scope, eligibility, intent)."
            value={formData.description}
            onChange={(nextValue) => onChange("description", nextValue)}
            fontFamily={formData.descriptionFontFamily || defaultEditorFont}
            onFontChange={(nextFont) => onChange("descriptionFontFamily", nextFont)}
          />

          <RichTextField
            label="About"
            rows={4}
            placeholder="Longer “About Service” section on mobile (HTML)."
            value={formData.about ?? ""}
            onChange={(nextValue) => onChange("about", nextValue)}
            fontFamily={formData.aboutFontFamily || defaultEditorFont}
            onFontChange={(nextFont) => onChange("aboutFontFamily", nextFont)}
          />

          {previewMode === "mobile" ? (
            <RichTextField
              label="Reminder Text"
              rows={4}
              placeholder="Type reminder shown in the mobile preview."
              value={formData.reminderText}
              onChange={(nextValue) => onChange("reminderText", nextValue)}
              fontFamily={formData.reminderFontFamily || defaultEditorFont}
              onFontChange={(nextFont) => onChange("reminderFontFamily", nextFont)}
            />
          ) : null}

          {previewMode === "mobile" ? (
            <WhoBulletsField
              bullets={formData.whoBullets}
              onChange={(next) => onChange("whoBullets", next)}
            />
          ) : null}

          {previewMode === "mobile" ? (
            <>
              <div className="space-y-2">
                {requirements.map((item, index) => (
                  <div
                    key={`req-${index}`}
                    className="rounded-lg border border-ocean-200 bg-ocean-50/60 p-2.5"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ocean-700">
                        Requirement {index + 1}
                      </p>
                      <button
                        type="button"
                        onClick={() => setRequirementPendingDelete(index)}
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 transition hover:border-rose-300 hover:bg-rose-50"
                        aria-label={`Delete requirement ${index + 1}`}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={item.title}
                      placeholder="e.g. Doctor's Prescription"
                      onClick={() => onSelectRequirement(index)}
                      onChange={(event) => onRequirementChange(index, event.target.value)}
                      className={`h-9 w-full rounded-lg border bg-white px-3 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/80 focus:border-ocean-400 ${
                        selectedRequirementIndex === index
                          ? "border-ocean-400 ring-1 ring-ocean-300/60"
                          : "border-ocean-200"
                      }`}
                    />

                    <div className="mt-2 space-y-2">
                      {(item.tips ?? []).map((tip, tipIndex) => (
                        <div key={`tip-${index}-${tipIndex}`} className="flex items-center gap-2">
                          <div className="grid w-full gap-2 sm:grid-cols-2">
                            <input
                              type="text"
                              value={typeof tip === "string" ? tip : tip?.title ?? ""}
                              placeholder="Tip title (e.g. Where to Get It)"
                              onChange={(event) => onTipChange(index, tipIndex, "title", event.target.value)}
                              className="h-9 w-full rounded-lg border border-ocean-200 bg-white px-3 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/80 focus:border-ocean-400"
                            />
                            <input
                              type="text"
                              value={typeof tip === "string" ? "" : tip?.description ?? ""}
                              placeholder="Tip description"
                              onChange={(event) => onTipChange(index, tipIndex, "description", event.target.value)}
                              className="h-9 w-full rounded-lg border border-ocean-200 bg-white px-3 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/80 focus:border-ocean-400"
                            />
                          </div>
                          {(item.tips?.length ?? 0) > 1 ? (
                            <button
                              type="button"
                              onClick={() => onRemoveTip(index, tipIndex)}
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ocean-200 bg-white text-sm font-bold text-ocean-700"
                              aria-label={`Remove tip ${tipIndex + 1}`}
                            >
                              -
                            </button>
                          ) : null}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => onAddTip(index)}
                        className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-ocean-200 bg-white text-xs font-semibold text-ocean-700 transition hover:border-ocean-300 hover:bg-ocean-50"
                        aria-label={`Add tip for requirement ${index + 1}`}
                      >
                        + Add tip
                      </button>
                    </div>

                    <div className="mt-3 space-y-2 text-sm font-semibold text-ocean-900">
                      <div className="flex items-center justify-between gap-2">
                        <p>Sample image</p>
                        {item.sampleDocumentImage && onRequirementSampleClear ? (
                          <button
                            type="button"
                            onClick={() => onRequirementSampleClear(index)}
                            className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        id={`req-sample-${mode}-${index}`}
                        onChange={(event) => onRequirementSampleUpload?.(index, event)}
                      />
                      {!item.sampleDocumentImage ? (
                        <label
                          htmlFor={`req-sample-${mode}-${index}`}
                          className="grid h-16 w-full cursor-pointer place-items-center rounded-lg border-2 border-dashed border-ocean-300 bg-white text-[11px] font-semibold leading-relaxed text-ocean-700 transition hover:border-ocean-400 hover:bg-ocean-50"
                        >
                          <span className="px-3 text-center">Upload sample image (JPG, PNG)</span>
                        </label>
                      ) : (
                        <>
                          {item.sampleDocumentName ? (
                            <p className="text-xs font-medium text-ocean-700">
                              Selected: {item.sampleDocumentName}
                            </p>
                          ) : null}
                          <RequirementSamplePreviewPanel
                            imageUrl={item.sampleDocumentImage}
                            fileName={item.sampleDocumentName}
                            label={item.title || `Requirement ${index + 1}`}
                            requirementKey={`${mode}-req-${index}`}
                            onExpand={() =>
                              openSampleLightbox({
                                url: item.sampleDocumentImage,
                                fileName: item.sampleDocumentName,
                                label: item.title || `Requirement ${index + 1}`,
                              })
                            }
                          />
                          <label
                            htmlFor={`req-sample-${mode}-${index}`}
                            className="inline-flex h-8 w-full cursor-pointer items-center justify-center rounded-lg border border-ocean-200 bg-white text-[11px] font-semibold text-ocean-700 transition hover:border-ocean-300 hover:bg-ocean-50"
                          >
                            Replace image
                          </label>
                        </>
                      )}
                    </div>
                  </div>
                ))}

                <div className="rounded-lg border border-slate-300 bg-slate-50/90 p-2.5">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                    Additional attachment (default)
                  </p>
                  <p className="mb-2 text-[11px] leading-relaxed text-slate-600">
                    Required on every service for the mobile app. Fixed title only — no tips or sample
                    document. Saved without tips in the database.
                  </p>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={additionalAttachment.title}
                    className="h-9 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm font-medium text-slate-700"
                  />
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Mobile slot{" "}
                    <span className="font-mono text-slate-700">{additionalAttachment.slotKey}</span>
                    {" → "}
                    <span className="font-mono text-slate-700">{additionalAttachment.fileType}</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onAddRequirement}
                  className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-ocean-200 bg-white px-3 text-xs font-semibold text-ocean-700 transition hover:border-ocean-300 hover:bg-ocean-50"
                >
                  + Add Requirement
                </button>
              </div>

            </>
          ) : (
            <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
              <p className="text-sm font-semibold text-ocean-900">Web preview settings</p>
              <p className="mt-1 text-xs text-ocean-700">
                Upload the image shown on the right side, provide the map link button URL, and edit the text shown on
                the preview.
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 text-sm font-semibold text-ocean-900">
                  <p>Web hero image</p>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    id={webHeroInputId}
                    onChange={(event) => onImageUpload("webHeroImage", event)}
                  />
                  <label
                    htmlFor={webHeroInputId}
                    className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-ocean-200 bg-ocean-50/60 text-xs font-semibold text-ocean-800 transition hover:border-ocean-300 hover:bg-ocean-100"
                  >
                    <UploadIcon />
                    Upload Image
                  </label>
                </div>

                <label className="space-y-1.5 text-sm font-semibold text-ocean-900">
                  Map link (URL)
                  <input
                    type="url"
                    placeholder="Paste Google Maps link..."
                    value={formData.webMapLink || ""}
                    onChange={(event) => onChange("webMapLink", event.target.value)}
                    className="h-10 w-full rounded-lg border border-ocean-200 bg-ocean-50/60 px-3 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/80 focus:border-ocean-400"
                  />
                </label>
              </div>

              <div className="mt-3 grid gap-3">
                <label className="space-y-1.5 text-sm font-semibold text-ocean-900">
                  Office title (shown on image)
                  <input
                    type="text"
                    placeholder="e.g. City Social Welfare and Development Office - CSWDO"
                    value={formData.webOfficeTitle || ""}
                    onChange={(event) => onChange("webOfficeTitle", event.target.value)}
                    className="h-10 w-full rounded-lg border border-ocean-200 bg-ocean-50/60 px-3 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/80 focus:border-ocean-400"
                  />
                </label>

                <label className="space-y-1.5 text-sm font-semibold text-ocean-900">
                  Intro text (paragraph)
                  <textarea
                    rows={3}
                    placeholder="Type the description shown under the assistance title..."
                    value={formData.webIntroText || ""}
                    onChange={(event) => onChange("webIntroText", event.target.value)}
                    className="w-full resize-none rounded-lg border border-ocean-200 bg-ocean-50/60 px-3 py-2 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/80 focus:border-ocean-400"
                  />
                </label>
              </div>
            </section>
          )}

          <RadioSelectionConfigCard
            config={formData.radioSelection ?? createEmptyRadioSelectionForm()}
            onChange={(next) => onChange("radioSelection", next)}
          />
        </div>

        <div className="rounded-xl border border-ocean-200 bg-ocean-50/70 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="inline-flex rounded-xl border border-ocean-200 bg-white p-1 shadow-sm">
              {[
                ["mobile", "Mobile"],
                ["web", "Web"],
              ].map(([id, label]) => {
                const active = previewMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPreviewMode(id)}
                    className={`inline-flex h-9 items-center rounded-lg px-4 text-sm font-semibold transition ${
                      active ? "bg-ocean-600 text-white" : "text-ocean-700 hover:bg-ocean-50"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-600">
              {previewMode === "mobile" ? "Sample Mobile Preview" : "Sample Web Preview"}
            </span>
          </div>

          {previewMode === "mobile" ? (
            <div className="mt-2 flex justify-center">
              <RequestInfoMobilePreview
                formData={formData}
                requirements={requirements}
                additionalAttachment={additionalAttachment}
                categoryTitle={previewCategoryTitle || formData.assistanceName}
                categorySlug={previewCategorySlug}
                categoryThemeJson={previewCategoryThemeJson}
                selectedRequirementIndex={selectedRequirementIndex}
                selectedTipIndex={selectedTipIndex}
                onSelectRequirement={onSelectRequirement}
                onSelectTip={onSelectTip}
                onSampleExpand={openSampleLightbox}
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-ocean-200 bg-white p-3">
              <div className="flex items-center justify-between gap-3 px-1 pb-2">
                <div>
                  <p className="text-sm font-semibold text-ocean-900">Web preview</p>
                  <p className="mt-0.5 text-xs text-ocean-700">
                    Full layout is available in <span className="font-semibold">Open web preview</span>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setWebPreviewOpen(true)}
                  className="inline-flex h-9 items-center rounded-lg bg-ocean-600 px-3 text-xs font-semibold text-white transition hover:bg-ocean-700"
                >
                  Open web preview
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
  );

  const footerBlock = (
    <div className={isModalLayout ? "space-y-1" : "mt-4 space-y-2"}>
      {statusMessage ? (
        <p
          className={`font-medium text-rose-600 ${isModalLayout ? "text-[11px] leading-tight" : "text-xs"}`}
        >
          {statusMessage}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        {mode === "service" && archiveTarget ? (
          <button
            type="button"
            onClick={() => setArchiveDialogOpen(true)}
            disabled={archiveTarget.isProcessing}
            className="inline-flex h-10 items-center rounded-lg border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-700 transition hover:border-rose-400 hover:bg-rose-50 disabled:opacity-60"
          >
            Remove service
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={handleSubmitClick}
          disabled={isSubmitDisabled || isSaving}
          className={`inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold text-white transition ${
            isSubmitDisabled || isSaving
              ? "cursor-not-allowed bg-ocean-300"
              : "bg-ocean-600 hover:bg-ocean-700"
          }`}
        >
          {isSaving
            ? "Saving..."
            : submitLabel || (mode === "service" ? "Save Service" : "Save Assistance")}
        </button>
      </div>
    </div>
  );

  const overlayDialogs = (
    <>
      {sampleLightbox ? (
        <ExpandedSampleImageViewer
          sample={sampleLightbox}
          zoom={sampleZoom}
          onZoomChange={setSampleZoom}
          onClose={() => setSampleLightbox(null)}
        />
      ) : null}

      {requirementPendingDelete !== null ? (
        <DeleteRequirementDialog
          open
          requirementTitle={requirements[requirementPendingDelete]?.title}
          onClose={() => setRequirementPendingDelete(null)}
          onConfirm={() => {
            onRemoveRequirement(requirementPendingDelete);
            setRequirementPendingDelete(null);
          }}
        />
      ) : null}

      {webPreviewOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-6xl overflow-y-auto rounded-3xl border border-ocean-200 bg-white p-4 shadow-[0_20px_45px_-24px_rgba(10,70,111,0.6)] max-h-[92vh]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-600">Web preview</p>
                <p className="mt-1 text-lg font-semibold text-ocean-950">Assistance page</p>
              </div>
              <button
                type="button"
                onClick={() => setWebPreviewOpen(false)}
                className="inline-flex h-9 items-center rounded-lg border border-ocean-200 bg-ocean-50 px-3 text-xs font-semibold text-ocean-700 transition hover:border-ocean-300 hover:bg-ocean-100"
              >
                Close
              </button>
            </div>
            <div className="mt-4">
              <WebAssistancePreview formData={formData} mode={mode} large />
            </div>
          </div>
        </div>
      ) : null}

      {archiveTarget ? (
        <ArchiveConfirmDialog
          open={archiveDialogOpen}
          onClose={() => !archiveTarget.isProcessing && setArchiveDialogOpen(false)}
          onConfirm={async () => {
            await archiveTarget.onArchive?.();
            setArchiveDialogOpen(false);
          }}
          entityType="service"
          entityName={archiveTarget.entityName || formData.serviceName}
          isProcessing={archiveTarget.isProcessing}
        />
      ) : null}

      {mode === "service" ? (
        <SaveServiceConfirmDialog
          open={saveConfirmOpen}
          serviceName={formData.serviceName}
          variant={confirmVariant}
          isProcessing={isSaving}
          onClose={() => setSaveConfirmOpen(false)}
          onConfirm={handleConfirmSave}
        />
      ) : null}
    </>
  );

  if (isModalLayout) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{formGrid}</div>
        <div className="shrink-0 border-t border-ocean-100 pt-2">{footerBlock}</div>
        {overlayDialogs}
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-ocean-200 bg-white p-4 shadow-[0_12px_30px_-24px_rgba(10,70,111,0.7)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-600">
            {mode === "service" ? "Create Service" : "Create Assistance"}
          </p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-ocean-950">
            {mode === "service" ? "Service Details" : "Assistance Details"}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center rounded-lg border border-ocean-200 bg-ocean-50 px-3 text-sm font-semibold text-ocean-800 transition hover:border-ocean-300 hover:bg-ocean-100"
        >
          Close
        </button>
      </div>
      {formGrid}
      {footerBlock}
      {overlayDialogs}
    </section>
  );
}

export function AssistanceManagement({ open, onClose, onCreate, isSaving, statusMessage }) {
  const [newAssistance, setNewAssistance] = useState(() => ({
    assistanceName: "",
    serviceName: "",
    requestCode: "",
    serviceImage: "",
    about: "",
    aboutFontFamily: defaultEditorFont,
    description: "",
    descriptionFontFamily: defaultEditorFont,
    requirements: [createEmptyRequirement()],
    additionalAttachment: { ...DEFAULT_ADDITIONAL_ATTACHMENT },
    reminderText: "",
    reminderFontFamily: defaultEditorFont,
    whoBullets: [""],
    webHeroImage: "",
    webMapLink: "",
    webIntroText: "",
    webOfficeTitle: "",
    radioSelection: createEmptyRadioSelectionForm(),
    adminEmail: "",
    adminPassword: "",
  }));
  const [selectedRequirementIndex, setSelectedRequirementIndex] = useState(null);
  const [selectedTipIndex, setSelectedTipIndex] = useState(null);

  const reset = useMemo(
    () => () => {
      setNewAssistance({
        assistanceName: "",
        serviceName: "",
        requestCode: "",
        serviceImage: "",
        about: "",
        aboutFontFamily: defaultEditorFont,
        description: "",
        descriptionFontFamily: defaultEditorFont,
        requirements: [createEmptyRequirement()],
        additionalAttachment: { ...DEFAULT_ADDITIONAL_ATTACHMENT },
        reminderText: "",
        reminderFontFamily: defaultEditorFont,
        whoBullets: [""],
        webHeroImage: "",
        webMapLink: "",
        webIntroText: "",
        webOfficeTitle: "",
        radioSelection: createEmptyRadioSelectionForm(),
        adminEmail: "",
        adminPassword: "",
      });
      setSelectedRequirementIndex(null);
      setSelectedTipIndex(null);
    },
    [],
  );

  const update = useCallback((field, value) => setNewAssistance((prev) => ({ ...prev, [field]: value })), []);

  if (!open) return null;

  const handleImageUpload = (field, event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!isUploadableIconImageFile(file)) {
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setNewAssistance((prev) => ({
        ...prev,
        [field]: String(reader.result),
      }));
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const makeRequirementHandlers = () => ({
    onRequirementChange: (index, value) =>
      setNewAssistance((prev) => {
        const next = [...prev.requirements];
        next[index] = { ...next[index], title: value };
        return { ...prev, requirements: next };
      }),
    onAddRequirement: () =>
      setNewAssistance((prev) => {
        const nextRequirements = [...prev.requirements, createEmptyRequirement()];
        setSelectedRequirementIndex(nextRequirements.length - 1);
        setSelectedTipIndex(null);
        return { ...prev, requirements: nextRequirements };
      }),
    onRemoveRequirement: (index) =>
      setNewAssistance((prev) => {
        const next = prev.requirements.filter((_, idx) => idx !== index);
        setSelectedTipIndex(null);
        return {
          ...prev,
          requirements: next.length ? next : [createEmptyRequirement()],
        };
      }),
  });

  const makeTipHandlers = () => ({
    onTipChange: (requirementIndex, tipIndex, field, value) =>
      setNewAssistance((prev) => {
        const reqIndex = Math.min(Math.max(0, requirementIndex ?? 0), prev.requirements.length - 1);
        const next = [...prev.requirements];
        const tips = [...(next[reqIndex].tips ?? [createEmptyTip()])];
        const current = tips[tipIndex];
        const normalized =
          typeof current === "string"
            ? { title: current, description: "" }
            : current ?? createEmptyTip();
        tips[tipIndex] = { ...normalized, [field]: value };
        next[reqIndex] = { ...next[reqIndex], tips };
        return { ...prev, requirements: next };
      }),
    onAddTip: (requirementIndex) =>
      setNewAssistance((prev) => {
        const reqIndex = Math.min(Math.max(0, requirementIndex ?? 0), prev.requirements.length - 1);
        const next = [...prev.requirements];
        const tips = [...(next[reqIndex].tips ?? [createEmptyTip()]), createEmptyTip()];
        next[reqIndex] = { ...next[reqIndex], tips };
        return { ...prev, requirements: next };
      }),
    onRemoveTip: (requirementIndex, tipIndex) =>
      setNewAssistance((prev) => {
        const reqIndex = Math.min(Math.max(0, requirementIndex ?? 0), prev.requirements.length - 1);
        const next = [...prev.requirements];
        const tips = (next[reqIndex].tips ?? [createEmptyTip()]).filter((_, idx) => idx !== tipIndex);
        next[reqIndex] = { ...next[reqIndex], tips: tips.length ? tips : [createEmptyTip()] };
        return { ...prev, requirements: next };
      }),
  });

  const handleRequirementSampleUpload = (index, event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!isImageSampleFile(file)) {
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setNewAssistance((prev) => {
        const next = [...prev.requirements];
        next[index] = {
          ...next[index],
          sampleDocumentImage: String(reader.result),
          sampleDocumentName: file.name,
        };
        return { ...prev, requirements: next };
      });
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleRequirementSampleClear = (index) => {
    setNewAssistance((prev) => {
      const next = [...prev.requirements];
      next[index] = {
        ...next[index],
        sampleDocumentImage: "",
        sampleDocumentName: "",
      };
      return { ...prev, requirements: next };
    });
  };

  const handlers = {
    onImageUpload: handleImageUpload,
    onRequirementSampleUpload: handleRequirementSampleUpload,
    onRequirementSampleClear: handleRequirementSampleClear,
    ...makeRequirementHandlers(),
    ...makeTipHandlers(),
  };

  const handleCreateAssistance = async () => {
    const assistanceName = newAssistance.assistanceName.trim();
    const serviceName = newAssistance.serviceName.trim();
    if (!assistanceName || !serviceName) return;

    const payload = {
      assistanceName,
      headline: `${assistanceName} Assistance`,
      service: {
        name: serviceName,
        requestCode: newAssistance.requestCode || "",
        about: newAssistance.about || "",
        description: newAssistance.description || "",
        whoBullets: newAssistance.whoBullets,
        image: hasUploadedServiceIcon(newAssistance.serviceImage) ? newAssistance.serviceImage : null,
        aboutFontFamily: newAssistance.aboutFontFamily || defaultEditorFont,
        descriptionFontFamily: newAssistance.descriptionFontFamily || defaultEditorFont,
        reminderText: newAssistance.reminderText || "",
        reminderFontFamily: newAssistance.reminderFontFamily || defaultEditorFont,
        webHeroImage: newAssistance.webHeroImage || "",
        webMapLink: newAssistance.webMapLink || "",
        webIntroText: newAssistance.webIntroText || "",
        webOfficeTitle: newAssistance.webOfficeTitle || "",
        radioSelection: newAssistance.radioSelection,
      },
      additionalAttachment: newAssistance.additionalAttachment ?? DEFAULT_ADDITIONAL_ATTACHMENT,
      requirements: newAssistance.requirements
        .filter((req) => req.title.trim())
        .map((req) => ({
          title: req.title.trim(),
          sampleDocumentImage: req.sampleDocumentImage || "",
          sampleDocumentName: req.sampleDocumentName || "",
          tips: (req.tips ?? [])
            .map((tip) =>
              typeof tip === "string"
                ? { title: tip.trim(), description: "" }
                : { title: (tip?.title ?? "").trim(), description: (tip?.description ?? "").trim() }
            )
            .filter((tip) => tip.title),
        })),
    };

    const result = await Promise.resolve(onCreate?.(payload));
    if (result?.ok === false) return;
    onClose?.();
    reset();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto">
        <AddAssistanceForm
          mode="assistance"
          formData={newAssistance}
          selectedRequirementIndex={selectedRequirementIndex}
          selectedTipIndex={selectedTipIndex}
          onSelectRequirement={(index) => {
            setSelectedRequirementIndex(index);
            setSelectedTipIndex(null);
          }}
          onSelectTip={setSelectedTipIndex}
          onChange={update}
          {...handlers}
          onSubmit={handleCreateAssistance}
          onClose={() => {
            onClose?.();
            reset();
          }}
          submitLabel={isSaving ? "Saving..." : "Save Assistance"}
          statusMessage={statusMessage}
        />
      </div>
    </div>
  );
}


