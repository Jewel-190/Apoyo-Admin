import { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { isPdfAttachment } from "../../shared/lib/requestAttachments";
import { getAdminDocumentResultBadgeStyle } from "../../shared/lib/adminLineStatusStyles";
import DocumentImageLightbox from "./DocumentImageLightbox";

function ThumbnailMedia({ doc }) {
  const [failed, setFailed] = useState(false);
  const isPdf = isPdfAttachment(doc);

  useEffect(() => {
    setFailed(false);
  }, [doc?.id, doc?.imageUrl]);

  if (!doc?.imageUrl || failed || isPdf) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-gray-50 to-gray-100 text-gray-400">
        <FileText className="h-7 w-7" strokeWidth={1.75} />
        <span className="text-[10px] font-semibold uppercase tracking-wide">
          {isPdf ? "PDF" : "File"}
        </span>
      </div>
    );
  }

  return (
    <img
      src={doc.imageUrl}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}

function documentKey(doc, index = 0) {
  return String(doc?.id || doc?.objectPath || `${doc?.label || "doc"}-${index}`);
}

/**
 * CMS-flexible submitted-document thumbnails (2-col by default).
 * Labels/order come from mapped attachment catalog data.
 */
export default function SubmittedDocumentsThumbnails({
  documents = [],
  title = "Submitted documents",
  emptyMessage = "No submitted documents found for this application.",
  columns = 2,
}) {
  const [activeKey, setActiveKey] = useState(null);

  const documentsList = useMemo(
    () => (Array.isArray(documents) ? documents.filter(Boolean) : []),
    [documents]
  );

  const activeDoc = useMemo(
    () =>
      documentsList.find((doc, index) => documentKey(doc, index) === activeKey) ||
      null,
    [documentsList, activeKey]
  );

  const gridClass =
    columns <= 1
      ? "grid-cols-1"
      : columns === 3
        ? "grid-cols-2 sm:grid-cols-3"
        : "grid-cols-2";

  return (
    <>
      <div className="mx-3 mb-4 min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-3 shadow-sm sm:mx-4">
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-800">
            {title}
          </h3>
          <span className="text-[11px] font-medium text-gray-400">
            {documentsList.length} file{documentsList.length === 1 ? "" : "s"}
          </span>
        </div>

        {documentsList.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-6 text-center text-xs text-gray-400">
            {emptyMessage}
          </p>
        ) : (
          <div className={`grid ${gridClass} gap-2.5`}>
            {documentsList.map((doc, index) => {
              const resultStyle = getAdminDocumentResultBadgeStyle(
                doc.result || "Pending"
              );
              const key = documentKey(doc, index);

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveKey(key)}
                  className="group min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white text-left shadow-sm transition hover:border-[color-mix(in_srgb,var(--apoyo-secondary)_45%,transparent)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--apoyo-secondary)]"
                  aria-label={`View ${doc.label || doc.fileName || "document"}`}
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                    <ThumbnailMedia doc={doc} />
                    <div className="pointer-events-none absolute inset-0 bg-black/0 transition group-hover:bg-black/10" />
                    <span
                      className="absolute left-1.5 top-1.5 max-w-[calc(100%-0.75rem)] truncate rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={resultStyle}
                    >
                      {doc.result || "Pending"}
                    </span>
                  </div>
                  <div className="min-w-0 border-t border-gray-100 px-2 py-1.5">
                    <p className="truncate text-[11px] font-semibold text-gray-800">
                      {doc.label || `Document ${index + 1}`}
                    </p>
                    {doc.fileName ? (
                      <p className="truncate text-[10px] text-gray-400">{doc.fileName}</p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {activeDoc ? (
        <DocumentImageLightbox doc={activeDoc} onClose={() => setActiveKey(null)} />
      ) : null}
    </>
  );
}
