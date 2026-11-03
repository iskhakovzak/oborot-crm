"use client";
import * as D from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const Dropdown = D.Root;
export const DropdownTrigger = D.Trigger;
export function DropdownContent({ className, align = "end", ...p }: React.ComponentProps<typeof D.Content>) {
  return (
    <D.Portal>
      <D.Content align={align} sideOffset={6} className={cn("z-50 min-w-[180px] rounded-[8px] border border-line-strong bg-surface-2 p-1 shadow-pop rise", className)} {...p} />
    </D.Portal>
  );
}
export function DropdownItem({ className, danger, ...p }: React.ComponentProps<typeof D.Item> & { danger?: boolean }) {
  return <D.Item className={cn("flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2 py-1.5 text-[13px] outline-none hover:bg-surface-3 focus:bg-surface-3 [&_svg]:size-4 [&_svg]:text-muted", danger && "text-accent [&_svg]:text-accent", className)} {...p} />;
}
export const DropdownSeparator = () => <D.Separator className="my-1 h-px bg-line" />;
export const DropdownLabel = ({ children }: { children: React.ReactNode }) => <D.Label className="px-2.5 py-1 text-xs text-muted">{children}</D.Label>;
