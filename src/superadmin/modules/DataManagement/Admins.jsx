import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../shared/lib/supabaseClient";
import {
  CATALOG_SELECT,
  fetchStitchedAssistanceCatalog,
  sortCatalogRows,
} from "../../../shared/lib/catalogFetch";
import {
  getSessionCachedQuery,
  invalidateSessionCache,
} from "../../../shared/lib/querySessionCache";
import { parseAssistanceCategoryTheme } from "../../../shared/lib/assistanceCategoryTheme";
import { normalizeThemeJsonHex } from "../../../shared/lib/themeJsonPalette";

const stripRichText = (text = "") => {
  if (!text) return "";
  if (typeof document === "undefined") return text.replace(/<[^>]*>/g, "");
  const div = document.createElement("div");
  div.innerHTML = text;
  return div.textContent || div.innerText || "";
};

function hexToRgba(hex, alpha) {
  const normalized = normalizeThemeJsonHex(hex);
  if (!normalized) return `rgba(15, 23, 42, ${alpha})`;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

function resolveAssistanceHeaderTheme(slug, themeJson) {
  const theme = parseAssistanceCategoryTheme(slug, themeJson);
  const parsed = themeJson && typeof themeJson === "object" && !Array.isArray(themeJson) ? themeJson : {};
  const primary = normalizeThemeJsonHex(parsed.primary);
  const secondary = normalizeThemeJsonHex(parsed.secondary);

  // Prefer base brand stops (home stripe / primary palette), not statusCardHeaderGradient
  // which intentionally tints Burial toward pink/purple for mobile status cards.
  const stops =
    theme.homeCardStripeGradient ??
    (primary && secondary ? [primary, secondary] : null) ??
    (primary ? [primary, primary] : null) ??
    [theme.accent, theme.accent];

  const from = stops[0] ?? theme.accent;
  const to = stops[1] ?? from;
  const light = hexLuminance(from) > 0.62;

  return {
    from,
    to,
    light,
    solidBackground: `linear-gradient(to bottom right, ${from}, ${to})`,
    overlayBackground: `linear-gradient(to bottom right, ${hexToRgba(from, 0.9)}, ${hexToRgba(to, 0.62)})`,
  };
}

function CredentialModal({
  open,
  mode,
  assistanceName,
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onClose,
  onSubmit,
  onDelete,
  isSubmitting,
  isDeleting,
  locked,
  errorText,
}) {
  if (!open) return null;
  const disableClose = isSubmitting || isDeleting || locked;

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" aria-hidden />
      <div className="fixed left-1/2 top-1/2 z-10 w-[min(100%,32rem)] -translate-x-1/2 -translate-y-1/2 px-4 sm:px-0">
        <div className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_24px_60px_-30px_rgba(var(--system-primary-rgb),0.8)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-ocean-950">
              Credential Management
            </h3>
            <p className="mt-1 text-xs text-ocean-700">
              {mode === "create" ? "Create admin credentials" : "Update admin credentials"} for{" "}
              <span className="font-semibold text-ocean-900">{assistanceName}</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={disableClose}
            className="rounded-lg border border-ocean-200 px-2.5 py-1 text-xs font-semibold text-ocean-700 hover:bg-ocean-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Close
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-ocean-700">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              autoComplete="off"
              required
              className="mt-1.5 w-full rounded-xl border border-ocean-200 bg-white px-3 py-2.5 text-sm text-ocean-950 outline-none transition focus:border-ocean-400 focus:ring-2 focus:ring-ocean-200/70"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-ocean-700">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              autoComplete="new-password"
              required={mode === "create"}
              className="mt-1.5 w-full rounded-xl border border-ocean-200 bg-white px-3 py-2.5 text-sm text-ocean-950 outline-none transition focus:border-ocean-400 focus:ring-2 focus:ring-ocean-200/70"
              placeholder={mode === "create" ? "Minimum 8 characters" : "Leave blank to keep current password"}
            />
            {mode === "edit" ? (
              <p className="mt-1 text-[11px] text-ocean-700">
                Passwords are write-only for security reasons. Enter a new password to replace it.
              </p>
            ) : null}
          </div>

          {errorText ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {errorText}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            {mode === "edit" ? (
              <button
                type="button"
                onClick={onDelete}
                disabled={isSubmitting || isDeleting}
                className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? "Deleting..." : "Delete Admin"}
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={disableClose}
              className="rounded-lg border border-ocean-200 px-3 py-2 text-xs font-semibold text-ocean-700 hover:bg-ocean-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isDeleting}
              className="rounded-lg bg-ocean-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-ocean-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? "Saving..."
                : mode === "create"
                  ? "Create Admin Email"
                  : "Save Credentials"}
            </button>
            </div>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}

function DeleteAdminConfirmModal({
  open,
  adminLabel,
  onClose,
  onProceedToFinal,
  onConfirmDelete,
  onBackToFirstStep,
  isDeleting,
  step,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-slate-950/35" aria-hidden />
      <div className="fixed left-1/2 top-1/2 z-10 w-[min(100%,28rem)] -translate-x-1/2 -translate-y-1/2 px-4 sm:px-0">
        <div className="rounded-2xl border border-rose-200 bg-white p-5 shadow-[0_24px_60px_-30px_rgba(127,29,29,0.45)]">
        <h3 className="text-lg font-semibold tracking-tight text-rose-900">Delete Admin Account</h3>

        {step === 1 ? (
          <>
            <p className="mt-2 text-sm text-rose-800">
              You are about to remove <span className="font-semibold">{adminLabel}</span>.
            </p>
            <p className="mt-2 text-xs text-rose-700">
              This removes the admin from assignment lists and revokes access.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-ocean-200 px-3 py-2 text-xs font-semibold text-ocean-700 hover:bg-ocean-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onProceedToFinal}
                className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
              >
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-rose-800">
              Final confirmation: delete <span className="font-semibold">{adminLabel}</span> permanently?
            </p>
            <p className="mt-2 text-xs text-rose-700">
              This action cannot be undone.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onBackToFirstStep}
                disabled={isDeleting}
                className="rounded-lg border border-ocean-200 px-3 py-2 text-xs font-semibold text-ocean-700 hover:bg-ocean-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Back
              </button>
              <button
                type="button"
                onClick={onConfirmDelete}
                disabled={isDeleting}
                className="rounded-lg border border-rose-500 bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}

function CredentialMutationLoadingModal({ open, message }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-slate-950/65 backdrop-blur-[2px]" aria-hidden />
      <div className="fixed left-1/2 top-1/2 z-10 w-[min(100%,24rem)] -translate-x-1/2 -translate-y-1/2 px-4 sm:px-0">
        <div className="rounded-2xl border border-ocean-200 bg-white p-5 text-center shadow-[0_24px_60px_-30px_rgba(var(--system-primary-rgb),0.8)]">
        <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-ocean-200 border-t-ocean-700" />
        <p className="text-sm font-semibold text-ocean-950">{message}</p>
        <p className="mt-1 text-xs text-ocean-700">Please wait...</p>
        </div>
      </div>
    </div>
  );
}

function AdminChip({ admin, onEdit }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-ocean-100 bg-ocean-50/60 p-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ocean-950">{admin.email ?? admin.user_id ?? ""}</p>
      </div>
      <button
        type="button"
        onClick={() => onEdit(admin)}
        aria-label={`Edit credentials for ${admin.email ?? "admin"}`}
        title="Edit credentials"
        className="shrink-0 inline-flex items-center justify-center rounded-lg border border-ocean-200 bg-white p-1.5 text-ocean-700 hover:bg-ocean-50"
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path
            d="M14.1667 2.5C14.3877 2.27902 14.6874 2.15491 15 2.15491C15.3126 2.15491 15.6123 2.27902 15.8333 2.5L17.5 4.16667C17.721 4.38768 17.8451 4.68744 17.8451 5C17.8451 5.31256 17.721 5.61232 17.5 5.83333L7.5 15.8333L3.33334 16.6667L4.16667 12.5L14.1667 2.5Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

function AssistanceAdminCard({ assistance, admins, onEditAdmin, onAddAdmin }) {
  const services = assistance.assistance_services ?? [];
  const banner = services.find((s) => s.mobile_image_url)?.mobile_image_url || "";
  const headerTheme = resolveAssistanceHeaderTheme(assistance.slug, assistance.theme_json);

  return (
    <article className="overflow-hidden rounded-2xl border border-ocean-200 bg-white shadow-[0_14px_34px_-26px_rgba(var(--system-primary-rgb),0.7)]">
      <div
        className="relative min-h-28"
        style={!banner ? { background: headerTheme.solidBackground } : undefined}
      >
        {banner ? (
          <>
            <img src={banner} alt="" className="absolute inset-0 size-full object-cover opacity-45" />
            <div className="absolute inset-0" style={{ background: headerTheme.overlayBackground }} />
          </>
        ) : null}
        <div
          className={`relative flex min-h-28 items-start justify-between gap-3 p-4 ${
            headerTheme.light ? "text-slate-950" : "text-white"
          }`}
        >
          <div>
            <h3 className="text-xl font-semibold tracking-tight">{assistance.assistance_name ?? ""}</h3>
            {assistance.description ? (
              <p
                className={`mt-1 line-clamp-2 text-xs font-medium ${
                  headerTheme.light ? "text-slate-800/75" : "text-white/75"
                }`}
              >
                {assistance.description}
              </p>
            ) : null}
            <p
              className={`mt-1 text-xs font-medium ${
                headerTheme.light ? "text-slate-800/75" : "text-white/75"
              }`}
            >
              {services.length} service{services.length === 1 ? "" : "s"} ·{" "}
              {admins.length} admin{admins.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-4 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ocean-700">Services</p>
          <div className="mt-2 space-y-2">
            {services.length ? (
              services.map((service) => (
              <div
                  key={service.id}
                className="flex items-center gap-3 rounded-xl border border-ocean-100 bg-ocean-50/60 p-2.5"
              >
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ocean-200 bg-white p-1">
                    {service.mobile_image_url ? (
                      <img src={service.mobile_image_url} alt="" className="size-full object-contain" />
                    ) : null}
                </div>
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ocean-950">{service.display_name ?? ""}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ocean-700">
                      {stripRichText(service.description_html)}
                  </p>
                  </div>
                </div>
              ))
            ) : null}
                </div>
              </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ocean-700">Admins</p>
          <div className="mt-2 space-y-2">
            {admins.length
              ? admins.map((admin) => (
                  <AdminChip
                    key={admin.user_id}
                    admin={admin}
                    onEdit={onEditAdmin}
                  />
                ))
              : (
                  <p className="rounded-xl border border-dashed border-ocean-200 bg-ocean-50/50 p-3 text-xs text-ocean-700">
                    No admins assigned to this assistance yet.
                  </p>
                )}
            <button
              type="button"
              onClick={onAddAdmin}
              className="mt-2 flex w-full items-center justify-center rounded-xl border border-dashed border-ocean-300 bg-white px-3 py-2.5 text-xs font-semibold text-ocean-700 hover:border-ocean-400 hover:bg-ocean-50"
            >
              + Add admin email
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function Admins() {
  const [assistances, setAssistances] = useState([]);
  const [adminsByCategory, setAdminsByCategory] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isCredentialModalOpen, setIsCredentialModalOpen] = useState(false);
  const [credentialMode, setCredentialMode] = useState("create");
  const [selectedAssistance, setSelectedAssistance] = useState(null);
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [credentialEmail, setCredentialEmail] = useState("");
  const [credentialPassword, setCredentialPassword] = useState("");
  const [credentialError, setCredentialError] = useState("");
  const [isSubmittingCredential, setIsSubmittingCredential] = useState(false);
  const [isDeletingCredential, setIsDeletingCredential] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState(1);
  const isCredentialMutationInFlight = isSubmittingCredential || isDeletingCredential;

  const loadData = useCallback(
    async ({ forceRefresh = false, showLoading = true } = {}) => {
      if (showLoading) {
        setIsLoading(true);
      }
      setLoadError("");

      try {
        const [categories, adminRows] = await Promise.all([
          getSessionCachedQuery(
            "admin-assignment:catalog",
            () =>
              fetchStitchedAssistanceCatalog({
                includeInactiveCategories: false,
                filterActiveServices: true,
                categoriesSelect: CATALOG_SELECT.categoriesFull,
                servicesSelect: CATALOG_SELECT.servicesList,
                requirementsSelect: null,
              }),
            { ttlMs: 120_000, forceRefresh }
          ),
          getSessionCachedQuery(
            "admin-assignment:admins",
            async () => {
              const { data, error } = await supabase.rpc("superadmin_list_admins");
              if (error) throw error;
              return data ?? [];
            },
            { ttlMs: 60_000, forceRefresh }
          ),
        ]);

        const grouped = {};
        for (const admin of adminRows) {
          if (admin.is_super_admin || !admin.category_id) continue;
          if (!grouped[admin.category_id]) grouped[admin.category_id] = [];
          grouped[admin.category_id].push(admin);
        }

        setAssistances(sortCatalogRows(categories));
        setAdminsByCategory(grouped);
      } catch (err) {
        console.error("[Admins] assignment load failed", err);
        setLoadError(err?.message || "Failed to load admin assignments.");
        setAssistances([]);
        setAdminsByCategory({});
      } finally {
        if (showLoading) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const anyModalOpen =
      isCredentialModalOpen || isDeleteConfirmOpen || isCredentialMutationInFlight;
    if (!anyModalOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isCredentialModalOpen, isDeleteConfirmOpen, isCredentialMutationInFlight]);

  const totalAdmins = useMemo(
    () => Object.values(adminsByCategory).reduce((sum, list) => sum + list.length, 0),
    [adminsByCategory]
  );

  const closeCredentialModal = ({ force = false } = {}) => {
    if (!force && (isSubmittingCredential || isDeletingCredential || isDeleteConfirmOpen)) return;
    setIsCredentialModalOpen(false);
    setCredentialError("");
    setCredentialPassword("");
    setSelectedAdmin(null);
    setSelectedAssistance(null);
    setIsDeleteConfirmOpen(false);
    setDeleteConfirmStep(1);
  };

  const openCreateModal = (assistance) => {
    setCredentialMode("create");
    setSelectedAssistance(assistance);
    setSelectedAdmin(null);
    setCredentialEmail("");
    setCredentialPassword("");
    setCredentialError("");
    setIsCredentialModalOpen(true);
  };

  const openEditModal = (assistance, admin) => {
    setCredentialMode("edit");
    setSelectedAssistance(assistance);
    setSelectedAdmin(admin);
    setCredentialEmail(admin?.email ?? "");
    setCredentialPassword("");
    setCredentialError("");
    setIsCredentialModalOpen(true);
  };

  const handleCredentialSubmit = async (event) => {
    event.preventDefault();
    setCredentialError("");

    const email = String(credentialEmail || "").trim().toLowerCase();
    const password = String(credentialPassword || "").trim();

    if (!email) {
      setCredentialError("Email is required.");
      return;
    }
    if (credentialMode === "create" && password.length < 8) {
      setCredentialError("Password must be at least 8 characters.");
      return;
    }

    if (credentialMode === "edit" && !selectedAdmin?.user_id) {
      setCredentialError("Selected admin is invalid.");
      return;
    }
    if (credentialMode === "create" && !selectedAssistance?.id) {
      setCredentialError("Selected assistance is invalid.");
      return;
    }

    setIsSubmittingCredential(true);
    try {
      const body =
        credentialMode === "create"
          ? {
              action: "create",
              category_id: selectedAssistance.id,
              email,
              password,
            }
          : {
              action: "update",
              user_id: selectedAdmin.user_id,
              email,
              ...(password ? { password } : {}),
            };

      const { data, error } = await supabase.functions.invoke(
        "super-admin-admin-credential-management",
        { body }
      );

      if (error) {
        throw new Error(error.message || "Failed to save credentials.");
      }
      if (data?.error) {
        throw new Error(data.error);
      }

      invalidateSessionCache("admin-assignment:admins");
      await loadData({ forceRefresh: true, showLoading: false });
      closeCredentialModal({ force: true });
    } catch (err) {
      setCredentialError(err?.message || "Failed to save credentials.");
    } finally {
      setIsSubmittingCredential(false);
    }
  };

  const handleDeleteCredential = async () => {
    if (credentialMode !== "edit" || !selectedAdmin?.user_id) {
      return;
    }

    setCredentialError("");
    setIsDeletingCredential(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "super-admin-admin-credential-management",
        {
          body: {
            action: "delete",
            user_id: selectedAdmin.user_id,
          },
        }
      );
      if (error) {
        throw new Error(error.message || "Failed to delete admin.");
      }
      if (data?.error) {
        throw new Error(data.error);
      }

      invalidateSessionCache("admin-assignment:admins");
      await loadData({ forceRefresh: true, showLoading: false });
      setIsDeleteConfirmOpen(false);
      setDeleteConfirmStep(1);
      closeCredentialModal({ force: true });
    } catch (err) {
      setCredentialError(err?.message || "Failed to delete admin.");
    } finally {
      setIsDeletingCredential(false);
    }
  };

  const openDeleteConfirm = () => {
    if (credentialMode !== "edit" || !selectedAdmin?.user_id) return;
    setDeleteConfirmStep(1);
    setIsDeleteConfirmOpen(true);
  };

  const closeDeleteConfirm = () => {
    if (isDeletingCredential) return;
    setIsDeleteConfirmOpen(false);
    setDeleteConfirmStep(1);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(var(--system-primary-rgb),0.7)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-700">Admins</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-ocean-950">
              Assistance Admin Assignment
            </h2>
            <p className="mt-1 text-sm text-ocean-700">
              Active assistance categories and the admins assigned to each.
            </p>
          </div>
          {!isLoading && !loadError ? (
            <span className="rounded-full bg-ocean-50 px-3 py-1 text-xs font-semibold text-ocean-700">
              {assistances.length} assistance{assistances.length === 1 ? "" : "s"} · {totalAdmins} admin
              {totalAdmins === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        {isLoading ? (
          <p className="mt-4 text-xs font-medium text-ocean-700">Loading assignments…</p>
        ) : null}
        {loadError ? (
          <p className="mt-4 text-xs font-medium text-rose-600">{loadError}</p>
        ) : null}

        {!isLoading && !loadError ? (
          assistances.length ? (
            <div className="mt-5 grid gap-4">
              {assistances.map((assistance) => (
                <AssistanceAdminCard
                  key={assistance.id}
                  assistance={assistance}
                  admins={adminsByCategory[assistance.id] ?? []}
                  onEditAdmin={(admin) => openEditModal(assistance, admin)}
                  onAddAdmin={() => openCreateModal(assistance)}
                />
              ))}
            </div>
          ) : null
        ) : null}
      </section>

      <CredentialModal
        open={isCredentialModalOpen}
        mode={credentialMode}
        assistanceName={selectedAssistance?.assistance_name ?? ""}
        email={credentialEmail}
        password={credentialPassword}
        onEmailChange={setCredentialEmail}
        onPasswordChange={setCredentialPassword}
        onClose={closeCredentialModal}
        onSubmit={handleCredentialSubmit}
        onDelete={openDeleteConfirm}
        isSubmitting={isSubmittingCredential}
        isDeleting={isDeletingCredential}
        locked={isDeleteConfirmOpen}
        errorText={credentialError}
      />

      <DeleteAdminConfirmModal
        open={isDeleteConfirmOpen}
        adminLabel={selectedAdmin?.email || selectedAdmin?.user_id || "this admin"}
        onClose={closeDeleteConfirm}
        onProceedToFinal={() => setDeleteConfirmStep(2)}
        onBackToFirstStep={() => setDeleteConfirmStep(1)}
        onConfirmDelete={handleDeleteCredential}
        isDeleting={isDeletingCredential}
        step={deleteConfirmStep}
      />

      <CredentialMutationLoadingModal
        open={isCredentialMutationInFlight}
        message={
          isDeletingCredential
            ? "Deleting admin account..."
            : credentialMode === "create"
              ? "Creating admin account..."
              : "Applying credential changes..."
        }
      />
    </div>
  );
}
