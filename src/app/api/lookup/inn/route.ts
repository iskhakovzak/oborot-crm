import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { lookupCompanyByInn, validateInn } from "@/lib/integrations/company-data";

/** 4. Автозаполнение карточки клиента по ИНН (реестр ЮЛ soliq.uz или демо-данные) */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  const inn = (new URL(req.url).searchParams.get("inn") ?? "").replace(/\D/g, "");
  if (!inn) return NextResponse.json({ error: "Укажите ИНН" }, { status: 400 });
  if (!validateInn(inn)) return NextResponse.json({ error: "ИНН не проходит проверку контрольной суммы" }, { status: 400 });
  const data = await lookupCompanyByInn(inn);
  if (!data) return NextResponse.json({ error: "Компания не найдена" }, { status: 404 });
  return NextResponse.json(data);
}
