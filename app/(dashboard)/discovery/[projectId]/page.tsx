import { redirect } from "next/navigation";

// Discovery merged into the Estimator. Guided scoping now lives inside a
// proposal (Scope & risk tab), so standalone discovery links redirect there.
export default function DiscoveryDetailPage() {
  redirect("/proposals");
}
