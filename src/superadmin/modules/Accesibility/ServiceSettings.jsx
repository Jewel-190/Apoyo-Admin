import { useEffect, useMemo, useRef, useState } from "react";

const SECTIONS = [
  {
    id: "service-pipeline",
    title: "Service Pipeline",
  },
];

function SectionCard({ id, title, description, children }) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(10,70,111,0.55)]"
    >
      <div className="border-b border-ocean-100 pb-3">
        <h2 className="text-lg font-semibold tracking-tight text-ocean-950">{title}</h2>
        {description ? <p className="mt-1 text-sm text-ocean-600">{description}</p> : null}
      </div>
      <div className="mt-4 min-h-[70vh] space-y-4">{children}</div>
    </section>
  );
}

export function ServiceSettings() {
  const contentRef = useRef(null);
  const [activeId, setActiveId] = useState(SECTIONS[0].id);

  const sectionIds = useMemo(() => SECTIONS.map((section) => section.id), []);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return undefined;
    const nodes = sectionIds
      .map((id) => root.querySelector(`#${CSS.escape(id)}`))
      .filter(Boolean);
    if (!nodes.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target?.id) setActiveId(visible[0].target.id);
      },
      { root: null, rootMargin: "-20% 0px -55% 0px", threshold: [0.08, 0.2, 0.4] }
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [sectionIds]);

  const handleTocClick = (event, id) => {
    event.preventDefault();
    const target = contentRef.current?.querySelector(`#${CSS.escape(id)}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#${id}`
    );
  };

  const renderTocItems = (keyPrefix) =>
    SECTIONS.map((section) => {
      const isActive = activeId === section.id;
      return (
        <li key={`${keyPrefix}-${section.id}`}>
          <a
            href={`#${section.id}`}
            onClick={(event) => handleTocClick(event, section.id)}
            className={`block truncate rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors ${
              isActive
                ? "bg-ocean-600 text-white shadow-sm"
                : "text-ocean-700 hover:bg-ocean-50 hover:text-ocean-950"
            }`}
          >
            {section.title}
          </a>
        </li>
      );
    });

  return (
    <>
      <aside
        className="fixed bottom-0 top-16 z-20 hidden w-[var(--settings-toc-w)] flex-col border-r border-ocean-200 bg-white lg:flex"
        style={{ left: "var(--superadmin-sidebar-w)" }}
      >
        <nav aria-label="On this page" className="flex h-full flex-col overflow-hidden p-3">
          <p className="shrink-0 px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ocean-500">
            On this page
          </p>
          <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">{renderTocItems("desk")}</ul>
        </nav>
      </aside>

      <div className="space-y-5">
        <nav
          aria-label="On this page"
          className="rounded-2xl border border-ocean-200 bg-white p-2.5 shadow-[0_12px_30px_-24px_rgba(10,70,111,0.55)] lg:hidden"
        >
          <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ocean-500">
            On this page
          </p>
          <ul className="space-y-0.5">{renderTocItems("mobile")}</ul>
        </nav>

        <section className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(10,70,111,0.7)]">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-600">Settings</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ocean-950">
            Service settings
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-ocean-700">
            Controls for assistance service workflows.
          </p>
        </section>

        <div ref={contentRef} className="space-y-4">
          <SectionCard id="service-pipeline" title="Service Pipeline" />
        </div>
      </div>
    </>
  );
}

export default ServiceSettings;
