import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "pressable inline-flex items-center justify-center gap-1.5 whitespace-nowrap border rounded-[6px] font-semibold cursor-pointer select-none disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-[14px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "btn-primary",
        secondary: "border-line bg-canvas text-ink-2 hover:bg-surface-2 hover:text-ink hover:border-[#5c5c5c]",
        ghost: "border-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
        danger: "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20",
        good: "border-good/40 bg-good/10 text-good hover:bg-good/20",
        soft: "border-line-strong bg-surface-2 text-ink hover:bg-surface-3",
        link: "border-transparent text-ink underline-offset-4 hover:underline px-0 h-auto",
      },
      size: {
        sm: "h-7 px-2.5 text-[10.5px]",
        md: "h-8 px-3 text-[11px]",
        lg: "h-9.5 px-4 text-[12.5px]",
        icon: "h-8 w-8 rounded-full",
        iconSm: "h-7 w-7 rounded-full",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, type, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} type={asChild ? undefined : (type ?? "button")} {...props} />;
});
Button.displayName = "Button";
export { buttonVariants };
