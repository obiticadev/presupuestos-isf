import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth/session";

// The UI hides admin pages from presupuestadores; the services still check permissions themselves.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireUser();
  if (user.role !== "admin") notFound();
  return children;
}
