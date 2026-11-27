import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadAll } from "@/lib/actions";
import CairnApp from "@/components/CairnApp";

export const dynamic = "force-dynamic";

export default async function Home() {
  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) redirect("/login");
  const initial = await loadAll(sb, uid).catch(() => null);
  if (!initial) {
    return (
      <main style={{ maxWidth: 560, margin: "0 auto", padding: 16 }}>
        <h1>Cairn</h1>
        <p className="status">Your account isn't set up yet (no profile or plan found). If you just signed up, reload in a moment.</p>
      </main>
    );
  }
  return <CairnApp initial={initial} />;
}
