import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { documentBytes } from "@/lib/documents/service";
import { docToken } from "../../token";

export const dynamic = "force-dynamic";

/** PDF документа. Внутри CRM — по сессии (кука), снаружи — по токену ?t=<docToken(id)> из ссылок в письмах и мессенджерах. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = new URL(req.url).searchParams.get("t");
  const user = await getCurrentUser();
  const allowed = (user && can(user.actor, "documents", "view")) || (!!token && token === docToken(id));
  if (!allowed) return new Response("Нет доступа", { status: user ? 403 : 401 });
  const doc = await documentBytes(id);
  if (!doc) return new Response("Документ не найден", { status: 404 });
  const ascii = doc.filename.replace(/[^\x20-\x7e]/g, "_");
  return new Response(new Uint8Array(doc.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(doc.bytes.length),
      "content-disposition": `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
      "cache-control": "private, no-store",
    },
  });
}
