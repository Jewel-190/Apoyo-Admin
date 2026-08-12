/* eslint-disable react-hooks/set-state-in-effect */
/**
 * Web Content Management
 * ----------------------
 * Superadmin CMS for the public Apoyo website (ApoyoWeb). Content is stored in a
 * single flexible Supabase table `web_content` (one jsonb row per page), which
 * doubles as the website's read endpoint.
 *
 * The editor is schema-driven: `WEB_SCHEMA` describes the sections and fields of
 * each page and a small set of recursive field controls render them, so almost
 * every piece of website copy/imagery is editable and rich-text capable without
 * bespoke UI per field.
 *
 * The database is the ONLY source of truth for website content — no website copy
 * is hardcoded here. This component loads each page's row from `web_content`,
 * edits it in place, and writes it back. `WEB_SCHEMA` only defines editor
 * structure (which fields exist), never content values.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../shared/lib/supabaseClient";
import { fetchCmsCatalogList } from "../../../shared/lib/catalogFetch";

/* ------------------------------------------------------------------ */
/* Rich text (lightweight markdown) helpers                            */
/* ------------------------------------------------------------------ */

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
      .replaceAll(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replaceAll(/\n/g, "<br />");

const normalizeRichTextHtml = (text = "") => {
  if (!text) return "";
  return isHtmlRichText(text) ? text : markdownToHtml(text);
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

/* ------------------------------------------------------------------ */
/* Field controls                                                      */
/* ------------------------------------------------------------------ */

const LABEL_CLS = "block text-[11px] font-semibold uppercase tracking-[0.12em] text-ocean-600";
const INPUT_CLS =
  "mt-1.5 w-full rounded-lg border border-ocean-200 bg-ocean-50/60 px-3 py-2 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/70 focus:border-ocean-400";
const TOOL_BTN =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-semibold text-slate-700 transition hover:bg-ocean-50 hover:text-ocean-900";

function TextField({ label, value, onChange, placeholder, hint, type = "text" }) {
  return (
    <label className="block">
      {label ? <span className={LABEL_CLS}>{label}</span> : null}
      <input
        type={type === "number" ? "number" : "text"}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value;
          if (type === "number") {
            onChange(raw === "" ? "" : Number.isNaN(Number(raw)) ? raw : Number(raw));
          } else {
            onChange(raw);
          }
        }}
        className={INPUT_CLS}
      />
      {hint ? <span className="mt-1 block text-[11px] text-ocean-500">{hint}</span> : null}
    </label>
  );
}

const WEB_ASSET_BUCKET = "web-content";
const WEB_ASSET_MAX_BYTES = 100 * 1024 * 1024; // keep in sync with bucket file_size_limit

function inferContentType(file) {
  if (file?.type) return file.type;
  const name = String(file?.name || "").toLowerCase();
  if (name.endsWith(".mp4") || name.endsWith(".m4v")) return "video/mp4";
  if (name.endsWith(".webm")) return "video/webm";
  if (name.endsWith(".mov")) return "video/quicktime";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

async function uploadWebAsset(file) {
  if (file.size > WEB_ASSET_MAX_BYTES) {
    throw new Error(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Max is 100 MB.`);
  }
  const contentType = inferContentType(file);
  const isVideo = contentType.startsWith("video/");
  // Chrome/Edge often cannot play .mov (QuickTime) — fail early with a clear message.
  if (isVideo && /\.mov$/i.test(file.name)) {
    throw new Error("This video type isn't supported. Please upload an MP4 instead.");
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const folder = isVideo ? "videos" : "images";
  const objectPath = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  const { error } = await supabase.storage.from(WEB_ASSET_BUCKET).upload(objectPath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(WEB_ASSET_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

function looksLikeVideo(url = "", accept = "") {
  if (typeof accept === "string" && accept.includes("video/")) return true;
  return /\.(mp4|webm|mov|m4v|avi|mkv)(\?|$)/i.test(String(url));
}

/**
 * Many phones/cameras export "MP4" with H.265/HEVC video + AAC audio.
 * Chrome/Edge often play the audio but show a black frame for the video track.
 * Returns true when the browser can decode visible video frames.
 */
function probeVideoHasPicture(url) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;

    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      video.pause();
      video.removeAttribute("src");
      video.load();
      resolve(ok);
    };

    const timer = window.setTimeout(() => finish(video.videoWidth > 0), 5000);

    video.addEventListener("loadeddata", () => {
      if (video.videoWidth > 0) {
        window.clearTimeout(timer);
        finish(true);
        return;
      }
      // Some codecs report 0 until playback starts.
      video
        .play()
        .then(() => {
          window.setTimeout(() => {
            window.clearTimeout(timer);
            finish(video.videoWidth > 0);
          }, 400);
        })
        .catch(() => {
          window.clearTimeout(timer);
          finish(false);
        });
    });
    video.addEventListener("error", () => {
      window.clearTimeout(timer);
      finish(false);
    });
  });
}

const VIDEO_CODEC_HINT =
  "This video's picture won't show in the browser (you may only hear sound). Please upload a different MP4 — for example, one saved for web or YouTube.";

/** One-step remove confirmation via a simple modal. */
function ConfirmRemoveButton({
  onConfirm,
  className = "",
  label = "Remove",
  title = "Remove this item?",
  message = "Are you sure you want to remove this?",
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
        <button
          type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          "inline-flex h-9 items-center rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
        }
      >
        {label}
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
            aria-labelledby="confirm-remove-title"
            className="w-full max-w-sm rounded-2xl border border-ocean-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-remove-title" className="text-base font-semibold text-ocean-950">
              {title}
            </h3>
            <p className="mt-1.5 text-sm text-ocean-600">{message}</p>
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

function ImageField({ label, value, onChange, accept = "image/*" }) {
  const [broken, setBroken] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [codecWarning, setCodecWarning] = useState("");
  const [previewHint, setPreviewHint] = useState("");
  const isVideo = looksLikeVideo(value, accept);
  const canPreview = Boolean(value && /^https?:\/\//i.test(String(value).trim()));
  useEffect(() => setBroken(false), [value]);
  useEffect(() => setPreviewHint(""), [value]);

  useEffect(() => {
    if (!isVideo || !value || !/^https?:\/\//i.test(value)) {
      setCodecWarning("");
      return undefined;
    }
    let cancelled = false;
    setCodecWarning("");
    probeVideoHasPicture(value).then((ok) => {
      if (!cancelled && !ok) setCodecWarning(VIDEO_CODEC_HINT);
    });
    return () => {
      cancelled = true;
    };
  }, [isVideo, value]);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setUploadError("");
    setCodecWarning("");
    setPreviewHint("");
    try {
      const url = await uploadWebAsset(file);
      onChange(url);
      if (inferContentType(file).startsWith("video/")) {
        const ok = await probeVideoHasPicture(url);
        if (!ok) setCodecWarning(VIDEO_CODEC_HINT);
      }
    } catch (ex) {
      setUploadError(ex?.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const preview = () => {
    const href = String(value || "").trim();
    if (!href || !/^https?:\/\//i.test(href)) {
      setPreviewHint("Please upload a file first.");
      return;
    }
    setPreviewHint("");
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div>
      {label ? <span className={LABEL_CLS}>{label}</span> : null}
      <p className="mt-0.5 text-[11px] text-ocean-500">
        Any resolution is fine — the site shows it at a fixed height without stretching.
      </p>
      <div className="mt-1.5 flex items-center gap-3">
        <button
          type="button"
          onClick={preview}
          title={canPreview ? "Open in a new tab" : "Upload a file to preview"}
          className={`grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-ocean-200 bg-ocean-50/50 transition ${
            canPreview
              ? "cursor-pointer hover:border-ocean-400 hover:ring-2 hover:ring-ocean-200"
              : value
                ? "cursor-pointer hover:border-amber-300 hover:ring-2 hover:ring-amber-100"
                : "cursor-pointer hover:border-ocean-300"
          }`}
        >
          {value && !broken && !isVideo && canPreview ? (
            <img src={value} alt="" className="max-h-full max-w-full object-contain object-center" onError={() => setBroken(true)} />
          ) : value && isVideo ? (
            <svg className="size-7 text-ocean-600" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5.5v13l11-6.5L8 5.5z" />
            </svg>
          ) : value && !isVideo && !canPreview ? (
            <svg className="size-5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          ) : (
            <svg className="size-5 text-ocean-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <label
              className={`inline-flex h-9 cursor-pointer items-center rounded-lg border border-ocean-200 bg-white px-3 text-xs font-semibold text-ocean-700 transition hover:border-ocean-300 hover:bg-ocean-50 ${
                uploading ? "cursor-wait opacity-60" : ""
              }`}
            >
              <input type="file" accept={accept} className="hidden" onChange={handleFile} disabled={uploading} />
              {uploading ? "Uploading…" : value ? "Replace file" : "Upload file"}
            </label>
            {value ? (
              <ConfirmRemoveButton
                onConfirm={() => {
                  onChange("");
                  setCodecWarning("");
                  setPreviewHint("");
                }}
              />
            ) : null}
          </div>
          <p className="mt-1 text-[11px] text-ocean-500">
            {canPreview
              ? "Uploaded. Click the thumbnail to open it in a new tab."
              : isVideo
                ? "Upload an MP4 video (up to 100 MB)."
                : "Upload an image (up to 100 MB)."}
          </p>
          {previewHint ? <p className="mt-1 text-[11px] font-semibold text-amber-700">{previewHint}</p> : null}
          {uploadError ? <p className="mt-1 text-[11px] font-semibold text-rose-600">{uploadError}</p> : null}
          {codecWarning ? <p className="mt-1 text-[11px] font-semibold text-amber-700">{codecWarning}</p> : null}
        </div>
      </div>
    </div>
  );
}

function LinkField({ label, value, onChange, placeholder, hint }) {
  const val = value ?? "";
  const canOpen = /^(https?:|tel:|mailto:|\/)/i.test(val.trim());
  return (
    <label className="block">
      {label ? <span className={LABEL_CLS}>{label}</span> : null}
      <div className="mt-1.5 flex items-center gap-2">
        <span className="pointer-events-none -mr-9 pl-3 text-ocean-400">
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
            <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12 19" />
          </svg>
        </span>
        <input
          type="text"
          inputMode="url"
          value={val}
          placeholder={placeholder || "https://…"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full rounded-lg border border-ocean-200 bg-ocean-50/60 pl-9 pr-3 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/70 focus:border-ocean-400"
        />
        <a
          href={canOpen ? val : undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!canOpen}
          className={`inline-flex h-10 shrink-0 items-center rounded-lg border px-3 text-xs font-semibold transition ${
            canOpen
              ? "border-ocean-200 bg-white text-ocean-700 hover:border-ocean-300 hover:bg-ocean-50"
              : "pointer-events-none border-ocean-100 bg-ocean-50 text-ocean-300"
          }`}
        >
          Open ↗
        </a>
      </div>
      {hint ? <span className="mt-1 block text-[11px] text-ocean-500">{hint}</span> : null}
    </label>
  );
}

function RichTextField({ label, value, onChange, placeholder, rows = 3 }) {
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
            onClick={() => setShowPreview((p) => !p)}
            title="Toggle preview"
          >
            Preview
        </button>
        </div>
        <textarea
          ref={ref}
          rows={rows}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full resize-y bg-ocean-50/40 px-3 py-2 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/70"
        />
        {showPreview ? (
          <div className="border-t border-ocean-100 bg-white px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ocean-400">Preview</p>
            <div
              className="prose-sm mt-1 text-sm leading-relaxed text-ocean-800 [&_a]:text-ocean-600 [&_a]:underline"
              dangerouslySetInnerHTML={{ __html: normalizeRichTextHtml(value) || '<span class="text-ocean-400">Nothing to preview</span>' }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StringList({ label, value, onChange, itemType = "text", placeholder }) {
  const items = Array.isArray(value) ? value : [];
  const update = (idx, val) => onChange(items.map((it, i) => (i === idx ? val : it)));
  const remove = (idx) => onChange(items.filter((_, i) => i !== idx));
  const add = () => onChange([...items, ""]);
  return (
    <div>
      {label ? <span className={LABEL_CLS}>{label}</span> : null}
      <div className="mt-1.5 space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <div className="flex-1">
              {itemType === "richtext" ? (
                <RichTextField value={item} onChange={(v) => update(idx, v)} placeholder={placeholder} rows={2} />
              ) : (
                <input
                  type="text"
                  value={item ?? ""}
                  placeholder={placeholder}
                  onChange={(e) => update(idx, e.target.value)}
                  className="h-10 w-full rounded-lg border border-ocean-200 bg-ocean-50/60 px-3 text-sm font-medium text-ocean-900 outline-none focus:border-ocean-400"
                />
              )}
            </div>
            <div className="mt-0.5">
              <ConfirmRemoveButton onConfirm={() => remove(idx)} />
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="inline-flex h-9 items-center rounded-lg border border-dashed border-ocean-300 bg-white px-3 text-xs font-semibold text-ocean-700 transition hover:border-ocean-400 hover:bg-ocean-50"
        >
          + Add item
        </button>
      </div>
    </div>
  );
}

function Repeater({ label, value, fields, newItem, itemTitle, onChange, defaultOpen = false, pinBottom }) {
  const items = Array.isArray(value) ? value : [];
  const isPinned = (it) => Boolean(pinBottom?.(it));
  // Multiple entries can stay open at once; optionally start expanded so loaded content is visible.
  const [openSet, setOpenSet] = useState(() =>
    defaultOpen ? new Set(items.map((_, idx) => idx)) : new Set()
  );

  const toggleOpen = (idx) => {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const update = (idx, val) => onChange(items.map((it, i) => (i === idx ? val : it)));

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
    const copy = [...items];
    const pinIdx = copy.findIndex(isPinned);
    const insertAt = pinIdx === -1 ? copy.length : pinIdx;
    copy.splice(insertAt, 0, structuredClone(newItem));
    onChange(copy);
    setOpenSet((prev) => new Set([...prev, insertAt]));
  };

  const move = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    if (isPinned(items[idx]) || isPinned(items[j])) return;
    const copy = [...items];
    [copy[idx], copy[j]] = [copy[j], copy[idx]];
    onChange(copy);
    setOpenSet((prev) => {
      const next = new Set(prev);
      const aOpen = next.has(idx);
      const bOpen = next.has(j);
      if (aOpen) next.add(j);
      else next.delete(j);
      if (bOpen) next.add(idx);
      else next.delete(idx);
      return next;
    });
  };

  return (
    <div>
      {label ? <span className={LABEL_CLS}>{label}</span> : null}
      <div className="mt-1.5 space-y-2">
        {items.map((item, idx) => {
          const open = openSet.has(idx);
          const pinned = isPinned(item);
          const canUp = idx > 0 && !pinned && !isPinned(items[idx - 1]);
          const canDown = idx < items.length - 1 && !pinned && !isPinned(items[idx + 1]);
          return (
            <div key={idx} className="overflow-hidden rounded-xl border border-ocean-200 bg-white">
              <div className="flex items-center gap-2 bg-ocean-50/60 px-3 py-2">
        <button
          type="button"
                  onClick={() => toggleOpen(idx)}
                  className="flex flex-1 items-center gap-2 text-left text-sm font-semibold text-ocean-900"
                >
                  <span className={`transition ${open ? "rotate-90" : ""}`}>▸</span>
                  <span className="truncate">{itemTitle?.(item, idx) || `Item ${idx + 1}`}</span>
                  {pinned ? (
                    <span className="rounded-md bg-ocean-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ocean-600">
                      Always bottom
                    </span>
                  ) : null}
        </button>
                <button type="button" onClick={() => move(idx, -1)} className={TOOL_BTN} title="Move up" disabled={!canUp}>↑</button>
                <button type="button" onClick={() => move(idx, 1)} className={TOOL_BTN} title="Move down" disabled={!canDown}>↓</button>
                <ConfirmRemoveButton
                  onConfirm={() => remove(idx)}
                  className="inline-flex h-8 items-center rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
                />
              </div>
              {open ? (
                <div className="border-t border-ocean-100 p-3">
                  <GroupFields fields={fields} value={item} onChange={(v) => update(idx, v)} />
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
          + Add entry
        </button>
      </div>
    </div>
  );
}

function FieldControl({ field, value, onChange }) {
  switch (field.type) {
    case "richtext":
      return <RichTextField label={field.label} value={value} onChange={onChange} placeholder={field.placeholder} rows={field.rows} />;
    case "image":
      return <ImageField label={field.label} value={value} onChange={onChange} accept={field.accept} />;
    case "number":
      return <TextField label={field.label} value={value} onChange={onChange} placeholder={field.placeholder} hint={field.hint} type="number" />;
    case "url":
      return <LinkField label={field.label} value={value} onChange={onChange} placeholder={field.placeholder} hint={field.hint} />;
    case "select":
      return (
        <label className="block">
          {field.label ? <span className={LABEL_CLS}>{field.label}</span> : null}
          <select
            value={value ?? field.options?.[0]?.value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1.5 h-10 w-full rounded-lg border border-ocean-200 bg-ocean-50/60 px-3 text-sm font-medium text-ocean-900 outline-none focus:border-ocean-400"
          >
            {(field.options ?? []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {field.hint ? <span className="mt-1 block text-[11px] text-ocean-500">{field.hint}</span> : null}
        </label>
      );
    case "list":
      return <StringList label={field.label} value={value} onChange={onChange} itemType={field.itemType} placeholder={field.placeholder} />;
    case "group":
      return (
        <div className="rounded-xl border border-ocean-100 bg-ocean-50/40 p-3">
          {field.label ? <p className="mb-2 text-xs font-semibold text-ocean-800">{field.label}</p> : null}
          <GroupFields fields={field.fields} value={value} onChange={onChange} />
        </div>
      );
    case "repeater":
      return (
        <Repeater
          label={field.label}
          value={value}
          fields={field.fields}
          newItem={field.newItem}
          itemTitle={field.itemTitle}
          defaultOpen={field.defaultOpen}
          pinBottom={field.pinBottom}
          onChange={onChange}
        />
      );
    default:
      return <TextField label={field.label} value={value} onChange={onChange} placeholder={field.placeholder} hint={field.hint} />;
  }
}

function GroupFields({ fields, value, onChange }) {
  const obj = value && typeof value === "object" ? value : {};
  return (
    <div className="grid gap-3">
      {fields.map((field) => {
        const span = field.type === "group" || field.type === "repeater" || field.type === "richtext" || field.type === "list";
        return (
          <div key={field.key} className={span ? "sm:col-span-2" : ""}>
            <FieldControl field={field} value={obj[field.key]} onChange={(v) => onChange({ ...obj, [field.key]: v })} />
      </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Schema (drives the editor)                                          */
/* ------------------------------------------------------------------ */

const T = (key, label, extra = {}) => ({ key, label, type: "text", ...extra });
const RT = (key, label, extra = {}) => ({ key, label, type: "richtext", ...extra });
const IMG = (key, label, extra = {}) => ({ key, label, type: "image", ...extra });
const URLF = (key, label, extra = {}) => ({ key, label, type: "url", ...extra });
const SEL = (key, label, options, extra = {}) => ({
  key,
  label,
  type: "select",
  options,
  ...extra,
});
const NUM = (key, label) => ({ key, label, type: "number" });

const WEB_SCHEMA = {
  global: [
    {
      id: "site",
      key: "site",
      type: "group",
      title: "Site metadata",
      desc: "Document-level settings for the whole site.",
      fields: [T("title", "Browser tab title"), IMG("favicon", "Favicon")],
    },
    {
      id: "navbar",
      key: "navbar",
      type: "group",
      title: "Navbar",
      desc: "Top navigation shown on every page.",
      fields: [
        IMG("logoPrimary", "Primary logo"),
        T("logoPrimaryAlt", "Primary logo alt text"),
        IMG("logoSecondary", "Secondary logo"),
        T("logoSecondaryAlt", "Secondary logo alt text"),
        T("searchPlaceholder", "Search placeholder"),
        T("openMenuAria", "Open-menu aria label"),
        T("closeMenuAria", "Close-menu aria label"),
        {
          key: "links",
          label: "Navigation links",
          type: "repeater",
          itemTitle: (it) => it.name || "Link",
          newItem: { name: "", path: "/" },
          fields: [T("name", "Label"), T("path", "Path")],
        },
      ],
    },
    {
      id: "footer",
      key: "footer",
      type: "group",
      title: "Footer",
      desc: "Global footer content. Use {year} for the current year.",
      fields: [IMG("logo", "Logo"), T("logoAlt", "Logo alt text"), RT("tagline", "Tagline"), T("copyright", "Copyright line")],
    },
    {
      id: "contacts",
      key: "contacts",
      type: "group",
      title: "Shared contacts",
      desc: "Contact details reused across Home, About, and Services.",
      fields: [
        URLF("gmailSignIn", "Gmail sign-in URL"),
        T("cityPhoneDisplay", "City phone (display)"),
        T("cityPhoneHref", "City phone (tel: link)"),
        T("cityCellDisplay", "City cell (display)"),
        T("cityCellHref", "City cell (tel: link)"),
        T("mayorEmail", "Mayor's office email"),
        URLF("facebookCity", "Facebook — City Gov"),
        T("facebookCityLabel", "Facebook — City Gov (label)"),
        URLF("facebookCswdo", "Facebook — CSWDO"),
        T("facebookCswdoLabel", "Facebook — CSWDO (label)"),
        URLF("facebookPagamutan", "Facebook — Pagamutan"),
        T("facebookPagamutanLabel", "Facebook — Pagamutan (label)"),
        URLF("facebookPanteon", "Facebook — Panteon"),
        T("facebookPanteonLabel", "Facebook — Panteon (label)"),
        RT("cityHallAddress", "City Hall address"),
        RT("panteonAddress", "Panteon address"),
        T("panteonSmart", "Panteon Smart/TNT"),
        T("panteonGlobe", "Panteon Globe/TM"),
        T("panteonLandline", "Panteon landline"),
        T("panteonEmail", "Panteon email"),
      ],
    },
  ],

  legal: [
    {
      id: "terms",
      key: "terms",
      type: "group",
      title: "Terms & Conditions",
      desc: "Shown at /terms. Every section is fully rich-text editable; add or reorder sections freely.",
      fields: [
        T("title", "Page title"),
        T("updated", "Updated line"),
        T("secondaryLinkLabel", "Cross-link label"),
        T("secondaryLinkTo", "Cross-link route"),
        {
          key: "sections",
          label: "Sections",
          type: "repeater",
          itemTitle: (it, i) => it.heading || `Section ${i + 1}`,
          newItem: { heading: "", body: "" },
          fields: [T("heading", "Heading"), RT("body", "Body", { rows: 5 })],
        },
      ],
    },
    {
      id: "privacy",
      key: "privacy",
      type: "group",
      title: "Privacy Policy",
      desc: "Shown at /privacy. Use bullet lines (- item) inside a section body for lists.",
      fields: [
        T("title", "Page title"),
        T("updated", "Updated line"),
        T("secondaryLinkLabel", "Cross-link label"),
        T("secondaryLinkTo", "Cross-link route"),
        {
          key: "sections",
          label: "Sections",
          type: "repeater",
          itemTitle: (it, i) => it.heading || `Section ${i + 1}`,
          newItem: { heading: "", body: "" },
          fields: [T("heading", "Heading"), RT("body", "Body", { rows: 5 })],
        },
      ],
    },
  ],

  home: [
    {
      id: "hero",
      key: "hero",
      type: "group",
      title: "Hero",
      desc: "Full-width hero with background video and headline.",
      fields: [
        IMG("videoSrc", "Background video", { accept: "video/mp4,video/webm,.mp4,.webm" }),
        IMG("poster", "Video poster / fallback"),
        IMG("logo", "Hero logo"),
        T("logoAlt", "Hero logo alt text"),
        RT("eyebrow", "Eyebrow / kicker"),
        RT("heading", "Headline"),
        RT("subcopy", "Subcopy"),
      ],
    },
    {
      id: "slogan",
      key: "slogan",
      type: "group",
      title: "Slogan band",
      fields: [IMG("image", "Slogan image"), T("alt", "Image alt text")],
    },
    {
      id: "howFits",
      key: "howFits",
      type: "group",
      title: "How Apoyo fits",
      fields: [
        T("kicker", "Section kicker"),
        RT("intro", "Intro paragraph"),
        {
          key: "pillars",
          label: "Pillars",
          type: "repeater",
          itemTitle: (it) => it.kicker || "Pillar",
          newItem: { num: "", kicker: "", body: "", icon: "" },
          fields: [T("num", "Number"), T("kicker", "Title"), RT("body", "Body"), T("icon", "Icon id (users / document / phone)")],
        },
      ],
    },
    {
      id: "showcase",
      key: "showcase",
      type: "group",
      title: "Living showcase",
      desc: "Auto-rotating photo carousel.",
      fields: [
        NUM("intervalMs", "Auto-play interval (ms)"),
        RT("heading", "Heading"),
        RT("subcopy", "Subcopy"),
        T("overlayLabel", "Overlay label"),
        {
          key: "slides",
          label: "Slides",
          type: "repeater",
          itemTitle: (it) => it.title || "Slide",
          newItem: { src: "", alt: "", title: "", subtitle: "" },
          fields: [IMG("src", "Image"), T("alt", "Alt text"), T("title", "Title"), RT("subtitle", "Subtitle")],
        },
      ],
    },
    {
      id: "download",
      key: "download",
      type: "group",
      title: "Download app",
      fields: [
        T("kicker", "Kicker"),
        RT("heading", "Heading"),
        RT("paragraph", "Paragraph"),
        { key: "benefits", label: "Benefits", type: "list", itemType: "richtext" },
        {
          key: "links",
          label: "Download links",
          type: "repeater",
          itemTitle: (it) => it.label || "Download link",
          newItem: { label: "", image: "", alt: "", href: "" },
          fields: [
            T("label", "Label"),
            IMG("image", "Badge / thumbnail"),
            T("alt", "Image alt text"),
            URLF("href", "Link URL"),
          ],
        },
        RT("disclaimer", "Disclaimer"),
      ],
    },
    {
      id: "phones",
      key: "phones",
      type: "group",
      title: "Phone showcase",
      fields: [
        T("kicker", "Kicker"),
        RT("heading", "Heading"),
        RT("intro", "Intro"),
        {
          key: "items",
          label: "Phones",
          type: "repeater",
          itemTitle: (it) => it.captionTitle || "Phone",
          newItem: { src: "", alt: "", captionTitle: "", captionDetail: "" },
          fields: [IMG("src", "Screenshot"), T("alt", "Alt text"), T("captionTitle", "Caption title"), RT("captionDetail", "Caption detail")],
        },
        T("ctaLabel", "CTA label"),
        T("ctaRoute", "CTA route"),
      ],
    },
    {
      id: "quickLinks",
      key: "quickLinks",
      type: "group",
      title: "Quick links",
      fields: [
        RT("heading", "Heading"),
        RT("intro", "Intro"),
        {
          key: "items",
          label: "Link cards",
          type: "repeater",
          itemTitle: (it) => it.title || "Link",
          newItem: { title: "", desc: "", href: "", to: "", accent: "#2E7D32" },
          fields: [
            T("title", "Title"),
            RT("desc", "Description"),
            URLF("href", "External URL (href)"),
            T("to", "Internal route (to)"),
            T("accent", "Accent color"),
          ],
        },
      ],
    },
  ],

  services: [
    {
      id: "presentations",
      key: "presentations",
      type: "servicesPresentations",
      title: "Category presentation",
      desc: "Titles, programs, and requirements come from Assistance CMS. Here you only set facility images (1–3), location preview, and the visit link for each live category.",
    },
  ],

  about: [
    {
      id: "hero",
      key: "hero",
      type: "group",
      title: "About hero",
      fields: [IMG("logo", "Logo"), T("kicker", "Kicker"), RT("heading", "Heading"), RT("body", "Body")],
    },
    {
      id: "partners",
      key: "partners",
      type: "group",
      title: "Partner marquee",
      fields: [
        RT("heading", "Heading"),
        RT("subcopy", "Subcopy"),
        {
          key: "logos",
          label: "Partner logos",
          type: "repeater",
          itemTitle: (it) => it.label || "Partner",
          newItem: { src: "", label: "" },
          fields: [IMG("src", "Logo"), T("label", "Label")],
        },
      ],
    },
    {
      id: "pillars",
      key: "pillars",
      type: "repeater",
      title: "About pillars",
      itemTitle: (it) => it.title || "Pillar",
      newItem: { title: "", body: "" },
      fields: [T("title", "Title"), RT("body", "Body")],
    },
    {
      id: "channels",
      key: "channels",
      type: "group",
      title: "Official channels",
      desc: "Stackable groups of contact cards. Add, remove, and reorder freely. Entry kinds: text, phone, email, link (external), route (in-site). Quick links always stays at the bottom.",
      fields: [
        RT("heading", "Heading"),
        RT("intro", "Intro"),
        {
          key: "groups",
          label: "Channel groups",
          type: "repeater",
          itemTitle: (it) => it.title || "Group",
          pinBottom: (it) => isQuickLinksGroup(it),
          newItem: {
            title: "",
            entries: [{ kind: "text", label: "", body: "", href: "", style: "card" }],
          },
          fields: [
            T("title", "Group title"),
            {
              key: "entries",
              label: "Entries",
              type: "repeater",
              itemTitle: (it) => it.label || it.body || it.kind || "Entry",
              newItem: { kind: "text", label: "", body: "", href: "", style: "card" },
              fields: [
                SEL(
                  "kind",
                  "Kind",
                  [
                    { value: "text", label: "Text / address" },
                    { value: "phone", label: "Phone" },
                    { value: "email", label: "Email" },
                    { value: "link", label: "External link" },
                    { value: "route", label: "In-site route" },
                  ],
                  { hint: "Controls how the entry behaves on the website." }
                ),
                T("label", "Label / caption", {
                  hint: "Small caption on cards, or button text for primary/secondary styles.",
                }),
                RT("body", "Body / display text", {
                  hint: "Address, phone, email, or the main line shown on a card.",
                  rows: 2,
                }),
                URLF("href", "URL / route (optional)", {
                  hint: "Required for link/route. Also used as fallback display if body is empty.",
                }),
                SEL(
                  "style",
                  "Display style",
                  [
                    { value: "card", label: "Card" },
                    { value: "primary", label: "Primary button" },
                    { value: "secondary", label: "Secondary button" },
                  ],
                  { hint: "Buttons work best for route/link CTAs." }
                ),
              ],
            },
          ],
        },
      ],
    },
    {
      id: "closing",
      key: "closing",
      type: "group",
      title: "Closing CTA",
      fields: [RT("boldLine", "Bold line"), RT("body", "Body")],
    },
  ],
};

const PAGES = [
  { id: "home", label: "Home", hint: "Landing page" },
  { id: "services", label: "Services", hint: "Images · location · link" },
  { id: "about", label: "About", hint: "About & channels" },
  { id: "legal", label: "Legal", hint: "Terms · Privacy" },
  { id: "global", label: "Site-wide", hint: "Navbar · footer · contacts" },
];

/**
 * Migrate legacy single-badge download fields into `links[]` for the editor.
 * Publish writes the new shape; legacy keys are dropped from the draft.
 */
function normalizeHomeDownloadContent(pageContent) {
  if (!pageContent || typeof pageContent !== "object") return pageContent ?? {};
  const download = pageContent.download;
  if (!download || typeof download !== "object") return pageContent;

  const existingLinks = Array.isArray(download.links) ? download.links : [];
  const hasLinks = existingLinks.some(
    (link) =>
      String(link?.href ?? "").trim() ||
      String(link?.image ?? "").trim() ||
      String(link?.label ?? "").trim()
  );

  let links = existingLinks;
  if (!hasLinks && (download.badgeImage || download.storeHref)) {
    links = [
      {
        label: "App store",
        image: download.badgeImage || "",
        alt: download.badgeAlt || "",
        href: download.storeHref || "",
      },
    ];
  }

  const nextDownload = { ...download, links };
  delete nextDownload.badgeImage;
  delete nextDownload.badgeAlt;
  delete nextDownload.storeHref;

  return { ...pageContent, download: nextDownload };
}

const EMPTY_PRESENTATION = {
  catalogSlug: "",
  infoLink: "",
  infoLabel: "",
  locationLabel: "",
  locationAddress: "",
  lat: "",
  lng: "",
  imagesSide: "left",
  imageMain: "",
  imageSub1: "",
  imageSub2: "",
};

const PRESENTATION_FIELDS = [
  URLF("infoLink", "Visit / Facebook link"),
  T("infoLabel", "Link label"),
  T("locationLabel", "Location label"),
  RT("locationAddress", "Location address"),
  NUM("lat", "Latitude"),
  NUM("lng", "Longitude"),
  T("imagesSide", "Images side (left/right)"),
  IMG("imageMain", "Image 1"),
  IMG("imageSub1", "Image 2 (optional)"),
  IMG("imageSub2", "Image 3 (optional)"),
];

function presentationFromLegacyCategory(cat = {}) {
  return {
    ...EMPTY_PRESENTATION,
    catalogSlug: String(cat.catalogSlug ?? cat.id ?? "").trim(),
    infoLink: cat.infoLink ?? "",
    infoLabel: cat.infoLabel ?? "",
    locationLabel: cat.locationLabel ?? "",
    locationAddress: cat.locationAddress ?? "",
    lat: cat.lat ?? "",
    lng: cat.lng ?? "",
    imagesSide: cat.imagesSide || "left",
    imageMain: cat.imageMain ?? "",
    imageSub1: cat.imageSub1 ?? "",
    imageSub2: cat.imageSub2 ?? "",
  };
}

/**
 * Slim services page payload: only presentations[] keyed by catalog slug.
 * Migrates legacy categories[] / hero chrome into the new shape on load/save.
 */
function normalizeServicesPresentationsContent(pageContent) {
  if (!pageContent || typeof pageContent !== "object") return { presentations: [] };

  const fromPresentations = Array.isArray(pageContent.presentations)
    ? pageContent.presentations.map(presentationFromLegacyCategory)
    : [];
  const fromLegacy = Array.isArray(pageContent.categories)
    ? pageContent.categories.map(presentationFromLegacyCategory)
    : [];

  const bySlug = new Map();
  for (const row of [...fromLegacy, ...fromPresentations]) {
    const slug = String(row.catalogSlug ?? "").trim();
    if (!slug) continue;
    bySlug.set(slug, { ...row, catalogSlug: slug });
  }

  return { presentations: [...bySlug.values()] };
}

function mergePresentationsWithCatalog(presentations, catalogCategories) {
  const saved = new Map(
    (Array.isArray(presentations) ? presentations : [])
      .map((row) => {
        const slug = String(row?.catalogSlug ?? "").trim();
        return slug ? [slug, presentationFromLegacyCategory(row)] : null;
      })
      .filter(Boolean)
  );

  return (catalogCategories ?? []).map((cat) => {
    const slug = String(cat.slug ?? "").trim();
    const prev = saved.get(slug);
    return {
      ...(prev ?? EMPTY_PRESENTATION),
      catalogSlug: slug,
      _label: cat.assistance_name || slug,
    };
  });
}

/**
 * Official channels: stackable groups[] of entries.
 * Migrates legacy flat mayor/facebook/panteon/cta fields into groups on load/save.
 */
function isQuickLinksGroup(group) {
  if (!group || typeof group !== "object") return false;
  if (group.id === "quickLinks") return true;
  return /^quick\s*links$/i.test(String(group.title ?? "").trim());
}

function pinQuickLinksLast(groups) {
  const rest = [];
  const pinned = [];
  for (const group of groups) {
    if (isQuickLinksGroup(group)) pinned.push(group);
    else rest.push(group);
  }
  return [...rest, ...pinned];
}

function normalizeChannelGroup(group = {}) {
  const quick = isQuickLinksGroup(group);
  return {
    ...(quick ? { id: "quickLinks" } : group.id ? { id: group.id } : {}),
    title: group.title ?? "",
    entries: Array.isArray(group.entries) ? group.entries.map(channelEntry) : [],
  };
}

function channelEntry(entry = {}) {
  // Guard against a bad SQL migration shape: { eord, jsonb_build_object: {...} }
  const raw =
    entry && typeof entry.jsonb_build_object === "object" && entry.jsonb_build_object
      ? entry.jsonb_build_object
      : entry;
  const kind = ["text", "phone", "email", "link", "route"].includes(raw.kind) ? raw.kind : "text";
  const style = ["card", "primary", "secondary"].includes(raw.style) ? raw.style : "card";
  return {
    kind,
    label: raw.label ?? "",
    body: raw.body ?? "",
    href: raw.href ?? "",
    style,
  };
}

function pushEntry(entries, entry) {
  const next = channelEntry(entry);
  if (!String(next.body ?? "").trim() && !String(next.href ?? "").trim() && !String(next.label ?? "").trim()) {
      return;
  }
  entries.push(next);
}

function groupsFromLegacyChannels(ch = {}) {
  const groups = [];

  const mayorEntries = [];
  pushEntry(mayorEntries, { kind: "text", label: "Address", body: ch.mayorAddress, style: "card" });
  pushEntry(mayorEntries, { kind: "phone", label: "Landline", body: ch.mayorLandline, style: "card" });
  pushEntry(mayorEntries, { kind: "phone", label: "Cellphone", body: ch.mayorCell, style: "card" });
  pushEntry(mayorEntries, {
    kind: "email",
    label: "Email · Open in Gmail",
    body: ch.mayorEmail,
    style: "card",
  });
  if (mayorEntries.length) {
    groups.push({ title: "Office of the City Mayor", entries: mayorEntries });
  }

  const cityEntries = [];
  if (ch.facebookCityUrl) {
    pushEntry(cityEntries, {
      kind: "link",
      label: "Facebook",
      body: ch.facebookCityLabel,
      href: ch.facebookCityUrl,
      style: "card",
    });
  }
  if (ch.facebookCswdoUrl) {
    pushEntry(cityEntries, {
      kind: "link",
      label: "CSWDO",
      body: ch.facebookCswdoLabel,
      href: ch.facebookCswdoUrl,
      style: "card",
    });
  }
  if (cityEntries.length) {
    groups.push({ title: "City & programs", entries: cityEntries });
  }

  const panteonEntries = [];
  pushEntry(panteonEntries, { kind: "text", label: "Address", body: ch.panteonAddress, style: "card" });
  pushEntry(panteonEntries, { kind: "phone", label: "Smart / TNT", body: ch.panteonSmart, style: "card" });
  pushEntry(panteonEntries, { kind: "phone", label: "Globe / TM", body: ch.panteonGlobe, style: "card" });
  pushEntry(panteonEntries, { kind: "phone", label: "Landline", body: ch.panteonLandline, style: "card" });
  pushEntry(panteonEntries, {
    kind: "email",
    label: "Email · Open in Gmail",
    body: ch.panteonEmail,
    style: "card",
  });
  if (ch.panteonFacebookUrl) {
    pushEntry(panteonEntries, {
      kind: "link",
      label: "Facebook",
      body: ch.panteonFacebookLabel,
      href: ch.panteonFacebookUrl,
      style: "card",
    });
  }
  if (panteonEntries.length) {
    groups.push({ title: "Panteon / Lafuneraria de Dasmariñas", entries: panteonEntries });
  }

  const ctaEntries = [];
  if (ch.ctaServicesLabel) {
    pushEntry(ctaEntries, {
      kind: "route",
      label: ch.ctaServicesLabel,
      href: ch.ctaServicesRoute || "/services",
      style: "primary",
    });
  }
  if (ch.ctaTermsLabel) {
    pushEntry(ctaEntries, {
      kind: "route",
      label: ch.ctaTermsLabel,
      href: ch.ctaTermsRoute || "/terms",
      style: "secondary",
    });
  }
  if (ch.ctaPrivacyLabel) {
    pushEntry(ctaEntries, {
      kind: "route",
      label: ch.ctaPrivacyLabel,
      href: ch.ctaPrivacyRoute || "/privacy",
      style: "secondary",
    });
  }
  if (ch.ctaHomeLabel) {
    pushEntry(ctaEntries, {
      kind: "route",
      label: ch.ctaHomeLabel,
      href: ch.ctaHomeRoute || "/",
      style: "secondary",
    });
  }
  if (ctaEntries.length) {
    groups.push({ id: "quickLinks", title: "Quick links", entries: ctaEntries });
  }

  return groups;
}

function normalizeAboutChannelsContent(pageContent) {
  if (!pageContent || typeof pageContent !== "object") return pageContent ?? {};
  const ch = pageContent.channels;
  if (!ch || typeof ch !== "object") return pageContent;

  const hasGroups = Array.isArray(ch.groups);
  const groups = pinQuickLinksLast(
    hasGroups ? ch.groups.map(normalizeChannelGroup) : groupsFromLegacyChannels(ch)
  );

  return {
    ...pageContent,
    channels: {
      heading: ch.heading ?? "",
      intro: ch.intro ?? "",
      groups,
    },
  };
}

function normalizePageContent(page, pageContent) {
  if (page === "home") return normalizeHomeDownloadContent(pageContent);
  if (page === "services") return normalizeServicesPresentationsContent(pageContent);
  if (page === "about") return normalizeAboutChannelsContent(pageContent);
  return pageContent ?? {};
}

/* ------------------------------------------------------------------ */
/* Services presentations editor (live catalog–driven)                 */
/* ------------------------------------------------------------------ */

function ServicesPresentationsEditor({ value, onChange }) {
  const [catalogError, setCatalogError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [openSet, setOpenSet] = useState(() => new Set());
  const [labelBySlug, setLabelBySlug] = useState(() => new Map());

  const rows = useMemo(
    () => (Array.isArray(value) ? value : []).map((row) => presentationFromLegacyCategory(row)),
    [value]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCatalogLoading(true);
      setCatalogError("");
      try {
        const catalog = await fetchCmsCatalogList();
        if (cancelled) return;
        const categories = (catalog ?? [])
          .filter((cat) => cat?.active !== false && String(cat?.slug ?? "").trim())
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const labels = new Map(
          categories.map((cat) => [String(cat.slug).trim(), cat.assistance_name || cat.slug])
        );
        setLabelBySlug(labels);
        const merged = mergePresentationsWithCatalog(value, categories).map((row) => {
          const { _label, ...rest } = row;
          return presentationFromLegacyCategory(rest);
        });
        const prevKey = JSON.stringify(
          (Array.isArray(value) ? value : []).map((row) => presentationFromLegacyCategory(row))
        );
        const nextKey = JSON.stringify(merged);
        if (prevKey !== nextKey) onChange(merged);
      } catch (ex) {
        if (!cancelled) {
          setCatalogError(ex?.message || "Failed to load live assistance categories.");
        }
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Sync once when the editor mounts for the Services tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleOpen = (idx) => {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const updateRow = (idx, nextRow) => {
    const slug = rows[idx]?.catalogSlug;
    const cleaned = presentationFromLegacyCategory({ ...nextRow, catalogSlug: slug });
    onChange(rows.map((row, i) => (i === idx ? cleaned : row)));
  };

  return (
    <div className="space-y-3">
      {catalogLoading ? (
        <p className="text-xs text-ocean-600">Loading live assistance categories…</p>
      ) : null}
      {catalogError ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {catalogError} Showing saved presentation rows only.
        </p>
      ) : null}
      {!catalogLoading && rows.length === 0 ? (
        <p className="rounded-lg border border-ocean-200 bg-ocean-50/60 px-3 py-2 text-xs text-ocean-700">
          No active assistance categories yet. Add them in Assistance CMS — they will appear here
          automatically.
        </p>
      ) : null}
      <div className="space-y-2">
        {rows.map((item, idx) => {
          const open = openSet.has(idx);
          const label = labelBySlug.get(item.catalogSlug) || item.catalogSlug || "Category";
          return (
            <div key={item.catalogSlug || idx} className="overflow-hidden rounded-xl border border-ocean-200 bg-white">
              <div className="flex items-center gap-2 bg-ocean-50/60 px-3 py-2">
          <button
            type="button"
                  onClick={() => toggleOpen(idx)}
                  className="flex flex-1 items-center gap-2 text-left text-sm font-semibold text-ocean-900"
                >
                  <span className={`transition ${open ? "rotate-90" : ""}`}>▸</span>
                  <span className="truncate">{label}</span>
                  <span className="rounded bg-ocean-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ocean-600">
                    {item.catalogSlug}
                  </span>
          </button>
        </div>
              {open ? (
                <div className="border-t border-ocean-100 p-3">
                  <GroupFields
                    fields={PRESENTATION_FIELDS}
                    value={item}
                    onChange={(v) => updateRow(idx, v)}
            />
          </div>
              ) : null}
                  </div>
          );
        })}
                </div>
            </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section card                                                        */
/* ------------------------------------------------------------------ */

function SectionCard({ section, value, onChange }) {
  return (
        <article className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(10,70,111,0.7)]">
      <header className="mb-4">
        <h3 className="text-base font-semibold tracking-tight text-ocean-950">{section.title}</h3>
        {section.desc ? <p className="mt-0.5 text-xs text-ocean-600">{section.desc}</p> : null}
      </header>
      {section.type === "servicesPresentations" ? (
        <ServicesPresentationsEditor value={value} onChange={onChange} />
      ) : section.type === "repeater" ? (
        <Repeater
          value={value}
          fields={section.fields}
          newItem={section.newItem}
          itemTitle={section.itemTitle}
          defaultOpen={section.defaultOpen}
          pinBottom={section.pinBottom}
          onChange={onChange}
                />
              ) : (
        <GroupFields fields={section.fields} value={value} onChange={onChange} />
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function Web() {
  const [activePage, setActivePage] = useState("home");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // { type: "ok"|"error", text }

  // page -> content loaded from the DB (the only source of truth)
  const [content, setContent] = useState({});
  // page -> JSON snapshot of last persisted content
  const savedRef = useRef({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const { data, error } = await supabase.from("web_content").select("page, content");
    if (error) {
      setLoadError(error.message || "Failed to load web content.");
      setLoading(false);
      return;
    }
    const stored = new Map((data ?? []).map((row) => [row.page, row.content]));
    const next = {};
    const snapshot = {};
    for (const { id: page } of PAGES) {
      const value = normalizePageContent(page, stored.get(page) ?? {});
      next[page] = value;
      snapshot[page] = JSON.stringify(value);
    }
    setContent(next);
    savedRef.current = snapshot;
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!status) return undefined;
    const timer = window.setTimeout(() => setStatus(null), 3200);
    return () => window.clearTimeout(timer);
  }, [status]);

  const setSectionValue = useCallback(
    (page, key, value) => {
      setContent((prev) => ({ ...prev, [page]: { ...prev[page], [key]: value } }));
    },
    []
  );

  const pageDirty = useMemo(() => {
    const result = {};
    for (const { id: page } of PAGES) {
      result[page] = content[page] ? JSON.stringify(content[page]) !== savedRef.current[page] : false;
    }
    return result;
  }, [content]);

  const savePage = useCallback(
    async (page) => {
      setSaving(true);
      setStatus(null);
      const payload = normalizePageContent(page, content[page] ?? {});
      const { error } = await supabase
        .from("web_content")
        .upsert({ page, content: payload }, { onConflict: "page" });
      setSaving(false);
      if (error) {
        setStatus({ type: "error", text: error.message || "Save failed." });
      return;
    }
      savedRef.current = { ...savedRef.current, [page]: JSON.stringify(payload) };
      // force dirty recompute
      setContent((prev) => ({ ...prev, [page]: payload }));
      setStatus({ type: "ok", text: `${PAGES.find((p) => p.id === page)?.label ?? "Page"} content published.` });
    },
    [content]
  );

  const discardChanges = useCallback((page) => {
    setContent((prev) => ({ ...prev, [page]: JSON.parse(savedRef.current[page] ?? "{}") }));
  }, []);

  const sections = WEB_SCHEMA[activePage] ?? [];
  const activeContent = content[activePage] ?? {};
  const dirty = pageDirty[activePage];

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(10,70,111,0.7)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-600">Content Management</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-ocean-950">Web Content</h2>
            <p className="mt-1 max-w-2xl text-xs text-ocean-600">
              Edit what appears on the public Apoyo website. Changes are saved when you publish each page.
            </p>
            </div>
          <div className="flex items-center gap-2">
            {status ? (
              <span
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  status.type === "ok"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {status.text}
            </span>
            ) : null}
            </div>
        </div>

        {/* Page tabs */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {PAGES.map((page) => {
            const isActive = page.id === activePage;
            return (
                <button
                key={page.id}
                  type="button"
                onClick={() => setActivePage(page.id)}
                className={`group inline-flex flex-col rounded-xl border px-3.5 py-2 text-left transition ${
                  isActive
                    ? "border-ocean-500 bg-ocean-600 text-white shadow-sm"
                    : "border-ocean-200 bg-white text-ocean-800 hover:border-ocean-300 hover:bg-ocean-50"
                }`}
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {page.label}
                  {pageDirty[page.id] ? (
                    <span className={`size-1.5 rounded-full ${isActive ? "bg-white" : "bg-amber-500"}`} title="Unsaved changes" />
                  ) : null}
                </span>
                <span className={`text-[11px] ${isActive ? "text-white/80" : "text-ocean-500"}`}>{page.hint}</span>
                </button>
            );
          })}
            </div>
      </section>

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-ocean-200 bg-white p-5">
              <div className="h-4 w-40 rounded bg-ocean-100" />
              <div className="mt-4 space-y-2">
                <div className="h-10 rounded bg-ocean-50" />
                <div className="h-10 rounded bg-ocean-50" />
            </div>
          </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          <p className="font-semibold">Could not load web content.</p>
          <p className="mt-1">{loadError}</p>
            <button
              type="button"
            onClick={load}
            className="mt-3 inline-flex h-9 items-center rounded-lg border border-rose-300 bg-white px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
            >
            Retry
            </button>
          </div>
      ) : (
        <>
          <div className="space-y-4">
            {sections.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                value={activeContent[section.key]}
                onChange={(v) => setSectionValue(activePage, section.key, v)}
              />
            ))}
          </div>

          {/* Sticky save bar */}
          <div className="sticky bottom-4 z-10">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-ocean-200 bg-white/95 p-3 shadow-[0_18px_40px_-24px_rgba(10,70,111,0.9)] backdrop-blur">
              <p className="pl-1 text-xs text-ocean-600">
                {dirty ? (
                  <span className="font-semibold text-amber-600">Unsaved changes on this page.</span>
                ) : (
                  <span>All changes saved.</span>
                )}
              </p>
              <div className="flex items-center gap-2">
            <button
              type="button"
                  disabled={!dirty || saving}
                  onClick={() => discardChanges(activePage)}
                  className="inline-flex h-10 items-center rounded-lg border border-ocean-200 bg-white px-4 text-sm font-semibold text-ocean-700 transition hover:border-ocean-300 hover:bg-ocean-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Discard changes
                </button>
                <button
                  type="button"
                  disabled={saving || !dirty}
                  onClick={() => savePage(activePage)}
                  className="inline-flex h-10 items-center rounded-lg bg-ocean-600 px-5 text-sm font-semibold text-white transition hover:bg-ocean-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Publishing…" : "Publish changes"}
            </button>
          </div>
            </div>
          </div>
        </>
      )}

      {saving ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4"
          role="alertdialog"
          aria-busy="true"
          aria-live="assertive"
          aria-label="Publishing"
        >
          <div className="w-full max-w-xs rounded-2xl border border-ocean-200 bg-white px-6 py-8 text-center shadow-xl">
            <div
              className="mx-auto size-9 animate-spin rounded-full border-2 border-ocean-200 border-t-ocean-600"
              aria-hidden
            />
            <p className="mt-4 text-sm font-semibold text-ocean-950">Publishing…</p>
            <p className="mt-1 text-xs text-ocean-600">Please wait a moment.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
