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
  Search,
  Trash2,
  Edit3,
  Mic,
  FileText,
  MessageCircle,
  Sparkles,
  Brain,
  Send,
  X,
  ChevronRight,
  BookOpen,
  Clock,
  Loader2,
  ArrowLeft,
  RotateCcw,
} from "lucide-react";

// ── Types ──

interface CourseNote {
  id: string;
  title: string;
  raw_transcript?: string;
  cleaned_text?: string;
  structured_notes?: string;
  summary?: string;
  course_name?: string;
  duration_seconds?: number;
  created_at: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface TauriCaptureStatus {
  running: boolean;
  failed?: boolean;
  session_id: string;
  course_name: string;
  started_at_unix: number;
  duration_seconds: number;
  chunk_count: number;
  retry_count?: number;
  last_error?: string | null;
}

interface TauriTranscriptionResult {
  session_id: string;
  course_name: string;
  duration_seconds: number;
  transcript: string;
  chunk_count: number;
  source: string;
}

declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke: <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>;
      };
    };
  }
}

function getTauriInvoke() {
  if (typeof window === "undefined") return null;
  return window.__TAURI__?.core?.invoke || null;
}

// ── Component ──

export default function CoursesPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"notes" | "chat">("notes");

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("courses.title")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{t("courses.subtitle")}</p>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 bg-muted/50 backdrop-blur-sm rounded-xl p-1 border border-border/50">
          {([
            { key: "notes" as const, label: t("courses.tabNotes"), icon: FileText },
            { key: "chat" as const, label: t("courses.tabChat"), icon: MessageCircle },
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

        {activeTab === "notes" ? <NotesTab /> : <ChatTab />}
      </div>
    </AppLayout>
  );
}

// ═══════════════════════════════════════
// Notes Tab
// ═══════════════════════════════════════

function NotesTab() {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<CourseNote[]>([]);
  const [courseNames, setCourseNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCourse, setFilterCourse] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<CourseNote | null>(null);
  const [viewingNote, setViewingNote] = useState<CourseNote | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [captureStatus, setCaptureStatus] = useState<TauriCaptureStatus | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [isDesktopBridge, setIsDesktopBridge] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    raw_transcript: "",
    course_name: "",
  });

  const refreshCaptureStatus = useCallback(async () => {
    const invoke = getTauriInvoke();
    setIsDesktopBridge(Boolean(invoke));
    if (!invoke) return;
    try {
      const status = await invoke<TauriCaptureStatus>("get_audio_capture_status");
      setCaptureStatus(status);
    } catch {
      setCaptureStatus(null);
    }
  }, []);

  const fetchNotes = useCallback(async () => {
    try {
      const res = await api.get("/courses/?page=1&page_size=100") as any;
      if (res) {
        setNotes(res.items || []);
      }
    } catch {
      setError("Failed to load notes");
    }
  }, []);

  const fetchCourseNames = useCallback(async () => {
    try {
      const res = await api.get("/courses/courses") as any;
      if (res) {
        setCourseNames(res || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    Promise.all([fetchNotes(), fetchCourseNames()]).finally(() => setLoading(false));
  }, [fetchNotes, fetchCourseNames]);

  useEffect(() => {
    refreshCaptureStatus();
    const timer = window.setInterval(refreshCaptureStatus, 3000);
    return () => window.clearInterval(timer);
  }, [refreshCaptureStatus]);

  const filteredNotes = notes.filter((n) => {
    if (search && !n.title.toLowerCase().includes(search.toLowerCase()) &&
        !(n.summary || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCourse !== "all" && n.course_name !== filterCourse) return false;
    return true;
  });

  const openCreateDialog = () => {
    setEditingNote(null);
    setFormData({ title: "", raw_transcript: "", course_name: "" });
    setDialogOpen(true);
  };

  const openEditDialog = (note: CourseNote) => {
    setEditingNote(note);
    setFormData({
      title: note.title,
      raw_transcript: note.raw_transcript || "",
      course_name: note.course_name || "",
    });
    setDialogOpen(true);
  };

  const saveNote = async () => {
    if (!formData.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: formData.title,
        raw_transcript: formData.raw_transcript || undefined,
        course_name: formData.course_name || undefined,
      };
      if (editingNote) {
        await api.put(`/courses/${editingNote.id}`, payload);
        toast.success(t("courses.noteUpdated"));
      } else {
        await api.post("/courses/", payload);
        toast.success(t("courses.noteCreated"));
      }
      setDialogOpen(false);
      fetchNotes();
      fetchCourseNames();
    } catch {
      toast.error("Failed to save note");
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = async (id: string) => {
    if (!confirm(t("courses.deleteConfirm"))) return;
    try {
      await api.delete(`/courses/${id}`);
      toast.success(t("courses.noteDeleted"));
      fetchNotes();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const cleanText = async () => {
    if (!formData.raw_transcript.trim()) return;
    setAiLoading(true);
    try {
      const res = await api.post("/courses/ai/clean-text", { text: formData.raw_transcript }) as any;
      if (res) {
        setFormData({ ...formData, raw_transcript: res.cleaned_text });
        toast.success(t("courses.textCleaned"));
      }
    } catch {
      toast.error("AI cleaning failed");
    } finally {
      setAiLoading(false);
    }
  };

  const generateNotes = async () => {
    if (!formData.raw_transcript.trim()) return;
    setAiLoading(true);
    try {
      const res = await api.post("/courses/ai/generate-notes", {
        text: formData.raw_transcript,
        course_name: formData.course_name,
      }) as any;
      if (res) {
        toast.success(t("courses.notesGenerated"));
        // Save as new note with generated content
        await api.post("/courses/", {
          title: formData.title || "AI Generated Notes",
          raw_transcript: formData.raw_transcript,
          course_name: formData.course_name || undefined,
          structured_notes: res.structured_notes,
        });
        setDialogOpen(false);
        fetchNotes();
      }
    } catch {
      toast.error("AI generation failed");
    } finally {
      setAiLoading(false);
    }
  };

  const startDesktopCapture = async () => {
    const invoke = getTauriInvoke();
    if (!invoke) {
      toast.info("请在 Mnemo 桌面端使用录课桥接");
      return;
    }
    setCaptureBusy(true);
    try {
      const status = await invoke<TauriCaptureStatus>("start_audio_capture", {
        courseName: formData.course_name || formData.title || "Untitled course",
      });
      setCaptureStatus(status);
      toast.success("桌面录课桥接已启动");
    } catch (err) {
      if (invoke) {
        const message = err instanceof Error ? err.message : "start_capture_failed";
        try {
          const failedStatus = await invoke<TauriCaptureStatus>("mark_capture_failed", { error: message });
          setCaptureStatus(failedStatus);
        } catch {}
      }
      toast.error(err instanceof Error ? err.message : "启动录课桥接失败");
    } finally {
      setCaptureBusy(false);
    }
  };

  const stopDesktopCapture = async () => {
    const invoke = getTauriInvoke();
    if (!invoke) return;
    setCaptureBusy(true);
    try {
      await invoke("stop_audio_capture");
      const result = await invoke<TauriTranscriptionResult>("trigger_transcription");
      setCaptureStatus((prev) => prev ? { ...prev, running: false, duration_seconds: result.duration_seconds, chunk_count: result.chunk_count } : null);
      setFormData((prev) => ({
        ...prev,
        title: prev.title || result.course_name || "桌面录课转写",
        course_name: prev.course_name || result.course_name || "",
        raw_transcript: [prev.raw_transcript, result.transcript].filter(Boolean).join("\n\n"),
      }));
      toast.success("转写已填入笔记草稿");
    } catch (err) {
      const message = err instanceof Error ? err.message : "stop_capture_failed";
      try {
        const failedStatus = await invoke<TauriCaptureStatus>("mark_capture_failed", { error: message });
        setCaptureStatus(failedStatus);
      } catch {}
      toast.error(err instanceof Error ? err.message : "停止录课桥接失败");
    } finally {
      setCaptureBusy(false);
    }
  };

  if (loading) return <AppLayout><ListSkeleton count={3} /></AppLayout>;
  if (error) return <AppLayout><ErrorState message={error} onRetry={fetchNotes} /></AppLayout>;

  if (viewingNote) {
    return (
      <AppLayout>
        <div className="space-y-4">
          <button onClick={() => setViewingNote(null)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            {t("common.back")}
          </button>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">{viewingNote.title}</CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    {viewingNote.course_name && <Badge variant="outline">{viewingNote.course_name}</Badge>}
                    {viewingNote.duration_seconds && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {Math.floor(viewingNote.duration_seconds / 60)}min
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => { openEditDialog(viewingNote); setViewingNote(null); }}>
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { deleteNote(viewingNote.id); setViewingNote(null); }}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {viewingNote.summary && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">{t("courses.summary")}</h3>
                  <p className="text-sm">{viewingNote.summary}</p>
                </div>
              )}
              {viewingNote.structured_notes && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">{t("courses.structuredNotes")}</h3>
                  <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: simpleMarkdown(viewingNote.structured_notes) }} />
                </div>
              )}
              {viewingNote.cleaned_text && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">{t("courses.cleanedText")}</h3>
                  <p className="text-sm whitespace-pre-wrap">{viewingNote.cleaned_text}</p>
                </div>
              )}
              {viewingNote.raw_transcript && (
                <details>
                  <summary className="text-sm font-medium text-muted-foreground cursor-pointer">{t("courses.rawTranscript")}</summary>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{viewingNote.raw_transcript}</p>
                </details>
              )}
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-card/80">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Mic className={`h-4 w-4 ${captureStatus?.running ? "text-red-500" : "text-primary"}`} />
                <span className="font-medium">桌面录课桥接</span>
                <Badge variant={captureStatus?.running ? "default" : captureStatus?.failed ? "destructive" : "secondary"}>
                  {captureStatus?.running ? "录制中" : captureStatus?.failed ? "采集异常" : isDesktopBridge ? "桌面端就绪" : "仅桌面端可用"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {isDesktopBridge
                  ? `会话 ${captureStatus?.session_id || "-"} · ${captureStatus?.duration_seconds || 0}s · ${captureStatus?.chunk_count || 0} 段 · 重试 ${captureStatus?.retry_count || 0} 次`
                  : "Web 端先保留入口；在 Mnemo 桌面端中可启动捕获、停止并把转写填入笔记草稿。"}
              </p>
              {captureStatus?.last_error && (
                <p className="text-xs text-red-500">最近错误: {captureStatus.last_error}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={refreshCaptureStatus} disabled={captureBusy}>
                <RotateCcw className="h-4 w-4 mr-1" />
                刷新
              </Button>
              {captureStatus?.running ? (
                <Button onClick={stopDesktopCapture} disabled={captureBusy}>
                  {captureBusy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileText className="h-4 w-4 mr-1" />}
                  停止并转写
                </Button>
              ) : (
                <Button onClick={startDesktopCapture} disabled={captureBusy || !isDesktopBridge}>
                  {captureBusy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Mic className="h-4 w-4 mr-1" />}
                  开始捕获
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("courses.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select value={filterCourse} onChange={(e) => setFilterCourse(e.target.value)}
          className="h-9 rounded-lg border border-border/50 bg-card px-3 text-sm backdrop-blur-sm">
          <option value="all">{t("courses.allCourses")}</option>
          {courseNames.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-1" />
          {t("courses.newNote")}
        </Button>
      </div>

      {/* Notes List */}
      {filteredNotes.length === 0 ? (
        <EmptyState
          title={t("courses.noNotes")}
          description={t("courses.noNotesDesc")}
          action={<Button onClick={openCreateDialog}><Plus className="h-4 w-4 mr-1" />{t("courses.newNote")}</Button>}
        />
      ) : (
        <div className="space-y-2">
          {filteredNotes.map((note) => (
            <Card key={note.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setViewingNote(note)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium truncate">{note.title}</h3>
                      {note.course_name && <Badge variant="secondary" className="text-xs shrink-0">{note.course_name}</Badge>}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(note.created_at).toLocaleDateString("zh-CN")}
                      </span>
                      {note.duration_seconds && (
                        <span className="text-xs text-muted-foreground">{Math.floor(note.duration_seconds / 60)}min</span>
                      )}
                      {note.structured_notes && (
                        <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          <Sparkles className="h-3 w-3 mr-0.5" />AI
                        </Badge>
                      )}
                    </div>
                    {note.summary && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">{note.summary}</p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingNote ? t("courses.editNote") : t("courses.newNote")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">{t("courses.noteTitle")}</label>
              <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={t("courses.noteTitlePlaceholder")} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">{t("courses.courseName")}</label>
              <Input value={formData.course_name} onChange={(e) => setFormData({ ...formData, course_name: e.target.value })}
                placeholder={t("courses.courseNamePlaceholder")} className="mt-1" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium">{t("courses.transcript")}</label>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={cleanText} disabled={aiLoading || !formData.raw_transcript.trim()}>
                    {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {t("courses.cleanText")}
                  </Button>
                </div>
              </div>
              <textarea value={formData.raw_transcript} onChange={(e) => setFormData({ ...formData, raw_transcript: e.target.value })}
                placeholder={t("courses.transcriptPlaceholder")} rows={8}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            {formData.raw_transcript.trim() && (
              <Button onClick={generateNotes} disabled={aiLoading} className="w-full">
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Brain className="h-4 w-4 mr-1" />}
                {t("courses.generateNotes")}
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={saveNote} disabled={saving || !formData.title.trim()}>
              {saving ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════
// Chat Tab
// ═══════════════════════════════════════

function ChatTab() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);
    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await api.post("/courses/ai/chat", {
        message: userMsg,
        context,
        history,
      }) as any;
      if (res) {
        setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
      }
    } catch {
      toast.error("AI chat failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-220px)]">
      {/* Context input */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="h-4 w-4 text-gray-500" />
          <label className="text-sm font-medium text-gray-500">{t("courses.chatContext")}</label>
        </div>
        <textarea value={context} onChange={(e) => setContext(e.target.value)}
          placeholder={t("courses.chatContextPlaceholder")} rows={2}
          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>

      {/* Messages */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <MessageCircle className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" />
              <p className="mt-4 text-gray-500">{t("courses.chatWelcome")}</p>
              <p className="text-sm text-gray-400 mt-1">{t("courses.chatWelcomeDesc")}</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              }`}>
                <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: simpleMarkdown(msg.content) }} />
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg px-4 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-3">
          <div className="flex gap-2">
            <Input value={input} onChange={(e) => setInput(e.target.value)}
              placeholder={t("courses.chatPlaceholder")}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              className="flex-1" />
            <Button onClick={sendMessage} disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Helpers ──

function simpleMarkdown(text: string): string {
  return text
    .replace(/^### (.+)$/gm, '<h3 class="font-semibold mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-bold text-lg mt-4 mb-1">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="font-bold text-xl mt-4 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-gray-200 dark:bg-gray-600 px-1 rounded text-xs">$1</code>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal">$2</li>')
    .replace(/\n/g, '<br/>');
}
