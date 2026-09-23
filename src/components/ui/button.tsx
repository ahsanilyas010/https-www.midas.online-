import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-sm font-medium " +
    "transition-[background-color,box-shadow,transform] duration-150 ease-out " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-blue " +
    "disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] cursor-pointer",
  {
    variants: {
      variant: {
        // Primary blue — the only brand colour that carries white text.
        primary:
          "bg-brand-gradient bg-[length:150%_100%] bg-left text-white shadow-sm shadow-brand-blue/30 hover:-translate-y-px hover:bg-right hover:shadow-lg hover:shadow-violet/30 transition-[background-position,box-shadow,transform]",
        // DialDesk gold — the signature highlight action.
        gold:
          "bg-gold-gradient text-ink shadow-sm shadow-gold/30 hover:-translate-y-px hover:brightness-105 hover:shadow-lg hover:shadow-gold/40",
        // Zoom-blue for meeting actions.
        zoom:
          "bg-[#0b5cff] text-white shadow-sm hover:-translate-y-px hover:bg-[#0a4fdb] hover:shadow-lg hover:shadow-[#0b5cff]/30",
        // Attention accent — dark ink text on orange, never white.
        accent:
          "bg-brand-orange text-ink shadow-sm hover:-translate-y-px hover:brightness-95 hover:shadow-md hover:shadow-brand-orange/30",
        // Confirmation — dark ink text on green, never white.
        confirm:
          "bg-brand-green text-ink shadow-sm hover:-translate-y-px hover:brightness-95 hover:shadow-md hover:shadow-brand-green/30",
        secondary:
          "bg-white text-ink border border-line shadow-sm hover:-translate-y-px hover:bg-canvas hover:border-brand-blue-tint-2 hover:shadow-md",
        ghost: "text-ink hover:bg-canvas",
        danger:
          "bg-danger text-white shadow-sm hover:-translate-y-px hover:brightness-90 hover:shadow-md hover:shadow-danger/30",
        link: "text-brand-blue underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-2.5 text-xs",
        default: "h-9 px-4",
        lg: "h-11 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
