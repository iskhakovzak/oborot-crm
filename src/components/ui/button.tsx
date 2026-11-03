import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer select-none active:translate-y-px",
  {
    variants: {
      variant: {
        primary: "bg-brand-gradient text-white shadow-brand hover:brightness-110",
        secondary: "bg-surface text-ink border border-line-strong shadow-card hover:bg-surface-2 hover:border-[#bfc4d4]",
        ghost: "text-ink-2 hover:bg-ink/5 hover:text-ink",
        danger: "bg-accent text-white hover:brightness-110",
        good: "bg-good text-white hover:brightness-110",
        soft: "bg-brand-soft text-brand-ink hover:bg-[#e1ddfb]",
        link: "text-brand underline-offset-4 hover:underline px-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-9.5 px-4 text-sm",
        lg: "h-11 px-5 text-[15px]",
        icon: "h-9.5 w-9.5",
        iconSm: "h-8 w-8",
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
