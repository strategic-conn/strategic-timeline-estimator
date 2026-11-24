import { redirect } from "next/navigation";

// The "Draft from client scope" demo was replaced by the real thing — New
// estimate → "Let Esther estimate" (2026-11-21). Old links land on the Estimator.
export default function ScopeDemoPage() {
  redirect("/proposals");
}
