import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-16 w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink shadow-sm",
        "placeholder:text-muted transition-[border-color,box-shadow] duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:border-brand-blue",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
