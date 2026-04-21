"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { useTranslation } from "@/lib/i18n";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ListSkeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Search,
  List,
  LayoutGrid,
  Trash2,
  Edit3,
  Pin,
  PinOff,
  MoreHorizontal,
  X,
  Check,
  Clock,
  AlertTriangle,
  ChevronDown,
  Filter,
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Flame,
  Upload,
  WandSparkles,
  Download,
  FileSpreadsheet,
  Settings,
} from "lucide-react";

// ── Types ──

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: "high" | "medium" | "low";
  category: string;
  status: "pending" | "in_progress" | "completed";
  due_date?: string;
  estimated_time?: number;
  tags?: string[];
  subtasks?: Subtask[];
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

interface Subtask {
  id: string;
  title: string;
  is_completed: boolean;
}

interface TaskCategory {
  id: string;
  name: string;
  color: string;
  icon?: string;
  sort_order: number;
}

interface CheckinRecord {
  id: string;
  checkin_date: string;
  tasks_completed: number;
  cards_reviewed: number;
  study_minutes: number;
  notes_count: number;
}

interface PlanTemplateEntry {
  id: string;
  day: number;
  planned_text: string;
  actual_text?: string;
  manual_text?: string;
  completion_rate?: number;
  locked: boolean;
}

interface PlanTemplate {
  id: string;
  name: string;
  month: string;
  source_filename?: string;
  export_mapping?: string;
  entries: PlanTemplateEntry[];
}

interface PlanExportMapping {
  date_col: string;
  plan_col: string;
  auto_col: string;
  manual_col: string;
  final_col: string;
  rate_col: string;
  lock_col: string;
  morning_col?: string;
  afternoon_col?: string;
  evening_col?: string;
}

interface GlobalSearchItem {
  id: string;
  title: string;
  subtitle?: string;
  type: string;
}

interface GlobalSearchResult {
  tasks: GlobalSearchItem[];
  memory_cards: GlobalSearchItem[];
  course_notes: GlobalSearchItem[];
  schedule_entries: GlobalSearchItem[];
}

// ── Helpers ──

const PRIORITY_COLORS = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dueDate) < today;
}

function isToday(dueDate?: string): boolean {
  if (!dueDate) return false;
  const today = new Date().toISOString().split("T")[0];
  return dueDate.startsWith(today);
}

function isThisWeek(dueDate?: string): boolean {
  if (!dueDate) return false;
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + 1);
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  const d = new Date(dueDate);
  return d >= startOfWeek && d <= endOfWeek;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dDate = new Date(d);
  dDate.setHours(0, 0, 0, 0);

  if (dDate.getTime() === today.getTime()) return "今天";
  if (dDate.getTime() === tomorrow.getTime()) return "明天";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── Component ──

export default function TasksPage() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab
  const [activeTab, setActiveTab] = useState<"tasks" | "calendar" | "week">("tasks");

  // Checkin
  const [checkins, setCheckins] = useState<CheckinRecord[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [weekOffset, setWeekOffset] = useState(0);
  const [planTemplate, setPlanTemplate] = useState<PlanTemplate | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planDrafts, setPlanDrafts] = useState<Record<string, { planned_text: string; manual_text: string }>>({});
  const [mapping, setMapping] = useState<PlanExportMapping>({
    date_col: "日期",
    plan_col: "计划内容",
    auto_col: "自动回填",
    manual_col: "手工补充",
    final_col: "最终上交内容",
    rate_col: "完成率",
    lock_col: "锁定",
  });

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("created");
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [globalQuery, setGlobalQuery] = useState("");
  const [globalSearching, setGlobalSearching] = useState(false);
  const [globalResults, setGlobalResults] = useState<GlobalSearchResult>({
    tasks: [],
    memory_cards: [],
    course_notes: [],
    schedule_entries: [],
  });
  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium" as "high" | "medium" | "low",
    category: "其他",
    due_date: "",
    estimated_time: "",
    tags: [] as string[],
    subtasks: [] as { id: string; title: string; is_completed: boolean }[],
  });
  const [tagInput, setTagInput] = useState("");
  const [subtaskInput, setSubtaskInput] = useState("");
  const [saving, setSaving] = useState(false);
  const taskListAnchorRef = useRef<HTMLDivElement | null>(null);

  // ── Data Fetching ──

  const fetchTasks = useCallback(async () => {
    try {
      const res = await api.get("/tasks/?page=1&page_size=100") as any;
      if (res) {
        setTasks(res.items || []);
      }
    } catch {
      setError("Failed to load tasks");
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await api.get("/tasks/categories") as any;
      if (res) {
        setCategories(res || []);
      }
    } catch {
      // Categories are optional
    }
  }, []);

  const fetchCheckins = useCallback(async (month: string) => {
    try {
      const res = await api.get(`/tasks/checkin?month=${month}`) as any;
      if (res) {
        setCheckins(res || []);
      }
    } catch {
      // Checkins are optional
    }
  }, []);

  const fetchPlanTemplate = useCallback(async (month: string) => {
    try {
      const res = await api.get(`/tasks/plan-template?month=${month}`) as PlanTemplate | null;
      setPlanTemplate(res || null);
      if (res?.export_mapping) {
        try {
          const parsed = JSON.parse(res.export_mapping) as PlanExportMapping;
          setMapping((prev) => ({ ...prev, ...parsed }));
        } catch {}
      }
    } catch {
      setPlanTemplate(null);
    }
  }, []);

  const doCheckin = useCallback(async () => {
    const today = new Date().toISOString().split("T")[0];
    const completedCount = tasks.filter(t => t.status === "completed").length;
    try {
      const res = await api.post("/tasks/checkin", {
        checkin_date: today,
        tasks_completed: completedCount,
        cards_reviewed: 0,
        study_minutes: 0,
        notes_count: 0,
      }) as any;
      if (res) {
        toast.success(t("tasks.checkinSuccess"));
        fetchCheckins(calendarMonth);
      }
    } catch {
      toast.error("Checkin failed");
    }
  }, [tasks, calendarMonth, t, fetchCheckins]);

  useEffect(() => {
    Promise.all([fetchTasks(), fetchCategories()]).finally(() => setLoading(false));
  }, [fetchTasks, fetchCategories]);

  useEffect(() => {
    if (activeTab === "calendar") {
      fetchCheckins(calendarMonth);
    }
    fetchPlanTemplate(calendarMonth);
  }, [activeTab, calendarMonth, fetchCheckins, fetchPlanTemplate]);

  const importPlanTemplate = async (file: File) => {
    setPlanLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("month", calendarMonth);
      form.append("name", `${calendarMonth} 机构计划表`);
      const res = await api.postForm("/tasks/plan-template/import-docx", form) as PlanTemplate;
      setPlanTemplate(res);
      setPlanDrafts(Object.fromEntries((res.entries || []).map((e) => [e.id, { planned_text: e.planned_text || "", manual_text: e.manual_text || "" }])));
      toast.success("计划模板导入成功");
    } catch {
      toast.error("计划模板导入失败");
    } finally {
      setPlanLoading(false);
    }
  };

  const generateTodayPlan = async () => {
    setPlanLoading(true);
    try {
      const res = await api.post(`/tasks/plan-template/generate-today?month=${calendarMonth}`, {}) as PlanTemplate;
      setPlanTemplate(res);
      setPlanDrafts(Object.fromEntries((res.entries || []).map((e) => [e.id, { planned_text: e.planned_text || "", manual_text: e.manual_text || "" }])));
      toast.success("已根据今日 ToDo 自动生成回填内容");
    } catch {
      toast.error("自动生成失败，请确认已导入当月模板");
    } finally {
      setPlanLoading(false);
    }
  };

  const exportPlanExcel = async () => {
    try {
      const token = localStorage.getItem("mnemo_token");
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://106.53.10.184:8000/api/v1";
      const res = await fetch(`${apiBase}/tasks/plan-template/export-excel?month=${calendarMonth}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `plan_${calendarMonth}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("已导出 Excel");
    } catch {
      toast.error("导出 Excel 失败");
    }
  };

  const exportSubmitPlanExcel = async () => {
    try {
      const validation = await api.get(`/tasks/plan-template/validate?month=${calendarMonth}`) as {
        ok: boolean;
        missing_days: number[];
        unlocked_past_days: number[];
      };
      if (!validation.ok) {
        const msg = [
          validation.missing_days.length ? `缺内容天数: ${validation.missing_days.join(",")}` : "",
          validation.unlocked_past_days.length ? `未锁定历史天: ${validation.unlocked_past_days.join(",")}` : "",
        ].filter(Boolean).join("；");
        toast.error(`校验未通过，已阻止上交导出。${msg}`);
        return;
      }
      const token = localStorage.getItem("mnemo_token");
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://106.53.10.184:8000/api/v1";
      const res = await fetch(`${apiBase}/tasks/plan-template/export-submit-excel?month=${calendarMonth}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `plan_submit_${calendarMonth}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("已导出上交版 Excel");
    } catch {
      toast.error("导出上交版失败");
    }
  };

  const validatePlanTemplate = async () => {
    try {
      const res = await api.get(`/tasks/plan-template/validate?month=${calendarMonth}`) as {
        ok: boolean;
        missing_days: number[];
        unlocked_past_days: number[];
      };
      if (res.ok) {
        toast.success("校验通过，可直接上交");
      } else {
        const msg = [
          res.missing_days.length ? `缺内容天数: ${res.missing_days.join(",")}` : "",
          res.unlocked_past_days.length ? `未锁定历史天: ${res.unlocked_past_days.join(",")}` : "",
        ].filter(Boolean).join("；");
        toast.error(msg || "校验未通过");
      }
    } catch {
      toast.error("校验失败");
    }
  };

  const saveExportMapping = async () => {
    try {
      await api.put(`/tasks/plan-template/export-mapping?month=${calendarMonth}`, mapping);
      toast.success("导出字段映射已保存");
      fetchPlanTemplate(calendarMonth);
    } catch {
      toast.error("保存映射失败");
    }
  };

  const generateMonthPlan = async () => {
    setPlanLoading(true);
    try {
      const res = await api.post(`/tasks/plan-template/generate-month?month=${calendarMonth}`, {}) as PlanTemplate;
      setPlanTemplate(res);
      setPlanDrafts(Object.fromEntries((res.entries || []).map((e) => [e.id, { planned_text: e.planned_text || "", manual_text: e.manual_text || "" }])));
      toast.success("已生成当月可生成的计划填表内容");
    } catch {
      toast.error("生成当月填表失败");
    } finally {
      setPlanLoading(false);
    }
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
      if (refreshed) {
        setPlanDrafts(Object.fromEntries((refreshed.entries || []).map((e) => [e.id, { planned_text: e.planned_text || "", manual_text: e.manual_text || "" }])));
      }
      toast.success("已保存该日补充内容");
    } catch {
      toast.error("保存失败");
    }
  };

  const runGlobalSearch = async () => {
    const keyword = globalQuery.trim();
    if (!keyword) {
      toast.error("请输入搜索关键词");
      return;
    }
    setGlobalSearching(true);
    try {
      const res = await api.get(`/system/search/global?q=${encodeURIComponent(keyword)}&limit=6`) as GlobalSearchResult;
      setGlobalResults(res || { tasks: [], memory_cards: [], course_notes: [], schedule_entries: [] });
      const total =
        (res?.tasks?.length || 0) +
        (res?.memory_cards?.length || 0) +
        (res?.course_notes?.length || 0) +
        (res?.schedule_entries?.length || 0);
      toast.success(`已检索到 ${total} 条相关记录`);
    } catch {
      toast.error("全局搜索失败");
    } finally {
      setGlobalSearching(false);
    }
  };

  const jumpToTaskFromSearch = (item: GlobalSearchItem) => {
    setActiveTab("tasks");
    setSearch(item.title);
    setTimeout(() => {
      taskListAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    toast.success("已定位到任务列表并应用筛选");
  };

  // ── Filtered & Sorted ──

  const filteredTasks = useMemo(() => {
    let result = [...tasks];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.tags?.some((tag) => tag.toLowerCase().includes(q))
      );
    }

    if (filterStatus === "today") {
      result = result.filter((t) => isToday(t.due_date) && t.status !== "completed");
    } else if (filterStatus === "week") {
      result = result.filter((t) => isThisWeek(t.due_date) && t.status !== "completed");
    } else if (filterStatus === "overdue") {
      result = result.filter((t) => isOverdue(t.due_date) && t.status !== "completed");
    } else if (filterStatus !== "all") {
      result = result.filter((t) => t.status === filterStatus);
    }

    if (filterCategory !== "all") {
      result = result.filter((t) => t.category === filterCategory);
    }

    if (filterPriority !== "all") {
      result = result.filter((t) => t.priority === filterPriority);
    }

    // Sort: pinned first, then by criteria
    result.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      if (sortBy === "due") {
        const da = a.due_date || "9999-12-31";
        const db = b.due_date || "9999-12-31";
        return da.localeCompare(db);
      }
      if (sortBy === "priority") {
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      }
      if (sortBy === "updated") {
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return result;
  }, [tasks, search, filterStatus, filterCategory, filterPriority, sortBy]);

  // ── Actions ──

  const openCreateDialog = () => {
    setEditingTask(null);
    setFormData({
      title: "",
      description: "",
      priority: "medium",
      category: categories[0]?.name || "其他",
      due_date: "",
      estimated_time: "",
      tags: [],
      subtasks: [],
    });
    setDialogOpen(true);
  };

  const openEditDialog = (task: Task) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      category: task.category,
      due_date: task.due_date?.split("T")[0] || "",
      estimated_time: task.estimated_time?.toString() || "",
      tags: task.tags || [],
      subtasks: task.subtasks || [],
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
    } catch {
      toast.error("Error saving task");
    } finally {
      setSaving(false);
    }
  };

  const toggleComplete = async (task: Task) => {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    try {
      await api.put(`/tasks/${task.id}`, { status: newStatus });
      fetchTasks();
    } catch {
      toast.error("Error updating task");
    }
  };

  const togglePin = async (task: Task) => {
    try {
      await api.put(`/tasks/${task.id}`, { is_pinned: !task.is_pinned });
      fetchTasks();
    } catch {
      toast.error("Error updating task");
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!confirm(t("tasks.deleteConfirm"))) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      toast.success(t("tasks.taskDeleted"));
      fetchTasks();
    } catch {
      toast.error("Error deleting task");
    }
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !formData.tags.includes(tag)) {
      setFormData({ ...formData, tags: [...formData.tags, tag] });
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setFormData({ ...formData, tags: formData.tags.filter((t) => t !== tag) });
  };

  const addSubtask = () => {
    const title = subtaskInput.trim();
    if (title) {
      setFormData({
        ...formData,
        subtasks: [
          ...formData.subtasks,
          { id: crypto.randomUUID(), title, is_completed: false },
        ],
      });
      setSubtaskInput("");
    }
  };

  const toggleSubtask = (id: string) => {
    setFormData({
      ...formData,
      subtasks: formData.subtasks.map((s) =>
        s.id === id ? { ...s, is_completed: !s.is_completed } : s
      ),
    });
  };

  const removeSubtask = (id: string) => {
    setFormData({
      ...formData,
      subtasks: formData.subtasks.filter((s) => s.id !== id),
    });
  };

  const hasActiveFilters =
    filterStatus !== "all" || filterCategory !== "all" || filterPriority !== "all" || search;

  // ── Stats ──

  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === "completed").length;
    const pending = tasks.filter((t) => t.status === "pending").length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const overdue = tasks.filter((t) => isOverdue(t.due_date) && t.status !== "completed").length;
    return { total, completed, pending, inProgress, overdue, streak: 0 };
  }, [tasks]);

  // ── Render ──

  if (loading) return <AppLayout><ListSkeleton count={5} /></AppLayout>;
  if (error) return <AppLayout><ErrorState message={error} onRetry={fetchTasks} /></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-6">
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
                <Plus className="h-4 w-4 mr-1" />
                {t("tasks.newTask")}
              </Button>
            )}
            {activeTab === "calendar" && (
              <Button onClick={doCheckin} className="rounded-xl bg-gradient-brand hover:opacity-90 shadow-lg shadow-primary/20 btn-press">
                <Check className="h-4 w-4 mr-1" />
                {t("tasks.checkinToday")}
              </Button>
            )}
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 bg-muted/50 backdrop-blur-sm rounded-xl p-1 border border-border/50">
          {([
            { key: "tasks" as const, label: t("tasks.tabTasks"), icon: List },
            { key: "calendar" as const, label: t("tasks.tabCalendar"), icon: Calendar },
            { key: "week" as const, label: t("tasks.tabWeek"), icon: CalendarDays },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === key
                  ? "bg-card text-primary shadow-sm ring-1 ring-border/50"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Stats Bar */}
        {activeTab === "tasks" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: t("tasks.statusPending"), value: stats.pending, gradient: "from-blue-500 to-blue-400", bg: "bg-blue-500/10" },
            { label: t("tasks.statusInProgress"), value: stats.inProgress, gradient: "from-amber-500 to-orange-400", bg: "bg-amber-500/10" },
            { label: t("tasks.statusCompleted"), value: stats.completed, gradient: "from-emerald-500 to-green-400", bg: "bg-emerald-500/10" },
            { label: t("tasks.overdue"), value: stats.overdue, gradient: "from-red-500 to-rose-400", bg: "bg-red-500/10" },
          ].map((s) => (
            <Card key={s.label} className="card-hover">
              <CardContent className="p-3.5">
                <div className="flex items-center gap-2.5">
                  <div className={`p-1.5 rounded-lg bg-gradient-to-br ${s.gradient}`}>
                    <div className="h-2 w-2 rounded-full bg-white/80" />
                  </div>
                  <div>
                    <div className="text-xl font-bold tracking-tight">{s.value}</div>
                    <div className="text-[11px] text-muted-foreground">{s.label}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        )}

        {/* Toolbar */}
        {activeTab === "tasks" && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div>
                <p className="font-medium">全局搜索</p>
                <p className="text-xs text-muted-foreground">
                  跨任务、记忆卡、课程笔记、课表检索。数据导出与备份恢复已统一到
                  <Link href="/settings" className="text-primary underline-offset-2 hover:underline mx-0.5">设置 → 数据管理</Link>
                  ，避免多处重复入口。
                </p>
              </div>
              <Link
                href="/settings"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                <Settings className="h-4 w-4 mr-1" />
                数据管理
              </Link>
            </div>
            <div className="flex gap-2">
              <Input
                value={globalQuery}
                onChange={(e) => setGlobalQuery(e.target.value)}
                placeholder="全局搜索：任务/记忆卡/课程笔记/课表"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runGlobalSearch();
                  }
                }}
              />
              <Button onClick={runGlobalSearch} disabled={globalSearching}>
                <Search className="h-4 w-4 mr-1" />
                搜索
              </Button>
            </div>
            <div className="grid md:grid-cols-2 gap-3 text-xs">
              {[
                { key: "tasks", label: "任务", data: globalResults.tasks },
                { key: "memory_cards", label: "记忆卡", data: globalResults.memory_cards },
                { key: "course_notes", label: "课程笔记", data: globalResults.course_notes },
                { key: "schedule_entries", label: "课表", data: globalResults.schedule_entries },
              ].map((group) => (
                <div key={group.key} className="rounded-md border p-2">
                  <p className="font-medium mb-1">{group.label}（{group.data.length}）</p>
                  <div className="space-y-1 text-muted-foreground">
                    {group.data.length === 0 ? (
                      <p>-</p>
                    ) : (
                      group.data.slice(0, 4).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="truncate block w-full text-left hover:text-foreground"
                          onClick={() => {
                            if (group.key === "tasks") {
                              jumpToTaskFromSearch(item);
                            } else {
                              toast.message("该类型跳转将在后续白皮书阶段接入");
                            }
                          }}
                        >
                          {item.title}{item.subtitle ? ` · ${item.subtitle}` : ""}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        )}

        <div ref={taskListAnchorRef} />

        {activeTab === "tasks" && (
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder={t("tasks.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-9 rounded-lg border border-border/50 bg-card px-3 text-sm backdrop-blur-sm"
            >
              <option value="all">{t("tasks.all")}</option>
              <option value="pending">{t("tasks.statusPending")}</option>
              <option value="in_progress">{t("tasks.statusInProgress")}</option>
              <option value="completed">{t("tasks.statusCompleted")}</option>
              <option value="today">{t("tasks.today")}</option>
              <option value="week">{t("tasks.week")}</option>
              <option value="overdue">{t("tasks.overdue")}</option>
            </select>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="h-9 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm"
            >
              <option value="all">{t("tasks.filterByCategory")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>

            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="h-9 rounded-lg border border-border/50 bg-card px-3 text-sm backdrop-blur-sm"
            >
              <option value="all">{t("tasks.filterByPriority")}</option>
              <option value="high">{t("tasks.priorityHigh")}</option>
              <option value="medium">{t("tasks.priorityMedium")}</option>
              <option value="low">{t("tasks.priorityLow")}</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-9 rounded-lg border border-border/50 bg-card px-3 text-sm backdrop-blur-sm"
            >
              <option value="created">{t("tasks.sortCreated")}</option>
              <option value="due">{t("tasks.sortDue")}</option>
              <option value="priority">{t("tasks.sortPriority")}</option>
              <option value="updated">{t("tasks.sortUpdated")}</option>
            </select>

            {/* View Toggle */}
            <div className="flex border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 ${viewMode === "list" ? "bg-indigo-600 text-white" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400"}`}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("board")}
                className={`p-2 ${viewMode === "board" ? "bg-indigo-600 text-white" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400"}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={() => {
                setSearch("");
                setFilterStatus("all");
                setFilterCategory("all");
                setFilterPriority("all");
              }}>
                <X className="h-3 w-3 mr-1" />
                {t("tasks.clearFilters")}
              </Button>
            )}
          </div>
        </div>
        )}

        {activeTab === "tasks" && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div>
                  <p className="font-medium">机构计划表联动</p>
                  <p className="text-xs text-muted-foreground">导入 .docx 模板后，可按当天任务完成情况一键回填；历史天内容锁定不变。</p>
                </div>
                <div className="flex gap-2">
                  <label className="inline-flex">
                    <input
                      type="file"
                      accept=".docx"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) importPlanTemplate(f);
                        e.currentTarget.value = "";
                      }}
                    />
                    <Button variant="outline" disabled={planLoading}>
                      <Upload className="h-4 w-4 mr-1" />
                      导入模板
                    </Button>
                  </label>
                  <Button onClick={generateTodayPlan} disabled={planLoading || !planTemplate}>
                    <WandSparkles className="h-4 w-4 mr-1" />
                    一键生成今日填表
                  </Button>
                  <Button variant="outline" onClick={generateMonthPlan} disabled={planLoading || !planTemplate}>
                    <FileSpreadsheet className="h-4 w-4 mr-1" />
                    批量生成当月
                  </Button>
                  <Button variant="outline" onClick={exportPlanExcel} disabled={!planTemplate}>
                    <Download className="h-4 w-4 mr-1" />
                    导出 Excel
                  </Button>
                  <Button variant="outline" onClick={validatePlanTemplate} disabled={!planTemplate}>
                    校验
                  </Button>
                  <Button onClick={exportSubmitPlanExcel} disabled={!planTemplate}>
                    上交版导出
                  </Button>
                </div>
              </div>
              {planTemplate && (
                <div className="space-y-3">
                  <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
                    已自动识别模板表头并初始化导出映射，可在下方按机构模板微调。
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs font-medium mb-2">导出字段映射配置</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {[
                        ["date_col", "日期列"],
                        ["plan_col", "计划列"],
                        ["auto_col", "自动列"],
                        ["manual_col", "手工列"],
                        ["final_col", "最终列"],
                        ["rate_col", "完成率列"],
                        ["lock_col", "锁定列"],
                      ].map(([key, label]) => (
                        <Input
                          key={key}
                          value={(mapping as unknown as Record<string, string>)[key]}
                          onChange={(e) => setMapping((prev) => ({ ...prev, [key]: e.target.value }))}
                          placeholder={label}
                        />
                      ))}
                      <Input
                        value={mapping.morning_col || ""}
                        onChange={(e) => setMapping((prev) => ({ ...prev, morning_col: e.target.value }))}
                        placeholder="上午列(可选)"
                      />
                      <Input
                        value={mapping.afternoon_col || ""}
                        onChange={(e) => setMapping((prev) => ({ ...prev, afternoon_col: e.target.value }))}
                        placeholder="下午列(可选)"
                      />
                      <Input
                        value={mapping.evening_col || ""}
                        onChange={(e) => setMapping((prev) => ({ ...prev, evening_col: e.target.value }))}
                        placeholder="晚间列(可选)"
                      />
                    </div>
                    <div className="mt-2">
                      <Button size="sm" variant="outline" onClick={saveExportMapping}>保存映射</Button>
                    </div>
                  </div>
                  <div className="rounded-md border max-h-64 overflow-y-auto">
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium border-b bg-muted/40">
                    <div className="col-span-1">日</div>
                    <div className="col-span-3">计划</div>
                    <div className="col-span-3">自动回填</div>
                    <div className="col-span-4">手工补充</div>
                    <div className="col-span-1 text-right">锁定</div>
                  </div>
                  {planTemplate.entries.map((entry) => (
                    <div key={entry.id} className="grid grid-cols-12 gap-2 px-3 py-2 text-xs border-b last:border-b-0">
                      <div className="col-span-1">{entry.day}</div>
                      <div className="col-span-3">
                        <textarea
                          value={planDrafts[entry.id]?.planned_text ?? entry.planned_text ?? ""}
                          onChange={(e) => setPlanDrafts((prev) => ({ ...prev, [entry.id]: { ...(prev[entry.id] || { planned_text: "", manual_text: "" }), planned_text: e.target.value } }))}
                          className="w-full min-h-14 rounded border px-1 py-1"
                        />
                      </div>
                      <div className="col-span-3 whitespace-pre-wrap">{entry.actual_text || "-"}</div>
                      <div className="col-span-4 space-y-1">
                        <textarea
                          value={planDrafts[entry.id]?.manual_text ?? entry.manual_text ?? ""}
                          onChange={(e) => setPlanDrafts((prev) => ({ ...prev, [entry.id]: { ...(prev[entry.id] || { planned_text: "", manual_text: "" }), manual_text: e.target.value } }))}
                          className="w-full min-h-14 rounded border px-1 py-1"
                          placeholder="手工补充说明"
                        />
                        <Button size="sm" variant="outline" onClick={() => savePlanEntry(entry.id)}>保存</Button>
                      </div>
                      <div className="col-span-1 text-right">{entry.locked ? "是" : "否"}</div>
                    </div>
                  ))}
                </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Task List / Board */}
        {activeTab === "tasks" && (
          <>
          {filteredTasks.length === 0 ? (
          <EmptyState
            title={t("tasks.noTasks")}
            description={t("tasks.noTasksDesc")}
            action={
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-1" />
                {t("tasks.newTask")}
              </Button>
            }
          />
        ) : viewMode === "list" ? (
          <div className="space-y-2">
            {filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                t={t}
                onToggleComplete={() => toggleComplete(task)}
                onTogglePin={() => togglePin(task)}
                onEdit={() => openEditDialog(task)}
                onDelete={() => deleteTask(task.id)}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(["pending", "in_progress", "completed"] as const).map((status) => (
              <div key={status} className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <div className={`h-2 w-2 rounded-full ${
                    status === "pending" ? "bg-blue-500" :
                    status === "in_progress" ? "bg-amber-500" : "bg-green-500"
                  }`} />
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    {t(`tasks.column${status.charAt(0).toUpperCase() + status.slice(1)}`)}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {filteredTasks.filter((t) => t.status === status).length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {filteredTasks
                    .filter((t) => t.status === status)
                    .map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        t={t}
                        compact
                        onToggleComplete={() => toggleComplete(task)}
                        onTogglePin={() => togglePin(task)}
                        onEdit={() => openEditDialog(task)}
                        onDelete={() => deleteTask(task.id)}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
          </>
        )}

        {/* Calendar View */}
        {activeTab === "calendar" && (
          <CheckinCalendar
            t={t}
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            checkins={checkins}
            streak={stats.streak}
          />
        )}

        {/* Week View */}
        {activeTab === "week" && (
          <WeekView
            t={t}
            tasks={tasks}
            weekOffset={weekOffset}
            onWeekChange={setWeekOffset}
            onToggleComplete={toggleComplete}
          />
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTask ? t("tasks.editTask") : t("tasks.newTask")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Title */}
            <div>
              <label className="text-sm font-medium">{t("tasks.taskTitle")}</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={t("tasks.taskTitlePlaceholder")}
                className="mt-1"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-sm font-medium">{t("tasks.description")}</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t("tasks.descriptionPlaceholder")}
                rows={3}
                className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Priority + Category */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("tasks.priority")}</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as "high" | "medium" | "low" })}
                  className="mt-1 w-full h-9 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm"
                >
                  <option value="high">{t("tasks.priorityHigh")}</option>
                  <option value="medium">{t("tasks.priorityMedium")}</option>
                  <option value="low">{t("tasks.priorityLow")}</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">{t("tasks.category")}</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="mt-1 w-full h-9 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                  <option value="其他">其他</option>
                </select>
              </div>
            </div>

            {/* Due Date + Estimated Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("tasks.dueDate")}</label>
                <Input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("tasks.estimatedTime")}</label>
                <Input
                  type="number"
                  min="0"
                  value={formData.estimated_time}
                  onChange={(e) => setFormData({ ...formData, estimated_time: e.target.value })}
                  placeholder="30"
                  className="mt-1"
                />
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="text-sm font-medium">{t("tasks.tags")}</label>
              <div className="mt-1 flex flex-wrap gap-1.5 mb-2">
                {formData.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button onClick={() => removeTag(tag)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                  placeholder={t("tasks.tagsPlaceholder")}
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={addTag}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Subtasks */}
            <div>
              <label className="text-sm font-medium">{t("tasks.subtasks")}</label>
              <div className="mt-1 space-y-1.5 mb-2">
                {formData.subtasks.map((sub) => (
                  <div key={sub.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={sub.is_completed}
                      onCheckedChange={() => toggleSubtask(sub.id)}
                    />
                    <span className={`flex-1 text-sm ${sub.is_completed ? "line-through text-gray-400" : ""}`}>
                      {sub.title}
                    </span>
                    <button onClick={() => removeSubtask(sub.id)}>
                      <X className="h-3 w-3 text-gray-400 hover:text-gray-600" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={subtaskInput}
                  onChange={(e) => setSubtaskInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSubtask())}
                  placeholder={t("tasks.subtaskPlaceholder")}
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={addSubtask}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving || !formData.title.trim()}>
              {saving ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// ── Task Card ──

function TaskCard({
  task,
  t,
  compact = false,
  onToggleComplete,
  onTogglePin,
  onEdit,
  onDelete,
}: {
  task: Task;
  t: (key: string) => string;
  compact?: boolean;
  onToggleComplete: () => void;
  onTogglePin: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const overdue = isOverdue(task.due_date) && task.status !== "completed";
  const completedSubtasks = task.subtasks?.filter((s) => s.is_completed).length || 0;
  const totalSubtasks = task.subtasks?.length || 0;

  return (
    <Card className={`group relative card-hover ${
      task.status === "completed" ? "opacity-60" : ""
    } ${overdue ? "ring-1 ring-red-300/50 dark:ring-red-800/50" : ""}`}>
      <CardContent className={compact ? "p-3" : "p-4"}>
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <div className="pt-0.5">
            <Checkbox
              checked={task.status === "completed"}
              onCheckedChange={onToggleComplete}
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {task.is_pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
              <span className={`font-medium truncate transition-all duration-300 ${
                task.status === "completed" ? "line-through text-muted-foreground opacity-60" : ""
              }`}>
                {task.title}
              </span>
            </div>

            {!compact && task.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {task.description}
              </p>
            )}

            {/* Meta row */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge className={PRIORITY_COLORS[task.priority]}>
                {t(`tasks.priority${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}`)}
              </Badge>

              {task.category && (
                <Badge variant="outline">{task.category}</Badge>
              )}

              {task.due_date && (
                <span className={`text-xs flex items-center gap-1 ${
                  overdue ? "text-red-500" : "text-muted-foreground"
                }`}>
                  {overdue ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                  {formatDate(task.due_date)}
                </span>
              )}

              {task.estimated_time && (
                <span className="text-xs text-muted-foreground">
                  {task.estimated_time} {t("tasks.minutes")}
                </span>
              )}

              {totalSubtasks > 0 && (
                <span className="text-xs text-muted-foreground">
                  {completedSubtasks}/{totalSubtasks}
                </span>
              )}
            </div>

            {/* Tags */}
            {!compact && task.tags && task.tags.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {task.tags.map((tag) => (
                  <span key={tag} className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-md">
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {/* Subtasks progress */}
            {!compact && totalSubtasks > 0 && (
              <div className="mt-2">
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div
                    className="bg-gradient-to-r from-primary to-violet-400 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${(completedSubtasks / totalSubtasks) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreHorizontal className="h-4 w-4 text-gray-400" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-8 z-20 w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1">
                  <button
                    onClick={() => { onTogglePin(); setShowMenu(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    {task.is_pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                    {task.is_pinned ? t("tasks.unpin") : t("tasks.pin")}
                  </button>
                  <button
                    onClick={() => { onEdit(); setShowMenu(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <Edit3 className="h-3 w-3" />
                    {t("common.edit")}
                  </button>
                  <button
                    onClick={() => { onDelete(); setShowMenu(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 flex items-center gap-2"
                  >
                    <Trash2 className="h-3 w-3" />
                    {t("common.delete")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Checkin Calendar ──

function CheckinCalendar({
  t,
  month,
  onMonthChange,
  checkins,
  streak,
}: {
  t: (key: string) => string;
  month: string;
  onMonthChange: (m: string) => void;
  checkins: CheckinRecord[];
  streak: number;
}) {
  const [year, mon] = month.split("-").map(Number);
  const today = new Date().toISOString().split("T")[0];
  const checkinDates = new Set(checkins.map((c) => c.checkin_date));
  const checkinMap = Object.fromEntries(checkins.map((c) => [c.checkin_date, c]));

  const firstDay = new Date(year, mon - 1, 1).getDay();
  const daysInMonth = new Date(year, mon, 0).getDate();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1; // Monday = 0

  const prevMonth = () => {
    const d = new Date(year, mon - 2, 1);
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const nextMonth = () => {
    const d = new Date(year, mon, 1);
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const monthNames = [
    t("common.january"), t("common.february"), t("common.march"),
    t("common.april"), t("common.may"), t("common.june"),
    t("common.july"), t("common.august"), t("common.september"),
    t("common.october"), t("common.november"), t("common.december"),
  ];
  const dayNames = [
    t("common.monday"), t("common.tuesday"), t("common.wednesday"),
    t("common.thursday"), t("common.friday"), t("common.saturday"), t("common.sunday"),
  ];

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const totalCheckins = checkins.length;
  const totalTasks = checkins.reduce((s, c) => s + c.tasks_completed, 0);
  const totalMinutes = checkins.reduce((s, c) => s + c.study_minutes, 0);

  return (
    <div className="space-y-4">
      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1">
              <Flame className="h-4 w-4 text-orange-500" />
              <span className="text-xl font-bold">{streak}</span>
            </div>
            <div className="text-xs text-gray-500">{t("tasks.studyStreak")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold text-indigo-600">{totalCheckins}</div>
            <div className="text-xs text-gray-500">{t("tasks.checkinDays")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold text-green-600">{totalTasks}</div>
            <div className="text-xs text-gray-500">{t("tasks.tasksDone")}</div>
          </CardContent>
        </Card>
      </div>

      {/* Calendar */}
      <Card>
        <CardContent className="p-4">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="font-semibold">{year} {monthNames[mon - 1]}</span>
            <button onClick={nextMonth} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {dayNames.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-500 py-1">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (day === null) return <div key={`empty-${i}`} className="h-10" />;
              const dateStr = `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isToday = dateStr === today;
              const hasCheckin = checkinDates.has(dateStr);
              const record = checkinMap[dateStr];

              return (
                <div
                  key={dateStr}
                  className={`h-10 rounded-lg flex flex-col items-center justify-center text-sm relative ${
                    isToday ? "bg-indigo-100 dark:bg-indigo-900/30 font-bold" : ""
                  } ${hasCheckin ? "bg-green-50 dark:bg-green-900/20" : ""}`}
                  title={record ? `${t("tasks.tasksDone")}: ${record.tasks_completed}, ${t("tasks.studyMinutes")}: ${record.study_minutes}` : ""}
                >
                  <span className={isToday ? "text-indigo-600 dark:text-indigo-400" : ""}>{day}</span>
                  {hasCheckin && (
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-0.5" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Week View ──

function WeekView({
  t,
  tasks,
  weekOffset,
  onWeekChange,
  onToggleComplete,
}: {
  t: (key: string) => string;
  tasks: Task[];
  weekOffset: number;
  onWeekChange: (offset: number) => void;
  onToggleComplete: (task: Task) => void;
}) {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7);
  startOfWeek.setHours(0, 0, 0, 0);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  const dayNames = [
    t("common.monday"), t("common.tuesday"), t("common.wednesday"),
    t("common.thursday"), t("common.friday"), t("common.saturday"), t("common.sunday"),
  ];

  const getTasksForDay = (date: Date) => {
    const dateStr = date.toISOString().split("T")[0];
    return tasks.filter((task) => task.due_date?.startsWith(dateStr));
  };

  const isCurrentWeek = weekOffset === 0;

  return (
    <div className="space-y-4">
      {/* Week nav */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onWeekChange(weekOffset - 1)}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <span className="font-semibold">
            {days[0].toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}
            {" - "}
            {days[6].toLocaleDateString("zh-CN", { month: "long", day: "numeric" })}
          </span>
          {isCurrentWeek && (
            <Badge className="ml-2" variant="secondary">{t("tasks.thisWeek")}</Badge>
          )}
        </div>
        <button
          onClick={() => onWeekChange(weekOffset + 1)}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
        {days.map((date, i) => {
          const dateStr = date.toISOString().split("T")[0];
          const isToday = dateStr === today.toISOString().split("T")[0];
          const dayTasks = getTasksForDay(date);

          return (
            <div
              key={dateStr}
              className={`rounded-lg border p-3 min-h-[120px] ${
                isToday
                  ? "border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-900/10"
                  : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-medium ${isToday ? "text-indigo-600 dark:text-indigo-400" : "text-gray-500"}`}>
                  {dayNames[i]}
                </span>
                <span className={`text-sm font-bold ${isToday ? "text-indigo-600 dark:text-indigo-400" : ""}`}>
                  {date.getDate()}
                </span>
              </div>
              <div className="space-y-1">
                {dayTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-1.5 group cursor-pointer"
                    onClick={() => onToggleComplete(task)}
                  >
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      task.priority === "high" ? "bg-red-500" :
                      task.priority === "medium" ? "bg-amber-500" : "bg-green-500"
                    }`} />
                    <span className={`text-xs truncate ${
                      task.status === "completed" ? "line-through text-gray-400" : ""
                    }`}>
                      {task.title}
                    </span>
                  </div>
                ))}
                {dayTasks.length === 0 && (
                  <div className="text-xs text-gray-400 text-center py-2">-</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
