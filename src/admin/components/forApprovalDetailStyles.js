/** Shared presentation tokens for For Approval detail UIs (kept out of component modules for fast refresh). */

export const detailFont = { fontFamily: "'Instrument Sans', sans-serif" };

export const detailActionButtonCompactClass =
  "inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-xs font-semibold shadow-md transition-all hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none";

export const detailPrimaryButtonCompactClass =
  `${detailActionButtonCompactClass} bg-gradient-to-r from-[color:var(--apoyo-primary)] to-[color:var(--apoyo-secondary)] text-white hover:brightness-[1.03]`;

export const detailDeclineButtonCompactClass =
  `${detailActionButtonCompactClass} border border-[#F8D0D0] bg-[#F8D0D0] text-[#7A2E2E] hover:bg-[#F3C0C0]`;

export const detailInputClass =
  "w-full max-w-xs rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm outline-none transition-all placeholder:text-gray-400 focus:border-[color:var(--apoyo-secondary)] focus:ring-2 focus:ring-[color:var(--apoyo-ring)]/25";
