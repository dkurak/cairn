import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadAll } from "@/lib/actions";
import AppProvider from "@/components/AppProvider";
import Shell from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) redirect("/login");
  const initial = await loadAll(sb, uid).catch(() => null);
  if (!initial) {
    return (
      <div className="page">
        <h1>Cairn</h1>
        <p className="status">Your account isn&apos;t set up yet (no profile or plan found). If you just signed up, reload in a moment.</p>
      </div>
    );
  }
  return (
    <AppProvider initial={initial}>
      <Shell>{children}</Shell>
    </AppProvider>
  );
}
