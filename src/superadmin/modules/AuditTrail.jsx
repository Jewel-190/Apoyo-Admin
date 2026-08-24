export function AuditTrail() {
  return (
    <section className="rounded-2xl border border-ocean-200 bg-white p-6 shadow-[0_12px_30px_-24px_rgba(var(--system-primary-rgb),0.7)]">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-700">Audit trail</p>
      <h2 className="mt-1 text-2xl font-semibold text-ocean-950">Audit trail</h2>
      <p className="mt-2 text-sm text-ocean-700">
        Audit trail records will appear here once logging views are connected.
      </p>

      <div className="mt-6 rounded-xl border border-dashed border-ocean-200 bg-ocean-50/70 px-6 py-10 text-center">
        <p className="text-sm font-semibold text-ocean-900">No audit events yet</p>
        <p className="mt-1 text-xs text-ocean-700">
          When enabled, you’ll see login events, admin actions, exports, and configuration changes here.
        </p>
      </div>
    </section>
  );
}

