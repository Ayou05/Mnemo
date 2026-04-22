"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useTranslation } from "@/lib/i18n";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Trash2,
  Edit3,
  Pencil,
  CalendarDays,
  AlertTriangle,
  MapPin,
  User,
  Clock,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Palette,
  Upload,
  FileJson,
  FileSpreadsheet,
  Camera,
  Download,
  CalendarCheck,
  List,
  Sparkles,
  Loader2,
} from "lucide-react";

// ── Types ──

interface ScheduleEntry {
  id: string;
  course_name: string;
  teacher?: string;
  location?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  weeks?: string;
  color?: string;
  event_date?: string; // YYYY-MM-DD, undefined = weekly recurring
}

interface Schedule {
  id: string;
  name: string;
  version: number;
  is_active: boolean;
  entries: ScheduleEntry[];
  created_at: string;
}

interface Conflict {
  course_1: string;
  course_2: string;
  day_of_week: number;
  time_range: string;
}

// ── Constants ──

const DAYS = [1, 2, 3, 4, 5, 6, 7];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 07:00 - 20:00
const COLORS = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#06B6D4", "#F97316", "#6366F1", "#14B8A6",
];

const DAY_KEYS = ["schedule.mon", "schedule.tue", "schedule.wed", "schedule.thu", "schedule.fri", "schedule.sat", "schedule.sun"];

// ── Component ──

export default function SchedulePage() {
  const { t } = useTranslation();
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [adviseResults, setAdviseResults] = useState<any[]>([]);
  const [adviseLoading, setAdviseLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ScheduleEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState<"week" | "list">("week");

  const [formData, setFormData] = useState({
    course_name: "",
    teacher: "",
    location: "",
    day_of_week: 1,
    start_time: "08:00",
    end_time: "09:30",
    color: COLORS[0],
    event_date: "",
  });

  const fetchSchedule = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get("/schedule/active") as any;
      if (res) {
        setSchedule(res);
      } else {
        setSchedule(null);
      }
    } catch {
      setError("Failed to load schedule");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchConflicts = useCallback(async () => {
    try {
      const res = await api.get("/schedule/conflicts") as any;
      if (res) {
        setConflicts(res.conflicts || []);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchAdvise = useCallback(async () => {
    setAdviseLoading(true);
    try {
      const res = await api.get("/schedule/conflicts/advise") as any;
      if (res) {
        setAdviseResults(res.advise || []);
      }
    } catch { /* ignore */ }
    setAdviseLoading(false);
  }, []);

  useEffect(() => {
    fetchSchedule();
    fetchConflicts();
  }, [fetchSchedule, fetchConflicts]);

  // ── Import handlers ──

  const handleImportJSON = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        setImporting(true);
        const text = await file.text();
        const data = JSON.parse(text);
        const res = await api.post("/schedule/import/json", data) as any;
        if (res) {
          toast.success(t("schedule.importSuccess", { count: res.entries?.length || 0 }));
          fetchSchedule();
          fetchConflicts();
          setImportDialogOpen(false);
        } else {
          toast.error("Import failed");
        }
      } catch (err) {
        toast.error(t("schedule.importError"));
      } finally {
        setImporting(false);
      }
    };
    input.click();
  };

  const handleImportCSV = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.xlsx,.xls";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        setImporting(true);
        const formData = new FormData();
        formData.append("file", file);
        const token = localStorage.getItem("mnemo_token");
        const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "/api/v1"}/schedule/import/csv`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
        const res = await resp.json();
        if (res.code === 0) {
          toast.success(t("schedule.importSuccess", { count: res.data?.entries?.length || 0 }));
          fetchSchedule();
          fetchConflicts();
          setImportDialogOpen(false);
        } else {
          toast.error(res.message || "Import failed");
        }
      } catch (err) {
        toast.error(t("schedule.importError"));
      } finally {
        setImporting(false);
      }
    };
    input.click();
  };

  const handleImportICS = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".ics,.ical";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        setImporting(true);
        const form = new FormData();
        form.append("file", file);
        form.append("name", "iCal导入课表");
        const token = localStorage.getItem("mnemo_token");
        const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "/api/v1"}/schedule/import/ics`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ detail: "导入失败" }));
          throw new Error(err.detail || err.message || "导入失败");
        }
        const res = await resp.json();
        if (res.code === 0) {
          toast.success(t("schedule.importSuccess", { count: res.data?.entries?.length || 0 }));
          fetchSchedule();
          fetchConflicts();
          setImportDialogOpen(false);
        } else {
          toast.error(res.message || "导入失败");
        }
      } catch (err) {
        toast.error(t("schedule.importError"));
      } finally {
        setImporting(false);
      }
    };
    input.click();
  };

  const handleImportOCR = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        setImporting(true);
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result as string;
          const res = await api.post("/schedule/import/ocr", {
            image: base64,
            name: "OCR导入课表",
          }) as any;
          if (res) {
            toast.success(t("schedule.importSuccess", { count: res.entries?.length || 0 }));
            fetchSchedule();
            fetchConflicts();
            setImportDialogOpen(false);
          } else {
            toast.error("OCR failed");
          }
          setImporting(false);
        };
        reader.readAsDataURL(file);
      } catch (err) {
        toast.error(t("schedule.importError"));
        setImporting(false);
      }
    };
    input.click();
  };

  const handleExportJSON = async () => {
    try {
      const res = await api.get("/schedule/export/json") as any;
      if (res) {
        const blob = new Blob([JSON.stringify(res, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `schedule_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(t("schedule.exportSuccess"));
      }
    } catch {
      toast.error("Export failed");
    }
  };

  const openAddDialog = (day?: number, time?: string) => {
    setEditingEntry(null);
    setFormData({
      course_name: "",
      teacher: "",
      location: "",
      day_of_week: day || 1,
      start_time: time || "08:00",
      end_time: time ? `${String(parseInt(time.split(":")[0]) + 1).padStart(2, "0")}:${time.split(":")[1]}` : "09:30",
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      event_date: "",
    });
    setDialogOpen(true);
  };

  const openEditDialog = (entry: ScheduleEntry) => {
    setEditingEntry(entry);
    setFormData({
      course_name: entry.course_name,
      teacher: entry.teacher || "",
      location: entry.location || "",
      day_of_week: entry.day_of_week,
      start_time: entry.start_time,
      end_time: entry.end_time,
      color: entry.color || COLORS[0],
      event_date: entry.event_date || "",
    });
    setDialogOpen(true);
  };

  const saveEntry = async () => {
    if (!formData.course_name.trim()) return;
    if (formData.start_time >= formData.end_time) {
      toast.error(t("schedule.timeError"));
      return;
    }

    try {
      setSaving(true);
      const entryData = {
        course_name: formData.course_name.trim(),
        teacher: formData.teacher.trim() || undefined,
        location: formData.location.trim() || undefined,
        day_of_week: formData.day_of_week,
        start_time: formData.start_time,
        end_time: formData.end_time,
        color: formData.color,
        event_date: formData.event_date || undefined,
      };

      if (editingEntry) {
        // Update: delete old + add new via full schedule update
        const entries = (schedule?.entries || []).map(e =>
          e.id === editingEntry.id ? { ...e, ...entryData } : e
        );
        const res = await api.post("/schedule/", {
          name: schedule?.name || "My Schedule",
          entries,
        }) as any;
        if (res) {
          toast.success(t("schedule.entryUpdated"));
          fetchSchedule();
          fetchConflicts();
        }
      } else {
        // Add new entry
        const entries = [...(schedule?.entries || []), entryData];
        const res = await api.post("/schedule/", {
          name: schedule?.name || "My Schedule",
          entries,
        }) as any;
        if (res) {
          toast.success(t("schedule.entryAdded"));
          fetchSchedule();
          fetchConflicts();
        }
      }
      setDialogOpen(false);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (entryId: string) => {
    if (!schedule) return;
    try {
      const entries = (schedule.entries || []).filter(e => e.id !== entryId);
      const res = await api.post("/schedule/", {
        name: schedule.name,
        entries,
      }) as any;
      if (res) {
        toast.success(t("schedule.entryDeleted"));
        fetchSchedule();
        fetchConflicts();
      }
    } catch {
      toast.error("Failed to delete");
    }
  };

  const deleteSchedule = async () => {
    if (!schedule) return;
    try {
      await api.delete(`/schedule/${schedule.id}`);
      toast.success(t("schedule.scheduleDeleted"));
      setSchedule(null);
      setConflicts([]);
    } catch {
      toast.error("Failed to delete");
    }
  };

  // ── Week view helpers ──

  const getWeekDates = () => {
    const now = new Date();
    const dayOfWeek = now.getDay() || 7; // Mon=1
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayOfWeek + 1 + weekOffset * 7);
    return DAYS.map((_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  };

  const weekDates = getWeekDates();
  const today = new Date();
  const todayDow = today.getDay() || 7;

  const getEntriesForSlot = (day: number, hour: number) => {
    if (!schedule) return [];
    const dayDate = weekDates[day - 1]; // 0-indexed
    const mm = String(dayDate.getMonth() + 1).padStart(2, "0");
    const dd = String(dayDate.getDate()).padStart(2, "0");
    const dayStr = `${dayDate.getFullYear()}-${mm}-${dd}`;
    return schedule.entries.filter(entry => {
      if (entry.day_of_week !== day) return false;
      const evd = entry["event_date"];
      if (evd && evd !== dayStr) return false;
      const startH = parseInt(entry.start_time.split(":")[0]);
      const endH = parseInt(entry.end_time.split(":")[0]);
      return hour >= startH && hour < endH;
    });
  };

  const getEntryStyle = (entry: ScheduleEntry) => {
    const startH = parseInt(entry.start_time.split(":")[0]);
    const startM = parseInt(entry.start_time.split(":")[1]);
    const endH = parseInt(entry.end_time.split(":")[0]);
    const endM = parseInt(entry.end_time.split(":")[1]);
    const top = (startH - 7) * 60 + startM;
    const height = (endH - startH) * 60 + (endM - startM);
    return {
      top: `${top}px`,
      height: `${Math.max(height, 30)}px`,
      backgroundColor: entry.color || "#3B82F6",
    };
  };

  // ── Render ──

  if (loading) return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">{t("schedule.title")}</h1>
        <ListSkeleton count={5} />
      </div>
    </AppLayout>
  );

  if (error) return (
    <AppLayout>
      <ErrorState message={error} onRetry={fetchSchedule} />
    </AppLayout>
  );

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("schedule.title")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{t("schedule.subtitle")}</p>
          </div>
          <div className="flex gap-2">
            {schedule && (
              <Button variant="outline" onClick={handleExportJSON}>
                <Download className="h-4 w-4 mr-1" />
                {t("schedule.export")}
              </Button>
            )}
            <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
              <Upload className="h-4 w-4 mr-1" />
              {t("schedule.import")}
            </Button>
            {schedule && (
              <Button variant="outline" onClick={deleteSchedule} className="text-red-500">
                <Trash2 className="h-4 w-4 mr-1" />
                {t("common.delete")}
              </Button>
            )}
            <Button onClick={() => openAddDialog()} className="rounded-xl bg-gradient-brand hover:opacity-90 shadow-lg shadow-primary/20 btn-press">
              <Plus className="h-4 w-4 mr-1" />
              {t("schedule.addCourse")}
            </Button>
          </div>
        </div>

        {/* Conflicts - compact */}
        {conflicts.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400 px-1">
            <AlertTriangle className="h-4 w-4" />
            <span>{t("schedule.conflicts")} ({conflicts.length})</span>
          </div>
        )}

        {/* Week Navigation & View Toggle */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            <Button
              variant={viewMode === "week" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("week")}
              className="h-7 px-2"
            >
              <CalendarCheck className="h-3.5 w-3.5 mr-1" />
              {t("schedule.weekView")}
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("list")}
              className="h-7 px-2"
            >
              <List className="h-3.5 w-3.5 mr-1" />
              {t("schedule.listView")}
            </Button>
          </div>
          {viewMode === "week" && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setWeekOffset(w => w - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-medium text-sm">
                {weekDates[0].toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
                {" - "}
                {weekDates[6].toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setWeekOffset(w => w + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              {weekOffset !== 0 && (
                <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>
                  {t("schedule.thisWeek")}
                </Button>
              )}
            </>
          )}
        </div>

        {/* Schedule Content */}
        {!schedule ? (
          <Card>
            <CardContent className="py-16 text-center">
              <CalendarDays className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">{t("schedule.noSchedule")}</p>
              <p className="text-sm text-muted-foreground mt-1">{t("schedule.noScheduleDesc")}</p>
              <Button className="mt-4" onClick={() => openAddDialog()}>
                <Plus className="h-4 w-4 mr-1" />
                {t("schedule.addCourse")}
              </Button>
            </CardContent>
          </Card>
        ) : viewMode === "week" ? (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                {/* Header row */}
                <div className="grid grid-cols-8 border-b border-gray-200 dark:border-gray-700">
                  <div className="p-2 text-xs text-muted-foreground text-center border-r border-gray-200 dark:border-gray-700">
                    {t("schedule.time")}
                  </div>
                  {weekDates.map((date, i) => {
                    const isToday = weekOffset === 0 && (i + 1) === todayDow;
                    return (
                      <div key={i} className={`p-2 text-center text-sm border-r border-gray-200 dark:border-gray-700 last:border-r-0 ${isToday ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}>
                        <div className="font-medium">{t(DAY_KEYS[i])}</div>
                        <div className={`text-xs mt-0.5 ${isToday ? "text-blue-600 dark:text-blue-400 font-bold" : "text-muted-foreground"}`}>
                          {date.getDate()}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Time grid */}
                <div className="grid grid-cols-8" style={{ height: `${HOURS.length * 60}px` }}>
                  {/* Time column */}
                  <div className="border-r border-gray-200 dark:border-gray-700 relative">
                    {HOURS.map(h => (
                      <div key={h} className="absolute w-full text-xs text-muted-foreground text-right pr-2"
                        style={{ top: `${(h - 7) * 60}px`, transform: "translateY(-8px)" }}>
                        {String(h).padStart(2, "0")}:00
                      </div>
                    ))}
                  </div>

                  {/* Day columns */}
                  {DAYS.map(day => {
                    const isToday = weekOffset === 0 && day === todayDow;
                    const dayDate = weekDates[day - 1];
                    const dayStr = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, "0")}-${String(dayDate.getDate()).padStart(2, "0")}`;
                    const dayEntries = (schedule.entries || []).filter(e => {
                      if (e.day_of_week !== day) return false;
                      const evd = e["event_date"];
                      if (evd && evd !== dayStr) return false;
                      return true;
                    });

                    return (
                      <div key={day}
                        className={`border-r border-gray-200 dark:border-gray-700 last:border-r-0 relative cursor-pointer ${isToday ? "bg-blue-50/50 dark:bg-blue-950/10" : ""}`}
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const y = e.clientY - rect.top;
                          const hour = Math.floor(y / 60) + 7;
                          if (hour >= 7 && hour < 21) {
                            openAddDialog(day, `${String(hour).padStart(2, "0")}:00`);
                          }
                        }}
                      >
                        {/* Hour lines */}
                        {HOURS.map(h => (
                          <div key={h} className="absolute w-full border-t border-gray-100 dark:border-gray-800"
                            style={{ top: `${(h - 7) * 60}px` }} />
                        ))}

                        {/* Course blocks */}
                        {dayEntries.map(entry => (
                          <div
                            key={entry.id}
                            className="absolute left-0.5 right-0.5 rounded-md px-1 py-0.5 text-white text-xs overflow-hidden cursor-pointer z-10 hover:opacity-90 transition-opacity shadow-sm"
                            style={getEntryStyle(entry)}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDialog(entry);
                            }}
                          >
                            <div className="font-medium truncate">{entry.course_name}</div>
                            {(entry.start_time || entry.location) && (
                              <div className="opacity-80 truncate">
                                {entry.start_time}
                                {entry.location && ` · ${entry.location}`}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>
        ) : (
          /* List View */
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {(() => {
                  const sorted = [...schedule.entries].sort((a, b) => {
                    if (a["event_date"] && b["event_date"]) return a["event_date"].localeCompare(b["event_date"]);
                    if (a["event_date"]) return -1;
                    if (b["event_date"]) return 1;
                    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
                    return a.start_time.localeCompare(b.start_time);
                  });
                  return sorted.map(entry => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                      onClick={() => openEditDialog(entry)}
                    >
                      <div className="w-1.5 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color || "#3B82F6" }} />
                      <div className="flex-shrink-0 w-20 text-center">
                        {entry["event_date"] ? (
                          <div>
                            <div className="text-xs text-muted-foreground">{entry["event_date"].slice(5)}</div>
                            <div className="text-[10px] text-orange-400">{t(DAY_KEYS[entry.day_of_week - 1])}</div>
                          </div>
                        ) : (
                          <div className="text-sm font-medium">{t(DAY_KEYS[entry.day_of_week - 1])}</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{entry.course_name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                          <span>{entry.start_time}-{entry.end_time}</span>
                          {entry.location && (
                            <span className="flex items-center gap-0.5">
                              <MapPin className="h-3 w-3" />{entry.location}
                            </span>
                          )}
                          {entry.teacher && (
                            <span className="flex items-center gap-0.5">
                              <User className="h-3 w-3" />{entry.teacher}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {entry["event_date"] && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                            {entry["event_date"]}
                          </span>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); openEditDialog(entry); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-600" onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id); }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Course list below grid - only show in week view */}
        {viewMode === "week" && schedule && schedule.entries.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{t("schedule.courseList")} ({schedule.entries.length})</CardTitle>
                {conflicts.length > 0 && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-orange-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30"
                    onClick={fetchAdvise} disabled={adviseLoading}>
                    {adviseLoading ? (
                      <><Loader2 className="h-3 w-3 mr-1 animate-spin" />分析中...</>
                    ) : (
                      <><Sparkles className="h-3 w-3 mr-1" />冲突分析</>
                    )}
                  </Button>
                )}
              </div>
              {adviseResults.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {adviseResults.map((a: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-green-50 dark:bg-green-950/20 rounded-md px-2 py-1.5">
                      <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                      <span className="text-green-700 dark:text-green-400 font-medium">{a.recommend}</span>
                      <span className="text-muted-foreground">— {a.reason}</span>
                      {a.skip && <span className="text-red-400">（跳过：{a.skip}）</span>}
                    </div>
                  ))}
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {schedule.entries
                  .sort((a, b) => a.day_of_week !== b.day_of_week ? a.day_of_week - b.day_of_week : a.start_time.localeCompare(b.start_time))
                  .map(entry => (
                    <div key={entry.id}
                      className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-sm transition-shadow">
                      <div className="w-1 h-12 rounded-full mt-0.5" style={{ backgroundColor: entry.color || "#3B82F6" }} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{entry.course_name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                          <span>{t(DAY_KEYS[entry.day_of_week - 1])}</span>
                          {entry.event_date && (
                            <span className="text-orange-400">{entry.event_date}</span>
                          )}
                          <span>{entry.start_time}-{entry.end_time}</span>
                          {entry.location && (
                            <span className="flex items-center gap-0.5">
                              <MapPin className="h-3 w-3" />{entry.location}
                            </span>
                          )}
                          {entry.teacher && (
                            <span className="flex items-center gap-0.5">
                              <User className="h-3 w-3" />{entry.teacher}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditDialog(entry)}>
                          <Edit3 className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => deleteEntry(entry.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEntry ? t("schedule.editCourse") : t("schedule.addCourse")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">{t("schedule.courseName")}</label>
              <Input value={formData.course_name} onChange={e => setFormData({ ...formData, course_name: e.target.value })}
                placeholder={t("schedule.courseNamePlaceholder")} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("schedule.teacher")}</label>
                <Input value={formData.teacher} onChange={e => setFormData({ ...formData, teacher: e.target.value })}
                  placeholder={t("schedule.teacherPlaceholder")} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">{t("schedule.location")}</label>
                <Input value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })}
                  placeholder={t("schedule.locationPlaceholder")} className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{t("schedule.dayOfWeek")}</label>
              <select value={formData.day_of_week} onChange={e => setFormData({ ...formData, day_of_week: parseInt(e.target.value) })}
                className="mt-1 w-full h-9 rounded-lg border border-border/50 bg-card px-3 text-sm backdrop-blur-sm">
                {DAYS.map(d => (
                  <option key={d} value={d}>{t(DAY_KEYS[d - 1])}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("schedule.startTime")}</label>
                <Input type="time" value={formData.start_time} onChange={e => setFormData({ ...formData, start_time: e.target.value })}
                  className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">{t("schedule.endTime")}</label>
                <Input type="time" value={formData.end_time} onChange={e => setFormData({ ...formData, end_time: e.target.value })}
                  className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{t("schedule.color")}</label>
              <div className="flex gap-2 mt-2">
                {COLORS.map(c => (
                  <button key={c} className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                    style={{ backgroundColor: c, borderColor: formData.color === c ? "#000" : "transparent" }}
                    onClick={() => setFormData({ ...formData, color: c })} />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">每周循环</label>
                <p className="text-xs text-muted-foreground">开启后每周重复，关闭则指定具体日期</p>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, event_date: formData.event_date ? "" : new Date().toISOString().slice(0, 10) })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${!formData.event_date ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${!formData.event_date ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            {formData.event_date && (
              <div>
                <label className="text-sm font-medium">指定日期</label>
                <Input type="date" value={formData.event_date} onChange={e => setFormData({ ...formData, event_date: e.target.value })}
                  className="mt-1" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={saveEntry} disabled={saving || !formData.course_name.trim()}>
              {saving ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("schedule.import")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <button onClick={handleImportJSON} disabled={importing}
              className="w-full flex items-center gap-3 p-4 rounded-xl border border-border/50 hover:bg-muted/50 transition-colors text-left">
              <FileJson className="h-8 w-8 text-blue-500 shrink-0" />
              <div>
                <div className="font-medium">{t("schedule.importJSON")}</div>
                <div className="text-sm text-muted-foreground">{t("schedule.importJSONDesc")}</div>
              </div>
            </button>
            <button onClick={handleImportCSV} disabled={importing}
              className="w-full flex items-center gap-3 p-4 rounded-xl border border-border/50 hover:bg-muted/50 transition-colors text-left">
              <FileSpreadsheet className="h-8 w-8 text-green-500 shrink-0" />
              <div>
                <div className="font-medium">{t("schedule.importCSV")}</div>
                <div className="text-sm text-muted-foreground">{t("schedule.importCSVDesc")}</div>
              </div>
            </button>
            <button onClick={handleImportICS} disabled={importing}
              className="w-full flex items-center gap-3 p-4 rounded-xl border border-border/50 hover:bg-muted/50 transition-colors text-left"
            >
              <CalendarCheck className="h-8 w-8 text-orange-500 shrink-0" />
              <div>
                <div className="font-medium">{t("schedule.importICS")}</div>
                <div className="text-sm text-muted-foreground">{t("schedule.importICSDesc")}</div>
              </div>
            </button>
            <button onClick={handleImportOCR} disabled={importing}
              className="w-full flex items-center gap-3 p-4 rounded-xl border border-border/50 hover:bg-muted/50 transition-colors text-left">
              <Camera className="h-8 w-8 text-purple-500 shrink-0" />
              <div>
                <div className="font-medium">{t("schedule.importOCR")}</div>
                <div className="text-sm text-muted-foreground">{t("schedule.importOCRDesc")}</div>
              </div>
            </button>
            {importing && (
              <div className="flex items-center justify-center gap-2 py-2 text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500" />
                {t("schedule.importing")}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
