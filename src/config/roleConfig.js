/**
 * Admin roles and per-role request tables.
 * Keep `REQUEST_SOURCES` table lists in sync with
 * `supabase/functions/admin-dashboard-analytics/index.ts` → `TABLES_BY_ROLE`
 * so dashboard analytics match what each role can access in the app.
 */
export const ADMIN_ROLES = {
  medical_admin: "medical_admin",
  financial_admin: "financial_admin",
  burial_admin: "burial_admin",
};

const REQUEST_SOURCES = {
  [ADMIN_ROLES.medical_admin]: [
    { table: "hospitalization_requests", category: "Hospital Expense" },
    { table: "treatment_requests", category: "Treatment & Procedures" },
    { table: "medical_requests", category: "Medical Operations" },
  ],
  [ADMIN_ROLES.financial_admin]: [
    { table: "financial_requests", category: "Financial Requests" },
    { table: "monetary_requests", category: "Monetary Requests" },
  ],
  [ADMIN_ROLES.burial_admin]: [
    { table: "burial_requests", category: "Burial Assistance" },
    { table: "cremation_requests", category: "Cremation Assistance" },
    { table: "columbarium_requests", category: "Columbarium Assistance" },
  ],
};

export const FIELD_LABELS_BY_SOURCE_TABLE = {
  hospitalization_requests: {
    letter_file: "Letter of Request to the Mayor",
    voter_id_file: "Patient's Voter's ID / Certificate",
    barangay_endorsement_file: "Barangay Endorsement",
    indigency_cert_file: "Certificate of Indigency",
    birth_cert_file: "Valid ID / Birth Certificate",
    abstract_file: "Clinical / Medical Abstract",
    bill_file: "Partial Hospital Bill",
    attachment_file: "Attachments (Optional)",
  },
  treatment_requests: {
    med_cert_file: "Medical Certificate",
    rx_file: "Doctor's Prescription",
    lab_file: "Laboratory Request",
    letter_file: "Letter of Request to the Mayor",
    voter_id_file: "Patient's Voter's ID / Certificate",
    birth_cert_file: "Valid ID / Birth Certificate",
    barangay_endorsement_file: "Barangay Endorsement",
    indigency_cert_file: "Certificate of Indigency",
    attachment_file: "Attachments (Optional)",
  },
  medical_requests: {
    med_cert_file: "Medical Certificate",
    prescription_file: "Doctor's Prescription",
    quotation_file: "Submit Quotation of Expense",
    letter_file: "Letter of Request to the Mayor",
    voter_id_file: "Voter's ID / Certificate",
    birth_cert_file: "Valid ID / Birth Certificate",
    barangay_endorsement_file: "Barangay Endorsement",
    indigency_cert_file: "Certificate of Indigency",
    attachment_file: "Attachments (Optional)",
  },
  financial_requests: {
    letter_file: "Letter of Request to the Mayor",
    voter_id_file: "Applicant's Voter's ID / Certificate",
    barangay_endorsement_file: "Barangay Endorsement",
    indigency_cert_file: "Certificate of Indigency",
    birth_cert_file: "Valid ID / Birth Certificate",
    billing_file: "Statement of Account / Billing",
    proof_of_income_file: "Proof of Income",
    attachment_file: "Attachments (Optional)",
  },
  monetary_requests: {
    letter_file: "Letter of Request to the Mayor",
    voter_id_file: "Applicant's Voter's ID / Certificate",
    barangay_endorsement_file: "Barangay Endorsement",
    indigency_cert_file: "Certificate of Indigency",
    birth_cert_file: "Valid ID / Birth Certificate",
    quotation_file: "Quotation / Cost Breakdown",
    attachment_file: "Attachments (Optional)",
  },
  burial_requests: {
    letter_file: "Letter of Request to the Mayor",
    voter_id_file: "Applicant's Voter's ID / Certificate",
    barangay_endorsement_file: "Barangay Endorsement",
    indigency_cert_file: "Certificate of Indigency",
    death_cert_file: "Death Certificate",
    funeral_contract_file: "Funeral Contract / Billing",
    attachment_file: "Attachments (Optional)",
  },
  cremation_requests: {
    letter_file: "Letter of Request to the Mayor",
    voter_id_file: "Applicant's Voter's ID / Certificate",
    barangay_endorsement_file: "Barangay Endorsement",
    indigency_cert_file: "Certificate of Indigency",
    death_cert_file: "Death Certificate",
    cremation_quote_file: "Cremation Quotation",
    attachment_file: "Attachments (Optional)",
  },
  columbarium_requests: {
    letter_file: "Letter of Request to the Mayor",
    voter_id_file: "Applicant's Voter's ID / Certificate",
    barangay_endorsement_file: "Barangay Endorsement",
    indigency_cert_file: "Certificate of Indigency",
    death_cert_file: "Death Certificate",
    columbarium_contract_file: "Columbarium Contract / Quotation",
    attachment_file: "Attachments (Optional)",
  },
};

export const FIELD_ORDER_BY_SOURCE_TABLE = {
  hospitalization_requests: [
    "letter_file",
    "voter_id_file",
    "barangay_endorsement_file",
    "indigency_cert_file",
    "birth_cert_file",
    "abstract_file",
    "bill_file",
    "attachment_file",
  ],
  treatment_requests: [
    "med_cert_file",
    "rx_file",
    "lab_file",
    "letter_file",
    "voter_id_file",
    "birth_cert_file",
    "barangay_endorsement_file",
    "indigency_cert_file",
    "attachment_file",
  ],
  medical_requests: [
    "med_cert_file",
    "prescription_file",
    "quotation_file",
    "letter_file",
    "voter_id_file",
    "birth_cert_file",
    "barangay_endorsement_file",
    "indigency_cert_file",
    "attachment_file",
  ],
  financial_requests: [
    "letter_file",
    "voter_id_file",
    "barangay_endorsement_file",
    "indigency_cert_file",
    "birth_cert_file",
    "billing_file",
    "proof_of_income_file",
    "attachment_file",
  ],
  monetary_requests: [
    "letter_file",
    "voter_id_file",
    "barangay_endorsement_file",
    "indigency_cert_file",
    "birth_cert_file",
    "quotation_file",
    "attachment_file",
  ],
  burial_requests: [
    "letter_file",
    "voter_id_file",
    "barangay_endorsement_file",
    "indigency_cert_file",
    "death_cert_file",
    "funeral_contract_file",
    "attachment_file",
  ],
  cremation_requests: [
    "letter_file",
    "voter_id_file",
    "barangay_endorsement_file",
    "indigency_cert_file",
    "death_cert_file",
    "cremation_quote_file",
    "attachment_file",
  ],
  columbarium_requests: [
    "letter_file",
    "voter_id_file",
    "barangay_endorsement_file",
    "indigency_cert_file",
    "death_cert_file",
    "columbarium_contract_file",
    "attachment_file",
  ],
};

export const ROLE_CONFIG = {
  [ADMIN_ROLES.medical_admin]: {
    role: ADMIN_ROLES.medical_admin,
    title: "Medical Admin",
    sessionLabel: "Medical",
    requestSources: REQUEST_SOURCES[ADMIN_ROLES.medical_admin],
    tables: REQUEST_SOURCES[ADMIN_ROLES.medical_admin].map((item) => item.table),
    dashboardTitle: "Medical Assistance Command Center",
    dashboardSubtitle: "Welcome to the Medical Assistance Command Center.",
    theme: {
      primary: "#008B88",
      secondary: "#06C1EC",
      tertiary: "#33BFB8",
      accent: "#87CE60",
      ring: "#14B8A6",
    },
  },
  [ADMIN_ROLES.financial_admin]: {
    role: ADMIN_ROLES.financial_admin,
    title: "Financial Admin",
    sessionLabel: "Financial",
    requestSources: REQUEST_SOURCES[ADMIN_ROLES.financial_admin],
    tables: REQUEST_SOURCES[ADMIN_ROLES.financial_admin].map((item) => item.table),
    dashboardTitle: "Financial Assistance Command Center",
    dashboardSubtitle: "Welcome to the Financial Assistance Command Center.",
    theme: {
      primary: "#A16207",
      secondary: "#F59E0B",
      tertiary: "#FBBF24",
      accent: "#FDE68A",
      ring: "#D97706",
    },
  },
  [ADMIN_ROLES.burial_admin]: {
    role: ADMIN_ROLES.burial_admin,
    title: "Burial Admin",
    sessionLabel: "Burial",
    requestSources: REQUEST_SOURCES[ADMIN_ROLES.burial_admin],
    tables: REQUEST_SOURCES[ADMIN_ROLES.burial_admin].map((item) => item.table),
    dashboardTitle: "Burial Assistance Command Center",
    dashboardSubtitle: "Welcome to the Burial Assistance Command Center.",
    theme: {
      primary: "#6D28D9",
      secondary: "#8B5CF6",
      tertiary: "#A78BFA",
      accent: "#DDD6FE",
      ring: "#7C3AED",
    },
  },
};

const SERVICE_TYPE_TO_ROLE = {
  medical: ADMIN_ROLES.medical_admin,
  financial: ADMIN_ROLES.financial_admin,
  burial: ADMIN_ROLES.burial_admin,
};

function normalizeRawRole(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function resolveAdminRole(adminProfile) {
  if (!adminProfile) {
    return null;
  }

  const explicitRole = normalizeRawRole(adminProfile.role);
  if (ROLE_CONFIG[explicitRole]) {
    return explicitRole;
  }

  const serviceType = normalizeRawRole(adminProfile.service_type);
  if (SERVICE_TYPE_TO_ROLE[serviceType]) {
    return SERVICE_TYPE_TO_ROLE[serviceType];
  }

  return null;
}

export function getRoleConfig(role) {
  return ROLE_CONFIG[role] || ROLE_CONFIG[ADMIN_ROLES.medical_admin];
}

export function isSupportedAdminRole(role) {
  return Boolean(role) && Boolean(ROLE_CONFIG[role]);
}
