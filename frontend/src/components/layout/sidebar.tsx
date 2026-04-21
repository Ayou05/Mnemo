"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import {
  LayoutDashboard,
  CheckSquare,
  Brain,
  Headphones,
  CalendarDays,
  Settings,
  LogOut,
  BookOpen,
  Moon,
  Sun,
  Languages,
  Sparkles,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { useLocaleStore } from "@/stores/locale";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { locale, setLocale } = useLocaleStore();
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  const navItems = [
    { href: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
    { href: "/tasks", label: t("nav.tasks"), icon: CheckSquare },
    { href: "/memory", label: t("nav.memory"), icon: Brain },
    { href: "/courses", label: t("nav.courses"), icon: Headphones },
    { href: "/schedule", label: t("nav.schedule"), icon: CalendarDays },
    { href: "/settings", label: t("nav.settings"), icon: Settings },
  ];

  return (
    <aside className="fixed inset-y-0 left-0 z-40 w-64 bg-gradient-sidebar border-r border-sidebar-border hidden md:flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-brand shadow-lg shadow-primary/20">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-base font-bold text-sidebar-foreground tracking-tight">Mnemo</h1>
          <p className="text-[10px] text-sidebar-foreground/50 font-medium tracking-wider uppercase">Study Platform</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              {/* Active indicator bar */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-brand" />
              )}
              <item.icon className={cn(
                "h-[18px] w-[18px] shrink-0 transition-colors",
                isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80"
              )} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom controls */}
      <div className="px-3 pb-3 space-y-1">
        {/* Theme & Language */}
        <div className="flex items-center gap-1 px-1 py-1">
          <Button variant="ghost" size="sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="h-8 gap-1.5 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 rounded-lg">
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
            className="h-8 gap-1.5 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 rounded-lg">
            <Languages className="h-3.5 w-3.5" />
            {locale === "zh" ? "EN" : "中"}
          </Button>
        </div>

        {/* User */}
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-sidebar-accent/30">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand text-xs font-bold text-white shrink-0 shadow-sm shadow-primary/20">
            {user?.nickname?.[0] || user?.username?.[0] || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.nickname || user?.username}</p>
            <p className="text-[11px] text-sidebar-foreground/40 truncate">{user?.email}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={logout}
            className="h-7 w-7 shrink-0 text-sidebar-foreground/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg">
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
