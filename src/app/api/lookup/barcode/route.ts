import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { lookupProduct } from "@/lib/integrations/product-data";

/** 5. Автозаполнение товара по штрихкоду или артикулу */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  const code = (new URL(req.url).searchParams.get("code") ?? "").trim();
  if (!code) return NextResponse.json({ error: "Укажите штрихкод или артикул" }, { status: 400 });
  const data = await lookupProduct(code);
  if (!data) return NextResponse.json({ error: "Товар по этому коду не найден" }, { status: 404 });
  return NextResponse.json(data);
}
