export type CompanyOpt = { id: string; name: string };
export type DealOpt = { id: string; number: number; title: string; companyId: string | null; amount: number };
export type InvoiceOpt = { id: string; number: string; companyId: string | null; dealId: string | null; amount: number; status: string };
export type FinanceOptions = { companies: CompanyOpt[]; deals: DealOpt[]; invoices: InvoiceOpt[] };
