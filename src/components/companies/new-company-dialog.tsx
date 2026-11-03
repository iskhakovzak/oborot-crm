"use client";
import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { createCompany } from "@/app/(app)/companies/actions";
import type { Option } from "@/components/deals/types";
import { CompanyForm, EMPTY_COMPANY, toInput, type CompanyFormValues } from "./company-form";

export function NewCompanyDialog({ users, hidden, openByParam }: { users: Option[]; hidden: string[]; openByParam?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(!!openByParam);
  const [values, setValues] = useState<CompanyFormValues>(EMPTY_COMPANY);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (openByParam) setOpen(true);
  }, [openByParam]);
  function close() {
    setOpen(false);
    if (sp.get("new")) {
      const next = new URLSearchParams(sp.toString());
      next.delete("new");
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`);
    }
  }
  function submit() {
    start(async () => {
      const r = await createCompany(toInput(values, hidden, []));
      if ("error" in r) { toast.error(r.error); return; }
      toast.success("Клиент создан");
      setOpen(false);
      setValues(EMPTY_COMPANY);
      router.push(`/companies/${r.id}`);
    });
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus /> Новый клиент</Button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent title="Новый клиент" description="Введите ИНН и нажмите «Заполнить» — реквизиты подтянутся автоматически" wide>
          <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <CompanyForm values={values} onChange={setValues} users={users} hidden={hidden} readonly={[]} autoFocusInn />
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={close}>Отмена</Button>
              <Button type="submit" disabled={pending || !values.name.trim()}>{pending ? "Создаём…" : "Создать клиента"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
