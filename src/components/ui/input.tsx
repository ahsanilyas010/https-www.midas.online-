import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, mono, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "flex h-9 w-full rounded-md border border-line bg-white px-3 py-1 text-sm text-ink shadow-sm",
          "transition-[border-color,box-shadow] duration-150",
          "placeholder:text-muted",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:border-brand-blue",
          "disabled:cursor-not-allowed disabled:opacity-50",
          mono && "font-mono tabular-nums",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
