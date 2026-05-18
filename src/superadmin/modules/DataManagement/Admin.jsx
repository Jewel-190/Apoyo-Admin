import { useMemo, useState } from "react";

const existingAssistanceIds = new Set(["medical", "financial", "burial"]);
const adminOptions = ["Admin1", "Admin2", "Admin3"];

const defaultSelectedAdmins = {
  medical: "Admin1",
  financial: "Admin2",
  burial: "Admin3",
};

const stripRichText = (text = "") => {
  if (!text) return "";
  if (typeof document === "undefined") return text.replace(/<[^>]*>/g, "");
  const div = document.createElement("div");
  div.innerHTML = text;
  return div.textContent || div.innerText || "";
};

function AssistanceAdminCard({ assistance, status, selectedAdmin, onSelectAdmin }) {
  const image = assistance.services?.[0]?.image || "";
  const services = assistance.services ?? [];

  return (
    <article className="overflow-hidden rounded-2xl border border-ocean-200 bg-white shadow-[0_14px_34px_-26px_rgba(10,70,111,0.7)]">
      <div className="relative min-h-32 bg-ocean-900">
        {image ? <img src={image} alt="" className="absolute inset-0 size-full object-cover opacity-45" /> : null}
        <div className="absolute inset-0 bg-gradient-to-br from-ocean-950/90 via-ocean-900/65 to-teal-700/50" />
        <div className="relative flex min-h-32 items-start justify-between gap-3 p-4 text-white">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75">{status}</p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight">{assistance.label}</h3>
            <p className="mt-1 text-xs font-medium text-white/75">
              {services.length} service{services.length === 1 ? "" : "s"} available
            </p>
          </div>
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-white/20">
            {selectedAdmin || "Unassigned"}
          </span>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <label className="block space-y-1.5 text-xs font-semibold text-ocean-800">
          Choose admin
          <select
            value={selectedAdmin}
            onChange={(event) => onSelectAdmin(event.target.value)}
            className="h-11 w-full rounded-xl border border-ocean-200 bg-ocean-50/60 px-3 text-sm font-semibold text-ocean-900 outline-none focus:border-ocean-400"
          >
            <option value="">Select admin</option>
            {adminOptions.map((admin) => (
              <option key={admin} value={admin}>
                {admin}
              </option>
            ))}
          </select>
        </label>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ocean-600">Services</p>
          <div className="mt-2 space-y-2">
            {services.map((service, index) => (
              <div
                key={`${service.name}-${index}`}
                className="flex items-center gap-3 rounded-xl border border-ocean-100 bg-ocean-50/60 p-2.5"
              >
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ocean-200 bg-white p-1">
                  {service.image ? <img src={service.image} alt="" className="size-full object-contain" /> : null}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ocean-950">{service.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ocean-700">
                    {stripRichText(service.description)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

export function Admin() {
  const assistanceSections = useMemo(
    () => [
      {
        id: "medical",
        label: "Medical",
        services: [{ name: "Hospitalization Expense", description: "Urgent medical aid for confinement.", image: "" }],
      },
      {
        id: "financial",
        label: "Financial",
        services: [{ name: "Emergency Financial Relief", description: "Immediate aid for urgent hardship cases.", image: "" }],
      },
      {
        id: "burial",
        label: "Burial",
        services: [{ name: "Burial Assistance", description: "Aid for burial expenses and funeral service support.", image: "" }],
      },
    ],
    [],
  );

  const [username, setUsername] = useState("superadmin");
  const [email, setEmail] = useState("admin@apoyo.gov.ph");
  const [password, setPassword] = useState("********");
  const [selectedAdmins, setSelectedAdmins] = useState(defaultSelectedAdmins);

  const existingAssistances = useMemo(
    () => assistanceSections.filter((assistance) => existingAssistanceIds.has(assistance.id)),
    [assistanceSections],
  );
  const newAssistances = useMemo(
    () => assistanceSections.filter((assistance) => !existingAssistanceIds.has(assistance.id)),
    [assistanceSections],
  );

  const selectAdmin = (id, admin) => {
    setSelectedAdmins((prev) => ({ ...prev, [id]: admin }));
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(10,70,111,0.7)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-600">Admin</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-ocean-950">Assistance Admin Assignment</h2>
          <p className="mt-1 text-sm text-ocean-700">Choose which admin handles each assistance category.</p>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-ocean-950">Available assistance</h3>
              <span className="rounded-full bg-ocean-50 px-2.5 py-1 text-xs font-semibold text-ocean-700">
                {existingAssistances.length}
              </span>
            </div>
            <div className="mt-3 grid gap-4">
              {existingAssistances.map((assistance) => (
                <AssistanceAdminCard
                  key={assistance.id}
                  assistance={assistance}
                  status="Existing assistance"
                  selectedAdmin={selectedAdmins[assistance.id] ?? ""}
                  onSelectAdmin={(admin) => selectAdmin(assistance.id, admin)}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-ocean-950">Newly created assistance</h3>
              <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                {newAssistances.length}
              </span>
            </div>
            <div className="mt-3 grid gap-4">
              {newAssistances.length ? (
                newAssistances.map((assistance) => (
                  <AssistanceAdminCard
                    key={assistance.id}
                    assistance={assistance}
                    status="Created in mobile content"
                    selectedAdmin={selectedAdmins[assistance.id] ?? ""}
                    onSelectAdmin={(admin) => selectAdmin(assistance.id, admin)}
                  />
                ))
              ) : (
                <div className="grid min-h-80 place-items-center rounded-2xl border border-dashed border-ocean-300 bg-ocean-50/60 p-6 text-center">
                  <div>
                    <p className="text-sm font-semibold text-ocean-900">No new assistance yet</p>
                    <p className="mt-1 max-w-sm text-xs leading-relaxed text-ocean-600">
                      Assistance categories created under Content management, Mobile will appear here for admin assignment.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(10,70,111,0.7)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-600">Admin</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-ocean-950">Admin Credentials</h2>
            <p className="mt-1 text-sm text-ocean-700">Edit the primary admin login credentials.</p>
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-lg border border-ocean-200 bg-ocean-50 px-3 text-xs font-semibold text-ocean-700 transition hover:border-ocean-300 hover:bg-ocean-100"
          >
            Save Changes
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:max-w-xl">
          <label className="space-y-1.5 text-sm font-semibold text-ocean-900">
            Username
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter admin username"
              className="h-11 w-full rounded-xl border border-ocean-200 bg-ocean-50/60 px-3 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/80 focus:border-ocean-400"
            />
          </label>

          <label className="space-y-1.5 text-sm font-semibold text-ocean-900">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter admin email"
              className="h-11 w-full rounded-xl border border-ocean-200 bg-ocean-50/60 px-3 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/80 focus:border-ocean-400"
            />
          </label>

          <label className="space-y-1.5 text-sm font-semibold text-ocean-900">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter admin password"
              className="h-11 w-full rounded-xl border border-ocean-200 bg-ocean-50/60 px-3 text-sm font-medium text-ocean-900 outline-none placeholder:text-ocean-500/80 focus:border-ocean-400"
            />
          </label>
        </div>
      </section>
    </div>
  );
}

