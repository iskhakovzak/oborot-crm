import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { lookupBankByBik } from "@/lib/integrations/company-data";

/** Подстановка банка по БИК */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  const bik = (new URL(req.url).searchParams.get("bik") ?? "").replace(/\D/g, "");
  if (bik.length !== 9) return NextResponse.json({ error: "БИК состоит из 9 цифр" }, { status: 400 });
  const bank = await lookupBankByBik(bik);
  if (!bank) return NextResponse.json({ error: "Банк с таким БИК не найден в справочнике" }, { status: 404 });
  return NextResponse.json(bank);
}
