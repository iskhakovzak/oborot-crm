import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock, ShieldCheck, XCircle } from "lucide-react";
import { db, schema } from "@/db";
import { getSetting } from "@/lib/settings";
import { fmtMoney, fmtMoneyFull, fmtDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { findPaymentLink, markPaymentLinkPaid } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Оплата через Payme или Click" };

export default async function PayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const [link, company] = await Promise.all([findPaymentLink(id), getSetting("company")]);
  const now = new Date().toISOString();
  const expired = !!link && link.status === "active" && !!link.expiresAt && link.expiresAt < now;
  const status = !link ? "missing" : expired ? "expired" : link.status;
  const payer = link?.companyId ? await db.query.companies.findFirst({ where: eq(schema.companies.id, link.companyId) }) : null;
  const qr = link && status === "active" ? await QRCode.toDataURL(link.qrPayload, { width: 440, margin: 1, errorCorrectionLevel: "M", color: { dark: "#0a0a0a", light: "#ffffff" } }) : null;

  async function simulate() {
    "use server";
    const r = await markPaymentLinkPaid(id);
    if (!r.ok) redirect(`/pay/${id}?error=${encodeURIComponent(r.error ?? "Ошибка")}`);
    redirect(`/pay/${id}`);
  }

  return (
    <div className="min-h-screen bg-canvas px-4 py-8 sm:py-14">
      <div className="mx-auto w-full max-w-md">
        <div className="rise mb-6 flex items-center justify-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-[10px] bg-ink text-canvas text-[15px] font-bold">{company.shortName.slice(0, 1).toUpperCase()}</span>
          <span className="text-lg font-semibold tracking-[-0.01em]">{company.shortName}</span>
        </div>
        <div className="slab rise overflow-hidden !p-0">
          {status === "missing" || status === "cancelled" || status === "expired" ? (
            <div className="px-7 py-12 text-center">
              <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-surface-2 text-muted">{status === "expired" ? <Clock className="size-7" /> : <XCircle className="size-7" />}</div>
              <h1 className="text-xl font-semibold">{status === "missing" ? "Ссылка не найдена" : status === "expired" ? "Срок действия ссылки истёк" : "Ссылка отменена"}</h1>
              <p className="mt-2 text-[14px] text-muted leading-relaxed">
                {status === "missing" ? "Проверьте адрес или запросите новую ссылку у менеджера." : "Запросите у менеджера новую ссылку на оплату — это занимает минуту."}
              </p>
              {company.phone && <p className="mt-5 text-[13px] text-ink-2">Телефон: <a href={`tel:${company.phone}`} className="font-medium hover:underline">{company.phone}</a></p>}
            </div>
          ) : (
            <>
              <div className="border-b border-line px-7 pt-7 pb-6 text-center">
                <div className="eyebrow">{status === "paid" ? "// Оплачено" : "// К оплате"}</div>
                <div className="mt-1 whitespace-nowrap text-[32px] font-semibold leading-none tracking-[-0.02em] tnum sm:text-[36px]">{Number.isInteger(link!.amount) ? fmtMoney(link!.amount) : fmtMoneyFull(link!.amount)}</div>
                <div className="mt-3 text-[14px] text-ink-2 leading-relaxed">{link!.purpose}</div>
                {payer && <div className="mt-1 text-[13px] text-muted">Плательщик: {payer.name}</div>}
              </div>
              {status === "paid" ? (
                <div className="px-7 py-10 text-center">
                  <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-good-soft text-good"><CheckCircle2 className="size-9" /></div>
                  <div className="stamp text-accent text-sm mb-3">ОПЛАЧЕНО</div>
                  <p className="text-[14px] text-ink-2">Платёж получен {fmtDateTime(link!.paidAt)}. Чек и закрывающие документы придут от {company.shortName}.</p>
                </div>
              ) : (
                <div className="px-7 py-6">
                  <div className="mx-auto w-full max-w-[280px] rounded-[14px] bg-white p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qr!} alt="QR-код Payme/Click" className="block w-full" width={440} height={440} />
                  </div>
                  <p className="mt-3 text-center text-[13px] text-muted">Отсканируйте QR в приложении Payme или Click, либо нажмите кнопку на телефоне</p>
                  <div className="mt-5 space-y-2">
                    <Button size="lg" variant="secondary" className="w-full !border-transparent !bg-[#00c2b3] !text-white hover:!bg-[#00a99c]" asChild>
                      <a href={link!.qrPayload}><span className="rounded-[5px] bg-white/20 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">Payme</span> Оплатить через Payme</a>
                    </Button>
                    <Button size="lg" variant="secondary" className="w-full !border-transparent !bg-[#0f9af0] !text-white hover:!bg-[#0b85d1]" asChild>
                      <a href={link!.qrPayload}><span className="rounded-[5px] bg-white/20 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">Click</span> Оплатить через Click</a>
                    </Button>
                    <form action={simulate}>
                      <Button type="submit" size="lg" variant="secondary" className="w-full">Имитировать оплату (демо)</Button>
                    </form>
                  </div>
                  {sp.error && <div className="mt-3 rounded-[8px] bg-accent-soft px-3 py-2 text-center text-[13px] text-accent">{sp.error}</div>}
                  <div className="mt-5 flex items-center justify-between text-xs text-muted">
                    <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3.5" /> Безопасная оплата через Payme и Click</span>
                    {link!.expiresAt && <span className="inline-flex items-center gap-1"><Clock className="size-3.5" /> до {fmtDateTime(link!.expiresAt)}</span>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <p className="mt-5 text-center text-xs text-muted">{company.name}{company.inn ? ` · ИНН ${company.inn}` : ""}</p>
      </div>
    </div>
  );
}
