import { createHash } from "node:crypto";

/** Короткий токен для публичных ссылок на PDF документа (письма, мессенджеры): ?t=<docToken(id)> */
export function docToken(id: string) {
  return createHash("sha256").update(id + (process.env.SESSION_SECRET ?? "change-me-in-production")).digest("hex").slice(0, 16);
}

export function docPdfUrl(id: string, withToken = false) {
  return `/api/documents/${id}/pdf${withToken ? `?t=${docToken(id)}` : ""}`;
}
