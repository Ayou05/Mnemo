"use client";

import { cn } from "@/lib/utils";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "出错了",
  message = "加载失败，请稍后重试",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 text-center", className)}>
      <div className="mb-5 relative">
        <div className="absolute inset-0 bg-destructive/10 rounded-2xl blur-xl scale-150" />
        <div className="relative rounded-2xl bg-destructive/10 p-5">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
      </div>
      <p className="text-base font-semibold text-foreground/80">{title}</p>
      <p className="mt-1.5 text-sm text-muted-foreground max-w-xs leading-relaxed">{message}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}
          className="mt-5 gap-2 rounded-xl border-border/50 hover:bg-muted/50 btn-press">
          <RefreshCw className="h-4 w-4" />
          重试
        </Button>
      )}
    </div>
  );
}
