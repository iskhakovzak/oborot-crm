"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { DOC_STATUS_LABEL, EDO_STATUS_LABEL } from "./labels";

export function DocumentsFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("new");
    router.replace(`/documents?${next.toString()}`);
  };
  useEffect(() => {
    const t = setTimeout(() => { if ((sp.get("q") ?? "") !== q) set("q", q); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Номер или клиент" className="w-56 pl-8" />
      </div>
      <Select value={sp.get("status") ?? ""} onChange={(e) => set("status", e.target.value)} className="w-40">
        <option value="">Все статусы</option>
        {Object.entries(DOC_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </Select>
      <Select value={sp.get("edo") ?? ""} onChange={(e) => set("edo", e.target.value)} className="w-44">
        <option value="">ЭДО: любой</option>
        {Object.entries(EDO_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>ЭДО: {v}</option>)}
      </Select>
    </div>
  );
}
