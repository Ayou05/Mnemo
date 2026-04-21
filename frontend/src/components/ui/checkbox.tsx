"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onCheckedChange, onChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e);
      onCheckedChange?.(e.target.checked);
    };

    return (
      <input
        type="checkbox"
        className={cn(
          "h-4 w-4 rounded border border-gray-300 dark:border-gray-600",
          "text-indigo-600 focus:ring-indigo-500 dark:focus:ring-indigo-400",
          "cursor-pointer accent-indigo-600",
          className
        )}
        ref={ref}
        onChange={handleChange}
        {...props}
      />
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
