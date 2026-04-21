import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 text-center", className)}>
      {Icon && (
        <div className="mb-5 relative">
          <div className="absolute inset-0 bg-gradient-brand opacity-10 rounded-2xl blur-xl scale-150" />
          <div className="relative rounded-2xl bg-gradient-brand-soft p-5">
            <Icon className="h-8 w-8 text-primary" />
          </div>
        </div>
      )}
      <p className="text-base font-semibold text-foreground/80">{title}</p>
      {description && (
        <p className="mt-1.5 text-sm text-muted-foreground max-w-xs leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
