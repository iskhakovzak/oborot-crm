import { login, getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  if (await getCurrentUser()) redirect(sp.next && sp.next.startsWith("/") ? sp.next : "/");
  async function action(fd: FormData) {
    "use server";
    const r = await login(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""));
    const next = String(fd.get("next") ?? "/");
    if (!r.ok) redirect(`/login?error=${encodeURIComponent(r.error)}&next=${encodeURIComponent(next)}`);
    redirect(next.startsWith("/") ? next : "/");
  }
  return (
    <div className="grid grid-cols-1 min-h-screen lg:grid-cols-[minmax(0,1.1fr)_1fr]">
      <div className="hidden lg:flex flex-col justify-between bg-mesh p-12 text-ink rise">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-[9px] border border-line-strong bg-ink text-canvas text-sm font-bold">W</span>
          <span className="text-lg font-semibold">WS_CRM</span>
        </div>
        <div className="max-w-[34ch]">
          <h1 className="text-[40px] font-bold leading-[1.05] tracking-[-0.035em]">Заявка, счёт, отгрузка, оплата — в одном обороте.</h1>
          <p className="mt-5 text-[15px] leading-relaxed text-ink-2">
            Мессенджеры, телефония, банк, ЭДО, оплата через Payme и Click, Яндекс Метрика, Google Analytics и ИИ подключены к одной базе клиентов. Менеджер в Ташкенте или Самарканде работает в сделке, остальное система делает сама.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-6 text-[13px] text-ink-2">
          <div><div className="text-2xl font-bold text-ink tnum">30</div>автоматизаций из коробки</div>
          <div><div className="text-2xl font-bold text-ink tnum">1 клик</div>до счёта, договора и ЭСФ</div>
          <div><div className="text-2xl font-bold text-ink tnum">24/7</div>ИИ отвечает и принимает звонки</div>
        </div>
      </div>
      <div className="flex items-center justify-center border-l border-line bg-canvas p-6">
        <form action={action} className="slab rise w-full max-w-sm !p-8">
          <div className="eyebrow mb-3">// Вход</div>
          <h2 className="text-[22px] font-semibold">Вход в систему</h2>
          <p className="mt-1 text-[13px] text-muted">Вход по email или Telegram-нику</p>
          {sp.error && <div className="mt-4 rounded-[8px] bg-accent-soft px-3 py-2 text-[13px] text-accent">{sp.error}</div>}
          <input type="hidden" name="next" value={sp.next ?? "/"} />
          <div className="mt-6 space-y-4">
            <Field label="Email или Telegram"><Input name="email" type="text" required autoComplete="username" defaultValue="@ws_zr" /></Field>
            <Field label="Пароль"><Input name="password" type="password" required autoComplete="current-password" defaultValue="admin123" /></Field>
            <Button type="submit" size="lg" className="w-full">Войти</Button>
          </div>
          <div className="mt-6 rounded-[8px] border border-line p-3 text-xs text-muted leading-relaxed">Пароль по умолчанию: admin123. Смените его в разделе «Настройки → Профиль».</div>
        </form>
      </div>
    </div>
  );
}
