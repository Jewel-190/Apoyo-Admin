/**
 * Services.jsx — Content Management orchestrator for the assistance catalog.
 *
 * UI builds payloads; all catalog reads/writes go through
 * `super-admin-services-management` (superadmin JWT + service role).
 * Admin-only CMS fields live in `assistance_services.cms_metadata` (jsonb).
 * Per-requirement sample docs live in `assistance_requirements.metadata`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatAssistanceLineTitle } from "../../../shared/lib/assistanceCategoryDisplay.js";
import {
  AddAssistanceForm,
  DEFAULT_ADDITIONAL_ATTACHMENT,
  LARGE_MODAL_OVERLAY_CLASS,
  LARGE_MODAL_PANEL_CLASS,
  buildRadioSelectionPayload,
  createEmptyRequirement,
  defaultEditorFont,
  isUploadableIconImageFile,
  makeEmptyServiceForm,
  normalizeRequestCodePrefix,
  parseRadioSelectionForm,
  parseWhoBulletsForm,
  buildWhoBulletsPayload,
  ServiceIconDisplay,
  stripRichText,
} from "./ServiceManagement.jsx";
import { AssistanceManagement } from "./AssistanceManagement.jsx";

import {
  cmsServiceArchive,
  cmsServiceSave,
} from "../../../shared/lib/superAdminServicesApi.js";
import {
  fetchCmsCatalogList,
  fetchServiceCatalogDetail,
  invalidateCmsCatalogListCache,
  sortCatalogRows,
} from "../../../shared/lib/catalogFetch.js";
import { parseAssistanceCategoryTheme } from "../../../shared/lib/assistanceCategoryTheme.js";
import { normalizeThemeJsonHex } from "../../../shared/lib/themeJsonPalette.js";

const makeEmpty = () => makeEmptyServiceForm();

const PlusIcon = () => (
  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
);

const PencilIcon = () => (
  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M4 20h4l10-10-4-4L4 16v4z" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m13.5 6.5 4 4" strokeLinecap="round" />
  </svg>
);

function sanitizeRequirementHelpText(value) {
  const raw = String(value ?? "");
  if (!raw) return "";
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hexLuminance(hex) {
  const normalized = normalizeThemeJsonHex(hex);
  if (!normalized) return 0.5;
  const raw = normalized.slice(1);
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Selected assistance chip uses the category theme gradient from `theme_json`. */
function getSelectedAssistanceChipPresentation(slug, themeJson) {
  const theme = parseAssistanceCategoryTheme(slug, themeJson);
  const stops = theme.homeChipActiveGradient ?? theme.homeCardStripeGradient ?? [];
  const from = stops[0] ?? theme.accent ?? "#0e7490";
  const to = stops[1] ?? from;
  const light = hexLuminance(from) > 0.62;

  return {
    light,
    containerStyle: {
      borderColor: from,
      background: `linear-gradient(135deg, ${from}, ${to})`,
      color: light ? "#0f172a" : "#ffffff",
      boxShadow: `0 10px 22px -15px ${from}aa`,
    },
    editButtonClass: light
      ? "bg-slate-900/10 text-slate-800 hover:bg-slate-900/15"
      : "bg-white/15 text-white hover:bg-white/25",
  };
}

const ADDITIONAL_ATTACHMENT_SLOT = DEFAULT_ADDITIONAL_ATTACHMENT.slotKey;
const SAVE_STEP_TIMEOUT_MS = 25000;

function withTimeout(promise, label, timeoutMs = SAVE_STEP_TIMEOUT_MS) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out. Please try again.`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

function parseRequirementMetadata(metadata) {
  const meta = metadata && typeof metadata === "object" ? metadata : {};
  return {
    sampleDocumentImage: meta.sampleDocumentImage || "",
    sampleDocumentName: meta.sampleDocumentName || "",
  };
}

function buildAdditionalAttachment(svc, attachmentReq) {
  const slotMap =
    svc?.attachment_slot_map && typeof svc.attachment_slot_map === "object"
      ? svc.attachment_slot_map
      : {};
  return {
    title: attachmentReq?.title ?? DEFAULT_ADDITIONAL_ATTACHMENT.title,
    slotKey: ADDITIONAL_ATTACHMENT_SLOT,
    fileType: slotMap[ADDITIONAL_ATTACHMENT_SLOT] || DEFAULT_ADDITIONAL_ATTACHMENT.fileType,
    _id: attachmentReq?._id ?? null,
  };
}

function mapServiceRow(svc) {
  const allRequirements = sortCatalogRows(svc.assistance_requirements ?? []).map((req) => {
    const sampleMeta = parseRequirementMetadata(req.metadata);
    return {
      title: req.title ?? "",
      help: sanitizeRequirementHelpText(req.help ?? ""),
      _id: req.id,
      _slotKey: req.slot_key,
      sampleDocumentImage: sampleMeta.sampleDocumentImage,
      sampleDocumentName: sampleMeta.sampleDocumentName,
      tips: sortCatalogRows(req.assistance_requirement_tips ?? []).map((tip) => ({
        title: tip.title ?? "",
        description: tip.description ?? "",
      })),
    };
  });

  const attachmentReq = allRequirements.find((r) => r._slotKey === ADDITIONAL_ATTACHMENT_SLOT);
  const requirements = allRequirements.filter((r) => r._slotKey !== ADDITIONAL_ATTACHMENT_SLOT);
  const meta = svc.cms_metadata && typeof svc.cms_metadata === "object" ? svc.cms_metadata : {};

  return {
    id: svc.id,
    name: svc.display_name ?? "",
    requestCode: svc.request_code ?? "",
    about: svc.about_html ?? "",
    whoBullets: parseWhoBulletsForm(svc.who_bullets),
    description: svc.description_html ?? "",
    image: svc.mobile_image_url || "",
    reminderText: svc.reminder_text ?? "",
    webIntroText: svc.web_intro_html ?? "",
    aboutFontFamily: meta.aboutFontFamily || defaultEditorFont,
    descriptionFontFamily: meta.descriptionFontFamily || defaultEditorFont,
    reminderFontFamily: meta.reminderFontFamily || defaultEditorFont,
    webHeroImage: meta.webHeroImage || "",
    webMapLink: meta.webMapLink || "",
    webOfficeTitle: meta.webOfficeTitle || "",
    requirements,
    additionalAttachment: buildAdditionalAttachment(svc, attachmentReq),
    radioSelection: parseRadioSelectionForm(svc.radio_selection),
  };
}

/**
 * Maps raw catalog rows into the local UI shape, keeping both the slug-based
 * id (used by the UI) and the underlying UUIDs (used for DB writes).
 */
function mapCatalogRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];

  return sortCatalogRows(rows).map((cat) => {
    const services = sortCatalogRows(cat.assistance_services ?? [])
      .filter((svc) => svc.active !== false)
      .map((svc) => mapServiceRow(svc));

    const assistanceName = (cat.assistance_name ?? "").trim();
    return {
      id: cat.slug,
      categoryUuid: cat.id,
      slug: cat.slug,
      assistanceName,
      description: cat.description ?? "",
      active: cat.active !== false,
      displayTitle: formatAssistanceLineTitle(assistanceName),
      themeJson: cat.theme_json ?? null,
      services,
    };
  });
}

function mapServiceDetailRow(serviceRow) {
  return mapServiceRow(serviceRow);
}

function mapListServiceToPartialForm(service) {
  return {
    ...makeEmpty(),
    serviceName: service?.name ?? "",
    requestCode: service?.requestCode ?? "",
    serviceImage: service?.image ?? "",
    description: service?.description ?? "",
  };
}

function mapServiceRowToForm(service) {
  return {
    serviceName: service.name ?? "",
    requestCode: service.requestCode ?? "",
    serviceImage: service.image ?? "",
    about: service.about ?? "",
    whoBullets: service.whoBullets ?? parseWhoBulletsForm(null),
    description: service.description ?? "",
    aboutFontFamily: service.aboutFontFamily ?? defaultEditorFont,
    descriptionFontFamily: service.descriptionFontFamily ?? defaultEditorFont,
    requirements: normalizeRequirementsPreserveMeta(service.requirements),
    reminderText: service.reminderText ?? "",
    reminderFontFamily: service.reminderFontFamily ?? defaultEditorFont,
    additionalAttachment: service.additionalAttachment ?? { ...DEFAULT_ADDITIONAL_ATTACHMENT },
    webHeroImage: service.webHeroImage ?? "",
    webMapLink: service.webMapLink ?? "",
    webIntroText: service.webIntroText ?? "",
    webOfficeTitle: service.webOfficeTitle ?? "",
    radioSelection: service.radioSelection ?? parseRadioSelectionForm(null),
  };
}

/** Build the cms_metadata jsonb payload from the form. */
function buildCmsMetadata(serviceForm) {
  return {
    aboutFontFamily: serviceForm.aboutFontFamily || defaultEditorFont,
    descriptionFontFamily: serviceForm.descriptionFontFamily || defaultEditorFont,
    reminderFontFamily: serviceForm.reminderFontFamily || defaultEditorFont,
    webHeroImage: serviceForm.webHeroImage || "",
    webMapLink: serviceForm.webMapLink || "",
    webOfficeTitle: serviceForm.webOfficeTitle || "",
  };
}

/** Map service form data → assistance_services row payload. */
function buildServicePayload({ serviceForm, categoryId, sortOrder }) {
  const displayName = serviceForm.name?.trim() || serviceForm.serviceName?.trim() || "";
  return {
    category_id: categoryId,
    display_name: displayName,
    about_html: serviceForm.about || "",
    who_bullets: buildWhoBulletsPayload(serviceForm.whoBullets),
    description_html: serviceForm.description || "",
    mobile_image_url: serviceForm.image || serviceForm.serviceImage || null,
    reminder_text: serviceForm.reminderText || "",
    web_intro_html: serviceForm.webIntroText || "",
    cms_metadata: buildCmsMetadata({
      aboutFontFamily: serviceForm.aboutFontFamily,
      descriptionFontFamily: serviceForm.descriptionFontFamily,
      reminderFontFamily: serviceForm.reminderFontFamily,
      webHeroImage: serviceForm.webHeroImage,
      webMapLink: serviceForm.webMapLink,
      webOfficeTitle: serviceForm.webOfficeTitle,
    }),
    sort_order: sortOrder,
    active: true,
    radio_selection: buildRadioSelectionPayload(serviceForm),
    request_code: normalizeRequestCodePrefix(
      serviceForm.requestCode ?? serviceForm.request_code
    ) || null,
  };
}

/**
 * Local requirement normalizer that preserves `_id` and `_slotKey` (mobile
 * attachment slots key off `slot_key`). Persistence (requirements/tips/slot map)
 * runs in super-admin-services-management.
 */
function normalizeRequirementsPreserveMeta(requirements) {
  const list = (requirements ?? []).map((req) => ({
    _id: req?._id ?? null,
    _slotKey: req?._slotKey ?? null,
    title: req?.title ?? "",
    help: sanitizeRequirementHelpText(req?.help ?? ""),
    sampleDocumentImage: req?.sampleDocumentImage ?? "",
    sampleDocumentName: req?.sampleDocumentName ?? "",
    tips:
      (req?.tips ?? []).length > 0
        ? req.tips.map((tip) =>
            typeof tip === "string"
              ? { title: tip, description: "" }
              : { title: tip?.title ?? "", description: tip?.description ?? "" }
          )
        : [{ title: "", description: "" }],
  }));
  return list.length ? list : [{ title: "", help: "", tips: [{ title: "", description: "" }] }];
}

export function Services() {
  const [assistances, setAssistances] = useState([]);
  const [selectedAssistanceId, setSelectedAssistanceId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [isAddAssistanceOpen, setIsAddAssistanceOpen] = useState(false);
  const [isAddServiceOpen, setIsAddServiceOpen] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null); // { uuid, slug, assistanceName }
  const [newService, setNewService] = useState(makeEmpty);
  const [selectedServiceRequirementIndex, setSelectedServiceRequirementIndex] = useState(null);
  const [selectedServiceTipIndex, setSelectedServiceTipIndex] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [isLoadingServiceDetail, setIsLoadingServiceDetail] = useState(false);
  const serviceDetailCacheRef = useRef(new Map());
  const serviceDetailRequestsRef = useRef(new Map());

  const loadServiceDetail = useCallback(async (serviceId, { force = false } = {}) => {
    const id = String(serviceId ?? "").trim();
    if (!id) {
      throw new Error("Service id is required.");
    }

    if (!force) {
      const cached = serviceDetailCacheRef.current.get(id);
      if (cached) return cached;

      const inFlight = serviceDetailRequestsRef.current.get(id);
      if (inFlight) return inFlight;
    }

    const request = fetchServiceCatalogDetail(id)
      .then((detailRow) => {
        const mapped = mapServiceDetailRow(detailRow);
        serviceDetailCacheRef.current.set(id, mapped);
        return mapped;
      })
      .finally(() => {
        serviceDetailRequestsRef.current.delete(id);
      });

    serviceDetailRequestsRef.current.set(id, request);
    return request;
  }, []);

  const loadCatalog = useCallback(async ({ forceRefresh = false } = {}) => {
    setIsLoading(true);
    setLoadError("");
    try {
      const nestedRows = await fetchCmsCatalogList({ forceRefresh });

      const mapped = mapCatalogRows(nestedRows);
      setAssistances(mapped);
      setSelectedAssistanceId((prev) =>
        mapped.some((c) => c.id === prev) ? prev : mapped[0]?.id || ""
      );
    } catch (err) {
      console.error("[ContentManagement] catalog fetch failed", err);
      setLoadError(err?.message || "Failed to load catalog.");
      setAssistances([]);
      setSelectedAssistanceId("");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadCatalog();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCatalog]);

  useEffect(() => {
    if (!isAddServiceOpen) return undefined;
    const html = document.documentElement;
    const body = document.body;
    const main = document.querySelector("main");
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    const prevMain = main?.style.overflow ?? "";
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (main) main.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
      if (main) main.style.overflow = prevMain;
    };
  }, [isAddServiceOpen]);

  const selectedAssistance =
    assistances.find((assistance) => assistance.id === selectedAssistanceId) ??
    assistances[0] ??
    null;

  const updateNewService = useCallback(
    (field, value) => setNewService((prev) => ({ ...prev, [field]: value })),
    []
  );

  const handleImageUpload = (field, event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!isUploadableIconImageFile(file)) {
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setNewService((prev) => ({
        ...prev,
        [field]: String(reader.result),
      }));
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleRequirementSampleUpload = useCallback((index, event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setNewService((prev) => {
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
  }, []);

  const handleRequirementSampleClear = useCallback((index) => {
    setNewService((prev) => {
      const next = [...prev.requirements];
      next[index] = {
        ...next[index],
        sampleDocumentImage: "",
        sampleDocumentName: "",
      };
      return { ...prev, requirements: next };
    });
  }, []);

  const requirementHandlers = useMemo(
    () => ({
      onRequirementChange: (index, value) =>
        setNewService((prev) => {
          const next = [...prev.requirements];
          next[index] = { ...next[index], title: value };
          return { ...prev, requirements: next };
        }),
      onRequirementHelpChange: (index, value) =>
        setNewService((prev) => {
          const next = [...prev.requirements];
          next[index] = { ...next[index], help: value };
          return { ...prev, requirements: next };
        }),
      onAddRequirement: () =>
        setNewService((prev) => {
          const nextRequirements = [...prev.requirements, createEmptyRequirement()];
          setSelectedServiceRequirementIndex(nextRequirements.length - 1);
          setSelectedServiceTipIndex(null);
          return { ...prev, requirements: nextRequirements };
        }),
      onRemoveRequirement: (index) =>
        setNewService((prev) => {
          const next = prev.requirements.filter((_, idx) => idx !== index);
          setSelectedServiceTipIndex(null);
          return {
            ...prev,
            requirements: next.length ? next : [createEmptyRequirement()],
          };
        }),
    }),
    []
  );

  const tipHandlers = useMemo(
    () => ({
      onTipChange: (requirementIndex, tipIndex, field, value) =>
        setNewService((prev) => {
          const reqIndex = Math.min(Math.max(0, requirementIndex ?? 0), prev.requirements.length - 1);
          const next = [...prev.requirements];
          const tips = [...(next[reqIndex].tips ?? [{ title: "", description: "" }])];
          const current = tips[tipIndex];
          const normalized =
            typeof current === "string"
              ? { title: current, description: "" }
              : current ?? { title: "", description: "" };
          tips[tipIndex] = { ...normalized, [field]: value };
          next[reqIndex] = { ...next[reqIndex], tips };
          return { ...prev, requirements: next };
        }),
      onAddTip: (requirementIndex) =>
        setNewService((prev) => {
          const reqIndex = Math.min(Math.max(0, requirementIndex ?? 0), prev.requirements.length - 1);
          const next = [...prev.requirements];
          const tips = [
            ...(next[reqIndex].tips ?? [{ title: "", description: "" }]),
            { title: "", description: "" },
          ];
          next[reqIndex] = { ...next[reqIndex], tips };
          return { ...prev, requirements: next };
        }),
      onRemoveTip: (requirementIndex, tipIndex) =>
        setNewService((prev) => {
          const reqIndex = Math.min(Math.max(0, requirementIndex ?? 0), prev.requirements.length - 1);
          const next = [...prev.requirements];
          const tips = (next[reqIndex].tips ?? [{ title: "", description: "" }]).filter(
            (_, idx) => idx !== tipIndex
          );
          next[reqIndex] = { ...next[reqIndex], tips: tips.length ? tips : [{ title: "", description: "" }] };
          return { ...prev, requirements: next };
        }),
    }),
    []
  );

  const closeServiceModal = () => {
    setIsAddServiceOpen(false);
    setEditingServiceId(null);
    setNewService(makeEmpty());
    setSelectedServiceRequirementIndex(null);
    setSelectedServiceTipIndex(null);
    setSaveError("");
    setIsLoadingServiceDetail(false);
  };

  const openCreateServiceModal = () => {
    if (!selectedAssistance) return;
    setEditingServiceId(null);
    setNewService(makeEmpty());
    setSelectedServiceRequirementIndex(null);
    setSelectedServiceTipIndex(null);
    setSaveError("");
    setIsAddServiceOpen(true);
  };

  const openEditServiceModal = (service) => {
    if (!service?.id) return;

    const cached = serviceDetailCacheRef.current.get(service.id);
    setEditingServiceId(service.id);
    setSelectedServiceRequirementIndex(null);
    setSelectedServiceTipIndex(null);
    setSaveError("");
    setIsAddServiceOpen(true);

    if (cached) {
      setNewService(mapServiceRowToForm(cached));
      setIsLoadingServiceDetail(false);
      return;
    }

    setNewService(mapListServiceToPartialForm(service));
    setIsLoadingServiceDetail(true);

    void loadServiceDetail(service.id)
      .then((mappedService) => {
        setNewService(mapServiceRowToForm(mappedService));
      })
      .catch((err) => {
        console.error("[ContentManagement] service detail fetch failed", err);
        setSaveError(err?.message || "Failed to load service details.");
      })
      .finally(() => {
        setIsLoadingServiceDetail(false);
      });
  };

  const handleSaveService = async () => {
    if (!selectedAssistance) return;
    const serviceName = (newService.serviceName || "").trim();
    if (!serviceName) return;

    setSaveError("");
    setIsSaving(true);
    try {
      const categoryUuid = selectedAssistance.categoryUuid;
      const isUpdate = Boolean(editingServiceId);
      const sortOrder = isUpdate
        ? (selectedAssistance.services.findIndex((s) => s.id === editingServiceId) + 1) || 1
        : (selectedAssistance.services.length + 1);

      const payload = buildServicePayload({
        serviceForm: {
          name: serviceName,
          requestCode: newService.requestCode || "",
          about: newService.about || "",
          whoBullets: newService.whoBullets,
          description: newService.description || "",
          image: newService.serviceImage || null,
          aboutFontFamily: newService.aboutFontFamily,
          descriptionFontFamily: newService.descriptionFontFamily,
          reminderText: newService.reminderText || "",
          reminderFontFamily: newService.reminderFontFamily,
          webHeroImage: newService.webHeroImage,
          webMapLink: newService.webMapLink,
          webIntroText: newService.webIntroText,
          webOfficeTitle: newService.webOfficeTitle,
          radioSelection: newService.radioSelection,
        },
        categoryId: categoryUuid,
        sortOrder,
      });

      let serviceId = editingServiceId;
      const saveResult = await withTimeout(
        cmsServiceSave({
          serviceId: isUpdate ? serviceId : null,
          servicePayload: payload,
          requirements: newService.requirements,
          additionalAttachment: newService.additionalAttachment,
        }),
        isUpdate ? "Updating service" : "Creating service"
      );
      serviceId = saveResult?.serviceId || serviceId;

      await withTimeout(loadCatalog({ forceRefresh: true }), "Refreshing catalog");
      if (serviceId) {
        serviceDetailCacheRef.current.delete(serviceId);
      }
      closeServiceModal();
    } catch (err) {
      console.error("[ContentManagement] save service failed", err);
      setSaveError(err?.message || "Failed to save service.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteService = async (serviceId) => {
    setSaveError("");
    setIsSaving(true);
    try {
      await cmsServiceArchive(serviceId);
      invalidateCmsCatalogListCache();
      await loadCatalog({ forceRefresh: true });
    } catch (err) {
      console.error("[ContentManagement] delete service failed", err);
      setSaveError(err?.message || "Failed to archive service.");
    } finally {
      setIsSaving(false);
    }
  };

  const submitLabel = isLoadingServiceDetail
    ? "Loading..."
    : isSaving
      ? "Saving..."
      : editingServiceId
        ? "Update Service"
        : "Save Service";
  const categoryLabel =
    selectedAssistance?.displayTitle || formatAssistanceLineTitle(selectedAssistance?.assistanceName);
  const modalTitle = editingServiceId ? "Edit service" : "Add service";

  const serviceModal =
    isAddServiceOpen &&
    createPortal(
      <div
        className={LARGE_MODAL_OVERLAY_CLASS}
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-details-modal-title"
      >
        <div className={LARGE_MODAL_PANEL_CLASS}>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ocean-100 px-5 py-2.5">
            <div>
              <h3 id="service-details-modal-title" className="text-lg font-semibold text-ocean-950">
                {modalTitle}
              </h3>
              <p className="mt-1 text-sm text-ocean-700">
                {categoryLabel
                  ? `Configure catalog content for ${categoryLabel}. Changes apply to the mobile app after save.`
                  : "Configure service title, requirements, reminders, and previews."}
              </p>
            </div>
            <button
              type="button"
              onClick={closeServiceModal}
              disabled={isSaving}
              className="inline-flex h-10 shrink-0 items-center self-center rounded-lg border border-ocean-200 bg-ocean-50 px-3 text-sm font-semibold text-ocean-700 transition hover:border-ocean-300 hover:bg-ocean-100 disabled:opacity-60"
            >
              Close
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-2">
            <AddAssistanceForm
                layout="modal"
                mode="service"
                formData={newService}
                selectedRequirementIndex={selectedServiceRequirementIndex}
                selectedTipIndex={selectedServiceTipIndex}
                onSelectRequirement={(index) => {
                  setSelectedServiceRequirementIndex(index);
                  setSelectedServiceTipIndex(null);
                }}
                onSelectTip={setSelectedServiceTipIndex}
                onChange={updateNewService}
                onImageUpload={handleImageUpload}
                onRequirementSampleUpload={handleRequirementSampleUpload}
                onRequirementSampleClear={handleRequirementSampleClear}
                {...requirementHandlers}
                {...tipHandlers}
                previewCategoryTitle={categoryLabel}
                previewCategorySlug={selectedAssistance?.slug ?? ""}
                previewCategoryThemeJson={selectedAssistance?.themeJson ?? null}
                onSubmit={handleSaveService}
                onClose={closeServiceModal}
                submitLabel={submitLabel}
                statusMessage={saveError}
                isLoadingDetail={isLoadingServiceDetail}
                isSaving={isSaving || isLoadingServiceDetail}
                saveConfirmMode={editingServiceId ? "update" : "create"}
                archiveTarget={
                  editingServiceId
                    ? {
                        entityName: newService.serviceName?.trim() || "",
                        isProcessing: isSaving,
                        onArchive: async () => {
                          await handleDeleteService(editingServiceId);
                          closeServiceModal();
                        },
                      }
                    : null
                }
              />
          </div>
        </div>
      </div>,
      document.body
    );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(var(--system-primary-rgb),0.7)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-700">Assistance</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-ocean-950">
              List of Active Assistance
            </h2>
            <p className="mt-1 text-sm text-ocean-700">
              Select an assistance category to view and manage services.
            </p>
            {isLoading ? (
              <p className="mt-2 text-xs font-medium text-ocean-700">Loading catalog…</p>
            ) : null}
            {loadError ? (
              <p className="mt-2 text-xs font-medium text-rose-600">{loadError}</p>
            ) : null}
            {!isLoading && !loadError ? (
              <p className="mt-2 text-xs font-medium text-ocean-700">
                Live catalog · changes save to Database and propagate to the mobile app.
              </p>
            ) : null}
          </div>
          {!isLoading ? (
            <button
              type="button"
              onClick={() => {
                setEditingCategory(null);
                setIsAddAssistanceOpen(true);
              }}
              disabled={isSaving}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-ocean-200 bg-ocean-50 px-3 text-sm font-semibold text-ocean-800 transition hover:border-ocean-300 hover:bg-ocean-100 disabled:opacity-60"
            >
              <PlusIcon />
              Add Assistance
            </button>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assistances.map((assistance) => {
            const isActive = selectedAssistance?.id === assistance.id;
            const chipTheme = isActive
              ? getSelectedAssistanceChipPresentation(assistance.slug, assistance.themeJson)
              : null;
            return (
              <div
                key={assistance.id}
                style={chipTheme?.containerStyle}
                className={`group flex items-stretch gap-1 rounded-2xl border px-2 py-1 transition ${
                  isActive
                    ? ""
                    : "border-ocean-200 bg-ocean-50 text-ocean-900 hover:border-ocean-300 hover:bg-white"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedAssistanceId(assistance.id)}
                  className="flex-1 px-3 py-3 text-left text-base font-semibold transition"
                >
                  {assistance.assistanceName}
                </button>
                <div className="flex flex-col items-center justify-center gap-1 pr-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddAssistanceOpen(false);
                      setEditingCategory({
                        uuid: assistance.categoryUuid,
                        slug: assistance.slug,
                        assistanceName: assistance.assistanceName,
                        description: assistance.description,
                        themeJson: assistance.themeJson,
                      });
                    }}
                    className={`inline-flex size-7 items-center justify-center rounded-md transition ${
                      isActive
                        ? chipTheme?.editButtonClass ?? "bg-white/15 text-white hover:bg-white/25"
                        : "bg-white/70 text-ocean-700 hover:bg-white"
                    }`}
                    aria-label={`Rename ${assistance.assistanceName}`}
                    disabled={isSaving}
                  >
                    <PencilIcon />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <AssistanceManagement
        open={isAddAssistanceOpen || Boolean(editingCategory)}
        category={editingCategory}
        serviceCount={
          editingCategory
            ? (assistances.find((c) => c.categoryUuid === editingCategory.uuid)?.services?.length ?? 0)
            : 0
        }
        onClose={() => {
          setIsAddAssistanceOpen(false);
          setEditingCategory(null);
          setSaveError("");
        }}
        onSaved={async (savedSlug) => {
          invalidateCmsCatalogListCache();
          await loadCatalog({ forceRefresh: true });
          if (savedSlug) {
            setSelectedAssistanceId(savedSlug);
          }
          setIsAddAssistanceOpen(false);
          setEditingCategory(null);
          setSaveError("");
        }}
      />

      {serviceModal}

      {selectedAssistance ? (
        <section className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(var(--system-primary-rgb),0.7)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-700">Services</p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-ocean-950">
                Services for {selectedAssistance.assistanceName || "…"} Assistance
              </h3>
            </div>
            {saveError && !isAddServiceOpen ? (
              <p className="text-xs font-medium text-rose-600">{saveError}</p>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3">
            {selectedAssistance.services.map((service) => (
              <article
                key={service.id}
                role="button"
                tabIndex={0}
                onClick={() => openEditServiceModal(service)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openEditServiceModal(service);
                  }
                }}
                className="group flex cursor-pointer items-start gap-3 rounded-xl border border-ocean-200 bg-ocean-50/60 px-4 py-3 transition hover:border-ocean-300 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ocean-400"
              >
                  <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ocean-200 bg-white p-1">
                    <ServiceIconDisplay
                      src={service.image}
                      alt={service.name}
                      placeholderIconClassName="size-6"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-semibold text-ocean-900">{service.name}</h4>
                    <p className="mt-1 truncate text-sm text-ocean-700">{stripRichText(service.description)}</p>
                  </div>
              </article>
            ))}
            <button
              type="button"
              onClick={openCreateServiceModal}
              disabled={isSaving}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-ocean-300 bg-white text-sm font-semibold text-ocean-700 transition hover:border-ocean-400 hover:bg-ocean-50 disabled:opacity-60"
            >
              <PlusIcon />
              Add More Services
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
