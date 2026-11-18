/**
 * Which guided line waits for which, by default (decided 2026-11-18).
 *
 * The planner runs every task of a phase in parallel unless a line says it
 * depends on another (`depends_on`), so without these Willow School built its
 * pages on the same day as the site setup they need. Applied when guided line
 * items are GENERATED; the coordinator edits them per line ("Depends on #N")
 * like any other dependency. Matched by title within the same phase, so a
 * catalog or freehand line is never linked by these rules.
 */
import { PHASE_META } from "@/lib/discovery/constants";
import type { PhaseId } from "@/types/discovery.types";

type Rule = { phase: PhaseId; title: string; after: string[] };

const SETUP = "Development setup & architecture";

const RULES: Rule[] = [
  // Discovery: the plan comes out of the kickoff.
  { phase: "discovery", title: "Project plan & milestones", after: ["Kickoff & strategy session"] },
  { phase: "discovery", title: "Stakeholder alignment", after: ["Kickoff & strategy session"] },
  // Content: plan first, then write / collect / migrate.
  { phase: "content", title: "Copywriting", after: ["Content audit & planning"] },
  { phase: "content", title: "Client copy coordination", after: ["Content audit & planning"] },
  { phase: "content", title: "Content migration", after: ["Content audit & planning"] },
  // Design: brand → design system → templates; wireframes before templates.
  { phase: "design", title: "Visual design system", after: ["Brand definition", "Full rebrand / identity"] },
  { phase: "design", title: "Template designs", after: ["Wireframes", "Visual design system"] },
  { phase: "design", title: "Custom illustrations", after: ["Visual design system"] },
  { phase: "design", title: "Animations & motion prototype", after: ["Visual design system"] },
  { phase: "design", title: "Extra revision rounds", after: ["Template designs"] },
  // Development: setup → platform → templates → pages; extras after setup.
  { phase: "development", title: "Platform setup", after: [SETUP] },
  { phase: "development", title: "Template implementation", after: [SETUP, "Platform setup"] },
  { phase: "development", title: "Page build", after: [SETUP, "Platform setup", "Template implementation"] },
  { phase: "development", title: "Blog / news section", after: [SETUP, "Template implementation"] },
  { phase: "development", title: "Large product catalog", after: [SETUP, "E-commerce base"] },
  { phase: "development", title: "Product variations", after: [SETUP, "E-commerce base"] },
  { phase: "development", title: "Payment gateway integration", after: [SETUP, "E-commerce base"] },
  { phase: "development", title: "301 redirect mapping", after: [SETUP, "Page build"] },
  { phase: "development", title: "ADA / WCAG implementation", after: [SETUP, "Page build"] },
  { phase: "development", title: "Core Web Vitals / performance", after: [SETUP, "Page build"] },
  // SEO: research before the on-page work.
  { phase: "seo", title: "On-page SEO", after: ["Keyword research"] },
  { phase: "seo", title: "Schema markup", after: ["Keyword research"] },
  // Launch: checklist → DNS → smoke test → handoff.
  { phase: "launch", title: "DNS / SSL configuration", after: ["Pre-launch checklist"] },
  { phase: "launch", title: "Smoke testing", after: ["DNS / SSL configuration"] },
  { phase: "launch", title: "Handoff documentation", after: ["Smoke testing"] },
  { phase: "launch", title: "CMS training session", after: ["Smoke testing"] },
];

/** Development lines that wait for EVERY other Development line. */
const DEV_LAST = new Set(["Development QA pass"]);
/** QA lines that wait for every other QA line (phase plans; sprint plans fold QA into tests). */
const QA_LAST = new Set(["Bug fixes"]);

type Line = { id: string; title: string; module?: string | null; depends_on: string[] };

/**
 * `lines` with the default dependencies filled in on the lines listed in
 * `only` (default: all). A line that already has dependencies is left alone,
 * and a rule naming a line the quote doesn't have is skipped.
 */
export function withDefaultDependencies<T extends Line>(
  lines: T[],
  only?: ReadonlySet<string>,
): T[] {
  const dev = PHASE_META.development.label;
  const qa = PHASE_META.qa.label;
  const key = (module: string | null | undefined, title: string) => `${module ?? ""}|${title.trim()}`;
  const idOf = new Map<string, string>();
  for (const li of lines) if (!idOf.has(key(li.module, li.title))) idOf.set(key(li.module, li.title), li.id);
  const rules = new Map(RULES.map((r) => [key(PHASE_META[r.phase].label, r.title), r]));

  return lines.map((li) => {
    if ((only && !only.has(li.id)) || li.depends_on.length) return li;
    const title = li.title.trim();
    let after: string[] = [];
    if (li.module === dev && DEV_LAST.has(title)) {
      after = lines.filter((o) => o.module === dev && o.id !== li.id && !DEV_LAST.has(o.title.trim())).map((o) => o.id);
    } else if (li.module === qa && QA_LAST.has(title)) {
      after = lines.filter((o) => o.module === qa && o.id !== li.id && !QA_LAST.has(o.title.trim())).map((o) => o.id);
    } else {
      const rule = rules.get(key(li.module, title));
      const names = rule ? rule.after : li.module === dev && title !== SETUP ? [SETUP] : [];
      after = names.map((n) => idOf.get(key(li.module, n))).filter((id): id is string => Boolean(id) && id !== li.id);
    }
    return after.length ? { ...li, depends_on: [...new Set(after)] } : li;
  });
}
