// task-types.ts — Types and helpers for the tasks module

// ── Types ──

export interface Task {
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

export interface Subtask {
  id: string;
  title: string;
  is_completed: boolean;
}

export interface TaskCategory {
  id: string;
  name: string;
  color: string;
  icon?: string;
  sort_order: number;
}

export interface CheckinRecord {
  id: string;
  checkin_date: string;
  tasks_completed: number;
  cards_reviewed: number;
  study_minutes: number;
  notes_count: number;
}

export interface PlanTemplateEntry {
  id: string;
  day: number;
  planned_text: string;
  actual_text?: string;
  manual_text?: string;
  completion_rate?: number;
  locked: boolean;
}

export interface PlanTemplate {
  id: string;
  name: string;
  month: string;
  source_filename?: string;
  export_mapping?: string;
  entries: PlanTemplateEntry[];
}

export interface PlanExportMapping {
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



// ── Helpers ──

export const PRIORITY_COLORS = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

export const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

export function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dueDate) < today;
}

export function isToday(dueDate?: string): boolean {
  if (!dueDate) return false;
  const today = new Date().toISOString().split("T")[0];
  return dueDate.startsWith(today);
}

export function isThisWeek(dueDate?: string): boolean {
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

export function formatDate(dateStr?: string): string {
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

