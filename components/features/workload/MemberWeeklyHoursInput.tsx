"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { useWeeklyCapacityStore } from "@/store/weekly-capacity-store";

type MemberWeeklyHoursInputProps = {
  memberId: string;
  /** Effective hours from store (after clamp). */
  committedHours: number;
  /** Accessible label (person name). */
  label: string;
};

export function MemberWeeklyHoursInput({
  memberId,
  committedHours,
  label,
}: MemberWeeklyHoursInputProps) {
  const setWeeklyHours = useWeeklyCapacityStore((s) => s.setWeeklyHours);
  const [draft, setDraft] = React.useState(String(committedHours));

  React.useEffect(() => {
    setDraft(String(committedHours));
  }, [committedHours]);

  function commit() {
    const n = parseInt(draft, 10);
    if (Number.isNaN(n) || draft.trim() === "") {
      setDraft(String(committedHours));
      return;
    }
    setWeeklyHours(memberId, n);
    setDraft(String(useWeeklyCapacityStore.getState().getWeeklyHours(memberId)));
  }

  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className="h-8 w-14 text-center tabular-nums sm:w-16"
      value={draft}
      onChange={(e) => {
        const t = e.target.value;
        if (t === "" || /^\d{1,3}$/.test(t)) {
          setDraft(t);
        }
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
      aria-label={`Weekly capacity in hours for ${label}`}
    />
  );
}
