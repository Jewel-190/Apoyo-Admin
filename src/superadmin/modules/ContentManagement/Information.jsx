/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from "react";

const editorFonts = [
  { label: "Inter", value: "Inter, ui-sans-serif, system-ui, sans-serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times", value: '"Times New Roman", serif' },
  { label: "Courier", value: '"Courier New", monospace' },
];

const defaultEditorFont = editorFonts[0].value;

const isHtmlRichText = (text = "") => /<\/?[a-z][\s\S]*>/i.test(text);

const escapeHtml = (text = "") =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const markdownToHtml = (text = "") => {
  const escaped = escapeHtml(text);
  return (
    escaped
      // bold / italic / strike / code
      .replaceAll(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replaceAll(/_(.+?)_/g, "<em>$1</em>")
      .replaceAll(/~~(.+?)~~/g, "<del>$1</del>")
      .replaceAll(/`(.+?)`/g, "<code>$1</code>")
      // links
      .replaceAll(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
      // newlines
      .replaceAll(/\n/g, "<br />")
  );
};

const normalizeRichTextHtml = (text = "") => {
  if (!text) return "";
  if (isHtmlRichText(text)) return text;
  return markdownToHtml(text);
};

const RichTextPreview = ({ text, fallback, fontFamily, className = "" }) => {
  const normalized = normalizeRichTextHtml(text);
  if (!normalized) return <p className={className} style={{ fontFamily }}>{fallback}</p>;
  return (
    <p
      className={className}
      style={{ fontFamily }}
      dangerouslySetInnerHTML={{ __html: normalized }}
    />
  );
};

function applyWrap(textarea, before, after = before) {
  if (!textarea) return;
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const value = textarea.value ?? "";
  const selected = value.slice(start, end);
  const next = value.slice(0, start) + before + selected + after + value.slice(end);
  const cursor = start + before.length + selected.length + after.length;
  textarea.value = next;
  textarea.focus();
  textarea.setSelectionRange(cursor, cursor);
}

function applyLinePrefix(textarea, prefix) {
  if (!textarea) return;
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const value = textarea.value ?? "";
  const before = value.slice(0, start);
  const selection = value.slice(start, end);
  const after = value.slice(end);
  const selectedLines = (selection || "").split("\n");
  const nextSelection = selectedLines.map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`)).join("\n");
  const next = before + nextSelection + after;
  textarea.value = next;
  textarea.focus();
  textarea.setSelectionRange(start, start + nextSelection.length);
}

function applyChecklist(textarea) {
  applyLinePrefix(textarea, "- [ ] ");
}

function applyNumberedList(textarea) {
  if (!textarea) return;
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const value = textarea.value ?? "";
  const before = value.slice(0, start);
  const selection = value.slice(start, end);
  const after = value.slice(end);
  const lines = (selection || "").split("\n");
  const nextSelection = lines
    .map((line, idx) => {
      const pref = `${idx + 1}. `;
      return line.startsWith(pref) ? line : `${pref}${line}`;
    })
    .join("\n");
  const next = before + nextSelection + after;
  textarea.value = next;
  textarea.focus();
  textarea.setSelectionRange(start, start + nextSelection.length);
}

function RichTextField({ label, value, onChange, fontFamily, onFontChange, placeholder, rows = 3, ariaLabelFont }) {
  const textareaRef = useRef(null);
  return (
    <div className="overflow-hidden rounded-xl border border-ocean-200 bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-ocean-100 bg-white px-2 py-2 shadow-sm">
        <select
          className="h-9 rounded-lg border border-ocean-200 bg-ocean-50 px-2 text-xs font-semibold text-ocean-800 outline-none focus:border-ocean-400"
          aria-label={ariaLabelFont ?? `${label} font family`}
          value={fontFamily}
          onChange={(e) => onFontChange?.(e.target.value)}
        >
          {editorFonts.map((font) => (
            <option key={font.value} value={font.value}>
              {font.label}
            </option>
          ))}
        </select>
        <span className="mx-1 h-7 w-px bg-ocean-100" />
        <button
          type="button"
          title="Bold"
          className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-semibold text-slate-700 transition hover:bg-ocean-50 hover:text-ocean-900"
          onClick={() => applyWrap(textareaRef.current, "**", "**")}
        >
          B
        </button>
        <button
          type="button"
          title="Italic"
          className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-semibold text-slate-700 transition hover:bg-ocean-50 hover:text-ocean-900"
          onClick={() => applyWrap(textareaRef.current, "_", "_")}
        >
          I
        </button>
        <button
          type="button"
          title="Strikethrough"
          className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-semibold text-slate-700 transition hover:bg-ocean-50 hover:text-ocean-900"
          onClick={() => applyWrap(textareaRef.current, "~~", "~~")}
        >
          S
        </button>
        <button
          type="button"
          title="Underline"
          className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-semibold text-slate-700 transition hover:bg-ocean-50 hover:text-ocean-900"
          onClick={() => applyWrap(textareaRef.current, "<u>", "</u>")}
        >
          U
        </button>
        <button
          type="button"
          title="Link"
          className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-semibold text-slate-700 transition hover:bg-ocean-50 hover:text-ocean-900"
          onClick={() => applyWrap(textareaRef.current, "[", "](https://)")}
        >
          Link
        </button>
        <button
          type="button"
          title="Code"
          className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-semibold text-slate-700 transition hover:bg-ocean-50 hover:text-ocean-900"
          onClick={() => applyWrap(textareaRef.current, "`", "`")}
        >
          &lt;/&gt;
        </button>
        <button
          type="button"
          title="Bullet list"
          className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-semibold text-slate-700 transition hover:bg-ocean-50 hover:text-ocean-900"
          onClick={() => applyLinePrefix(textareaRef.current, "- ")}
        >
          List
        </button>
        <button
          type="button"
          title="Numbered list"
          className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-semibold text-slate-700 transition hover:bg-ocean-50 hover:text-ocean-900"
          onClick={() => applyNumberedList(textareaRef.current)}
        >
          1.
        </button>
        <button
          type="button"
          title="Checklist"
          className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-semibold text-slate-700 transition hover:bg-ocean-50 hover:text-ocean-900"
          onClick={() => applyChecklist(textareaRef.current)}
        >
          Check
        </button>
      </div>

      <div className="px-3 py-2">
        <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-ocean-600">
          {label}
        </label>
        <textarea
          ref={textareaRef}
          rows={rows}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          className="mt-2 w-full resize-none rounded-lg border border-ocean-200 bg-ocean-50/60 px-3 py-2 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/80 focus:border-ocean-400"
          style={{ fontFamily }}
        />
      </div>
    </div>
  );
}

const BellIcon = () => (
  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
    <path d="M9 17a3 3 0 0 0 6 0" />
  </svg>
);

export function InformationPage() {
  const [galleryItems, setGalleryItems] = useState([
    { id: "community", title: "Community Reach", image: "" },
    { id: "programs", title: "Programs in Motion", image: "" },
    { id: "medical", title: "Medical Lane", image: "" },
    { id: "windows", title: "Service Windows", image: "" },
  ]);
  const [activeGalleryId, setActiveGalleryId] = useState("community");
  const [headline, setHeadline] = useState("Community reach");
  const [subHeadline, setSubHeadline] = useState(
    "Outreach where neighbors already gather - organized lines and clear guidance."
  );
  const [headlineFontFamily, setHeadlineFontFamily] = useState(defaultEditorFont);
  const [subHeadlineFontFamily, setSubHeadlineFontFamily] = useState(defaultEditorFont);
  const [privacyPolicy, setPrivacyPolicy] = useState("");
  const [terms, setTerms] = useState("");
  const [slideProgress, setSlideProgress] = useState(0);
  const [progressCycle, setProgressCycle] = useState(0);

  const activeGalleryItem =
    galleryItems.find((item) => item.id === activeGalleryId) ?? galleryItems[0];
  const galleryWithImages = galleryItems.filter((item) => item.image);

  useEffect(() => {
    if (galleryWithImages.length < 2) return;
    if (!galleryWithImages.some((item) => item.id === activeGalleryId)) {
      setActiveGalleryId(galleryWithImages[0].id);
      return;
    }

    const timer = window.setInterval(() => {
      setActiveGalleryId((current) => {
        const currentIndex = galleryWithImages.findIndex((item) => item.id === current);
        if (currentIndex === -1) return galleryWithImages[0].id;
        return galleryWithImages[(currentIndex + 1) % galleryWithImages.length].id;
      });
    }, 3200);

    return () => window.clearInterval(timer);
  }, [galleryWithImages, activeGalleryId]);

  useEffect(() => {
    if (galleryWithImages.length < 2) {
      setSlideProgress(0);
      return;
    }
    setProgressCycle((prev) => prev + 1);
    setSlideProgress(0);
    const frame = window.requestAnimationFrame(() => setSlideProgress(100));
    return () => window.cancelAnimationFrame(frame);
  }, [activeGalleryId, galleryWithImages.length]);

  const handleGalleryImageUpload = (id, event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setGalleryItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, image: String(reader.result) } : item))
      );
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(10,70,111,0.7)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-xl">
            <input
              type="text"
              placeholder="Search web content settings..."
              className="h-11 w-full rounded-xl border border-ocean-200 bg-ocean-50/50 pl-10 pr-3 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/80 focus:border-ocean-400"
            />
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ocean-500">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="m21 21-4.3-4.3" />
                <circle cx="11" cy="11" r="7" />
              </svg>
            </span>
          </div>
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center self-end rounded-xl border border-ocean-200 bg-white text-ocean-800 shadow-sm transition hover:border-ocean-300 hover:bg-ocean-50 md:self-auto"
            aria-label="Notifications"
          >
            <BellIcon />
          </button>
        </div>
      </section>

      <section className="grid items-start gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="self-start rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(10,70,111,0.7)]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-600">Web Content</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-ocean-950">Homepage Media Settings</h2>
          </div>

          <div className="mt-4 space-y-3">
            <RichTextField
              label="Hero Headline"
              rows={2}
              placeholder="Type hero headline..."
              value={headline}
              onChange={setHeadline}
              fontFamily={headlineFontFamily}
              onFontChange={setHeadlineFontFamily}
              ariaLabelFont="Hero Headline font family"
            />
            <RichTextField
              label="Hero Description"
              rows={3}
              placeholder="Type hero description..."
              value={subHeadline}
              onChange={setSubHeadline}
              fontFamily={subHeadlineFontFamily}
              onFontChange={setSubHeadlineFontFamily}
              ariaLabelFont="Hero Description font family"
            />
          </div>

          <div className="mt-5">
            <p className="text-sm font-semibold text-ocean-900">Update Gallery Photos</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {galleryItems.map((item) => (
                <div key={item.id} className="rounded-xl border border-ocean-200 bg-ocean-50/60 p-3">
                  <div className="grid h-24 place-items-center overflow-hidden rounded-lg border border-ocean-200 bg-white">
                    {item.image ? (
                      <img src={item.image} alt={item.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full bg-ocean-100/60" />
                    )}
                  </div>
                  <label className="mt-2 inline-flex h-9 cursor-pointer items-center rounded-lg border border-ocean-200 bg-white px-3 text-xs font-semibold text-ocean-700 transition hover:border-ocean-300 hover:bg-ocean-50">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => handleGalleryImageUpload(item.id, event)}
                    />
                    Upload Image
                  </label>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(10,70,111,0.7)]">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-600">Mini Preview</p>
          <div className="mt-3 rounded-[24px] border border-ocean-300/60 bg-gradient-to-r from-[#082f4b] via-[#0a2d3a] to-[#065f46] p-3">
            <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-white/20">
              <div
                key={`progress-${progressCycle}`}
                className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-200 transition-[width] duration-[3200ms] ease-linear"
                style={{ width: `${slideProgress}%` }}
              />
            </div>
            <div className="overflow-hidden rounded-xl border border-white/20">
              {activeGalleryItem?.image ? (
                <img
                  src={activeGalleryItem.image}
                  alt={activeGalleryItem?.title || "Preview image"}
                  className="h-36 w-full object-cover"
                />
              ) : (
                <div className="h-36 w-full bg-white/10" />
              )}
            </div>
            <div className="mt-2 rounded-xl border border-white/10 bg-black/35 p-3">
              <RichTextPreview
                text={headline}
                fallback="Hero headline preview"
                fontFamily={headlineFontFamily}
                className="text-sm font-semibold text-white"
              />
              <RichTextPreview
                text={subHeadline}
                fallback="Hero description preview"
                fontFamily={subHeadlineFontFamily}
                className="mt-1 text-xs text-white/85"
              />
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {galleryItems.map((item) => (
                <button
                  key={`mini-${item.id}`}
                  type="button"
                  onClick={() => setActiveGalleryId(item.id)}
                  className={`overflow-hidden rounded-md border ${item.id === activeGalleryId ? "border-emerald-300" : "border-white/25"}`}
                >
                  {item.image ? <img src={item.image} alt={item.title} className="h-12 w-full object-cover" /> : <div className="h-12 w-full bg-white/10" />}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-ocean-200 bg-ocean-50/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ocean-600">Gallery Info</p>
            <p className="mt-1 text-xs leading-relaxed text-ocean-700">
              Uploaded images rotate automatically in this preview. You can still click thumbnails to jump to a specific slide.
            </p>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(10,70,111,0.7)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ocean-900">Privacy and Policy</p>
              <p className="mt-1 text-xs text-ocean-600">Update website privacy content shown to public users.</p>
            </div>
            <span className="rounded-md border border-ocean-200 bg-ocean-50 px-2 py-1 text-[11px] font-semibold text-ocean-700">
              {privacyPolicy.length} chars
            </span>
          </div>
          <textarea
            rows={7}
            value={privacyPolicy}
            onChange={(event) => setPrivacyPolicy(event.target.value)}
            placeholder="Type privacy policy content..."
            className="mt-3 w-full resize-none rounded-xl border border-ocean-200 bg-ocean-50/60 px-4 py-3 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/80 focus:border-ocean-400"
          />
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-lg bg-ocean-600 px-3 text-xs font-semibold text-white transition hover:bg-ocean-700"
            >
              Save Privacy
            </button>
          </div>
        </article>

        <article className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(10,70,111,0.7)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ocean-900">Terms and Condition</p>
              <p className="mt-1 text-xs text-ocean-600">Maintain service rules and legal text for website visitors.</p>
            </div>
            <span className="rounded-md border border-ocean-200 bg-ocean-50 px-2 py-1 text-[11px] font-semibold text-ocean-700">
              {terms.length} chars
            </span>
          </div>
          <textarea
            rows={7}
            value={terms}
            onChange={(event) => setTerms(event.target.value)}
            placeholder="Type terms and conditions..."
            className="mt-3 w-full resize-none rounded-xl border border-ocean-200 bg-ocean-50/60 px-4 py-3 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/80 focus:border-ocean-400"
          />
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-lg bg-ocean-600 px-3 text-xs font-semibold text-white transition hover:bg-ocean-700"
            >
              Save Terms
            </button>
          </div>
        </article>
      </section>
    </div>
  );
}

