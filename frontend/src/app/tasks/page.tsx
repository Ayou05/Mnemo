"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useTranslation } from "@/lib/i18n";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ListSkeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus, Search, List, Trash2, Edit3, Pin, PinOff, MoreHorizontal,
  X, Check, Clock, AlertTriangle, Calendar, CalendarDays,
  ChevronLeft, ChevronRight, Upload, WandSparkles, Download,
  FileSpreadsheet, ClipboardList, History,
} from "lucide-react";

import type { Task, TaskCategory, CheckinRecord, PlanTemplate } from "@/lib/task-types";
import { PRIORITY_ORDER, isOverdue, isToday, isThisWeek, formatDate } from "@/lib/task-types";
import { TaskCard, CheckinCalendar, WeekView, MonthNav, shiftMonth } from "./components";

// ── Shared Helpers ──

type TabKey = "tasks" | "plan" | "records";

const STATUS_CHIPS = [
  { key: "all", labelKey: "tasks.all" },
  { key: "today", labelKey: "tasks.today" },
  { key: "overdue", labelKey: "tasks.overdue" },
  { key: "pending", labelKey: "tasks.statusPending" },
  { key: "in_progress", labelKey: "tasks.statusInProgress" },
  { key: "completed", labelKey: "tasks.statusCompleted" },
] as const;

const EMPTY_DRAFT = { planned_text: "", manual_text: "" };

function syncDrafts(template: PlanTemplate) {
  return Object.fromEntries(
    (template.entries || []).map((e) => [e.id, { planned_text: e.planned_text || "", manual_text: e.manual_text || "" }])
  );
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function downloadBlob(url: string, filename: string) {
  const token = localStorage.getItem("mnemo_token");
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
  const res = await fetch(`${apiBase}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("download failed");
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

type FormData = {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  category: string;
  due_date: string;
  estimated_time: string;
  tags: string[];
  subtasks: { id: string; title: string; is_completed: boolean }[];
};

const BLANK_FORM: FormData = {
  title: "", description: "", priority: "medium", category: "其他",
  due_date: "", estimated_time: "", tags: [], subtasks: [],
};

// ── Main Page ──

export default function TasksPage() {
  const { t } = useTranslation();

  // Data
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab
  const [activeTab, setActiveTab] = useState<TabKey>("tasks");

  // Records
  const [checkins, setCheckins] = useState<CheckinRecord[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(currentMonth);
  const [weekOffset, setWeekOffset] = useState(0);

  // Plan
  const [planTemplate, setPlanTemplate] = useState<PlanTemplate | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planDrafts, setPlanDrafts] = useState<Record<string, { planned_text: string; manual_text: string }>>({});

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState<FormData>(BLANK_FORM);
  const [tagInput, setTagInput] = useState("");
  const [subtaskInput, setSubtaskInput] = useState("");
  const [saving, setSaving] = useState(false);

  // ── Data Fetching ──

  const fetchTasks = useCallback(async () => {
    try {
      const res = await api.get("/tasks/?page=1&page_size=100") as any;
      if (res) setTasks(res.items || []);
    } catch { setError("Failed to load tasks"); }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await api.get("/tasks/categories") as any;
      if (res) setCategories(res || []);
    } catch { /* optional */ }
  }, []);

  const fetchCheckins = useCallback(async (month: string) => {
    try {
      const res = await api.get(`/tasks/checkin?month=${month}`) as any;
      if (res) setCheckins(res || []);
    } catch { /* optional */ }
  }, []);

  const fetchPlanTemplate = useCallback(async (month: string) => {
    try {
      const res = await api.get(`/tasks/plan-template?month=${month}`) as PlanTemplate | null;
      setPlanTemplate(res || null);
    } catch { setPlanTemplate(null); }
  }, []);

  useEffect(() => {
    Promise.all([fetchTasks(), fetchCategories()]).finally(() => setLoading(false));
  }, [fetchTasks, fetchCategories]);

  useEffect(() => {
    if (activeTab === "records") fetchCheckins(calendarMonth);
    if (activeTab === "plan") fetchPlanTemplate(calendarMonth);
  }, [activeTab, calendarMonth, fetchCheckins, fetchPlanTemplate]);

  // ── Plan Actions ──

  const importPlanTemplate = async (file: File) => {
    setPlanLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("month", calendarMonth);
      form.append("name", `${calendarMonth} 机构计划表`);
      const res = await api.postForm("/tasks/plan-template/import-docx", form) as PlanTemplate;
      setPlanTemplate(res);
      setPlanDrafts(syncDrafts(res));
      toast.success("计划模板导入成功");
    } catch { toast.error("计划模板导入失败"); }
    finally { setPlanLoading(false); }
  };

  const generateTodayPlan = async () => {
    setPlanLoading(true);
    try {
      const res = await api.post(`/tasks/plan-template/generate-today?month=${calendarMonth}`, {}) as PlanTemplate;
      setPlanTemplate(res);
      setPlanDrafts(syncDrafts(res));
      toast.success("已根据今日 ToDo 自动生成回填内容");
    } catch { toast.error("自动生成失败，请确认已导入当月模板"); }
    finally { setPlanLoading(false); }
  };

  const generateMonthPlan = async () => {
    setPlanLoading(true);
    try {
      const res = await api.post(`/tasks/plan-template/generate-month?month=${calendarMonth}`, {}) as PlanTemplate;
      setPlanTemplate(res);
      setPlanDrafts(syncDrafts(res));
      toast.success("已生成当月可生成的计划填表内容");
    } catch { toast.error("生成当月填表失败"); }
    finally { setPlanLoading(false); }
  };

  const exportPlanExcel = async () => {
    try {
      await downloadBlob(`/tasks/plan-template/export-excel?month=${calendarMonth}`, `plan_${calendarMonth}.xlsx`);
      toast.success("已导出 Excel");
    } catch { toast.error("导出 Excel 失败"); }
  };

  const exportSubmitPlanExcel = async () => {
    try {
      const validation = await api.get(`/tasks/plan-template/validate?month=${calendarMonth}`) as {
        ok: boolean; missing_days: number[]; unlocked_past_days: number[];
      };
      if (!validation.ok) {
        const msg = [
          validation.missing_days.length ? `缺内容天数: ${validation.missing_days.join(",")}` : "",
          validation.unlocked_past_days.length ? `未锁定历史天: ${validation.unlocked_past_days.join(",")}` : "",
        ].filter(Boolean).join("；");
        toast.error(`校验未通过，已阻止上交导出。${msg}`);
        return;
      }
      await downloadBlob(`/tasks/plan-template/export-submit-excel?month=${calendarMonth}`, `plan_submit_${calendarMonth}.xlsx`);
      toast.success("已导出上交版 Excel");
    } catch { toast.error("导出上交版失败"); }
  };

  const savePlanEntry = async (entryId: string) => {
    const draft = planDrafts[entryId];
    if (!draft) return;
    try {
      await api.put(`/tasks/plan-template/entry/${entryId}`, {
        planned_text: draft.planned_text || "",
        manual_text: draft.manual_text || "",
      });
      const refreshed = await api.get(`/tasks/plan-template?month=${calendarMonth}`) as PlanTemplate | null;
      setPlanTemplate(refreshed || null);
      if (refreshed) setPlanDrafts(syncDrafts(refreshed));
      toast.success("已保存该日补充内容");
    } catch { toast.error("保存失败"); }
  };

  const doCheckin = useCallback(async () => {
    const today = new Date().toISOString().split("T")[0];
    const completedCount = tasks.filter((t) => t.status === "completed").length;
    try {
      const res = await api.post("/tasks/checkin", {
        checkin_date: today, tasks_completed: completedCount,
        cards_reviewed: 0, study_minutes: 0, notes_count: 0,
      }) as any;
      if (res) { toast.success(t("tasks.checkinSuccess")); fetchCheckins(calendarMonth); }
    } catch { toast.error("Checkin failed"); }
  }, [tasks, calendarMonth, t, fetchCheckins]);

  // ── Filtered & Sorted ──

  const filteredTasks = useMemo(() => {
    let result = [...tasks];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.tags?.some((tag) => tag.toLowerCase().includes(q))
      );
    }
    if (filterStatus === "today") result = result.filter((t) => isToday(t.due_date) && t.status !== "completed");
    else if (filterStatus === "week") result = result.filter((t) => isThisWeek(t.due_date) && t.status !== "completed");
    else if (filterStatus === "overdue") result = result.filter((t) => isOverdue(t.due_date) && t.status !== "completed");
    else if (filterStatus !== "all") result = result.filter((t) => t.status === filterStatus);

    result.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      const aO = isOverdue(a.due_date) && a.status !== "completed";
      const bO = isOverdue(b.due_date) && b.status !== "completed";
      if (aO !== bO) return aO ? -1 : 1;
      const da = a.due_date || "9999-12-31", db = b.due_date || "9999-12-31";
      if (da !== db) return da.localeCompare(db);
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    });
    return result;
  }, [tasks, search, filterStatus]);

  // ── Task CRUD ──

  const openCreateDialog = () => {
    setEditingTask(null);
    setFormData({ ...BLANK_FORM, category: categories[0]?.name || "其他" });
    setDialogOpen(true);
  };

  const openEditDialog = (task: Task) => {
    setEditingTask(task);
    setFormData({
      title: task.title, description: task.description || "",
      priority: task.priority, category: task.category,
      due_date: task.due_date?.split("T")[0] || "",
      estimated_time: task.estimated_time?.toString() || "",
      tags: task.tags || [], subtasks: task.subtasks || [],
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: formData.title,
        description: formData.description || undefined,
        priority: formData.priority,
        category: formData.category,
        due_date: formData.due_date || undefined,
        estimated_time: formData.estimated_time ? parseInt(formData.estimated_time) : undefined,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
        subtasks: formData.subtasks.length > 0 ? formData.subtasks : undefined,
      };
      if (editingTask) {
        await api.put(`/tasks/${editingTask.id}`, payload);
        toast.success(t("tasks.taskUpdated"));
      } else {
        await api.post("/tasks/", payload);
        toast.success(t("tasks.taskCreated"));
      }
      setDialogOpen(false);
      fetchTasks();
    } catch { toast.error("Error saving task"); }
    finally { setSaving(false); }
  };

  const toggleComplete = async (task: Task) => {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    try { await api.put(`/tasks/${task.id}`, { status: newStatus }); fetchTasks(); }
    catch { toast.error("Error updating task"); }
  };

  const togglePin = async (task: Task) => {
    try { await api.put(`/tasks/${task.id}`, { is_pinned: !task.is_pinned }); fetchTasks(); }
    catch { toast.error("Error updating task"); }
  };

  const deleteTask = async (taskId: string) => {
    if (!confirm(t("tasks.deleteConfirm"))) return;
    try { await api.delete(`/tasks/${taskId}`); toast.success(t("tasks.taskDeleted")); fetchTasks(); }
    catch { toast.error("Error deleting task"); }
  };

  // ── Form Helpers ──

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !formData.tags.includes(tag)) {
      setFormData({ ...formData, tags: [...formData.tags, tag] });
      setTagInput("");
    }
  };

  const addSubtask = () => {
    const title = subtaskInput.trim();
    if (title) {
      setFormData({ ...formData, subtasks: [...formData.subtasks, { id: crypto.randomUUID(), title, is_completed: false }] });
      setSubtaskInput("");
    }
  };

  // ── Stats ──

  const stats = useMemo(() => {
    const completed = tasks.filter((t) => t.status === "completed").length;
    const pending = tasks.filter((t) => t.status === "pending").length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const overdue = tasks.filter((t) => isOverdue(t.due_date) && t.status !== "completed").length;
    return { total: tasks.length, completed, pending, inProgress, overdue };
  }, [tasks]);

  // ── Render ──

  if (loading) return <AppLayout><ListSkeleton count={5} /></AppLayout>;
  if (error) return <AppLayout><ErrorState message={error} onRetry={fetchTasks} /></AppLayout>;

  const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "tasks", label: t("tasks.tabTasks"), icon: List },
    { key: "plan", label: "计划", icon: ClipboardList },
    { key: "records", label: "记录", icon: History },
  ];

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("tasks.title")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {stats.total} {t("tasks.title")} · {stats.completed} {t("tasks.completed")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === "tasks" && (
              <Button onClick={openCreateDialog} className="rounded-xl bg-gradient-brand hover:opacity-90 shadow-lg shadow-primary/20 btn-press">
                <Plus className="h-4 w-4 mr-1" />{t("tasks.newTask")}
              </Button>
            )}
            {activeTab === "records" && (
              <Button onClick={doCheckin} className="rounded-xl bg-gradient-brand hover:opacity-90 shadow-lg shadow-primary/20 btn-press">
                <Check className="h-4 w-4 mr-1" />{t("tasks.checkinToday")}
              </Button>
            )}
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 bg-muted/50 backdrop-blur-sm rounded-xl p-1 border border-border/50">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === key ? "bg-card text-primary shadow-sm ring-1 ring-border/50" : "text-muted-foreground hover:text-foreground"
              }`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>

        {/* ══ TAB: TASKS ══ */}
        {activeTab === "tasks" && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-4 gap-2">
              {([
                { label: t("tasks.statusPending"), value: stats.pending, color: "text-blue-500", bg: "bg-blue-500/10" },
                { label: t("tasks.statusInProgress"), value: stats.inProgress, color: "text-amber-500", bg: "bg-amber-500/10" },
                { label: t("tasks.statusCompleted"), value: stats.completed, color: "text-emerald-500", bg: "bg-emerald-500/10" },
                { label: t("tasks.overdue"), value: stats.overdue, color: "text-red-500", bg: "bg-red-500/10" },
              ] as const).map((s) => (
                <div key={s.label} className={`${s.bg} rounded-lg px-3 py-2 text-center`}>
                  <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-[10px] text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Search + Filters */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder={t("tasks.searchPlaceholder")} value={search}
                  onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted">
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {STATUS_CHIPS.map((chip) => (
                  <button key={chip.key}
                    onClick={() => setFilterStatus(filterStatus === chip.key ? "all" : chip.key)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                      filterStatus === chip.key ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/60 text-muted-foreground hover:bg-muted"
                    }`}>
                    {t(chip.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {/* Task List */}
            {filteredTasks.length === 0 ? (
              <EmptyState title={t("tasks.noTasks")} description={t("tasks.noTasksDesc")}
                action={<Button onClick={openCreateDialog}><Plus className="h-4 w-4 mr-1" />{t("tasks.newTask")}</Button>} />
            ) : (
              <div className="space-y-2">
                {filteredTasks.map((task) => (
                  <TaskCard key={task.id} task={task} t={t}
                    onToggleComplete={() => toggleComplete(task)}
                    onTogglePin={() => togglePin(task)}
                    onEdit={() => openEditDialog(task)}
                    onDelete={() => deleteTask(task.id)} />
                ))}
              </div>
            )}
          </>
        )}

        {/* ══ TAB: PLAN ══ */}
        {activeTab === "plan" && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <MonthNav month={calendarMonth} onChange={setCalendarMonth} />
                <div className="flex gap-1.5 flex-wrap">
                  <label className="inline-flex">
                    <input type="file" accept=".docx" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) importPlanTemplate(f); e.currentTarget.value = ""; }} />
                    <Button variant="outline" size="sm" disabled={planLoading}>
                      <Upload className="h-3.5 w-3.5 mr-1" />导入模板
                    </Button>
                  </label>
                  <Button size="sm" onClick={generateTodayPlan} disabled={planLoading || !planTemplate}>
                    <WandSparkles className="h-3.5 w-3.5 mr-1" />回填今日
                  </Button>
                  <Button size="sm" variant="outline" onClick={generateMonthPlan} disabled={planLoading || !planTemplate}>批量回填</Button>
                  <Button size="sm" variant="outline" onClick={exportPlanExcel} disabled={!planTemplate}>
                    <Download className="h-3.5 w-3.5 mr-1" />导出
                  </Button>
                  <Button size="sm" onClick={exportSubmitPlanExcel} disabled={!planTemplate}>
                    <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />上交版
                  </Button>
                </div>
              </div>

              {planTemplate ? (
                <div className="rounded-lg border overflow-hidden">
                  <div className="max-h-[60vh] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                        <tr className="border-b text-left">
                          <th className="px-3 py-2 w-10">日</th>
                          <th className="px-3 py-2 w-1/4">计划内容</th>
                          <th className="px-3 py-2 w-1/4">自动回填</th>
                          <th className="px-3 py-2 w-1/4">手工补充</th>
                          <th className="px-3 py-2 w-16 text-center">状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        {planTemplate.entries.map((entry) => (
                          <tr key={entry.id} className="border-b last:border-b-0 hover:bg-muted/30">
                            <td className="px-3 py-2 font-medium">{entry.day}</td>
                            <td className="px-3 py-2">
                              <textarea value={planDrafts[entry.id]?.planned_text ?? entry.planned_text ?? ""}
                                onChange={(e) => setPlanDrafts((prev) => ({
                                  ...prev, [entry.id]: { ...(prev[entry.id] || EMPTY_DRAFT), planned_text: e.target.value }
                                }))}
                                className="w-full min-h-10 rounded border bg-transparent px-1.5 py-1 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary/30" />
                            </td>
                            <td className="px-3 py-2 whitespace-pre-wrap text-muted-foreground">
                              {entry.actual_text || <span className="text-muted-foreground/50">待回填</span>}
                            </td>
                            <td className="px-3 py-2">
                              <textarea value={planDrafts[entry.id]?.manual_text ?? entry.manual_text ?? ""}
                                onChange={(e) => setPlanDrafts((prev) => ({
                                  ...prev, [entry.id]: { ...(prev[entry.id] || EMPTY_DRAFT), manual_text: e.target.value }
                                }))}
                                onBlur={() => savePlanEntry(entry.id)}
                                placeholder="补充说明..."
                                className="w-full min-h-10 rounded border bg-transparent px-1.5 py-1 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary/30" />
                            </td>
                            <td className="px-3 py-2 text-center">
                              {entry.locked ? (
                                <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">已锁定</Badge>
                              ) : entry.actual_text ? (
                                <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">已回填</Badge>
                              ) : (
                                <span className="text-muted-foreground/50">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">尚未导入计划模板</p>
                  <p className="text-xs mt-1">上传机构的 .docx 模板文件开始使用</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ══ TAB: RECORDS ══ */}
        {activeTab === "records" && (
          <>
            <CheckinCalendar t={t} month={calendarMonth} onMonthChange={setCalendarMonth} checkins={checkins} />
            <WeekView t={t} tasks={tasks} weekOffset={weekOffset} onWeekChange={setWeekOffset} onToggleComplete={toggleComplete} />
          </>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTask ? t("tasks.editTask") : t("tasks.newTask")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Title */}
            <div>
              <label className="text-sm font-medium">{t("tasks.taskTitle")}</label>
              <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={t("tasks.taskTitlePlaceholder")} className="mt-1" />
            </div>
            {/* Description */}
            <div>
              <label className="text-sm font-medium">{t("tasks.description")}</label>
              <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t("tasks.descriptionPlaceholder")} rows={3}
                className="mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            {/* Priority + Category */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("tasks.priority")}</label>
                <select value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value as FormData["priority"] })}
                  className="mt-1 w-full h-9 rounded-md border border-border bg-card px-3 text-sm">
                  <option value="high">{t("tasks.priorityHigh")}</option>
                  <option value="medium">{t("tasks.priorityMedium")}</option>
                  <option value="low">{t("tasks.priorityLow")}</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">{t("tasks.category")}</label>
                <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="mt-1 w-full h-9 rounded-md border border-border bg-card px-3 text-sm">
                  {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                  <option value="其他">其他</option>
                </select>
              </div>
            </div>
            {/* Due Date + Estimated Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("tasks.dueDate")}</label>
                <Input type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">{t("tasks.estimatedTime")}</label>
                <Input type="number" min="0" value={formData.estimated_time} onChange={(e) => setFormData({ ...formData, estimated_time: e.target.value })} placeholder="30" className="mt-1" />
              </div>
            </div>
            {/* Tags */}
            <div>
              <label className="text-sm font-medium">{t("tasks.tags")}</label>
              <div className="mt-1 flex flex-wrap gap-1.5 mb-2">
                {formData.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button onClick={() => setFormData({ ...formData, tags: formData.tags.filter((t) => t !== tag) })}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                  placeholder={t("tasks.tagsPlaceholder")} className="flex-1" />
                <Button variant="outline" size="sm" onClick={addTag}><Plus className="h-3 w-3" /></Button>
              </div>
            </div>
            {/* Subtasks */}
            <div>
              <label className="text-sm font-medium">{t("tasks.subtasks")}</label>
              <div className="mt-1 space-y-1.5 mb-2">
                {formData.subtasks.map((sub) => (
                  <div key={sub.id} className="flex items-center gap-2">
                    <Checkbox checked={sub.is_completed}
                      onCheckedChange={() => setFormData({
                        ...formData,
                        subtasks: formData.subtasks.map((s) => s.id === sub.id ? { ...s, is_completed: !s.is_completed } : s),
                      })} />
                    <span className={`flex-1 text-sm ${sub.is_completed ? "line-through text-muted-foreground" : ""}`}>{sub.title}</span>
                    <button onClick={() => setFormData({ ...formData, subtasks: formData.subtasks.filter((s) => s.id !== sub.id) })}
                      className="p-0.5 rounded hover:bg-muted">
                      <X className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={subtaskInput} onChange={(e) => setSubtaskInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSubtask())}
                  placeholder="添加子任务..." className="flex-1" />
                <Button variant="outline" size="sm" onClick={addSubtask}><Plus className="h-3 w-3" /></Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSave} disabled={saving || !formData.title.trim()}>
              {saving ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

