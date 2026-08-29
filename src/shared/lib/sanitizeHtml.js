/**
 * Strip XSS vectors from CMS HTML while keeping layout/classes intact.
 * Removes script/iframe/form tags, event handlers, and javascript:/data: URLs.
 */
const BLOCKED_TAGS = new Set([
  "SCRIPT",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "LINK",
  "META",
  "STYLE",
  "FORM",
  "INPUT",
  "TEXTAREA",
  "BUTTON",
  "BASE",
  "SVG",
  "MATH",
]);

function isUnsafeUrl(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return false;
  if (/^\s*(javascript|vbscript|data):/i.test(trimmed)) {
    return !/^\s*data:image\//i.test(trimmed);
  }
  return false;
}

export function sanitizeCmsHtml(dirty) {
  if (typeof dirty !== "string" || !dirty) return "";
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return dirty.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  }

  const template = document.createElement("template");
  template.innerHTML = dirty;

  template.content
    .querySelectorAll([...BLOCKED_TAGS].join(",").toLowerCase())
    .forEach((node) => node.remove());

  template.content.querySelectorAll("*").forEach((el) => {
    [...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc" || name === "formaction") {
        el.removeAttribute(attr.name);
        return;
      }
      if (
        (name === "href" || name === "src" || name === "xlink:href") &&
        isUnsafeUrl(attr.value)
      ) {
        el.removeAttribute(attr.name);
      }
    });
  });

  return template.innerHTML;
}
