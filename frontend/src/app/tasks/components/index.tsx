"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, MoreVertical, Edit3, Trash2, Pin, PinOff, Check, X, AlertTriangle, Calendar, Clock, List, MoreHorizontal } from "lucide-react";
import type { Task, CheckinRecord } from "@/lib/task-types";
import { PRIORITY_ORDER, isOverdue, isToday, formatDate } from "@/lib/task-types";

// ── Month Navigation ──

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export { shiftMonth };

export function MonthNav({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onChange(shiftMonth(month, -1))} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-sm font-medium min-w-[100px] text-center">{month}</span>
      <button onClick={() => onChange(shiftMonth(month, 1))} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Task Card ──

export function TaskCard({ task, t, onToggleComplete, onTogglePin, onEdit, onDelete }: {
  task: Task; t: (key: string) => string;
  onToggleComplete: () => void; onTogglePin: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const overdue = isOverdue(task.due_date) && task.status !== "completed";
  const today = isToday(task.due_date);
  const completed = task.status === "completed";
  const subtaskDone = task.subtasks?.filter((s) => s.is_completed).length || 0;
  const subtaskTotal = task.subtasks?.length || 0;

  return (
    <Card className={cn("card-hover transition-all duration-200", completed && "opacity-60", overdue && "ring-1 ring-red-200 dark:ring-red-900/40")}>
      <CardContent className="p-3.5">
        <div className="flex items-start gap-3">
          <button onClick={onToggleComplete}
            className={cn("mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all",
              completed ? "bg-emerald-500 border-emerald-500 text-white" : "border-muted-foreground/30 hover:border-primary")}>
            {completed && <Check className="h-3 w-3" />}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn("font-medium text-sm truncate", completed && "line-through text-muted-foreground")}>{task.title}</span>
              {task.is_pinned && <Pin className="h-3 w-3 text-amber-500 flex-shrink-0" />}
              {overdue && (
                <Badge variant="secondary" className="text-[10px] bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 flex-shrink-0">
                  <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />{t("tasks.overdue")}
                </Badge>
              )}
              {today && !completed && (
                <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 flex-shrink-0">
                  {t("tasks.today")}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
              {task.due_date && (
                <span className={cn("flex items-center gap-0.5", overdue && "text-red-500")}>
                  <Calendar className="h-3 w-3" />{formatDate(task.due_date)}
                </span>
              )}
              {task.estimated_time && (
                <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{task.estimated_time}min</span>
              )}
              {subtaskTotal > 0 && (
                <span className="flex items-center gap-0.5"><List className="h-3 w-3" />{subtaskDone}/{subtaskTotal}</span>
              )}
              {task.category && task.category !== "其他" && (
                <Badge variant="secondary" className="text-[10px] px-1.5">{task.category}</Badge>
              )}
            </div>

            {subtaskTotal > 0 && (
              <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${(subtaskDone / subtaskTotal) * 100}%` }} />
              </div>
            )}

            {task.tags && task.tags.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {task.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">{tag}</Badge>
                ))}
              </div>
            )}
          </div>

          {/* Actions Menu */}
          <div className="relative flex-shrink-0">
            <button onClick={() => setMenuOpen(!menuOpen)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-8 z-50 bg-popover border rounded-lg shadow-lg py-1 min-w-[120px]">
                  <button onClick={() => { onTogglePin(); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors">
                    {task.is_pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                    {task.is_pinned ? t("tasks.unpin") : t("tasks.pin")}
                  </button>
                  <button onClick={() => { onEdit(); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors">
                    <Edit3 className="h-3.5 w-3.5" />{t("tasks.editTask")}
                  </button>
                  <button onClick={() => { onDelete(); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />{t("tasks.deleteTask")}
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

export function CheckinCalendar({ t, month, onMonthChange, checkins, onDayClick, selectedDate }: {
  t: (key: string) => string; month: string; onMonthChange: (m: string) => void; checkins: CheckinRecord[];
  onDayClick?: (dateStr: string) => void; selectedDate?: string | null;
}) {
  const [year, mon] = month.split("-").map(Number);
  const todayStr = new Date().toISOString().split("T")[0];
  const checkinDates = new Set(checkins.map((c) => c.checkin_date));
  const checkinMap = Object.fromEntries(checkins.map((c) => [c.checkin_date, c]));

  const firstDay = new Date(year, mon - 1, 1).getDay();
  const daysInMonth = new Date(year, mon, 0).getDate();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;

  const monthNames = [
    t("common.january"), t("common.february"), t("common.march"),
    t("common.april"), t("common.may"), t("common.june"),
    t("common.july"), t("common.august"), t("common.september"),
    t("common.october"), t("common.november"), t("common.december"),
  ];

  const totalCheckins = checkins.length;
  const totalTasks = checkins.reduce((sum, c) => sum + (c.tasks_completed || 0), 0);
  const totalMinutes = checkins.reduce((sum, c) => sum + (c.study_minutes || 0), 0);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4">
          <MonthNav month={month} onChange={onMonthChange} />
          <h3 className="font-semibold text-sm text-center mb-4">{year} {monthNames[mon - 1]}</h3>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
              <div key={d} className="text-center text-[11px] text-muted-foreground font-medium py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startOffset }).map((_, i) => <div key={`e-${i}`} className="h-10" />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isToday = dateStr === todayStr;
              const hasCheckin = checkinDates.has(dateStr);
              const record = checkinMap[dateStr];
              const isSelected = selectedDate === dateStr;
              return (
                <div key={dateStr}
                  onClick={() => onDayClick && onDayClick(dateStr)}
                  className={cn("h-10 rounded-lg flex flex-col items-center justify-center text-sm relative cursor-pointer transition-colors",
                    isToday && "bg-indigo-100 dark:bg-indigo-900/30 font-bold",
                    hasCheckin && "bg-green-50 dark:bg-green-900/20",
                    isSelected && "ring-2 ring-primary bg-primary/10",
                    !isToday && !hasCheckin && "hover:bg-muted/50")}
                  title={record ? `${t("tasks.tasksDone")}: ${record.tasks_completed}, ${t("tasks.studyMinutes")}: ${record.study_minutes}` : ""}>
                  <span className={isToday ? "text-indigo-600 dark:text-indigo-400" : ""}>{day}</span>
                  {hasCheckin && <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-0.5" />}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        {[
          { value: totalCheckins, label: "打卡天数", color: "text-green-500" },
          { value: totalTasks, label: "完成任务", color: "text-blue-500" },
          { value: totalMinutes, label: "学习分钟", color: "text-amber-500" },
        ].map((s) => (
          <div key={s.label} className="bg-muted/50 rounded-lg px-3 py-2 text-center">
            <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Week View ──

export function WeekView({ t, tasks, weekOffset, onWeekChange, onToggleComplete }: {
  t: (key: string) => string; tasks: Task[]; weekOffset: number;
  onWeekChange: (offset: number) => void; onToggleComplete: (task: Task) => void;
}) {
  const today = new Date();
  const current = new Date(today);
  current.setDate(today.getDate() + weekOffset * 7);
  const monday = new Date(current);
  monday.setDate(current.getDate() - ((current.getDay() + 6) % 7));

  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  const dayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

  const getTasksForDay = (date: Date) => {
    const dateStr = date.toISOString().split("T")[0];
    return tasks.filter((task) => task.due_date?.startsWith(dateStr));
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => onWeekChange(weekOffset - 1)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h3 className="font-semibold text-sm">
            {weekDays[0].toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
            {" - "}
            {weekDays[6].toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
          </h3>
          <button onClick={() => onWeekChange(weekOffset + 1)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          {weekDays.map((day, i) => {
            const dayTasks = getTasksForDay(day);
            const isToday = day.toDateString() === today.toDateString();
            const isPast = day < today && !isToday;
            return (
              <div key={i} className={cn("rounded-lg border p-3 transition-colors",
                isToday && "border-primary/30 bg-primary/5", isPast && "opacity-60")}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={cn("text-xs font-medium", isToday ? "text-primary" : "text-muted-foreground")}>{dayNames[i]}</span>
                  <span className={cn("text-xs", isToday && "font-bold text-primary")}>{day.getDate()}</span>
                  {dayTasks.length > 0 && <Badge variant="secondary" className="text-[10px]">{dayTasks.length}</Badge>}
                </div>
                {dayTasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground/50">无任务</p>
                ) : (
                  <div className="space-y-1">
                    {dayTasks.map((task) => (
                      <div key={task.id} className="flex items-center gap-2">
                        <button onClick={() => onToggleComplete(task)}
                          className={cn("h-4 w-4 rounded border flex items-center justify-center flex-shrink-0",
                            task.status === "completed" ? "bg-emerald-500 border-emerald-500" : "border-muted-foreground/30")}>
                          {task.status === "completed" && <Check className="h-2.5 w-2.5 text-white" />}
                        </button>
                        <span className={cn("text-xs truncate", task.status === "completed" && "line-through text-muted-foreground")}>{task.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
