import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, RefreshCcw, Trash2 } from "lucide-react";
import {
  deleteRegisteredVoter,
  fetchRegisteredVoters,
  insertRegisteredVoter,
  insertRegisteredVotersBatch,
  updateRegisteredVoter,
} from "../../../shared/lib/registeredVoters";
import {
  REGISTERED_VOTER_BATCH_TEMPLATE_HEADERS,
  parseRegisteredVoterBatchFile,
} from "../../../shared/lib/registeredVoterImport";
import {
  downloadRegisteredVotersCsv,
  downloadRegisteredVotersXlsx,
  filterRegisteredVoterRecords,
  registeredVoterExportFileStamp,
} from "../../../shared/lib/registeredVoterExport";
import { buildBarangayCatalog, fetchBarangays } from "../../../shared/lib/barangays";
import { formatRegisteredVoterId, validateRegisteredVoterField } from "../../../shared/lib/registeredVoterValidation";

const recordFields = [
  { key: "firstName", label: "First Name", type: "text", placeholder: "Enter first name" },
  { key: "middleName", label: "Middle Name", type: "text", placeholder: "Enter middle name (optional)" },
  { key: "lastName", label: "Last Name", type: "text", placeholder: "Enter last name" },
  { key: "suffix", label: "Suffix", type: "text", placeholder: "Jr., Sr., III, or leave blank" },
  { key: "age", label: "Age", type: "number", placeholder: "Enter age" },
  { key: "sex", label: "Sex", type: "select", placeholder: "Select sex", options: ["", "Male", "Female"] },
  { key: "birthdate", label: "Birthdate", type: "date", placeholder: "Enter birthdate" },
  {
    key: "voterIdNumber",
    label: "Voter ID Number",
    type: "text",
    placeholder: "0000-00000-0000000000000-0",
  },
];

const emptyRecord = {
  ...recordFields.reduce((acc, field) => ({ ...acc, [field.key]: "" }), {}),
  barangayId: "",
};

function recordFromVoter(voter) {
  if (!voter) return emptyRecord;
  const sex = voter.sex === "M" || voter.sex === "Male" ? "Male" : voter.sex === "F" || voter.sex === "Female" ? "Female" : "";
  return {
    firstName: voter.firstName ?? "",
    middleName: voter.middleName ?? "",
    lastName: voter.lastName ?? "",
    suffix: voter.suffix ?? "",
    age: String(voter.age ?? ""),
    sex,
    birthdate: String(voter.birthdate ?? "").slice(0, 10),
    voterIdNumber: voter.voterIdNumber ?? "",
    barangayId: voter.barangayId ?? "",
  };
}

function voterIdKey(value) {
  return String(value || "").replace(/[^0-9A-Za-z]/gi, "").toUpperCase();
}

function voterWriteFromRecord(record) {
  const sexDb = record.sex === "Female" ? "F" : record.sex === "Male" ? "M" : "";
  return {
    firstName: record.firstName,
    middleName: record.middleName,
    lastName: record.lastName,
    suffix: record.suffix,
    age: record.age,
    sex: sexDb,
    birthdate: record.birthdate,
    barangayId: record.barangayId,
    voterId: record.voterIdNumber,
  };
}

function findDuplicateVoterId(voters, voterIdNumber, excludeId) {
  const key = voterIdKey(voterIdNumber);
  if (key.length !== 23) return null;
  return voters.find((row) => row.id !== excludeId && voterIdKey(row.voterIdNumber) === key) || null;
}

const BATCH_FILE_NAME_RE = /\.(csv|xls|xlsx)$/i;

function pickFirstBatchFile(fileList) {
  if (!fileList?.length) return null;
  const list = Array.from(fileList);
  return list.find((f) => BATCH_FILE_NAME_RE.test(f.name)) ?? null;
}

/** Preview table data columns (same order as batch import template). */
const BATCH_PREVIEW_COLUMNS = [
  { key: "firstName", label: "First Name" },
  { key: "middleName", label: "Middle Name" },
  { key: "lastName", label: "Last Name" },
  { key: "suffix", label: "Suffix" },
  { key: "age", label: "Age" },
  { key: "sex", label: "Sex" },
  { key: "birthdate", label: "Birthdate" },
  { key: "barangay", label: "Barangay" },
  { key: "voterIdNumber", label: "Voter ID" },
];

/** Add voters modal: grows with content until max height, then body scrolls. */
const ADD_MODAL_PANEL_CLASS =
  "flex max-h-[min(92vh,880px)] w-full max-w-[min(98vw,1400px)] shrink-0 flex-col overflow-hidden rounded-2xl border border-ocean-200 bg-white shadow-[0_24px_60px_-24px_rgba(var(--system-primary-rgb),0.85)]";

/** Taller shell for Preview import (more table room). */
const PREVIEW_MODAL_PANEL_CLASS =
  "flex h-[min(96vh,960px)] min-h-[min(96vh,960px)] max-h-[96vh] w-full max-w-[min(98vw,1400px)] shrink-0 flex-col overflow-hidden rounded-2xl border border-ocean-200 bg-white shadow-[0_24px_60px_-24px_rgba(var(--system-primary-rgb),0.85)]";

const ADD_VOTERS_MODAL_OVERLAY_CLASS =
  "fixed inset-0 z-[100] overflow-y-auto bg-ocean-950/45 p-4 backdrop-blur-[2px]";

/** Above add-voters (100) and barangay picker (110). */
const BATCH_PREVIEW_MODAL_OVERLAY_CLASS =
  "fixed inset-0 z-[130] overflow-y-auto bg-ocean-950/45 p-4 backdrop-blur-[2px]";

const LARGE_MODAL_CENTER_CLASS = "flex min-h-full w-full items-center justify-center";

/** Tighter min-widths for the import preview grid (shared by header + body). */
function BatchImportLoadingPanel({ phase, fileName, current, total }) {
  const isImporting = phase === "importing";
  const percent =
    isImporting && total > 0 ? Math.min(100, Math.max(0, Math.round((current / total) * 100))) : null;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-12 text-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <h4 className="text-lg font-semibold text-ocean-950">
        {isImporting ? "Importing records" : "Reading and validating your file"}
      </h4>
      {fileName ? (
        <p className="mt-1.5 text-sm text-ocean-700">
          File: <span className="font-medium text-ocean-800">{fileName}</span>
        </p>
      ) : null}
      <p className="mt-4 max-w-lg text-sm leading-relaxed text-ocean-700">
        {isImporting
          ? "Please wait while your records are being imported. Large files may take several minutes. Do not close this window, refresh the page, or navigate away until the import is complete."
          : "Please wait while we read and validate your file. Do not close this window or refresh the page."}
      </p>
      <div className="mt-8 w-full max-w-lg">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-ocean-700">
          <span>{isImporting ? "Import progress" : "Validation progress"}</span>
          <span className="tabular-nums text-ocean-800">
            {isImporting && total > 0 ? (
              <>
                {current} of {total} ({percent}%)
              </>
            ) : (
              "In progress…"
            )}
          </span>
        </div>
        <div
          className="h-2.5 w-full overflow-hidden rounded-full bg-ocean-100 shadow-[inset_0_1px_2px_rgba(7,42,64,0.08)]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? undefined}
          aria-label={isImporting ? "Import progress" : "File validation progress"}
        >
          {isImporting && percent != null ? (
            <div
              className="h-full rounded-full bg-gradient-to-r from-ocean-500 to-ocean-600 transition-[width] duration-300 ease-out"
              style={{ width: `${Math.max(percent, 2)}%` }}
            />
          ) : (
            <div className="batch-import-progress-indeterminate h-full w-2/5 rounded-full bg-gradient-to-r from-ocean-400 to-ocean-600" />
          )}
        </div>
      </div>
      <p className="mt-6 text-xs font-medium text-ocean-700">
        Please do not interrupt this process.
      </p>
    </div>
  );
}

function batchPreviewColMinClass(colKey) {
  switch (colKey) {
    case "voterIdNumber":
      return "min-w-[9rem]";
    case "barangay":
      return "min-w-[7.5rem]";
    case "birthdate":
      return "min-w-[5.25rem]";
    case "firstName":
    case "middleName":
    case "lastName":
      return "min-w-[5.75rem]";
    case "suffix":
      return "min-w-[2.25rem]";
    case "age":
      return "min-w-[2rem]";
    case "sex":
      return "min-w-[2.5rem]";
    default:
      return "min-w-[3rem]";
  }
}

const detailFields = [
  ["Full name", "fullName"],
  ["First Name", "firstName"],
  ["Middle Name", "middleName"],
  ["Last Name", "lastName"],
  ["Suffix", "suffix"],
  ["Age", "age"],
  ["Sex", "sex"],
  ["Birthdate", "birthdate"],
  ["Barangay", "barangay"],
  ["Voter ID Number", "voterIdNumber"],
  ["Created", "createdAt"],
  ["Updated", "updatedAt"],
];

function formatIsoForDisplay(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function Voters() {
  const [voters, setVoters] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [record, setRecord] = useState(emptyRecord);
  const [touched, setTouched] = useState({});
  const [entrySubmitting, setEntrySubmitting] = useState(false);
  const [entryMessage, setEntryMessage] = useState({ type: "", text: "" });

  const [selectedUser, setSelectedUser] = useState(null);
  const [editingVoter, setEditingVoter] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [directoryMessage, setDirectoryMessage] = useState({ type: "", text: "" });
  const [addVotersModalOpen, setAddVotersModalOpen] = useState(false);
  const [barangayModalOpen, setBarangayModalOpen] = useState(false);
  const [barangayDraft, setBarangayDraft] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [barangays, setBarangays] = useState([]);
  const [barangaysLoading, setBarangaysLoading] = useState(true);
  const [barangaysError, setBarangaysError] = useState("");
  const [filterBarangayName, setFilterBarangayName] = useState("");
  const [filterSex, setFilterSex] = useState("");
  const [filterAge, setFilterAge] = useState("");
  const [filterVoterId, setFilterVoterId] = useState("");
  const [filterBirthdate, setFilterBirthdate] = useState("");
  const [filterFullName, setFilterFullName] = useState("");
  const [filterFirstName, setFilterFirstName] = useState("");
  const [filterLastName, setFilterLastName] = useState("");

  const [batchPreview, setBatchPreview] = useState(null);
  const [batchParsing, setBatchParsing] = useState(false);
  const [batchImporting, setBatchImporting] = useState(false);
  const [batchImportProgress, setBatchImportProgress] = useState({ current: 0, total: 0 });
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState(null);
  const [batchLastImportMessage, setBatchLastImportMessage] = useState(null);
  const [batchDropActive, setBatchDropActive] = useState(false);
  const batchFileInputRef = useRef(null);
  const batchDragDepthRef = useRef(0);

  const rowsPerPage = 15;

  useEffect(() => {
    const clearDropHighlight = () => {
      batchDragDepthRef.current = 0;
      setBatchDropActive(false);
    };
    window.addEventListener("dragend", clearDropHighlight);
    return () => window.removeEventListener("dragend", clearDropHighlight);
  }, []);

  const loadVoters = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const rows = await fetchRegisteredVoters();
      setVoters(rows);
    } catch (e) {
      setListError(e?.message || "Failed to load registered voters.");
      setVoters([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadBarangays = useCallback(async () => {
    setBarangaysLoading(true);
    setBarangaysError("");
    try {
      const rows = await fetchBarangays();
      setBarangays(rows);
    } catch (e) {
      setBarangaysError(e?.message || "Failed to load barangays.");
      setBarangays([]);
    } finally {
      setBarangaysLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVoters();
    void loadBarangays();
  }, [loadVoters, loadBarangays]);

  const barangayCatalog = useMemo(() => buildBarangayCatalog(barangays), [barangays]);
  const filterBarangayNames = useMemo(() => {
    const names = new Set(barangayCatalog.activeList.map((row) => row.name));
    for (const voter of voters) {
      const name = String(voter.barangay || "").trim();
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [barangayCatalog, voters]);

  useEffect(() => {
    if (filterBarangayName && !filterBarangayNames.some((name) => name === filterBarangayName)) {
      setFilterBarangayName("");
    }
  }, [filterBarangayNames, filterBarangayName]);

  const voterValidationContext = useMemo(() => {
    const allowedBarangayIds = new Set(barangayCatalog.activeIdSet);
    const allowedBarangayNames = new Set(barangayCatalog.nameSet);
    if (editingVoter?.barangayId && barangayCatalog.idSet.has(editingVoter.barangayId)) {
      allowedBarangayIds.add(editingVoter.barangayId);
    }
    if (editingVoter?.barangay) allowedBarangayNames.add(editingVoter.barangay);
    const catalogGone =
      Boolean(editingVoter?.barangay) &&
      (!editingVoter?.barangayId || !barangayCatalog.idSet.has(editingVoter.barangayId));
    return {
      allowedBarangayIds,
      allowedBarangayNames,
      allowMissingBarangayId: catalogGone,
    };
  }, [barangayCatalog, editingVoter]);

  const validateField = (key, value, record) =>
    validateRegisteredVoterField(key, value, record, voterValidationContext);

  const barangayNameForId = (barangayId) =>
    barangayCatalog.byId.get(barangayId)?.name
    || (editingVoter?.barangayId && editingVoter.barangayId === barangayId ? editingVoter.barangay : "")
    || (!barangayId && editingVoter?.barangay ? editingVoter.barangay : "")
    || "";

  const barangayChoiceLabel = (barangayId) => {
    const name = barangayNameForId(barangayId);
    if (!name) return "";
    const inCatalog = barangayId && barangayCatalog.activeIdSet.has(barangayId);
    if (!inCatalog) return `${name} (removed from catalog)`;
    return name;
  };

  const pickerBarangays = useMemo(() => {
    const list = [...barangayCatalog.activeList];
    const currentId = record.barangayId;
    if (currentId && !list.some((row) => row.id === currentId)) {
      const extra = barangayCatalog.byId.get(currentId);
      if (extra) list.push(extra);
    }
    return list;
  }, [barangayCatalog, record.barangayId, editingVoter]);

  const barangaysReady = !barangaysLoading && !barangaysError && barangayCatalog.activeList.length > 0;

  const refreshDirectory = useCallback(async () => {
    await Promise.all([loadVoters(), loadBarangays()]);
  }, [loadVoters, loadBarangays]);
  const existingVoterIdKeys = useMemo(
    () =>
      new Set(
        voters
          .map((v) => String(v.voterIdNumber || "").replace(/[^0-9A-Za-z]/gi, "").toUpperCase())
          .filter((k) => k.length === 23)
      ),
    [voters]
  );
  const voterIdOptions = useMemo(() => Array.from(new Set(voters.map((u) => u.voterIdNumber))).sort(), [voters]);
  const ageOptions = useMemo(() => {
    const ages = [...new Set(voters.map((u) => Number(u.age)).filter((n) => Number.isFinite(n)))].sort((a, b) => a - b);
    return ages;
  }, [voters]);

  const voterFilters = useMemo(
    () => ({
      filterBarangayName,
      filterSex,
      filterAge,
      filterVoterId,
      filterBirthdate,
      filterFullName,
      filterFirstName,
      filterLastName,
    }),
    [
      filterBarangayName,
      filterSex,
      filterAge,
      filterVoterId,
      filterBirthdate,
      filterFullName,
      filterFirstName,
      filterLastName,
    ]
  );

  const filteredUsers = useMemo(
    () => filterRegisteredVoterRecords(voters, voterFilters),
    [voters, voterFilters]
  );

  const getError = (key) => validateField(key, record[key], record);
  const updateRecord = (key, value) => {
    const nextValue = key === "voterIdNumber" ? formatRegisteredVoterId(value) : value;
    setRecord((prev) => ({ ...prev, [key]: nextValue }));
  };

  const closeBatchModal = () => {
    if (batchParsing || batchImporting) return;
    setBatchPreview(null);
    setBatchImportProgress({ current: 0, total: 0 });
    if (batchFileInputRef.current) batchFileInputRef.current.value = "";
  };

  const batchModalBusy = batchParsing || batchImporting;

  const resetRecordForm = () => {
    setRecord(emptyRecord);
    setTouched({});
    setBarangayModalOpen(false);
    setBarangayDraft("");
    setEntryMessage({ type: "", text: "" });
  };

  const closeAddVotersModal = () => {
    setAddVotersModalOpen(false);
    setBarangayModalOpen(false);
    setBarangayDraft("");
    setEntryMessage({ type: "", text: "" });
    setBatchLastImportMessage(null);
    closeBatchModal();
  };

  const openAddVotersModal = () => {
    setEditingVoter(null);
    setPendingDelete(null);
    resetRecordForm();
    setAddVotersModalOpen(true);
  };

  const openEditVoter = (voter) => {
    if (entrySubmitting || deleteBusy) return;
    closeAddVotersModal();
    setSelectedUser(null);
    setPendingDelete(null);
    setDirectoryMessage({ type: "", text: "" });
    setEditingVoter(voter);
    setRecord(recordFromVoter(voter));
    setTouched({});
    setEntryMessage({ type: "", text: "" });
  };

  const closeEditVoter = () => {
    if (entrySubmitting) return;
    setEditingVoter(null);
    resetRecordForm();
  };

  const openDeleteVoter = (voter) => {
    if (entrySubmitting || deleteBusy) return;
    setSelectedUser(null);
    setPendingDelete({ voter, step: 1 });
    setDeleteError("");
    setDirectoryMessage({ type: "", text: "" });
  };

  const closeDeleteVoter = () => {
    if (deleteBusy) return;
    setPendingDelete(null);
    setDeleteError("");
  };

  const handleSaveRecord = async (mode) => {
    setEntryMessage({ type: "", text: "" });
    if (mode === "create" && !barangaysReady) {
      setEntryMessage({
        type: "error",
        text: barangaysError || "Barangay list is still loading. Please wait before saving.",
      });
      return;
    }
    if (mode === "update" && (barangaysLoading || !editingVoter?.id)) {
      setEntryMessage({
        type: "error",
        text: barangaysLoading ? "Barangay list is still loading. Please wait before saving." : "Voter record is required.",
      });
      return;
    }

    const nextTouched = { ...recordFields.reduce((acc, f) => ({ ...acc, [f.key]: true }), {}), barangayId: true };
    setTouched(nextTouched);

    const keysToValidate = [...recordFields.map((f) => f.key), "barangayId"];
    const firstInvalidKey = keysToValidate.find((key) => !!validateField(key, record[key], record));
    if (firstInvalidKey) {
      setEntryMessage({ type: "error", text: "Please fix the highlighted fields before saving." });
      return;
    }

    const payload = voterWriteFromRecord(record);
    if (mode === "update" && payload.barangayId && !barangayCatalog.idSet.has(payload.barangayId)) {
      payload.barangayId = "";
    }
    if (!payload.sex) {
      setEntryMessage({ type: "error", text: "Please select Male or Female for sex." });
      return;
    }

    const duplicate = findDuplicateVoterId(
      voters,
      record.voterIdNumber,
      mode === "update" ? editingVoter.id : null
    );
    if (duplicate) {
      setEntryMessage({ type: "error", text: "That Voter ID is already registered." });
      return;
    }

    setEntrySubmitting(true);
    try {
      if (mode === "update") {
        await updateRegisteredVoter(editingVoter.id, payload);
        setDirectoryMessage({ type: "success", text: "Voter record updated." });
        setEditingVoter(null);
        resetRecordForm();
        setSelectedUser((current) => (current?.id === editingVoter.id ? null : current));
      } else {
        await insertRegisteredVoter(payload);
        resetRecordForm();
        setEntryMessage({ type: "success", text: "Record saved to registered voters." });
      }
      await refreshDirectory();
    } catch (e) {
      const msg = e?.message || "Could not save record.";
      if (/duplicate|unique/i.test(msg)) {
        setEntryMessage({ type: "error", text: "That Voter ID is already registered." });
      } else if (/barangay|foreign key|violates foreign key/i.test(msg)) {
        setEntryMessage({ type: "error", text: "Invalid barangay. Choose one from the list and try again." });
      } else {
        setEntryMessage({ type: "error", text: msg });
      }
    } finally {
      setEntrySubmitting(false);
    }
  };

  const handleSaveIndividualRecord = () => handleSaveRecord("create");

  const handleConfirmDeleteVoter = async () => {
    const voter = pendingDelete?.voter;
    if (!voter?.id) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await deleteRegisteredVoter(voter.id);
      const label = voter.fullName || "Voter";
      const vin = voter.voterIdNumber || "—";
      setDirectoryMessage({ type: "success", text: `Removed ${label} (${vin}) from the directory.` });
      setPendingDelete(null);
      setSelectedUser((current) => (current?.id === voter.id ? null : current));
      if (editingVoter?.id === voter.id) {
        setEditingVoter(null);
        resetRecordForm();
      }
      await refreshDirectory();
    } catch (e) {
      setDeleteError(e?.message || "Could not remove this voter record.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const processBatchFile = useCallback(
    async (file) => {
      if (!file) return;
      if (!barangaysReady) {
        setBatchLastImportMessage({
          type: "error",
          text: barangaysError || "Barangay list is still loading. Please wait and try again.",
        });
        return;
      }
      if (!BATCH_FILE_NAME_RE.test(file.name)) {
        setBatchLastImportMessage({
          type: "error",
          text: "Please use a .csv, .xls, or .xlsx file.",
        });
        return;
      }
      setBatchLastImportMessage(null);
      setBatchParsing(true);
      setBatchPreview({
        fileName: file.name,
        rows: [],
        summary: { total: 0, valid: 0, invalid: 0 },
      });
      try {
        const result = await parseRegisteredVoterBatchFile(file, {
          existingVoterIds: existingVoterIdKeys,
          barangayNameSet: barangayCatalog.nameSet,
          barangaysByName: barangayCatalog.byName,
        });
        setBatchPreview(result);
      } catch (e) {
        setBatchPreview({
          fileName: file.name,
          parseError: e?.message || "Could not read the file.",
          rows: [],
          summary: { total: 0, valid: 0, invalid: 0 },
        });
      } finally {
        setBatchParsing(false);
        if (batchFileInputRef.current) batchFileInputRef.current.value = "";
      }
    },
    [existingVoterIdKeys, barangayCatalog, barangaysReady, barangaysError]
  );

  const handleBatchInputChange = (event) => {
    const file = event.target.files?.[0];
    void processBatchFile(file);
  };

  const handleBatchDragEnter = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (batchParsing) return;
    batchDragDepthRef.current += 1;
    setBatchDropActive(true);
  };

  const handleBatchDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (batchParsing) return;
    batchDragDepthRef.current -= 1;
    if (batchDragDepthRef.current <= 0) {
      batchDragDepthRef.current = 0;
      setBatchDropActive(false);
    }
  };

  const handleBatchDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!batchParsing) event.dataTransfer.dropEffect = "copy";
  };

  const handleBatchDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    batchDragDepthRef.current = 0;
    setBatchDropActive(false);
    if (batchParsing) return;
    const files = event.dataTransfer.files;
    const file = pickFirstBatchFile(files);
    if (!file && files?.length) {
      setBatchLastImportMessage({
        type: "error",
        text: "No supported file in that drop. Use .csv, .xls, or .xlsx.",
      });
      return;
    }
    void processBatchFile(file);
  };

  const handleBatchImport = async () => {
    if (!barangaysReady) {
      setBatchLastImportMessage({
        type: "error",
        text: barangaysError || "Barangay list is still loading. Please wait and try again.",
      });
      return;
    }
    if (!batchPreview?.rows?.length) return;
    const payloads = batchPreview.rows.map((r) => r.insertPayload).filter(Boolean);
    if (!payloads.length) {
      setBatchLastImportMessage({
        type: "error",
        text: "No valid rows to import. Fix or remove invalid rows first.",
      });
      return;
    }
    setBatchImporting(true);
    setBatchImportProgress({ current: 0, total: payloads.length });
    try {
      const { inserted, skippedDuplicate, failed } = await insertRegisteredVotersBatch(payloads, {
        onProgress: (completed, total) => setBatchImportProgress({ current: completed, total }),
      });
      const parts = [`Imported ${inserted.length} record(s).`];
      if (skippedDuplicate.length) parts.push(`${skippedDuplicate.length} skipped (already in the database).`);
      if (failed.length) parts.push(`${failed.length} failed (see server message).`);
      setBatchLastImportMessage({
        type: failed.length ? "error" : "success",
        text: parts.join(" "),
      });
      await refreshDirectory();
      closeBatchModal();
    } catch (e) {
      setBatchLastImportMessage({ type: "error", text: e?.message || "Batch import failed." });
      closeBatchModal();
    } finally {
      setBatchImporting(false);
      setBatchImportProgress({ current: 0, total: 0 });
    }
  };

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / rowsPerPage));
  const activePage = Math.min(currentPage, totalPages);
  const pagedUsers = filteredUsers.slice((activePage - 1) * rowsPerPage, activePage * rowsPerPage);

  const runRegisteredVotersExport = async (format) => {
    if (exporting) return;
    setExporting(true);
    setExportMessage(null);
    try {
      const rows = await fetchRegisteredVoters();
      setVoters(rows);
      const toExport = filterRegisteredVoterRecords(rows, voterFilters);
      if (!toExport.length) {
        setExportMessage({
          type: "error",
          text: "No records match the current filters to export.",
        });
        return;
      }
      const stamp = registeredVoterExportFileStamp();
      if (format === "csv") {
        downloadRegisteredVotersCsv(toExport, `registered-voters-${stamp}.csv`);
      } else {
        await downloadRegisteredVotersXlsx(toExport, `registered-voters-${stamp}.xlsx`);
      }
      setExportMessage({
        type: "success",
        text: `Exported ${toExport.length} record(s) from the database.`,
      });
    } catch (e) {
      setExportMessage({
        type: "error",
        text: e?.message || "Could not export registered voters.",
      });
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setCurrentPage(1);
    setFilterBarangayName("");
    setFilterSex("");
    setFilterAge("");
    setFilterVoterId("");
    setFilterBirthdate("");
    setFilterFullName("");
    setFilterFirstName("");
    setFilterLastName("");
  };

  useEffect(() => {
    if (!selectedUser && !addVotersModalOpen && !barangayModalOpen && !batchPreview && !editingVoter && !pendingDelete) {
      return undefined;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [selectedUser, addVotersModalOpen, barangayModalOpen, batchPreview, editingVoter, pendingDelete]);

  useEffect(() => {
    if (!batchModalBusy) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [batchModalBusy]);

  return (
    <div className="space-y-6">
<section className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(var(--system-primary-rgb),0.7)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-700">Voters</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-ocean-950">Registered voters</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openAddVotersModal}
              disabled={!barangaysReady}
              title={!barangaysReady ? "Add barangays in Service settings before creating voters" : undefined}
              className="inline-flex h-10 items-center rounded-xl bg-ocean-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-ocean-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add Registered Voters
            </button>
            <span className="inline-flex h-10 items-center rounded-lg border border-ocean-200 bg-ocean-50 px-3 text-sm font-semibold text-ocean-700">
              {listLoading ? "…" : `${filteredUsers.length} records`}
            </span>
            <button
              type="button"
              onClick={() => void refreshDirectory()}
              disabled={listLoading || barangaysLoading}
              aria-label="Refresh registered voters and barangays"
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-ocean-200 bg-white px-3 text-xs font-semibold text-ocean-800 transition hover:border-ocean-300 hover:bg-ocean-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw
                className={`h-3.5 w-3.5 ${listLoading || barangaysLoading ? "animate-spin" : ""}`}
                aria-hidden
              />
              Refresh
            </button>
          </div>
        </div>

        {listError ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{listError}</p>
        ) : null}
        {directoryMessage.text ? (
          <p
            className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
              directoryMessage.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
            role="status"
          >
            {directoryMessage.text}
          </p>
        ) : null}
        {barangaysError ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
            <p className="text-sm text-rose-700">{barangaysError}</p>
            <button
              type="button"
              onClick={() => void loadBarangays()}
              className="inline-flex h-8 shrink-0 items-center rounded-md border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-800 transition hover:bg-rose-50"
            >
              Retry barangays
            </button>
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 rounded-xl border border-ocean-200 bg-ocean-50/60 p-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ocean-700">Barangay + Sex</p>
            <select
              value={filterBarangayName}
              onChange={(event) => {
                setCurrentPage(1);
                setFilterBarangayName(event.target.value);
              }}
              disabled={barangaysLoading && !voters.length}
              className="h-9 w-full rounded-lg border border-ocean-200 bg-white px-2 text-xs font-semibold text-ocean-800 outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">{barangaysLoading && !voters.length ? "Loading barangays…" : "All Barangays"}</option>
              {filterBarangayNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={filterSex}
              onChange={(event) => {
                setCurrentPage(1);
                setFilterSex(event.target.value);
              }}
              className="h-9 w-full rounded-lg border border-ocean-200 bg-white px-2 text-xs font-semibold text-ocean-800 outline-none"
            >
              <option value="">All Sex</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ocean-700">Age</p>
            <p className="text-[10px] font-medium text-ocean-700">Uses barangay from the first filter group</p>
            <select
              value={filterAge}
              onChange={(event) => {
                setCurrentPage(1);
                setFilterAge(event.target.value);
              }}
              className="h-9 w-full rounded-lg border border-ocean-200 bg-white px-2 text-xs font-semibold text-ocean-800 outline-none"
            >
              <option value="">All Ages</option>
              {ageOptions.map((age) => (
                <option key={age} value={age}>
                  {age}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ocean-700">Voter ID + Birthdate</p>
            <select
              value={filterVoterId}
              onChange={(event) => {
                setCurrentPage(1);
                setFilterVoterId(event.target.value);
              }}
              className="h-9 w-full rounded-lg border border-ocean-200 bg-white px-2 text-xs font-semibold text-ocean-800 outline-none"
            >
              <option value="">All Voter IDs</option>
              {voterIdOptions.slice(0, 80).map((voterId) => (
                <option key={voterId} value={voterId}>
                  {voterId}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={filterBirthdate}
              onChange={(event) => {
                setCurrentPage(1);
                setFilterBirthdate(event.target.value);
              }}
              className="h-9 w-full rounded-lg border border-ocean-200 bg-white px-2 text-xs font-semibold text-ocean-800 outline-none"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ocean-700">Name search</p>
            <input
              type="text"
              value={filterFullName}
              onChange={(event) => {
                setCurrentPage(1);
                setFilterFullName(event.target.value);
              }}
              placeholder="Full name contains…"
              className="h-9 w-full rounded-lg border border-ocean-200 bg-white px-2 text-xs font-semibold text-ocean-800 outline-none placeholder:text-ocean-500"
            />
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <input
            type="text"
            value={filterFirstName}
            onChange={(event) => {
              setCurrentPage(1);
              setFilterFirstName(event.target.value);
            }}
            placeholder="First name contains…"
            className="h-9 w-full rounded-lg border border-ocean-200 bg-white px-2 text-xs font-semibold text-ocean-800 outline-none placeholder:text-ocean-500"
          />
          <div className="flex gap-2 md:col-span-2">
            <input
              type="text"
              value={filterLastName}
              onChange={(event) => {
                setCurrentPage(1);
                setFilterLastName(event.target.value);
              }}
              placeholder="Last name contains…"
              className="h-9 w-full rounded-lg border border-ocean-200 bg-white px-2 text-xs font-semibold text-ocean-800 outline-none placeholder:text-ocean-500"
            />
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-9 shrink-0 items-center rounded-lg border border-ocean-200 bg-ocean-50 px-3 text-xs font-semibold text-ocean-700 transition hover:border-ocean-300 hover:bg-ocean-100"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-ocean-200">
          <table className="min-w-full divide-y divide-ocean-200">
            <thead className="bg-ocean-50/80">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">Full name</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">Voter ID Number</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ocean-100 bg-white">
              {listLoading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-ocean-700">
                    Loading directory…
                  </td>
                </tr>
              ) : pagedUsers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-ocean-700">
                    No records match the current filters.
                  </td>
                </tr>
              ) : (
                pagedUsers.map((user) => (
                  <tr key={user.id} className="transition hover:bg-ocean-50/60">
                    <td className="px-4 py-3 text-sm font-medium text-ocean-900">{user.fullName}</td>
                    <td className="px-4 py-3 text-sm text-ocean-700">{user.voterIdNumber}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedUser(user)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-ocean-200 bg-white px-3 py-1.5 text-xs font-semibold text-ocean-700 transition hover:border-ocean-300 hover:bg-ocean-50"
                        >
                          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditVoter(user)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-ocean-200 bg-white px-3 py-1.5 text-xs font-semibold text-ocean-700 transition hover:border-ocean-300 hover:bg-ocean-50"
                        >
                          <Pencil className="size-3.5" aria-hidden />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => openDeleteVoter(user)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50"
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void runRegisteredVotersExport("csv")}
              disabled={exporting || filteredUsers.length === 0}
              className="inline-flex h-8 items-center rounded-md border border-ocean-200 bg-white px-3 text-xs font-semibold text-ocean-700 transition hover:border-ocean-300 hover:bg-ocean-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
            <button
              type="button"
              onClick={() => void runRegisteredVotersExport("xlsx")}
              disabled={exporting || filteredUsers.length === 0}
              className="inline-flex h-8 items-center rounded-md bg-ocean-600 px-3 text-xs font-semibold text-white transition hover:bg-ocean-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting ? "Exporting…" : "Export Excel"}
            </button>
            {exportMessage?.text ? (
              <p
                className={`text-xs font-medium ${exportMessage.type === "success" ? "text-emerald-700" : "text-rose-600"}`}
                role="status"
              >
                {exportMessage.text}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={activePage === 1}
              className="inline-flex h-8 items-center rounded-md border border-ocean-200 bg-white px-2 text-xs font-semibold text-ocean-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => setCurrentPage(page)}
                className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-semibold ${
                  activePage === page ? "border-ocean-500 bg-ocean-500 text-white" : "border-ocean-200 bg-white text-ocean-700"
                }`}
              >
                {page}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={activePage === totalPages}
              className="inline-flex h-8 items-center rounded-md border border-ocean-200 bg-white px-2 text-xs font-semibold text-ocean-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>


      {addVotersModalOpen ? (
        <div
          className={ADD_VOTERS_MODAL_OVERLAY_CLASS}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-voters-modal-title"
        >
          <div className={LARGE_MODAL_CENTER_CLASS}>
            <div className={ADD_MODAL_PANEL_CLASS}>
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-ocean-100 px-5 py-3">
              <div>
                <h3 id="add-voters-modal-title" className="text-lg font-semibold text-ocean-950">
                  Add registered voters
                </h3>
                <p className="mt-1 text-sm text-ocean-700">Enter one record or upload a batch file.</p>
              </div>
              <button
                type="button"
                onClick={closeAddVotersModal}
                className="inline-flex h-10 shrink-0 items-center rounded-lg border border-ocean-200 bg-ocean-50 px-3 text-sm font-semibold text-ocean-700 transition hover:border-ocean-300 hover:bg-ocean-100"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 text-sm">
              <div className="flex flex-col gap-3">
              <div className="rounded-xl border border-ocean-100 bg-ocean-50/30 p-3">
                  <h4 className="text-base font-semibold text-ocean-950">Individual record entry</h4>
                  <p className="text-sm text-ocean-700">One voter at a time.</p>
                  <div className="mt-1.5 grid gap-1 md:grid-cols-2">
                          {recordFields.map((field) => {
                            const error = touched[field.key] ? getError(field.key) : "";
                            return (
                              <label key={field.key} className="space-y-0.5 text-sm font-semibold text-ocean-900">
                                {field.label}
                                {field.type === "select" ? (
                                  <select
                                    value={record[field.key]}
                                    onChange={(event) => updateRecord(field.key, event.target.value)}
                                    onBlur={() => setTouched((prev) => ({ ...prev, [field.key]: true }))}
                                    className={`h-10 w-full rounded-lg border bg-ocean-50/60 px-3 text-sm font-medium text-ocean-900 outline-none focus:border-ocean-400 ${
                                      error ? "border-rose-300" : "border-ocean-200"
                                    }`}
                                  >
                                    {field.options.map((option) => (
                                      <option key={option || "empty"} value={option}>
                                        {option || field.placeholder}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type={field.type}
                                    value={record[field.key]}
                                    onChange={(event) => updateRecord(field.key, event.target.value)}
                                    onBlur={() => setTouched((prev) => ({ ...prev, [field.key]: true }))}
                                    inputMode={field.key === "voterIdNumber" || field.key === "age" ? "text" : undefined}
                                    maxLength={field.key === "voterIdNumber" ? 26 : undefined}
                                    min={field.key === "age" ? 1 : undefined}
                                    max={field.key === "age" ? 120 : undefined}
                                    placeholder={field.placeholder}
                                    className={`h-10 w-full rounded-lg border bg-ocean-50/60 px-3 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/80 focus:border-ocean-400 ${
                                      error ? "border-rose-300" : "border-ocean-200"
                                    }`}
                                  />
                                )}
                                <p
                                  className={`text-xs leading-snug ${error ? "text-rose-500" : "text-ocean-700"} ${!error && field.key !== "voterIdNumber" ? "invisible" : ""}`}
                                >
                                  {error ||
                                    (field.key === "voterIdNumber" ? "4-5-13-1 format" : "—")}
                                </p>
                              </label>
                            );
                          })}
                        </div>
                
                  <div className="mt-1.5 space-y-0.5 border-t border-ocean-100 pt-1.5">
                    <p className="text-sm font-semibold text-ocean-900">Barangay</p>
                    <button
                      type="button"
                      onClick={() => {
                        setBarangayDraft(record.barangayId);
                        setBarangayModalOpen(true);
                      }}
                      disabled={barangaysLoading || !!barangaysError}
                      className={`inline-flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-ocean-50/60 px-3 text-left text-sm font-medium text-ocean-900 transition hover:border-ocean-400 hover:bg-ocean-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean-500 disabled:cursor-not-allowed disabled:opacity-60 ${
                        touched.barangayId && getError("barangayId") ? "border-rose-300" : "border-ocean-200"
                      }`}
                    >
                      <span className={record.barangayId ? "text-ocean-900" : "text-ocean-700"}>
                        {barangaysLoading
                          ? "Loading barangays…"
                          : barangayChoiceLabel(record.barangayId) || "Select barangay…"}
                      </span>
                      <span className="text-xs font-semibold text-ocean-700">Browse</span>
                    </button>
                    <p
                      className={`text-xs leading-snug ${touched.barangayId && getError("barangayId") ? "text-rose-500" : "invisible"}`}
                    >
                      {touched.barangayId ? getError("barangayId") || "—" : "—"}
                    </p>
                  </div>
                  {entryMessage.text ? (
                    <p
                      className={`mt-1.5 text-sm font-medium ${entryMessage.type === "success" ? "text-emerald-700" : "text-rose-600"}`}
                      role="status"
                    >
                      {entryMessage.text}
                    </p>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleSaveIndividualRecord}
                      disabled={entrySubmitting}
                      className="inline-flex h-10 items-center rounded-lg bg-ocean-600 px-4 text-sm font-semibold text-white transition hover:bg-ocean-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {entrySubmitting ? "Saving…" : "Save record"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRecord(emptyRecord);
                        setTouched({});
                        setBarangayModalOpen(false);
                        setBarangayDraft("");
                        setEntryMessage({ type: "", text: "" });
                      }}
                      className="inline-flex h-10 items-center rounded-lg border border-ocean-200 bg-ocean-50 px-3 text-sm font-semibold text-ocean-800 transition hover:border-ocean-300 hover:bg-ocean-100"
                    >
                      Clear form
                    </button>
                  </div>
                </div>
                <div className="rounded-xl border border-ocean-100 bg-ocean-50/30 p-2.5">
                  <h4 className="shrink-0 text-base font-semibold text-ocean-950">Upload by batch</h4>
                  <p className="shrink-0 text-sm leading-snug text-ocean-700">
                    Row 1 = headers. Dates: YYYY-MM-DD or DD/MM/YYYY. Max 2,000 rows, 5 MB.
                  </p>
                  <p className="mt-1 shrink-0 rounded-md border border-ocean-100 bg-ocean-50/60 px-1.5 py-1 font-mono text-xs leading-snug text-ocean-800">
                    {REGISTERED_VOTER_BATCH_TEMPLATE_HEADERS.join(", ")}
                  </p>
                  <div
                    className={`mt-1.5 flex min-h-[5.25rem] select-none flex-col rounded-lg border-2 border-dashed transition ${
                      batchDropActive
                        ? "border-ocean-500 bg-ocean-100/80 shadow-[0_0_0_3px_rgba(14,116,144,0.2)]"
                        : "border-ocean-200 bg-ocean-50/40"
                    } ${batchParsing || !barangaysReady ? "pointer-events-none opacity-70" : ""}`}
                    onDragEnter={handleBatchDragEnter}
                    onDragLeave={handleBatchDragLeave}
                    onDragOver={handleBatchDragOver}
                    onDrop={handleBatchDrop}
                  >
                    <label className="flex min-h-[5.25rem] flex-1 cursor-pointer flex-col items-center justify-center rounded-md px-2 py-2 text-center transition hover:bg-ocean-50/80">
                      <input
                        ref={batchFileInputRef}
                        type="file"
                        accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        className="hidden"
                        disabled={batchParsing || !barangaysReady}
                        onChange={handleBatchInputChange}
                      />
                      <span className="text-sm font-semibold text-ocean-800">
                        {batchParsing ? "Reading file…" : batchDropActive ? "Release to preview" : "Click or drag a file here"}
                      </span>
                      <span className="mt-0.5 text-xs font-medium text-ocean-700">.csv, .xls, or .xlsx</span>
                    </label>
                  </div>
                  {batchLastImportMessage?.text ? (
                    <p
                      className={`mt-1 shrink-0 text-sm font-medium ${batchLastImportMessage.type === "success" ? "text-emerald-700" : "text-rose-600"}`}
                      role="status"
                    >
                      {batchLastImportMessage.text}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      ) : null}


{barangayModalOpen ? (
          <div
            className="fixed inset-0 z-[110] flex items-center justify-center bg-ocean-950/45 p-4 backdrop-blur-[2px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="barangay-picker-title"
            onClick={() => setBarangayModalOpen(false)}
          >
            <div
              className="flex max-h-[min(90vh,640px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-ocean-200 bg-white shadow-[0_24px_60px_-24px_rgba(var(--system-primary-rgb),0.85)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-ocean-100 px-5 py-4">
                <h3 id="barangay-picker-title" className="text-lg font-semibold text-ocean-950">
                  Select barangay
                </h3>
                <p className="mt-1 text-xs text-ocean-700">Tap a barangay, then Apply to confirm.</p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {barangaysLoading ? (
                  <p className="py-8 text-center text-sm text-ocean-700">Loading barangays from the database…</p>
                ) : barangaysError ? (
                  <p className="py-8 text-center text-sm text-rose-600">{barangaysError}</p>
                ) : pickerBarangays.length === 0 ? (
                  <p className="py-8 text-center text-sm text-ocean-700">
                    No barangays found. Add them in{" "}
                    <Link
                      to="/superadmin/global-settings/service#barangays"
                      className="font-semibold text-ocean-800 underline underline-offset-2"
                    >
                      Service settings → Barangays
                    </Link>
                    .
                  </p>
                ) : (
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {pickerBarangays.map((b) => (
                      <label
                        key={b.id}
                        className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-ocean-50 ${
                          barangayDraft === b.id ? "bg-ocean-50 ring-1 ring-ocean-300" : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name="barangay-modal-draft"
                          value={b.id}
                          checked={barangayDraft === b.id}
                          onChange={() => setBarangayDraft(b.id)}
                          className="mt-0.5 size-4 shrink-0 border-ocean-300 text-ocean-700 focus:ring-ocean-500"
                        />
                        <span className="text-xs font-medium leading-snug text-ocean-900">
                          {b.isActive === false ? `${b.name} (removed)` : b.name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-ocean-100 bg-ocean-50/50 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setBarangayModalOpen(false)}
                  className="inline-flex h-10 items-center rounded-lg border border-ocean-200 bg-white px-4 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!barangayDraft || barangaysLoading || !!barangaysError}
                  onClick={() => {
                    setRecord((prev) => ({ ...prev, barangayId: barangayDraft }));
                    setTouched((prev) => ({ ...prev, barangayId: true }));
                    setBarangayModalOpen(false);
                  }}
                  className="inline-flex h-10 items-center rounded-lg bg-ocean-600 px-4 text-sm font-semibold text-white transition hover:bg-ocean-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        ) : null}

      {batchPreview ? (
        <div
          className={BATCH_PREVIEW_MODAL_OVERLAY_CLASS}
          role="dialog"
          aria-modal="true"
          aria-labelledby="batch-import-title"
          aria-busy={batchModalBusy}
        >
          <div className={LARGE_MODAL_CENTER_CLASS}>
            <div className={PREVIEW_MODAL_PANEL_CLASS}>
            <div className="shrink-0 border-b border-ocean-100 px-5 py-3">
              <h3 id="batch-import-title" className="text-lg font-semibold text-ocean-950">
                {batchImporting
                  ? "Import in progress"
                  : batchParsing
                    ? "Preparing preview"
                    : "Preview import"}
              </h3>
              {!batchModalBusy ? (
                <p className="mt-1 text-xs text-ocean-700">
                  {batchPreview.fileName ? (
                    <>
                      File: <span className="font-medium text-ocean-800">{batchPreview.fileName}</span>
                    </>
                  ) : (
                    "Review parsed rows before saving to the database."
                  )}
                </p>
              ) : null}
            </div>

            {batchModalBusy ? (
              <BatchImportLoadingPanel
                phase={batchImporting ? "importing" : "parsing"}
                fileName={batchPreview.fileName}
                current={batchImportProgress.current}
                total={batchImportProgress.total}
              />
            ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-5 py-3">
              {batchPreview.parseError || batchPreview.headerError ? (
                <p className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  {batchPreview.parseError || batchPreview.headerError}
                </p>
              ) : null}

              {!batchPreview.parseError && !batchPreview.headerError ? (
                <div className="flex shrink-0 flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full border border-ocean-200 bg-ocean-50 px-3 py-1 text-ocean-800">
                    {batchPreview.summary.total} row(s)
                  </span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800">
                    {batchPreview.summary.valid} valid
                  </span>
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-800">
                    {batchPreview.summary.invalid} invalid
                  </span>
                </div>
              ) : null}

              {batchPreview.rows?.length ? (
                <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-ocean-200 bg-white">
                  <table className="w-max min-w-full border-collapse text-left text-[13px] leading-snug">
                    <thead className="sticky top-0 z-20 bg-ocean-50 shadow-[0_1px_0_0_rgb(226,232,240)]">
                      <tr>
                        <th className="sticky left-0 top-0 z-30 w-8 border-b border-r border-ocean-200 bg-ocean-50 px-1.5 py-1.5 text-left font-semibold text-ocean-900 shadow-[2px_0_6px_-2px_rgba(var(--system-primary-rgb),0.12)]">
                          <span className="block text-[13px] leading-tight">Row</span>
                        </th>
                        <th className="sticky top-0 z-20 min-w-[3.25rem] border-b border-ocean-200 bg-ocean-50 px-1.5 py-1.5 font-semibold text-ocean-900">
                          <span className="block text-[10px] leading-tight">Status</span>
                        </th>
                        {BATCH_PREVIEW_COLUMNS.map((col) => (
                          <th
                            key={col.key}
                            className={`sticky top-0 z-20 border-b border-ocean-200 bg-ocean-50 px-1.5 py-1.5 align-bottom font-semibold text-ocean-900 ${batchPreviewColMinClass(col.key)}`}
                          >
                            <span className="block whitespace-normal break-words">{col.label}</span>
                          </th>
                        ))}
                        <th className="sticky top-0 z-20 min-w-[9rem] border-b border-ocean-200 bg-ocean-50 px-1.5 py-1.5 font-semibold text-ocean-900">
                          <span className="block whitespace-normal break-words">Notes</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ocean-100 bg-white">
                      {batchPreview.rows.map((r) => {
                        const rec = r.record;
                        return (
                          <tr key={r.sheetRow} className={r.isValid ? "" : "bg-rose-50/90"}>
                            <td
                              className={`sticky left-0 z-10 border-r border-ocean-200 px-1.5 py-1.5 align-top font-medium text-ocean-800 shadow-[2px_0_6px_-2px_rgba(var(--system-primary-rgb),0.06)] ${
                                r.isValid ? "bg-white" : "bg-rose-50"
                              }`}
                            >
                              {r.sheetRow}
                            </td>
                            <td className="px-1.5 py-1.5 align-top font-semibold">
                              {r.isValid ? (
                                <span className="text-[13px] leading-tight text-emerald-700">Valid</span>
                              ) : (
                                <span className="text-[13px] leading-tight text-rose-700">Invalid</span>
                              )}
                            </td>
                            {BATCH_PREVIEW_COLUMNS.map((col) => {
                              const val = rec[col.key];
                              const display =
                                val === undefined || val === null || String(val).trim() === "" ? "—" : String(val);
                              const mono = col.key === "voterIdNumber";
                              return (
                                <td
                                  key={col.key}
                                  className={`px-1.5 py-1.5 align-top whitespace-normal break-words text-ocean-800 [overflow-wrap:anywhere] ${batchPreviewColMinClass(col.key)} ${
                                    mono ? "font-mono text-[13px] leading-tight tracking-tight" : ""
                                  }`}
                                >
                                  {display}
                                </td>
                              );
                            })}
                            <td className="min-w-[9rem] px-1.5 py-1.5 align-top whitespace-normal break-words text-rose-800 [overflow-wrap:anywhere]">
                              {r.errors.length ? r.errors.join(" · ") : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
            )}

            {!batchModalBusy ? (
            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-ocean-100 bg-ocean-50/50 px-5 py-3">
              <button
                type="button"
                onClick={closeBatchModal}
                className="inline-flex h-10 items-center rounded-lg border border-ocean-200 bg-white px-4 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  !barangaysReady ||
                  !batchPreview.rows?.length ||
                  batchPreview.summary.valid === 0 ||
                  !!batchPreview.parseError ||
                  !!batchPreview.headerError
                }
                onClick={() => void handleBatchImport()}
                className="inline-flex h-10 items-center rounded-lg bg-ocean-600 px-4 text-sm font-semibold text-white transition hover:bg-ocean-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {`Import ${batchPreview.summary.valid} valid row(s)`}
              </button>
            </div>
            ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {editingVoter ? (
        <div
          className={ADD_VOTERS_MODAL_OVERLAY_CLASS}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-voter-title"
        >
          <div className={LARGE_MODAL_CENTER_CLASS}>
            <div className="flex max-h-[min(92vh,880px)] w-full max-w-3xl shrink-0 flex-col overflow-hidden rounded-2xl border border-ocean-200 bg-white shadow-[0_24px_60px_-24px_rgba(var(--system-primary-rgb),0.85)]">
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-ocean-100 px-5 py-3">
                <div>
                  <h3 id="edit-voter-title" className="text-lg font-semibold text-ocean-950">
                    Edit voter record
                  </h3>
                  <p className="mt-1 text-sm text-ocean-700">
                    {editingVoter.fullName || "Registered voter"} · {editingVoter.voterIdNumber || "—"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeEditVoter}
                  disabled={entrySubmitting}
                  className="inline-flex h-10 shrink-0 items-center rounded-lg border border-ocean-200 bg-ocean-50 px-3 text-sm font-semibold text-ocean-700 transition hover:border-ocean-300 hover:bg-ocean-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 text-sm">
                <div className="mt-1.5 grid gap-1 md:grid-cols-2">
                  {recordFields.map((field) => {
                    const error = touched[field.key] ? getError(field.key) : "";
                    return (
                      <label key={field.key} className="space-y-0.5 text-sm font-semibold text-ocean-900">
                        {field.label}
                        {field.type === "select" ? (
                          <select
                            value={record[field.key]}
                            onChange={(event) => updateRecord(field.key, event.target.value)}
                            onBlur={() => setTouched((prev) => ({ ...prev, [field.key]: true }))}
                            disabled={entrySubmitting}
                            className={`h-10 w-full rounded-lg border bg-ocean-50/60 px-3 text-sm font-medium text-ocean-900 outline-none focus:border-ocean-400 ${
                              error ? "border-rose-300" : "border-ocean-200"
                            }`}
                          >
                            {field.options.map((option) => (
                              <option key={option || "empty"} value={option}>
                                {option || field.placeholder}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={field.type}
                            value={record[field.key]}
                            onChange={(event) => updateRecord(field.key, event.target.value)}
                            onBlur={() => setTouched((prev) => ({ ...prev, [field.key]: true }))}
                            disabled={entrySubmitting}
                            inputMode={field.key === "voterIdNumber" || field.key === "age" ? "text" : undefined}
                            maxLength={field.key === "voterIdNumber" ? 26 : undefined}
                            min={field.key === "age" ? 1 : undefined}
                            max={field.key === "age" ? 120 : undefined}
                            placeholder={field.placeholder}
                            className={`h-10 w-full rounded-lg border bg-ocean-50/60 px-3 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/80 focus:border-ocean-400 ${
                              error ? "border-rose-300" : "border-ocean-200"
                            }`}
                          />
                        )}
                        <p
                          className={`text-xs leading-snug ${error ? "text-rose-500" : "text-ocean-700"} ${!error && field.key !== "voterIdNumber" ? "invisible" : ""}`}
                        >
                          {error || (field.key === "voterIdNumber" ? "4-5-13-1 format" : "—")}
                        </p>
                      </label>
                    );
                  })}
                </div>
                <div className="mt-1.5 space-y-0.5 border-t border-ocean-100 pt-1.5">
                  <p className="text-sm font-semibold text-ocean-900">Barangay</p>
                  <button
                    type="button"
                    onClick={() => {
                      setBarangayDraft(record.barangayId);
                      setBarangayModalOpen(true);
                    }}
                    disabled={entrySubmitting || barangaysLoading || !!barangaysError}
                    className={`inline-flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-ocean-50/60 px-3 text-left text-sm font-medium text-ocean-900 transition hover:border-ocean-400 hover:bg-ocean-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean-500 disabled:cursor-not-allowed disabled:opacity-60 ${
                      touched.barangayId && getError("barangayId") ? "border-rose-300" : "border-ocean-200"
                    }`}
                  >
                    <span className={record.barangayId ? "text-ocean-900" : "text-ocean-700"}>
                      {barangaysLoading
                        ? "Loading barangays…"
                        : barangayChoiceLabel(record.barangayId) || "Select barangay…"}
                    </span>
                    <span className="text-xs font-semibold text-ocean-700">Browse</span>
                  </button>
                  <p
                    className={`text-xs leading-snug ${touched.barangayId && getError("barangayId") ? "text-rose-500" : "invisible"}`}
                  >
                    {touched.barangayId ? getError("barangayId") || "—" : "—"}
                  </p>
                </div>
                {entryMessage.text ? (
                  <p
                    className={`mt-3 text-sm font-medium ${entryMessage.type === "success" ? "text-emerald-700" : "text-rose-600"}`}
                    role="status"
                  >
                    {entryMessage.text}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-ocean-100 bg-ocean-50/50 px-5 py-3">
                <button
                  type="button"
                  onClick={closeEditVoter}
                  disabled={entrySubmitting}
                  className="inline-flex h-10 items-center rounded-lg border border-ocean-200 bg-white px-4 text-sm font-semibold text-ocean-800 transition hover:border-ocean-300 hover:bg-ocean-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveRecord("update")}
                  disabled={entrySubmitting || barangaysLoading}
                  className="inline-flex h-10 items-center rounded-lg bg-ocean-600 px-4 text-sm font-semibold text-white transition hover:bg-ocean-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {entrySubmitting ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDelete?.voter ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-ocean-950/45 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-voter-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-5 shadow-[0_24px_60px_-30px_rgba(127,29,29,0.45)]">
            <h3 id="remove-voter-title" className="text-lg font-semibold tracking-tight text-rose-900">
              Remove voter record
            </h3>
            {pendingDelete.step === 1 ? (
              <>
                <p className="mt-2 text-sm text-rose-800">
                  You are about to remove{" "}
                  <span className="font-semibold">{pendingDelete.voter.fullName || "this voter"}</span>{" "}
                  from the registered voters directory.
                </p>
                <p className="mt-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
                  Voter ID: {pendingDelete.voter.voterIdNumber || "—"}
                </p>
                <p className="mt-2 text-xs text-rose-700">
                  This only deletes the directory row. Applicant accounts are not deleted or changed.
                </p>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeDeleteVoter}
                    className="rounded-lg border border-ocean-200 px-3 py-2 text-xs font-semibold text-ocean-700 hover:bg-ocean-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete((current) => (current ? { ...current, step: 2 } : current))}
                    className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    Continue
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-rose-800">
                  Final confirmation: permanently remove{" "}
                  <span className="font-semibold">{pendingDelete.voter.fullName || "this voter"}</span>
                  {pendingDelete.voter.voterIdNumber ? ` (${pendingDelete.voter.voterIdNumber})` : ""}?
                </p>
                <p className="mt-2 text-xs text-rose-700">This action cannot be undone.</p>
                {deleteError ? (
                  <p className="mt-2 text-xs font-medium text-rose-700" role="alert">
                    {deleteError}
                  </p>
                ) : null}
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingDelete((current) => (current ? { ...current, step: 1 } : current))}
                    disabled={deleteBusy}
                    className="rounded-lg border border-ocean-200 px-3 py-2 text-xs font-semibold text-ocean-700 hover:bg-ocean-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirmDeleteVoter()}
                    disabled={deleteBusy}
                    className="rounded-lg border border-rose-500 bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deleteBusy ? "Removing…" : "Remove permanently"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {selectedUser ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ocean-950/45 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="voter-detail-title"
          onClick={() => setSelectedUser(null)}
        >
          <section
            className="max-h-[min(90vh,720px)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_24px_60px_-24px_rgba(var(--system-primary-rgb),0.85)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 id="voter-detail-title" className="text-lg font-semibold text-ocean-950">
                Voter Details
              </h3>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="inline-flex h-9 items-center rounded-lg border border-ocean-200 bg-ocean-50 px-3 text-xs font-semibold text-ocean-700 transition hover:border-ocean-300 hover:bg-ocean-100"
              >
                Close
              </button>
            </div>
            <div className="mt-4 rounded-xl border border-ocean-200 bg-ocean-50/40 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {detailFields.map(([label, key]) => (
                  <div key={key} className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ocean-700">{label}</p>
                    <div className="min-h-10 rounded-lg border border-ocean-200 bg-white px-3 py-2 text-sm font-medium leading-snug text-ocean-900">
                      {key === "createdAt" || key === "updatedAt"
                        ? formatIsoForDisplay(selectedUser[key])
                        : selectedUser[key] || "—"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => openEditVoter(selectedUser)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ocean-200 bg-white px-3 text-xs font-semibold text-ocean-700 transition hover:border-ocean-300 hover:bg-ocean-50"
              >
                <Pencil className="size-3.5" aria-hidden />
                Edit
              </button>
              <button
                type="button"
                onClick={() => openDeleteVoter(selectedUser)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50"
              >
                <Trash2 className="size-3.5" aria-hidden />
                Remove
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
