import { supabase } from "./supabaseClient";
import {
  attachmentHierarchyRank,
  normalizeAttachmentFieldKey,
  resolveAttachmentLabelFromCatalog,
} from "./attachmentCatalog";
import { normalizeAttachmentResult } from "./requestData";
import { getFirstValue } from "./requestReviewDisplay";

export const ATTACHMENT_BUCKET = "request-documents";

export const ACTION_REASONS = [
  "Blurry",
  "Tampered/Photoshopped",
  "Expired",
  "Name Mismatch",
  "Wrong document",
];

function knownFieldKeysFromCatalog(catalog) {
  return new Set(Object.keys(catalog?.globalLabels ?? {}));
}

export function normalizeReason(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return ACTION_REASONS.includes(trimmed) ? trimmed : "";
}

export function composeReason(reasonForAction, additionalReason) {
  const parts = [reasonForAction, additionalReason]
    .filter((value) => typeof value === "string" && value.trim() !== "")
    .map((value) => value.trim());
  return parts.join(" - ");
}

export function normalizeAttachmentObjectPath(pathValue) {
  if (typeof pathValue !== "string") {
    return "";
  }

  let normalized = pathValue.trim();
  if (!normalized) {
    return "";
  }

  normalized = normalized.split("?")[0];
  normalized = normalized.replace(
    /^https?:\/\/[^/]+\/storage\/v1\/object\/(?:public|sign)\/[^/]+\//i,
    ""
  );
  normalized = normalized.replace(
    /^\/?storage\/v1\/object\/(?:public|sign)\/[^/]+\//i,
    ""
  );
  normalized = normalized.replace(/^\/+/, "");
  normalized = normalized.replace(/^request-documents\//i, "");
  normalized = normalized.replace(
    /^(hospitalization-documents|treatment-documents|medical-documents|financial-documents|monetary-documents|burial-documents|cremation-documents|columbarium-documents)\//i,
    ""
  );

  return normalized;
}

const ATTACHMENT_SIGNED_URL_TTL_SEC = 8 * 60 * 60;

export async function buildAttachmentImageUrl(objectPath) {
  if (!objectPath) {
    return "";
  }

  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(objectPath, ATTACHMENT_SIGNED_URL_TTL_SEC);

  if (!error && data?.signedUrl) {
    return data.signedUrl;
  }

  const { data: pub } = supabase.storage.from(ATTACHMENT_BUCKET).getPublicUrl(objectPath);
  return pub?.publicUrl || "";
}

function resolveAttachmentName(attachment, objectPath, index) {
  const pathParts = String(objectPath || "")
    .split("/")
    .filter(Boolean);
  const fileName = pathParts[pathParts.length - 1];

  if (fileName) {
    return fileName;
  }

  return getFirstValue(
    attachment,
    ["document_name", "attachment_type", "file_name", "name", "type"],
    `Document ${index + 1}`
  );
}

function normalizeFieldKey(value, catalog) {
  const knownKeys = knownFieldKeysFromCatalog(catalog);
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");

  const aliases = {
    letter: "letter_file",
    voterid: "voter_id_file",
    voter_id: "voter_id_file",
    barangay: "barangay_endorsement_file",
    barangay_endorsement: "barangay_endorsement_file",
    indigency: "indigency_cert_file",
    indigency_cert: "indigency_cert_file",
    birth: "birth_cert_file",
    birth_cert: "birth_cert_file",
    valid_id: "birth_cert_file",
    abstract: "abstract_file",
    bill: "bill_file",
    medcert: "med_cert_file",
    med_cert: "med_cert_file",
    rx: "rx_file",
    lab: "lab_file",
    prescription: "prescription_file",
    quotation: "quotation_file",
    billing: "billing_file",
    statement_of_account: "billing_file",
    proof_of_income: "proof_of_income_file",
    death_certificate: "death_cert_file",
    death_cert: "death_cert_file",
    funeral_contract: "funeral_contract_file",
    cremation_quote: "cremation_quote_file",
    columbarium_contract: "columbarium_contract_file",
    attachment: "attachment_file",
    attachments: "attachment_file",
  };

  if (knownKeys.has(normalized)) {
    return normalized;
  }

  if (knownKeys.has(`${normalized}_file`)) {
    return `${normalized}_file`;
  }

  const catalogKey = normalizeAttachmentFieldKey(normalized);
  if (catalogKey && knownKeys.has(catalogKey)) {
    return catalogKey;
  }

  return aliases[normalized] || catalogKey || "";
}

function inferFieldKeyFromObjectPath(objectPath) {
  if (typeof objectPath !== "string" || objectPath.trim() === "") {
    return "";
  }

  const parts = objectPath.split("/").filter(Boolean);
  const fileName = (parts[parts.length - 1] || "").toLowerCase();

  if (/^letter[_-]/.test(fileName)) return "letter_file";
  if (/^(voter|voterid|voter_id)/.test(fileName)) return "voter_id_file";
  if (/^barangay[_-]/.test(fileName)) return "barangay_endorsement_file";
  if (/^indigency[_-]/.test(fileName)) return "indigency_cert_file";
  if (/^(birth|validid|valid_id)/.test(fileName)) return "birth_cert_file";
  if (/^abstract[_-]/.test(fileName)) return "abstract_file";
  if (/^bill[_-]/.test(fileName)) return "bill_file";
  if (/^(medcert|med_cert|medcertification|medcertification_file|medcertfile|medcert_fb|medcertimg|medcerti?)/.test(fileName)) {
    return "med_cert_file";
  }
  if (/^rx[_-]/.test(fileName)) return "rx_file";
  if (/^lab[_-]/.test(fileName)) return "lab_file";
  if (/^prescription[_-]/.test(fileName)) return "prescription_file";
  if (/^(quotation|quote)[_-]/.test(fileName)) return "quotation_file";
  if (/^(billing|statement)[_-]/.test(fileName)) return "billing_file";
  if (/^proof[_-]?of[_-]?income/.test(fileName)) return "proof_of_income_file";
  if (/^death[_-](cert|certificate)/.test(fileName)) return "death_cert_file";
  if (/^funeral[_-](contract|bill|billing)/.test(fileName)) return "funeral_contract_file";
  if (/^cremation[_-](quote|quotation|bill)/.test(fileName)) return "cremation_quote_file";
  if (/^columbarium[_-](contract|quote|quotation)/.test(fileName)) return "columbarium_contract_file";
  if (/^attachment[_-]/.test(fileName)) return "attachment_file";

  return "";
}

function resolveFieldKey(attachment, objectPath, catalog) {
  const rawFieldKey = getFirstValue(
    attachment,
    [
      "file_type",
      "file_field",
      "field_key",
      "field_name",
      "document_field",
      "attachment_field",
      "attachment_type",
      "document_type",
      "type",
    ],
    ""
  );

  const normalized = normalizeFieldKey(rawFieldKey, catalog);
  if (normalized) {
    return normalized;
  }

  const inferred = inferFieldKeyFromObjectPath(objectPath);
  return normalizeFieldKey(inferred, catalog) || inferred;
}

function sortAttachments(data) {
  return [...data].sort((a, b) => {
    const aTime = new Date(
      getFirstValue(a, ["created_at", "uploaded_at", "updated_at"], 0)
    ).getTime();
    const bTime = new Date(
      getFirstValue(b, ["created_at", "uploaded_at", "updated_at"], 0)
    ).getTime();
    return aTime - bTime;
  });
}

/**
 * Load request attachments for an assistance request (path-bearing rows only).
 */
export async function fetchRequestAttachments(requestId) {
  if (!requestId) {
    return { data: [], error: null };
  }

  const { data, error } = await supabase
    .from("request_attachments")
    .select("*")
    .eq("assistance_request_id", requestId);

  const rows = (data || []).filter((row) => {
    const path = String(row?.path ?? "").trim();
    return path.length > 0;
  });

  return { data: rows, error };
}

/**
 * Map DB attachment rows into UI document objects (labels, URLs, review status).
 */
export async function mapAttachments(rows, serviceId, catalog) {
  const mapped = sortAttachments(rows).map((row, index) => {
    const objectPath = normalizeAttachmentObjectPath(getFirstValue(row, ["path"], ""));
    const fileName = resolveAttachmentName(row, objectPath, index);
    const fieldKey = resolveFieldKey(row, objectPath, catalog);
    const label = resolveAttachmentLabelFromCatalog(catalog, serviceId, fieldKey, fileName);
    const reasonForAction = normalizeReason(row.reason_for_action);
    const additionalReason =
      typeof row.additional_reason === "string"
        ? row.additional_reason.slice(0, 500)
        : "";

    const statusColumn = ["status", "result", "verification_status"].find((field) =>
      Object.prototype.hasOwnProperty.call(row, field)
    );

    return {
      id: row.uid,
      keyColumn: "uid",
      tableName: "request_attachments",
      fieldKey,
      _hierarchyRank: attachmentHierarchyRank(catalog, serviceId, fieldKey, label),
      _orderIndex: index,
      objectPath,
      imageUrl: "",
      label,
      fileName,
      name: label,
      result: normalizeAttachmentResult(
        getFirstValue(row, ["status", "result", "verification_status"], "pending")
      ),
      reasonForAction,
      additionalReason,
      reason: composeReason(reasonForAction, additionalReason),
      statusColumn,
      raw: row,
    };
  });

  const ranked = mapped
    .sort((a, b) => {
      if (a._hierarchyRank !== b._hierarchyRank) {
        return a._hierarchyRank - b._hierarchyRank;
      }
      return a._orderIndex - b._orderIndex;
    })
    .map(({ _hierarchyRank, _orderIndex, ...doc }) => doc);

  return Promise.all(
    ranked.map(async (doc) => ({
      ...doc,
      imageUrl: await buildAttachmentImageUrl(doc.objectPath),
    }))
  );
}

export function isPdfAttachment(doc) {
  const mimeType = String(doc?.raw?.mime_type || doc?.raw?.content_type || "").toLowerCase();
  const lookup = [doc?.fileName, doc?.objectPath, doc?.imageUrl]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return mimeType.includes("pdf") || /\.pdf(\?|#|$)/.test(lookup);
}
