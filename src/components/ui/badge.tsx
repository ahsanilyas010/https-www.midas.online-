import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium leading-none whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "bg-canvas text-muted border border-line",
        blue: "bg-brand-blue-tint text-brand-blue",
        // Amber = needs attention, not blocked.
        warning: "bg-warning-tint text-warning",
        // Red = do not proceed. Never used for emphasis or branding.
        danger: "bg-danger-tint text-danger",
        // Green = earned confirmation only.
        confirm: "bg-brand-green-tint text-brand-green-text",
        accent: "bg-brand-orange-tint text-brand-orange-text",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
