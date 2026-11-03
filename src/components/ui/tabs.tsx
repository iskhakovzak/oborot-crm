"use client";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("inline-flex h-8 items-center gap-0.5 rounded-[7px] bg-surface-3 p-0.5", className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn("inline-flex h-7 items-center rounded-[6px] px-2.5 text-[12.5px] font-medium text-ink-2 transition-colors data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-[0_1px_2px_rgba(24,24,27,0.08)] cursor-pointer", className)}
      {...p}
    />
  );
}
export const TabsContent = TabsPrimitive.Content;
