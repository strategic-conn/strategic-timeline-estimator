"use client";

import { useSprintsStore } from "@/store/sprints-store";

export function useSprints() {
  return useSprintsStore();
}
