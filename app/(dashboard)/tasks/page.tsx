import { redirect } from "next/navigation";

/** Tasks live under each project. Use /projects → open a project → /projects/[id]/tasks */
export default function LegacyTasksRedirect() {
  redirect("/projects");
}
