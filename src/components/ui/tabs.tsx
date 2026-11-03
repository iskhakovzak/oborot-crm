"use client";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("inline-flex h-8 items-center gap-1 rounded-full border border-line bg-canvas p-0.5", className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn("inline-flex h-6.5 items-center rounded-full px-3 text-[10.5px] font-semibold text-ink-2 transition-colors data-[state=active]:bg-ink data-[state=active]:text-canvas hover:text-ink cursor-pointer", className)}
      {...p}
    />
  );
}
export const TabsContent = TabsPrimitive.Content;
