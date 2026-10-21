"use client";

import * as React from "react";

import { SectionHelp } from "@/components/common/section-help";

/**
 * The Estimator's section help — every "?" in a section's top-right corner,
 * written in one place so it reads as one voice and is easy to keep true.
 *
 * ⚠️ This restates how the estimator behaves. When pricing, add-ons, the risk
 * buffer or the Zoho send change, change the matching entry here in the same
 * commit (the same rule as the tour copy in lib/tours/tours.ts).
 *
 * Plain language on purpose: "Responsive" was read as "is the site
 * responsive?" — it always is; the box is about whether that WORK is billed.
 */
const HELP = {
  details: {
    label: "quote details",
    title: "The basics of this estimate",
    body: (
      <>
        <p>
          <strong>Title</strong>{" "}and{" "}<strong>client</strong>{" "}appear on the PDF
          the client gets. The client is always picked with{" "}
          <strong>Find in Zoho</strong>{" "}— it can&apos;t be typed — so every
          estimate is tied to a real company and contact and can be sent to Zoho.
        </p>
        <p>
          <strong>Zoho deal</strong>{" "}is the deal this estimate prices.{" "}
          <strong>Products</strong>{" "}are what you&apos;re selling, from the Zoho
          catalogue; they become the deal&apos;s package rows and share the
          estimate&apos;s price between them. They are separate from the line
          items, which are the work.
        </p>
        <p>
          <strong>Platform</strong>{" "}decides which ready-made tasks the catalog
          offers on the Line items tab. Changing it keeps the rows you have.
        </p>
        <p>
          <strong>Notes</strong>{" "}print on the PDF and Excel too, so write them
          for the client.
        </p>
      </>
    ),
  },
  scopeSummary: {
    label: "the guided estimate",
    title: "What the questionnaire worked out",
    body: (
      <>
        <p>
          Your answers give a{" "}<strong>risk score</strong>{" "}(how much is still
          uncertain), an{" "}<strong>hours range</strong>{" "}from best case to worst
          case, and a{" "}<strong>launch date</strong>.
        </p>
        <p>
          <strong>Generate line items</strong>{" "}turns that estimate into the
          quote&apos;s lines, priced at today&apos;s rates.{" "}
          <strong>Regenerating replaces</strong>{" "}the lines you have, including
          any edits you made to them.
        </p>
        <p>
          The{" "}<strong>Questionnaire</strong>,{" "}<strong>Hours</strong>{" "}and{" "}
          <strong>Timeline</strong>{" "}tabs below show the detail behind each
          number.
        </p>
      </>
    ),
  },
  scopeEmpty: {
    label: "guided scoping",
    title: "Guided scoping is optional",
    body: (
      <>
        <p>
          Answer a short questionnaire about the project and the estimator
          works out the hours (best to worst case), a phased timeline and a
          risk score — then it can write the line items for you.
        </p>
        <p>
          Prefer to pick tasks yourself? Skip this and use the{" "}
          <strong>Line items</strong>{" "}tab. You can start guided scoping later
          without losing anything.
        </p>
      </>
    ),
  },
  tentativeTimeline: {
    label: "the tentative timeline",
    title: "A rough timeline, not a promise",
    body: (
      <>
        <p>
          Drawn from your line items and add-ons, starting today, skipping
          weekends, US holidays and the team&apos;s approved time off.
        </p>
        <p>
          It firms up when the estimate becomes a project:{" "}<strong>Start
          project</strong>{" "}turns each phase into a sprint the manager can then
          adjust.
        </p>
      </>
    ),
  },
  lineItems: {
    label: "line items",
    title: "The work being quoted",
    body: (
      <>
        <p>Each row is one piece of work.</p>
        <p>
          <strong>Hours</strong>{" "}= base hours × tier × quantity. Tiers:{" "}
          <strong>Basic 1×</strong>,{" "}<strong>Advanced 1.5×</strong>,{" "}
          <strong>Custom 2×</strong>.
        </p>
        <p>
          <strong>Price</strong>{" "}= hours × the hourly rate of the row&apos;s
          role and level. The rate is fixed when the row is added, so later
          rate changes in Settings don&apos;t quietly change this quote.
        </p>
        <p>
          <strong>Browse catalog</strong>{" "}adds ready-made tasks for the
          platform;{" "}<strong>Add row</strong>{" "}adds your own. Rows are grouped by
          module, as on the PDF.
        </p>
      </>
    ),
  },
  requirements: {
    label: "requirements not pinned down",
    title: "When the client hasn't decided yet",
    body: (
      <>
        <p>
          Tick this when the details are still fuzzy. Every line is then priced
          as{" "}<strong>Advanced (1.5×)</strong>{" "}— more hours, a higher price, a
          safer quote.
        </p>
        <p>
          It forces every line{" "}<em>to</em>{" "}Advanced, so a{" "}
          <strong>Custom (2×)</strong>{" "}line actually goes down. Untick it once
          the scope is firm and each line uses its own tier again.
        </p>
        <p>
          This changes the{" "}<strong>price</strong>. To change only the{" "}
          <strong>dates</strong>, use the risk buffer below.
        </p>
      </>
    ),
  },
  schedulePlan: {
    label: "who does the work",
    title: "Who does the work",
    body: (
      <>
        <p>
          Picks how the timeline is planned before the deal closes, because it
          changes the launch date the client agrees to.{" "}
          <strong>Best-fit</strong>{" "}gives each task to the best-skilled
          person;{" "}<strong>Fastest</strong>{" "}spreads it across everyone
          qualified;{" "}<strong>Manual</strong>{" "}assigns nobody.
        </p>
        <p>
          It moves the{" "}<strong>dates only</strong>. The price is each
          line&apos;s hours times its own rate, whoever does it.
        </p>
        <p>
          Approving the estimate locks it and remembers the launch date.{" "}
          <strong>Start project</strong>{" "}uses the same plan, and warns if
          today&apos;s team would finish later than quoted.
        </p>
      </>
    ),
  },
  riskBuffer: {
    label: "the risk buffer",
    title: "Extra time for surprises",
    body: (
      <>
        <p>
          Makes the timeline longer to allow for things you can&apos;t list —
          a slow client, an undocumented system, a late surprise.
        </p>
        <p>
          It moves the{" "}<strong>dates only</strong>. Hours and price stay the
          same. If you&apos;re unsure how much{" "}<em>work</em>{" "}there is (not how
          long it takes), use{" "}<strong>Requirements not pinned down</strong>{" "}
          instead — that one changes the price.
        </p>
        <p>
          The buffer carries over to the project when you press{" "}
          <strong>Start project</strong>.
        </p>
      </>
    ),
  },
  rates: {
    label: "hourly rates",
    title: "Which rates this quote uses",
    body: (
      <>
        <p>
          Each line keeps the hourly rate it had when it was added. So when
          someone changes a rate in Settings, existing quotes don&apos;t
          change by themselves.
        </p>
        <p>
          If today&apos;s rates differ, this card says so.{" "}
          <strong>Update to current rates</strong>{" "}shows the old and new price
          first, and only changes the quote if you confirm.
        </p>
      </>
    ),
  },
  addons: {
    label: "roll-up add-ons",
    title: "Extra hours on top of development",
    body: (
      <>
        <p>
          Each box asks one question:{" "}<strong>should this quote charge extra
          hours for this kind of work?</strong>{" "}It isn&apos;t asking whether the
          site will be responsive or designed — only whether that time is
          billed here.
        </p>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            <strong>Responsive</strong>{" "}— making the pages work on phones and
            tablets.
          </li>
          <li>
            <strong>Design</strong>{" "}— mockups and visual design.
          </li>
          <li>
            <strong>QA</strong>{" "}— testing.
          </li>
          <li>
            <strong>PM</strong>{" "}— project management: meetings, updates,
            coordination. Simple 10%, Complex 15%, or type your own.
          </li>
        </ul>
        <p>
          <strong>They stack, in order.</strong>{" "}
          {"100 h dev → +25 h responsive (125) → +44 h design (169) → +34 h QA (203) → +20 h PM = about 223 h."}
        </p>
        <p>
          <strong>Tick it or not?</strong>{" "}If the line items&apos; hours
          already include that work, leave it off — or the client pays twice.
          If they don&apos;t, tick it — or that work is quoted for free.
        </p>
      </>
    ),
  },
  totals: {
    label: "totals",
    title: "How the final number is built",
    body: (
      <>
        <p>
          Development hours, plus each add-on that is switched on, give the
          total hours. Each line&apos;s hours × its rate, added up, give the
          price.
        </p>
        <p>
          This is the figure on the PDF header and the one sent to Zoho.
        </p>
      </>
    ),
  },
  review: {
    label: "the client preview",
    title: "What the client sees",
    body: (
      <>
        <p>
          This is exactly what goes into the PDF and Excel. Client documents
          show{" "}<strong>prices only</strong>{" "}— never roles, levels or hourly
          rates.
        </p>
        <p>
          <strong>Send to Zoho</strong>{" "}creates the deal (or updates the linked
          one) and attaches this PDF. You see exactly what will be written
          before anything is sent, and nothing in Zoho can be deleted from
          here, so check the preview.
        </p>
      </>
    ),
  },
} satisfies Record<string, { label: string; title: string; body: React.ReactNode }>;

export type EstimatorHelpSection = keyof typeof HELP;

export function EstimatorHelp({
  section,
  corner,
  className,
}: {
  section: EstimatorHelpSection;
  /** For a section with no card header: pin to its top-right corner. */
  corner?: boolean;
  className?: string;
}) {
  const h = HELP[section];
  return (
    <SectionHelp label={h.label} title={h.title} corner={corner} className={className}>
      {h.body}
    </SectionHelp>
  );
}
