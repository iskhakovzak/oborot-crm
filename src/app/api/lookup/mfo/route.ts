import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { lookupBankByMfo } from "@/lib/integrations/company-data";

/** Подстановка банка по МФО */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  const mfo = (new URL(req.url).searchParams.get("mfo") ?? "").replace(/\D/g, "");
  if (mfo.length !== 5) return NextResponse.json({ error: "МФО состоит из 5 цифр" }, { status: 400 });
  const bank = await lookupBankByMfo(mfo);
  if (!bank) return NextResponse.json({ error: "Банк с таким МФО не найден в справочнике" }, { status: 404 });
  return NextResponse.json(bank);
}
