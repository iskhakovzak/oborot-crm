import { cn } from "@/lib/utils";

export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("overflow-x-auto rounded-[12px] border border-line bg-surface", className)}>
      <table className="table-base w-full text-sm">{children}</table>
    </div>
  );
}
