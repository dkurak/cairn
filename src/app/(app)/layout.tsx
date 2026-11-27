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
  let loadError = "";
  const initial = await loadAll(sb, uid).catch((e) => {
    loadError = e?.message ?? String(e);
    console.error("loadAll failed", e);
    return null;
  });
  if (!initial) {
    const noRow = /0 rows|no rows|PGRST116/i.test(loadError);
    return (
      <div className="page">
        <h1>Cairn</h1>
        {noRow ? (
          <p className="status">Your account isn&apos;t set up yet (no profile or plan found). If you just signed up, reload in a moment.</p>
        ) : (
          <>
            <p className="status">You&apos;re signed in, but Cairn couldn&apos;t load your data. Reload in a moment. If it keeps happening, the database may be missing an update.</p>
            <p className="status"><code>{loadError}</code></p>
          </>
        )}
      </div>
    );
  }
  return (
    <AppProvider initial={initial}>
      <Shell>{children}</Shell>
    </AppProvider>
  );
}
