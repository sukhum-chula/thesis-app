import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCommitteeRules, setCommitteeRules } from "@/lib/systemSettings";
import { parseCommitteeRules } from "@/lib/committeeRules";

function sessionRoles(session: { user?: { roles?: string[]; role?: string } } | null): string[] {
  return session?.user?.roles ?? [session?.user?.role ?? ""];
}

// The committee composition table (src/lib/committeeRules.ts). Readable by every signed-in user —
// students need it to fill in their committee — but only ADMIN may change it. A change applies to
// committees saved from then on; existing submissions are not re-checked.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getCommitteeRules());
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !sessionRoles(session).includes("ADMIN"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = parseCommitteeRules(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  await setCommitteeRules(parsed.rules);
  return NextResponse.json(parsed.rules);
}
