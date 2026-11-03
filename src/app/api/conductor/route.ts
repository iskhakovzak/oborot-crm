import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runConductor, type ConductorMessage } from "@/lib/conductor";

export const dynamic = "force-dynamic";

/** Кондуктор: { text, history } → выполненная команда или ответ по данным */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  let body: { text?: unknown; history?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 2000) : "";
  if (!text) return NextResponse.json({ error: "Пустая команда" }, { status: 400 });
  const history: ConductorMessage[] = Array.isArray(body.history)
    ? body.history
        .filter((m): m is ConductorMessage => !!m && typeof m === "object" && typeof (m as ConductorMessage).text === "string" && ((m as ConductorMessage).role === "user" || (m as ConductorMessage).role === "conductor"))
        .slice(-10)
        .map((m) => ({ role: m.role, text: m.text.slice(0, 2000) }))
    : [];
  try {
    const r = await runConductor({ text, user, history });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ kind: "answer", text: `Ошибка: ${e instanceof Error ? e.message : String(e)}`, actions: [], ok: false, sandbox: true }, { status: 500 });
  }
}
