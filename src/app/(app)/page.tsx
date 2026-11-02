import { PageHeader } from "@/components/ui/page";
export const dynamic = "force-dynamic";
export default async function Dashboard() {
  return <PageHeader title="Рабочий стол" description="Загрузка…" />;
}
