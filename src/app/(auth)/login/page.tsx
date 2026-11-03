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
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden lg:flex flex-col justify-between bg-mesh p-12 text-white">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-[11px] bg-brand-gradient text-white text-sm font-bold shadow-brand">О</span>
          <span className="text-lg font-semibold">Оборот</span>
        </div>
        <div className="max-w-[34ch]">
          <h1 className="text-[40px] font-semibold leading-[1.1] tracking-[-0.02em]">Заявка, счёт, отгрузка, оплата — в одном обороте.</h1>
          <p className="mt-5 text-[15px] leading-relaxed text-white/70">
            Мессенджеры, телефония, банк, ЭДО, Яндекс Метрика и ИИ подключены к одной базе клиентов. Менеджер работает в сделке, остальное система делает сама.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-6 text-[13px] text-white/60">
          <div><div className="text-2xl font-semibold text-white tnum">30</div>автоматизаций из коробки</div>
          <div><div className="text-2xl font-semibold text-white tnum">1 клик</div>до счёта, договора и УПД</div>
          <div><div className="text-2xl font-semibold text-white tnum">24/7</div>ИИ отвечает и принимает звонки</div>
        </div>
      </div>
      <div className="flex items-center justify-center bg-canvas p-6">
        <form action={action} className="card w-full max-w-sm p-8">
          <h2 className="text-[22px] font-semibold">Вход в систему</h2>
          <p className="mt-1 text-[13px] text-muted">Демо-доступ: admin@oborot.ru / admin123</p>
          {sp.error && <div className="mt-4 rounded-[8px] bg-accent-soft px-3 py-2 text-[13px] text-accent">{sp.error}</div>}
          <input type="hidden" name="next" value={sp.next ?? "/"} />
          <div className="mt-6 space-y-4">
            <Field label="Email"><Input name="email" type="email" required autoComplete="email" defaultValue="admin@oborot.ru" /></Field>
            <Field label="Пароль"><Input name="password" type="password" required autoComplete="current-password" defaultValue="admin123" /></Field>
            <Button type="submit" size="lg" className="w-full">Войти</Button>
          </div>
          <div className="mt-6 rounded-[10px] bg-surface-2 p-3 text-xs text-muted leading-relaxed">
            Другие роли для проверки прав: менеджер — ivan@oborot.ru, производство — oleg@oborot.ru, бухгалтер — anna@oborot.ru. Пароль у всех: demo123.
          </div>
        </form>
      </div>
    </div>
  );
}
