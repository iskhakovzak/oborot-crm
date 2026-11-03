export const TEAMS = [{ id: "sales", label: "Продажи" }, { id: "production", label: "Производство" }, { id: "finance", label: "Финансы" }];

export function teamLabel(id: string | null) {
  return TEAMS.find((t) => t.id === id)?.label ?? id ?? "—";
}
