import MedicalAbstract from "../assets/MedicalAbstract.png";
import PartialHospitalBill from "../assets/PartialHospitalBill.png";
import PersonalLetter from "../assets/PersonalLetter.png";
import PatientsVotersCert from "../assets/PatientsVotersCert.png";
import BarangayEndorsement from "../assets/BarangayEndorsement.png";
import CertificateofIndigency from "../assets/CertificateofIndigency.png";
import BirthCert from "../assets/BirthCert.png";

const documentTemplates = [
  { name: "Medical Abstract", image: MedicalAbstract },
  { name: "Partial Hospital Bill", image: PartialHospitalBill },
  { name: "Personal Letter", image: PersonalLetter },
  { name: "Patient's Voters ID / Certificate", image: PatientsVotersCert },
  { name: "Barangay Endorsement", image: BarangayEndorsement },
  { name: "Certificate of Indigency", image: CertificateofIndigency },
  { name: "Birth Certificate", image: BirthCert },
];

export const createDefaultDocuments = () =>
  documentTemplates.map((doc) => ({
    ...doc,
    result: "Verified",
    reason: "",
  }));

/** Display label for burial assistance category tabs (matches Overview). */
export const getCategoryLabel = (category) => {
  if (category === "Medical Operations") return "Columbarium Allocation";
  if (category === "Treatment & Procedures") return "Cremation Assistance";
  return "Burial Site Assistance";
};

function ageFromBirthday(birthdayStr) {
  const t = Date.parse(birthdayStr);
  if (Number.isNaN(t)) return null;
  const bd = new Date(t);
  const ref = new Date(2026, 4, 1);
  let age = ref.getFullYear() - bd.getFullYear();
  const m = ref.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < bd.getDate())) age--;
  return age;
}

function controlNumberFromId(id) {
  return `CN-${id.replace(/\s+/g, "")}`;
}

const rawApplications = [
  {
    id: "BACA - 2026 - 001",
    name: "Gojo Sensei",
    category: "Treatment & Procedures",
    date: "Feb 1, 2026",
    status: "In Progress",
    interviewDate: null,
    birthday: "December 7, 1989",
    sex: "Male",
    address: "Zone 4, Paliparan 3, Dasmariñas Cavite",
    contactNo: "0917 111 2233",
    email: "gojosensei@gmail.com",
    documents: createDefaultDocuments(),
  },
  {
    id: "BACA - 2026 - 002",
    name: "Amria Clara",
    category: "Hospital Expense",
    date: "Feb 3, 2026",
    status: "In Progress",
    interviewDate: null,
    birthday: "April 2, 1995",
    sex: "Female",
    address: "Salitran 2, Dasmariñas Cavite",
    contactNo: "0927 444 8899",
    email: "amriaclara@gmail.com",
    documents: createDefaultDocuments(),
  },
  {
    id: "BACA - 2026 - 003",
    name: "Zayn Malik",
    category: "Medical Operations",
    date: "Feb 5, 2026",
    status: "In Progress",
    interviewDate: null,
    birthday: "January 12, 1993",
    sex: "Male",
    address: "Burol Main, Dasmariñas Cavite",
    contactNo: "0918 556 7788",
    email: "zaynmalik@gmail.com",
    documents: createDefaultDocuments(),
  },
  {
    id: "BACA - 2026 - 004",
    name: "Jose Cruz",
    category: "Hospital Expense",
    date: "Feb 6, 2026",
    status: "Pending",
    interviewDate: null,
    birthday: "July 25, 1990",
    sex: "Male",
    address: "Langkaan 1, Dasmariñas Cavite",
    contactNo: "09122 334 555",
    email: "Josecruz@gmail.com",
    documents: createDefaultDocuments(),
  },
  {
    id: "BACA - 2026 - 005",
    name: "Yuji Itadori",
    category: "Medical Operations",
    date: "Feb 7, 2026",
    status: "Pending",
    interviewDate: null,
    birthday: "March 20, 2002",
    sex: "Male",
    address: "Sabang, Dasmariñas Cavite",
    contactNo: "0939 001 0203",
    email: "yujiitadori@gmail.com",
    documents: createDefaultDocuments(),
  },
  {
    id: "BACA - 2026 - 006",
    name: "Judai Gonzales",
    category: "Treatment & Procedures",
    date: "Feb 7, 2026",
    status: "Pending",
    interviewDate: null,
    birthday: "August 15, 1988",
    sex: "Female",
    address: "Malagasang 1-G, Dasmariñas Cavite",
    contactNo: "0915 778 9900",
    email: "judaigonzales@gmail.com",
    documents: createDefaultDocuments(),
  },
  {
    id: "BACA - 2026 - 007",
    name: "Lesley Gomez",
    category: "Hospital Expense",
    date: "Feb 8, 2026",
    status: "Action Required",
    interviewDate: null,
    birthday: "November 3, 1991",
    sex: "Female",
    address: "San Antonio, Dasmariñas Cavite",
    contactNo: "0921 334 5566",
    email: "lesleygomez@gmail.com",
    documents: createDefaultDocuments(),
  },
  {
    id: "BACA - 2026 - 008",
    name: "Maine China",
    category: "Medical Operations",
    date: "Feb 8, 2026",
    status: "Resubmission",
    interviewDate: null,
    birthday: "June 30, 1997",
    sex: "Female",
    address: "Burol 2, Dasmariñas Cavite",
    contactNo: "0919 887 6655",
    email: "mainechina@gmail.com",
    documents: createDefaultDocuments(),
  },
  {
    id: "BACA - 2026 - 009",
    name: "Valentina Ortiz",
    category: "Hospital Expense",
    date: "Jan 25, 2026",
    status: "Approved for Disbursement",
    interviewDate: "2026-01-20",
    birthday: "February 14, 1986",
    sex: "Female",
    address: "Paliparan 1, Dasmariñas Cavite",
    contactNo: "0928 112 3344",
    email: "valentinaortiz@gmail.com",
    documents: createDefaultDocuments(),
    caseStudyInterviewEnd: "2026-01-20T17:00:00",
    disbursementAmount: "18500",
    dateClaimed: "January 28, 2026",
    approvedForDisbursementAt: "2026-01-26T10:00:00.000Z",
  },
];

export const initialApplications = rawApplications.map((app) => ({
  ...app,
  age: ageFromBirthday(app.birthday),
  controlNumber: controlNumberFromId(app.id),
  appliedBenefits: app.category,
  caseStudyInterviewEnd: app.caseStudyInterviewEnd ?? null,
  disbursementAmount: app.disbursementAmount ?? null,
  dateClaimed: app.dateClaimed ?? null,
  approvedForDisbursementAt: app.approvedForDisbursementAt ?? null,
}));
