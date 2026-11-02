import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = [/^\/login/, /^\/book\//, /^\/api\/webhooks\//, /^\/api\/telegram\//, /^\/api\/public\//, /^\/pay\//, /^\/_next\//, /^\/favicon/];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  const sid = req.cookies.get("crm_session")?.value;
  if (!sid) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
