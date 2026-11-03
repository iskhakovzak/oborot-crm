import type { Metadata } from "next";
import { getSetting } from "@/lib/settings";

export const metadata: Metadata = { title: "Онлайн-запись" };
export const dynamic = "force-dynamic";

/** Публичная оболочка для страниц записи: без сайдбара и авторизации, mobile-first */
export default async function BookLayout({ children }: { children: React.ReactNode }) {
  const company = await getSetting("company");
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="mx-auto flex w-full max-w-[640px] items-center gap-2.5 px-4 py-4 sm:py-6">
        <span className="grid size-8 place-items-center rounded-[8px] bg-ink text-[14px] font-bold text-white">{company.shortName.replace(/[«»]/g, "").charAt(0).toUpperCase() || "О"}</span>
        <span className="text-[15px] font-semibold tracking-[-0.01em]">{company.shortName}</span>
        <span className="ml-auto text-[13px] text-muted">Онлайн-запись</span>
      </header>
      <main className="mx-auto w-full max-w-[640px] flex-1 px-4 pb-10">{children}</main>
      <footer className="mx-auto w-full max-w-[640px] px-4 pb-6 text-center text-xs text-muted">
        {company.name} · {company.phone} · {company.email}
      </footer>
    </div>
  );
}
