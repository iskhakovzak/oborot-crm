import { cn } from "@/lib/utils";

export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("card overflow-x-auto", className)}>
      <table className="table-base w-full text-sm">{children}</table>
    </div>
  );
}
