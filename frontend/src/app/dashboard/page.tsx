"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useTranslation } from "@/lib/i18n";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  AlertTriangle,
  Plus,
  Brain,
  Flame,
  ListTodo,
  ArrowRight,
  Sparkles,
  BookOpen,
  CalendarDays,
  Headphones,
  Target,
} from "lucide-react";
import { useRouter } from "next/navigation";

interface Task {
  id: string;
  title: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "in_progress" | "completed";
  due_date?: string;
  category: string;
  is_pinned: boolean;
}

interface TaskStats {
  total: number;
  completed: number;
  pending: number;
  in_progress: number;
  overdue: number;
  completion_rate: number;
  streak: number;
  today_completed: number;
  week_completed: number;
  category_distribution: Record<string, number>;
  daily_completion: { date: string; count: number }[];
}

interface MemoryStats {
  total: number;
  mastered: number;
  due_today: number;
  total_reviews: number;
  avg_ease: number;
  mastery_rate: number;
  domains: Record<string, number>;
  difficulties: Record<string, number>;
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const results = await Promise.all([
        api.get("/tasks/?page=1&page_size=10"),
        api.get("/tasks/stats"),
        api.get("/memory/stats"),
      ]);
      const tasksData = results[0] as any;
      const statsData = results[1] as any;
      const memoryData = results[2] as any;
      if (tasksData) {
        setTasks(tasksData.items || []);
      }
      if (statsData) {
        setStats(statsData);
      }
      if (memoryData) {
        setMemoryStats(memoryData);
      }
    } catch {
      setError("Failed to load dashboard");
    }
  }, []);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  if (loading) return <AppLayout><DashboardSkeleton /></AppLayout>;
  if (error) return <AppLayout><ErrorState message={error} onRetry={fetchData} /></AppLayout>;

  const s = {
    total: 0, completed: 0, pending: 0, in_progress: 0, overdue: 0,
    completion_rate: 0, streak: 0, today_completed: 0, week_completed: 0,
    category_distribution: {}, daily_completion: [],
    ...stats,
  };
  const m = {
    total: 0, mastered: 0, due_today: 0, total_reviews: 0,
    avg_ease: 0, mastery_rate: 0, domains: {}, difficulties: {},
    ...memoryStats,
  };
  const recentDaily = s.daily_completion.slice(-7);
  const maxDaily = Math.max(...recentDaily.map((item) => item.count), 1);

  const quickActions = [
    { icon: Plus, label: t("dashboard.newTask"), href: "/tasks", color: "text-violet-500", bg: "bg-violet-500/10" },
    { icon: Brain, label: t("dashboard.startReview"), href: "/memory", color: "text-blue-500", bg: "bg-blue-500/10" },
    { icon: BookOpen, label: t("nav.courses"), href: "/courses", color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { icon: CalendarDays, label: t("nav.schedule"), href: "/schedule", color: "text-amber-500", bg: "bg-amber-500/10" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Welcome */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.title")}</h1>
            <p className="text-muted-foreground mt-0.5">{t("dashboard.welcome")}</p>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>Mnemo</span>
          </div>
        </div>

        {/* Top Stats */}
        <div className="grid grid-cols-2 xl:grid-cols-6 gap-4">
          <StatCard
            icon={<Flame className="h-5 w-5 text-orange-500" />}
            label={t("dashboard.studyStreak")}
            value={`${s.streak}`}
            suffix={t("dashboard.days")}
            gradient="from-orange-500/10 to-amber-500/5"
          />
          <StatCard
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />}
            label={t("dashboard.completionRate")}
            value={`${Math.round(s.completion_rate)}%`}
            gradient="from-emerald-500/10 to-green-500/5"
          />
          <StatCard
            icon={<ListTodo className="h-5 w-5 text-blue-500" />}
            label={t("dashboard.todayTasks")}
            value={`${s.today_completed}`}
            gradient="from-blue-500/10 to-indigo-500/5"
          />
          <StatCard
            icon={<Brain className="h-5 w-5 text-violet-500" />}
            label={t("dashboard.todayReview")}
            value={`${m.due_today}`}
            gradient="from-violet-500/10 to-fuchsia-500/5"
          />
          <StatCard
            icon={<BookOpen className="h-5 w-5 text-cyan-500" />}
            label={t("dashboard.totalCards")}
            value={`${m.total}`}
            gradient="from-cyan-500/10 to-sky-500/5"
          />
          <StatCard
            icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
            label={t("dashboard.overdueTasks")}
            value={`${s.overdue}`}
            gradient="from-red-500/10 to-rose-500/5"
          />
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Tasks */}
          <div className="lg:col-span-2">
            <Card className="card-hover">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base font-semibold">{t("dashboard.recentTasks")}</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => router.push("/tasks")}
                  className="text-muted-foreground hover:text-foreground rounded-lg">
                  {t("tasks.title")}
                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </CardHeader>
              <CardContent>
                {tasks.length === 0 ? (
                  <EmptyState
                    title={t("dashboard.noTasks")}
                    description={t("dashboard.noTasksDesc")}
                  />
                ) : (
                  <div className="space-y-1">
                    {tasks.slice(0, 8).map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => router.push("/tasks")}
                      >
                        <div className={`h-2 w-2 rounded-full shrink-0 ${
                          task.status === "completed" ? "bg-emerald-500" :
                          task.status === "in_progress" ? "bg-amber-500" : "bg-gray-300 dark:bg-gray-600"
                        }`} />
                        <span className={`flex-1 text-sm truncate ${
                          task.status === "completed" ? "line-through text-muted-foreground" : ""
                        }`}>
                          {task.title}
                        </span>
                        <Badge variant="secondary" className="text-[11px] shrink-0 font-normal">
                          {task.category}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <div className="space-y-4">
            <Card className="card-hover overflow-hidden border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Target className="h-4 w-4 text-primary" />
                  学习状态
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">长期记忆达成</span>
                    <span className="font-mono">{Math.round(m.mastery_rate)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-primary to-cyan-400 transition-all duration-500"
                      style={{ width: `${Math.min(100, m.mastery_rate)}%` }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-muted/40 p-2">
                    <div className="text-lg font-semibold">{m.mastered}</div>
                    <div className="text-muted-foreground">已掌握</div>
                  </div>
                  <div className="rounded-xl bg-muted/40 p-2">
                    <div className="text-lg font-semibold">{m.total_reviews}</div>
                    <div className="text-muted-foreground">复习次数</div>
                  </div>
                  <div className="rounded-xl bg-muted/40 p-2">
                    <div className="text-lg font-semibold">{m.avg_ease.toFixed(2)}</div>
                    <div className="text-muted-foreground">平均难度</div>
                  </div>
                </div>
                <Button className="w-full rounded-xl" onClick={() => router.push("/memory")}>
                  进入学习
                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </CardContent>
            </Card>

            <Card className="card-hover">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">{t("dashboard.quickActions")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {quickActions.map((action) => (
                  <Button
                    key={action.href}
                    variant="ghost"
                    className="w-full justify-start gap-3 h-10 rounded-xl hover:bg-muted/50 transition-colors"
                    onClick={() => router.push(action.href)}
                  >
                    <div className={`p-1.5 rounded-lg ${action.bg}`}>
                      <action.icon className={`h-4 w-4 ${action.color}`} />
                    </div>
                    {action.label}
                  </Button>
                ))}
              </CardContent>
            </Card>

            {recentDaily.length > 0 && (
              <Card className="card-hover">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">{t("dashboard.weeklyOverview")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex h-28 items-end gap-2">
                    {recentDaily.map((item) => (
                      <div key={item.date} className="flex flex-1 flex-col items-center gap-1">
                        <div
                          className="w-full rounded-t-lg bg-gradient-to-t from-primary to-violet-300 transition-all duration-500"
                          style={{ height: `${Math.max(8, (item.count / maxDaily) * 96)}px` }}
                          title={`${item.date}: ${item.count}`}
                        />
                        <span className="text-[10px] text-muted-foreground">
                          {item.date.slice(5)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Category Breakdown */}
            {s.category_distribution && Object.keys(s.category_distribution).length > 0 && (
              <Card className="card-hover">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">{t("dashboard.taskStats")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(s.category_distribution)
                      .sort(([, a], [, b]) => b - a)
                      .map(([cat, count]) => (
                        <div key={cat} className="flex items-center justify-between">
                          <span className="text-sm">{cat}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-20 bg-muted rounded-full h-1.5">
                              <div
                                className="bg-gradient-to-r from-primary to-violet-400 h-1.5 rounded-full transition-all duration-500"
                                style={{ width: `${s.total > 0 ? (count / s.total) * 100 : 0}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-5 text-right">{count}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function StatCard({
  icon,
  label,
  value,
  suffix,
  gradient,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix?: string;
  gradient: string;
}) {
  return (
    <Card className="card-hover">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl bg-gradient-to-br ${gradient}`}>
            {icon}
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight">
              {value}
              {suffix && <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span>}
            </div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
