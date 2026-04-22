"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { useTranslation } from "@/lib/i18n";
import { LayoutDashboard, CheckSquare, Brain, CalendarDays, Headphones, Settings, BookOpen } from "lucide-react";
import { useSettingsStore } from "@/stores/settings";
import { api } from "@/lib/api";
import { canSendReminderNow, isWithinQuietHours, todayKey } from "@/lib/notifications";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hydrate } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const {
    enableReviewReminder,
    reminderTime,
    quietHoursStart,
    quietHoursEnd,
    hydrate: hydrateSettings,
  } = useSettingsStore();

  const mobileNavItems = [
    { href: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
    { href: "/tasks", label: t("nav.tasks"), icon: CheckSquare },
    { href: "/memory", label: t("nav.memory"), icon: Brain },
    { href: "/practice", label: "练习", icon: BookOpen },
    { href: "/schedule", label: t("nav.schedule"), icon: CalendarDays },
    { href: "/courses", label: t("nav.courses"), icon: Headphones },
    { href: "/settings", label: t("nav.settings"), icon: Settings },
  ];

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    hydrateSettings();
  }, [hydrateSettings]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated || !enableReviewReminder) return;
    if (typeof window === "undefined") return;

    const requestPermissionIfNeeded = async () => {
      if (!("Notification" in window)) return;
      if (Notification.permission === "default") {
        try {
          await Notification.requestPermission();
        } catch {
          // no-op
        }
      }
    };

    const trySendReminder = async () => {
      const now = new Date();
      if (isWithinQuietHours(now, quietHoursStart, quietHoursEnd)) return;
      if (!canSendReminderNow(now, reminderTime)) return;

      const sentKey = `mnemo_reminder_sent_${todayKey()}`;
      if (localStorage.getItem(sentKey) === "1") return;

      try {
        const [memoryStats, taskStats] = await Promise.all([
          api.get("/memory/stats") as Promise<any>,
          api.get("/tasks/stats") as Promise<any>,
        ]);
        const dueCount = Number(memoryStats?.due_today || 0);
        const pendingCount = Number(taskStats?.pending || 0);
        const overdueCount = Number(taskStats?.overdue || 0);

        if (dueCount <= 0 && pendingCount <= 0 && overdueCount <= 0) {
          localStorage.setItem(sentKey, "1");
          return;
        }

        const title = t("notifications.dailyReminderTitle");
        const body = t("notifications.dailyReminderBody", {
          due: dueCount,
          pending: pendingCount,
          overdue: overdueCount,
        });

        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(title, { body });
        } else {
          // fallback when browser notification permission is unavailable
          console.info(`[Mnemo Reminder] ${title}: ${body}`);
        }

        localStorage.setItem(sentKey, "1");
      } catch {
        // ignore polling errors
      }
    };

    requestPermissionIfNeeded();
    trySendReminder();
    const intervalId = window.setInterval(trySendReminder, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [
    isAuthenticated,
    enableReviewReminder,
    reminderTime,
    quietHoursStart,
    quietHoursEnd,
    t,
  ]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-page">
      <Sidebar />
      <main className="md:ml-64 p-4 md:p-6 min-h-screen pb-24 md:pb-6">
        <div className="animate-fade-in-up">
          {children}
        </div>
      </main>
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-6 gap-1 px-2 py-2">
          {mobileNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-1 text-[11px] ${
                pathname === item.href || pathname.startsWith(item.href + "/")
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
