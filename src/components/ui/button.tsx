import * as React from "react";
import { cn } from "../../lib/utils";

const buttonClassName =
  "inline-flex items-center justify-center rounded-md border border-border transition-colors focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none disabled:pointer-events-none disabled:opacity-50";

export function Button({
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button type={type} className={cn(buttonClassName, className)} {...props} />
  );
}

export function LinkButton({ className, ...props }: React.ComponentProps<"a">) {
  return <a className={cn(buttonClassName, className)} {...props} />;
}
