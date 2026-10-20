import { redirect } from "next/navigation";

// Esther is hidden for now (2026-10-21): no nav entry, and old links land on
// the Estimator. The parked chat client lives in components/features/esther.
export default function EstherPage() {
  redirect("/proposals");
}
