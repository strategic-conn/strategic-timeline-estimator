import { redirect } from "next/navigation";

// The "Draft from client scope" demo is hidden for now (2026-10-28): no entry on
// the Estimator, and old links land there. The demo itself is parked in
// components/features/proposals/ScopeDraftDemo.tsx, ready to bring back.
export default function ScopeDemoPage() {
  redirect("/proposals");
}
