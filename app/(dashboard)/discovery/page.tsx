import { redirect } from "next/navigation";

// Discovery merged into the Estimator (Proposals). Old links land on the tool.
export default function DiscoveryPage() {
  redirect("/proposals");
}
