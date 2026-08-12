import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Minus, Plus, X } from "lucide-react";
import { isPdfAttachment } from "../../shared/lib/requestAttachments";

/** Zoom relative to Fit (viewport contain). Even steps — avoids the old width% jump. */
export const DOCUMENT_ZOOM_LEVELS = [50, 75, 100, 125, 150, 200];
export const DOCUMENT_FIT_ZOOM = 100;

export function stepDocumentZoom(current, direction) {
  const levels = DOCUMENT_ZOOM_LEVELS;
  const currentIndex = levels.indexOf(Number(current));
  const safeIndex =
    currentIndex >= 0 ? currentIndex : levels.indexOf(DOCUMENT_FIT_ZOOM);
  const nextIndex = Math.min(
    levels.length - 1,
    Math.max(0, safeIndex + (direction > 0 ? 1 : -1))
  );
  return levels[nextIndex];
}

function useElementSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const update = () => {
      setSize({
        width: node.clientWidth,
        height: node.clientHeight,
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

/**
 * Renders an image at Fit × (zoom/100).
 * Fit = contain inside the viewport. Zoom steps are multipliers of that fitted size.
 */
function FitRelativeZoomImage({ src, alt, zoomPercent }) {
  const viewportRef = useRef(null);
  const viewport = useElementSize(viewportRef);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setNatural({ width: 0, height: 0 });
    setLoadError(false);

    if (!src) {
      return undefined;
    }

    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      setNatural({
        width: image.naturalWidth || 0,
        height: image.naturalHeight || 0,
      });
    };
    image.onerror = () => {
      setLoadError(true);
    };
    image.src = src;

    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [src]);

  const padding = 48;
  const availW = Math.max(0, viewport.width - padding);
  const availH = Math.max(0, viewport.height - padding);

  const fitScale =
    natural.width > 0 && natural.height > 0 && availW > 0 && availH > 0
      ? Math.min(availW / natural.width, availH / natural.height)
      : 0;

  const scale = fitScale * (Number(zoomPercent) || DOCUMENT_FIT_ZOOM) / 100;
  const displayW = natural.width * scale;
  const displayH = natural.height * scale;

  const canvasW = Math.max(viewport.width, Math.ceil(displayW + padding));
  const canvasH = Math.max(viewport.height, Math.ceil(displayH + padding));
  const left = displayW > 0 ? Math.max(padding / 2, (canvasW - displayW) / 2) : padding / 2;
  const top = displayH > 0 ? Math.max(padding / 2, (canvasH - displayH) / 2) : padding / 2;

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-white/70">
        Image preview is unavailable.
      </div>
    );
  }

  return (
    <div ref={viewportRef} className="absolute inset-0 overflow-auto">
      {displayW > 0 && displayH > 0 ? (
        <div className="relative" style={{ width: canvasW, height: canvasH }}>
          <img
            src={src}
            alt={alt}
            draggable={false}
            style={{
              position: "absolute",
              left,
              top,
              width: displayW,
              height: displayH,
            }}
            className="block select-none"
          />
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-white/70">
          Loading image...
        </div>
      )}
    </div>
  );
}

/**
 * Shared pipeline document lightbox (PDF iframe or fit-relative zoom for images).
 */
export default function DocumentImageLightbox({ doc, onClose }) {
  const [zoom, setZoom] = useState(DOCUMENT_FIT_ZOOM);
  const isPdf = isPdfAttachment(doc);

  useEffect(() => {
    setZoom(DOCUMENT_FIT_ZOOM);
  }, [doc?.id, doc?.imageUrl]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom((previous) => stepDocumentZoom(previous, 1));
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setZoom((previous) => stepDocumentZoom(previous, -1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleZoomSelect = useCallback((event) => {
    const next = Number(event.target.value);
    if (DOCUMENT_ZOOM_LEVELS.includes(next)) {
      setZoom(next);
    }
  }, []);

  if (!doc?.imageUrl) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-1 sm:p-2"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={doc.label || "Document preview"}
    >
      <div
        className="relative h-[100dvh] max-h-[100dvh] w-full max-w-[100vw] rounded-xl border border-white/20 bg-black/50 sm:h-[98vh] sm:max-h-[98vh] sm:w-[99vw]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="absolute left-2 right-12 top-2 z-10 max-w-full rounded-lg border border-white/20 bg-black/55 px-3 py-2 sm:left-4 sm:right-auto sm:top-4 sm:max-w-[min(70vw,28rem)]">
          <p className="truncate text-sm font-semibold text-white">
            {doc.label || "Document Preview"}
          </p>
          <p className="mt-0.5 truncate text-xs text-white/80">
            {doc.fileName || "Unknown file name"}
          </p>
        </div>

        {!isPdf ? (
          <div className="absolute left-2 top-20 z-10 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-lg border border-white/20 bg-black/55 px-2 py-1.5 sm:left-4">
            <button
              type="button"
              onClick={() => setZoom((previous) => stepDocumentZoom(previous, -1))}
              className="rounded p-1 text-white hover:bg-white/10 disabled:opacity-40"
              aria-label="Zoom out"
              disabled={zoom <= DOCUMENT_ZOOM_LEVELS[0]}
            >
              <Minus className="h-4 w-4" />
            </button>
            <select
              value={zoom}
              onChange={handleZoomSelect}
              className="rounded border border-white/30 bg-transparent px-2 py-1 text-sm text-white outline-none"
              aria-label="Select zoom level"
            >
              {DOCUMENT_ZOOM_LEVELS.map((level) => (
                <option key={level} value={level} className="text-black">
                  {level === DOCUMENT_FIT_ZOOM ? "Fit" : `${level}%`}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setZoom((previous) => stepDocumentZoom(previous, 1))}
              className="rounded p-1 text-white hover:bg-white/10 disabled:opacity-40"
              aria-label="Zoom in"
              disabled={zoom >= DOCUMENT_ZOOM_LEVELS[DOCUMENT_ZOOM_LEVELS.length - 1]}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="absolute left-2 top-20 z-10 inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-black/55 px-2.5 py-1.5 text-[11px] font-semibold text-white sm:left-4">
            <FileText className="h-3.5 w-3.5" />
            PDF Preview
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 z-20 rounded-full p-2 text-white hover:bg-white/10 sm:right-4 sm:top-4"
          aria-label="Close document preview"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="relative h-full w-full overflow-hidden pt-16">
          {isPdf ? (
            <div className="absolute inset-0 px-4 pb-4 pt-4">
              <iframe
                src={`${doc.imageUrl}#toolbar=1&navpanes=0`}
                title={doc.label || doc.fileName || "PDF Document"}
                className="h-full w-full rounded-lg border border-white/20 bg-white"
              />
            </div>
          ) : (
            <FitRelativeZoomImage
              src={doc.imageUrl}
              alt={doc.label || doc.fileName || "Document"}
              zoomPercent={zoom}
            />
          )}
        </div>
      </div>
    </div>
  );
}
