"use client";

import * as React from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";

import { StarRating } from "@/components/features/skills/StarRating";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COMMON_SKILLS } from "@/lib/constants/skills";
import {
  useAllSkillNames,
  useMemberSkills,
  useMemberSkillsStore,
} from "@/store/member-skills-store";
import { DEFAULT_CONFIDENCE, skillKey } from "@/types/skill.types";

const MAX_SUGGESTIONS = 8;

type MemberSkillsEditorProps = {
  profileId: string;
  /** When false, renders a read-only view (no add/edit/remove). */
  editable?: boolean;
};

/**
 * Add / rate / remove a person's tech-stack skills. Reused by Settings (self)
 * and the Team page (admin/manager editing anyone; everyone else read-only).
 */
export function MemberSkillsEditor({
  profileId,
  editable = false,
}: MemberSkillsEditorProps) {
  const skills = useMemberSkills(profileId);
  const teamSkillNames = useAllSkillNames();
  const setSkill = useMemberSkillsStore((s) => s.setSkill);
  const removeSkill = useMemberSkillsStore((s) => s.removeSkill);

  const [draft, setDraft] = React.useState("");

  const alreadyHas = React.useMemo(
    () => new Set(skills.map((s) => skillKey(s.skill))),
    [skills],
  );

  const add = (value: string) => {
    const clean = value.trim();
    if (!clean || alreadyHas.has(skillKey(clean))) return;
    setSkill(profileId, clean, DEFAULT_CONFIDENCE);
  };

  const addDraft = () => {
    add(draft);
    setDraft("");
  };

  // Suggestions: team-used names first (consistency), then the curated list;
  // drop what this person already has, and typeahead-filter by the draft.
  const suggestions = React.useMemo(() => {
    const q = skillKey(draft);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const name of [...teamSkillNames, ...COMMON_SKILLS]) {
      const k = skillKey(name);
      if (seen.has(k) || alreadyHas.has(k)) continue;
      if (q && !k.includes(q)) continue;
      seen.add(k);
      out.push(name);
      if (out.length >= MAX_SUGGESTIONS) break;
    }
    return out;
  }, [teamSkillNames, alreadyHas, draft]);

  return (
    <div className="space-y-3">
      {editable ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addDraft();
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a skill or technology (e.g. Next.js, Figma, Postgres)"
            aria-label="Add a skill"
            maxLength={40}
          />
          <Button type="submit" className="shrink-0 gap-1.5" disabled={!draft.trim()}>
            <Plus className="size-4" aria-hidden />
            Add
          </Button>
        </form>
      ) : null}

      {editable && suggestions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">
            {draft.trim() ? "Matches:" : "Suggestions:"}
          </span>
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                add(name);
                setDraft("");
              }}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
            >
              <Plus className="size-3" aria-hidden />
              {name}
            </button>
          ))}
        </div>
      ) : null}

      {skills.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-6 text-sm text-muted-foreground">
          <Sparkles className="size-4 shrink-0" aria-hidden />
          {editable
            ? "No skills yet — add technologies above and rate your confidence."
            : "No skills listed yet."}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border">
          {skills.map((s) => (
            <li
              key={s.skill}
              className="flex items-center justify-between gap-3 px-3 py-2.5"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {s.skill}
              </span>
              <StarRating
                value={s.confidence}
                label={s.skill}
                onChange={
                  editable
                    ? (v) => setSkill(profileId, s.skill, v)
                    : undefined
                }
              />
              {editable ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${s.skill}`}
                  onClick={() => removeSkill(profileId, s.skill)}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
