"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useTranslation } from "@/lib/i18n";
import { api } from "@/lib/api";
import { useSettingsStore } from "@/stores/settings";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ListSkeleton } from "@/components/ui/skeleton";
import { Confetti } from "@/components/ui/celebrations";
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
  Brain,
  Layers,
  RotateCcw,
  Sparkles,
  PenTool,
  Link2,
  Timer,
  Headphones,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Check,
  Star,
  BookOpen,
  BarChart3,
  RefreshCw,
  Lightbulb,
  Eye,
  EyeOff,
  Filter,
  Upload,
  FileText,
  Loader2,
  Play,
  AlertTriangle,
  WandSparkles,
} from "lucide-react";


import {
  MemoryCard, CardSet, MemoryStats, TrainingSessionSummary,
  GroupCardProgress, GamificationState,
  GROUP_SIZE_OPTIONS, PASS_STREAK_TARGET,
  WRONG_REASON_LABELS_MAP, WRONG_REASON_COLORS,
  MODE_LABELS, MODE_DESCRIPTIONS, MODE_ICONS,
  getComboMultiplier, getStreakMilestone, getReviewCountdown,
  CountdownBadge,
} from "@/lib/memory-types";

// ── Component ──

export default function MemoryPage() {
  const { t } = useTranslation();
  const { defaultReviewMode, hydrate: hydrateSettings } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<"review" | "library" | "wrongbook" | "stats">("review");
  const [cards, setCards] = useState<MemoryCard[]>([]);
  const [cardSets, setCardSets] = useState<CardSet[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [sessionSummary, setSessionSummary] = useState<TrainingSessionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCards, setTotalCards] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Library filters & sort
  const [search, setSearch] = useState("");
  const [filterSet, setFilterSet] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState<"created" | "review_count" | "source_text">("created");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 200;

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<MemoryCard | null>(null);
  const [formData, setFormData] = useState({
    source_text: "",
    target_text: "",
    source_lang: "en",
    target_lang: "zh",
    domain: "通用",
    difficulty: 3,
    card_type: "bilingual",
  });
  const [saving, setSaving] = useState(false);

  // Import state
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    name: string;
    source_type: string;
    card_count: number;
    preview: Array<{ source_text: string; target_text: string; card_type?: string }>;
    cards: Array<{
      source_text: string;
      target_text: string;
      source_lang?: string;
      target_lang?: string;
      domain?: string;
      card_type?: string;
    }>;
  } | null>(null);
  const [importSetName, setImportSetName] = useState("");
  const [importConfirmed, setImportConfirmed] = useState(false);

  // CASR Review state
  const [reviewQueue, setReviewQueue] = useState<any[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [flippedAt, setFlippedAt] = useState(0);
  const [cardShownAt, setCardShownAt] = useState(0);
  const [flipCount, setFlipCount] = useState(0);
  const [reviewStepLocked, setReviewStepLocked] = useState(false);
  const [lastCASRResult, setLastCASRResult] = useState<any>(null);
  const [aiDiagnosis, setAiDiagnosis] = useState<any>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [modeRecommendation, setModeRecommendation] = useState<any>(null);
  const [reviewSessionStats, setReviewSessionStats] = useState({ forgot: 0, fuzzy: 0, remembered: 0 });
  const [sessionInsight, setSessionInsight] = useState<{ summary: string; weak_points: string[]; suggestions: string[]; encouragement: string } | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [reviewMode, setReviewMode] = useState<"standard" | "write_en_to_zh" | "write_zh_to_en" | "cloze" | "paragraph">("write_en_to_zh");
  const [answerText, setAnswerText] = useState("");
  const [wrongbook, setWrongbook] = useState<any[]>([]);
  const [wrongbookReasonDist, setWrongbookReasonDist] = useState<Record<string, number>>({});
  const [wrongbookFilter, setWrongbookFilter] = useState<string>("all");
  const [expandedWrongCard, setExpandedWrongCard] = useState<string | null>(null);
  const [reviewSource, setReviewSource] = useState<"general" | "wrongbook">("general");
  const [reviewDeckId, setReviewDeckId] = useState("all");
  const [reviewScope, setReviewScope] = useState<"due" | "recent" | "random" | "wrongbook">("due");
  const [reviewFlow, setReviewFlow] = useState<"first" | "review" | "fragment">("first");
  const [groupSize, setGroupSize] = useState(10);
  const [groupProgress, setGroupProgress] = useState<Record<string, GroupCardProgress>>({});
  const [groupTotal, setGroupTotal] = useState(0);
  const [groupPassed, setGroupPassed] = useState(0);
  const pendingAdvanceRef = useRef<{
    remainingQueue: any[];
    nextIndex: number;
    nextMode: "standard" | "write_en_to_zh" | "write_zh_to_en" | "cloze" | "paragraph";
  } | null>(null);
  /** 反馈出现后必须手动点「继续」再进下一题（无定时器自动切题，避免秒跳） */
  const [awaitingManualAdvance, setAwaitingManualAdvance] = useState(false);

  // Gamification state
  const [game, setGame] = useState<GamificationState>({
    globalStreak: 0,
    bestStreak: 0,
    totalScore: 0,
    sessionScore: 0,
    lastScoreDelta: 0,
    streakMilestone: null,
  });
  const streakMilestoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reviewQueueRef = useRef<any[]>([]);
  const reviewSessionStatsRef = useRef({ forgot: 0, fuzzy: 0, remembered: 0 });
  const gameRef = useRef({ sessionScore: 0 });

  // Keep refs in sync with state (for use in async callbacks)
  useEffect(() => { reviewQueueRef.current = reviewQueue; }, [reviewQueue]);
  useEffect(() => { reviewSessionStatsRef.current = reviewSessionStats; }, [reviewSessionStats]);
  useEffect(() => { gameRef.current = { sessionScore: game.sessionScore }; }, [game.sessionScore]);
  const [sessionComplete, setSessionComplete] = useState(false);

  // Card detail panel
  const [detailCard, setDetailCard] = useState<any>(null);
  const [encounters, setEncounters] = useState<any[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);

  // ── Data Fetching ──

  const fetchCardSets = useCallback(async () => {
    try {
      const res = await api.get("/memory/sets") as any;
      if (res) setCardSets(res);
    } catch { /* optional */ }
  }, []);

  const fetchCards = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
        sort: sortBy,
        order: sortOrder,
      });
      if (filterSet !== "all") params.set("card_set_id", filterSet);
      if (filterStatus === "mastered") params.set("mastered", "true");
      else if (filterStatus === "new") params.set("mastered", "false"); // will filter client-side
      const res = await api.get(`/memory/?${params}`) as any;
      if (res) {
        let items = res.items || [];
        // Client-side filter for "new" (review_count === 0)
        if (filterStatus === "new") {
          items = items.filter((c: MemoryCard) => c.review_count === 0);
        } else if (filterStatus === "learning") {
          items = items.filter((c: MemoryCard) => !c.is_mastered && c.review_count > 0);
        }
        // Client-side search
        if (search) {
          const q = search.toLowerCase();
          items = items.filter((c: MemoryCard) =>
            c.source_text.toLowerCase().includes(q) || c.target_text.toLowerCase().includes(q)
          );
        }
        setCards(items);
        setTotalCards(res.total || 0);
      }
    } catch {
      setError("Failed to load cards");
    }
  }, [page, pageSize, sortBy, sortOrder, filterSet, filterStatus, search]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get("/memory/stats") as any;
      if (res) {
        setStats(res);
      }
    } catch {
      // stats optional
    }
  }, []);

  const fetchSessionSummary = useCallback(async () => {
    try {
      const res = await api.get("/memory/training/session-summary?hours=24") as TrainingSessionSummary;
      if (res) setSessionSummary(res);
    } catch {
      setSessionSummary(null);
    }
  }, []);

  const fetchSessionInsight = useCallback(async () => {
    setInsightLoading(true);
    setSessionInsight(null);
    try {
      const cardIds = reviewQueueRef.current.map(c => c.id);
      const res = await api.post("/memory/training/session-insight", {
        remembered: reviewSessionStatsRef.current.remembered,
        fuzzy: reviewSessionStatsRef.current.fuzzy,
        forgot: reviewSessionStatsRef.current.forgot,
        score: gameRef.current.sessionScore,
        card_ids: cardIds,
      }) as any;
      if (res) setSessionInsight(res);
    } catch {
      // Silent fail — insight is optional
    } finally {
      setInsightLoading(false);
    }
  }, []);

  const fetchWrongbook = useCallback(async () => {
    try {
      const res = await api.get("/memory/wrongbook") as any;
      setWrongbook(res?.items || []);
      setWrongbookReasonDist(res?.reason_distribution || {});
    } catch {
      setWrongbook([]);
      setWrongbookReasonDist({});
    }
  }, []);

  const fetchModeRecommendation = useCallback(async () => {
    try {
      const res = await api.get("/memory/recommend-mode") as any;
      setModeRecommendation(res);
    } catch {
      setModeRecommendation(null);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchCardSets(), fetchCards(), fetchStats(), fetchWrongbook(), fetchSessionSummary(), fetchModeRecommendation()]).finally(() => setLoading(false));
  }, [fetchCardSets, fetchCards, fetchStats, fetchWrongbook, fetchSessionSummary, fetchModeRecommendation]);

  useEffect(() => {
    hydrateSettings();
  }, [hydrateSettings]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!reviewing) {
      setReviewMode(defaultReviewMode);
    }
  }, [defaultReviewMode, reviewing]);

  // ── CRUD ──

  const openCreateDialog = () => {
    setEditingCard(null);
    setFormData({ source_text: "", target_text: "", source_lang: "en", target_lang: "zh", domain: "通用", difficulty: 3, card_type: "bilingual" });
    setDialogOpen(true);
  };

  const openEditDialog = (card: MemoryCard) => {
    setEditingCard(card);
    setFormData({
      source_text: card.source_text,
      target_text: card.target_text,
      source_lang: card.source_lang,
      target_lang: card.target_lang,
      domain: card.domain,
      difficulty: card.difficulty,
      card_type: card.card_type,
    });
    setDialogOpen(true);
  };

  const saveCard = async () => {
    if (!formData.source_text.trim() || !formData.target_text.trim()) return;
    setSaving(true);
    try {
      if (editingCard) {
        await api.put(`/memory/${editingCard.id}`, formData);
        toast.success(t("memory.cardUpdated"));
      } else {
        await api.post("/memory/", formData);
        toast.success(t("memory.cardCreated"));
      }
      setDialogOpen(false);
      fetchCards();
      fetchStats();
      fetchSessionSummary();
    } catch {
      toast.error("Error saving card");
    } finally {
      setSaving(false);
    }
  };

  const deleteCard = async (cardId: string) => {
    if (!confirm(t("memory.deleteConfirm"))) return;
    try {
      await api.delete(`/memory/${cardId}`);
      toast.success(t("memory.cardDeleted"));
      fetchCards();
      fetchStats();
      fetchSessionSummary();
    } catch {
      toast.error("Error deleting card");
    }
  };

  const openDetail = async (card: any) => {
    setDetailCard(card);
    setDetailOpen(true);
    try {
      const res = await api.get(`/memory/casr/encounters/${card.id}?limit=20`) as any;
      setEncounters(res?.items || []);
    } catch {
      setEncounters([]);
    }
  };

  // ── Import ──

  const openImportDialog = () => {
    setImportResult(null);
    setImportSetName("");
    setImportConfirmed(false);
    setImportOpen(true);
  };

  const parseTextCards = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const cards: NonNullable<typeof importResult>["cards"] = [];

    for (const line of lines) {
      const separator = line.includes("\t") ? "\t" : line.includes("|") ? "|" : line.includes(",") ? "," : null;
      if (!separator) continue;
      const [left, right] = line.split(separator).map((part) => part.trim());
      if (!left || !right) continue;
      const leftHasZh = /[\u4e00-\u9fff]/.test(left);
      const rightHasZh = /[\u4e00-\u9fff]/.test(right);
      cards.push({
        source_text: leftHasZh && !rightHasZh ? right : left,
        target_text: leftHasZh && !rightHasZh ? left : right,
        source_lang: leftHasZh && !rightHasZh ? "en" : "zh",
        target_lang: leftHasZh && !rightHasZh ? "zh" : "en",
        card_type: Math.max(left.length, right.length) < 30 ? "term" : "sentence",
      });
    }

    return cards;
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      const name = importSetName.trim() || file.name.replace(/\.[^.]+$/, "");

      if (extension === "txt" || extension === "csv") {
        const cards = await parseTextCards(file);
        if (cards.length === 0) throw new Error("empty text import");
        setImportSetName(name);
        setImportResult({
          name,
          source_type: "text",
          card_count: cards.length,
          preview: cards.slice(0, 5),
          cards,
        });
        return;
      }

      const endpoint = extension === "xlsx" || extension === "xls"
        ? "/memory/import/excel"
        : extension === "docx" || extension === "doc"
          ? "/memory/import/docx"
          : null;
      if (!endpoint) throw new Error("unsupported file type");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", name);
      const res = await api.postForm(endpoint, formData) as NonNullable<typeof importResult>;
      if (res) {
        setImportSetName(res.name);
        setImportResult(res);
      }
    } catch {
      toast.error("导入失败，请检查文件格式");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const confirmImport = async () => {
    if (!importResult) return;
    setImportConfirmed(true);
    try {
      await api.post(`/memory/import/confirm`, {
        name: importSetName.trim() || importResult.name,
        source_type: importResult.source_type,
        domain: "通用",
        cards: importResult.cards,
      });
      toast.success(`成功导入 ${importResult.card_count} 张卡片`);
      setImportOpen(false);
      fetchCardSets();
      fetchCards();
      fetchStats();
      fetchSessionSummary();
    } catch {
      toast.error("确认导入失败");
      setImportConfirmed(false);
    }
  };

  // ── Review ──

  const startCASRReview = async (cardSetId?: string, mode: "standard" | "write_en_to_zh" | "write_zh_to_en" | "cloze" = "standard") => {
    try {
      const query = new URLSearchParams({ mode });
      if (cardSetId) query.set("card_set_id", cardSetId);
      const params = `?${query.toString()}`;
      const res = await api.get(`/memory/casr/queue${params}`) as any;
      if (res) {
        const queue = res.items || [];
        if (queue.length === 0) {
          toast.info(t("memory.noDueCards"));
          return;
        }
        const group = queue.slice(0, groupSize);
        const initialProgress = Object.fromEntries(
          group.map((card: any) => [card.id, { streak: 0, progress: 0, attempts: 0, passed: false }])
        );
        setReviewQueue(group);
        setReviewIndex(0);
        setShowAnswer(false);
        setReviewing(true);
        setCardShownAt(Date.now());
        setFlipCount(0);
        setReviewStepLocked(false);
        setLastCASRResult(null);
        setReviewSessionStats({ forgot: 0, fuzzy: 0, remembered: 0 });
        setGame({ globalStreak: 0, bestStreak: 0, totalScore: 0, sessionScore: 0, lastScoreDelta: 0, streakMilestone: null });
        setSessionComplete(false);
        setReviewMode(mode);
        setReviewSource("general");
        setGroupProgress(initialProgress);
        setGroupTotal(group.length);
        setGroupPassed(0);
        setAnswerText("");
        pendingAdvanceRef.current = null;
        setAwaitingManualAdvance(false);
      }
    } catch {
      toast.error("Failed to load review queue");
    }
  };

  const startLearning = (cardSetId?: string) => {
    // Use CASR queue for new cards too
    startCASRReview(cardSetId, "write_en_to_zh");
  };

  const shuffleCards = (items: any[]) => [...items].sort(() => Math.random() - 0.5);

  const buildReviewItem = (card: MemoryCard, mode: "write_en_to_zh" | "write_zh_to_en" | "cloze" | "paragraph" = "write_en_to_zh") => {
    const item: any = {
      ...card,
      mode,
      evolution_mode: getReviewCountdown(card, nowMs).due ? "standard" : "hint",
      prompt_text: card.source_text,
      expected_answer: card.target_text,
    };
    if (mode === "write_zh_to_en") {
      item.prompt_text = card.target_text;
      item.expected_answer = card.source_text;
    }
    if (mode === "cloze") {
      const words = card.source_text.split(/\s+/).filter(Boolean);
      const blankIndex = Math.max(0, Math.floor(words.length / 2));
      item.expected_answer = words[blankIndex] || card.target_text;
      item.prompt_text = words.length > 1
        ? words.map((word, index) => index === blankIndex ? "_____" : word).join(" ")
        : card.source_text.replace(item.expected_answer, "_____");
    }
    if (mode === "paragraph") {
      item.prompt_text = card.target_text;
      item.expected_answer = card.source_text;
    }
    return item;
  };

  const startSmartSession = async (flow: "first" | "review" | "fragment") => {
    try {
      const res = await api.get("/memory/?page=1&page_size=2000&sort=created&order=desc") as any;
      let pool: MemoryCard[] = res?.items || [];
      if (reviewDeckId !== "all") {
        pool = pool.filter((card) => card.card_set_id === reviewDeckId);
      }

      if (flow === "first") {
        pool = pool.filter((card) => card.review_count === 0);
      } else {
        pool = pool.filter((card) => card.review_count > 0);
        if (reviewScope === "due") {
          pool = pool.filter((card) => getReviewCountdown(card, nowMs).due);
        } else if (reviewScope === "recent") {
          pool = pool.sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
        } else if (reviewScope === "wrongbook") {
          pool = pool
            .filter((card) => (card.wrong_count || 0) > 0)
            .sort((a, b) => (b.wrong_count || 0) - (a.wrong_count || 0));
        } else {
          pool = shuffleCards(pool);
        }
      }

      if (flow === "fragment") {
        pool = shuffleCards(pool);
      }

      // Smart mode selection: pick mode based on card state (confidence + error pattern)
      const group = pool.slice(0, groupSize).map((card) => {
        const conf = card.confidence || 0;
        const wrongReason = (card as any).last_wrong_reason || "";
        const wrongCount = card.wrong_count || 0;
        let mode: "write_en_to_zh" | "write_zh_to_en" | "cloze" | "paragraph";

        if (flow === "fragment") {
          const modes: Array<"write_en_to_zh" | "write_zh_to_en" | "cloze" | "paragraph"> = ["write_en_to_zh", "write_zh_to_en", "cloze", "paragraph"];
          mode = modes[Math.floor(Math.random() * modes.length)];
        } else if (flow === "first") {
          // New cards: use text features to pick mode
          const srcLen = card.source_text?.length || 0;
          const wordCount = (card.source_text || "").split(/\s+/).filter(Boolean).length;
          if (wordCount <= 3 && srcLen <= 30) {
            mode = "write_en_to_zh"; // Short terms: basic recall
          } else if (wordCount <= 8) {
            mode = "cloze"; // Medium phrases: cloze for targeted recall
          } else {
            mode = "write_en_to_zh"; // Long sentences: start with basic
          }
        } else {
          // Review: error-pattern-aware + confidence-based
          if (wrongReason === "spelling" && wrongCount >= 2) {
            mode = "cloze";
          } else if (wrongReason === "word_order" && wrongCount >= 2) {
            mode = "paragraph";
          } else if ((wrongReason === "forgot" || wrongReason === "omission") && wrongCount >= 3) {
            mode = "write_en_to_zh";
          } else if (wrongReason === "grammar" && wrongCount >= 2) {
            mode = "paragraph";
          } else if (conf < 30) {
            mode = "write_en_to_zh";
          } else if (conf < 60) {
            mode = "write_zh_to_en";
          } else if (conf < 80) {
            mode = "cloze";
          } else {
            mode = "paragraph";
          }
        }
        return buildReviewItem(card, mode);
      });
      if (group.length === 0) {
        toast.info(flow === "first" ? "暂无初见卡片" : "当前范围暂无可练内容");
        return;
      }

      const initialProgress = Object.fromEntries(
        group.map((card: any) => [card.id, { streak: 0, progress: 0, attempts: 0, passed: false }])
      );
      setReviewQueue(group);
      setReviewIndex(0);
      setShowAnswer(false);
      setReviewing(true);
      setCardShownAt(Date.now());
      setFlippedAt(0);
      setFlipCount(0);
      setReviewStepLocked(false);
      setLastCASRResult(null);
      setReviewSessionStats({ forgot: 0, fuzzy: 0, remembered: 0 });
      setGame({ globalStreak: 0, bestStreak: 0, totalScore: 0, sessionScore: 0, lastScoreDelta: 0, streakMilestone: null });
      setSessionComplete(false);
      setReviewMode(group[0]?.mode || "write_en_to_zh");
      setReviewFlow(flow);
      setReviewSource("general");
      setGroupProgress(initialProgress);
      setGroupTotal(group.length);
      setGroupPassed(0);
      setAnswerText("");
      pendingAdvanceRef.current = null;
      setAwaitingManualAdvance(false);
    } catch {
      toast.error("Failed to start training");
    }
  };

  const startWrongbookReview = async () => {
    try {
      const res = await api.get(`/memory/wrongbook/review-queue?limit=30`) as any;
      const queue = res?.items || [];
      if (queue.length === 0) {
        toast.info(t("memory.wrongbookEmpty"));
        return;
      }
      const group = queue.slice(0, groupSize);
      const initialProgress = Object.fromEntries(
        group.map((card: any) => [card.id, { streak: 0, progress: 0, attempts: 0, passed: false }])
      );
      setReviewQueue(group);
      setReviewIndex(0);
      setShowAnswer(false);
      setReviewing(true);
      setCardShownAt(Date.now());
      setFlipCount(0);
      setReviewStepLocked(false);
      setLastCASRResult(null);
      setReviewSessionStats({ forgot: 0, fuzzy: 0, remembered: 0 });
      setGame({ globalStreak: 0, bestStreak: 0, totalScore: 0, sessionScore: 0, lastScoreDelta: 0, streakMilestone: null });
      setSessionComplete(false);
      setReviewMode("write_en_to_zh");
      setReviewSource("wrongbook");
      setGroupProgress(initialProgress);
      setGroupTotal(group.length);
      setGroupPassed(0);
      setAnswerText("");
      pendingAdvanceRef.current = null;
      setAwaitingManualAdvance(false);
    } catch {
      toast.error("Failed to load wrongbook queue");
    }
  };

  const requestAiDiagnosis = async () => {
    if (!lastCASRResult || !reviewQueue[reviewIndex]) return;
    const card = reviewQueue[reviewIndex];
    setDiagnosing(true);
    try {
      const res = await api.post("/memory/diagnose", {
        source_text: card.source_text || "",
        expected: lastCASRResult.expected_answer || "",
        actual: lastCASRResult.answer || "",
        mode: lastCASRResult.mode || "write_en_to_zh",
        score: lastCASRResult.score || 0,
      }) as any;
      setAiDiagnosis(res);
    } catch {
      toast.error("AI 分析失败，请重试");
    } finally {
      setDiagnosing(false);
    }
  };

  const continueToNextCard = () => {
    setAwaitingManualAdvance(false);
    const p = pendingAdvanceRef.current;
    pendingAdvanceRef.current = null;
    if (!p) {
      setReviewStepLocked(false);
      toast.error("无法进入下一题，请关闭训练后重新开始");
      return;
    }
    setReviewQueue(p.remainingQueue);
    setReviewIndex(p.nextIndex);
    setReviewMode(p.nextMode);
    setShowAnswer(false);
    setCardShownAt(Date.now());
    setFlippedAt(0);
    setFlipCount(0);
    setReviewStepLocked(false);
    setLastCASRResult(null);
    setAiDiagnosis(null);
    setAnswerText("");
  };

  const handleFlip = () => {
    if (reviewStepLocked) return;
    if (!showAnswer) {
      setFlippedAt(Date.now());
      setFlipCount(prev => prev + 1);
      setShowAnswer(true);
    } else {
      setFlipCount(prev => prev + 1);
    }
  };

  const completeReviewStep = async (res: any) => {
    const card = reviewQueue[reviewIndex];
    if (!card) {
      setReviewStepLocked(false);
      return;
    }
    const raw = res?.result;
    const result: "forgot" | "fuzzy" | "remembered" =
      raw === "remembered" || raw === "fuzzy" || raw === "forgot" ? raw : "forgot";

    // Merge server CASR state into queue so 算法信心 / 模式 badge match API after each step
    const queueSynced = reviewQueue.map((item: any) =>
      item.id !== card.id
        ? item
        : {
            ...item,
            confidence:
              typeof res?.confidence_after === "number" ? res.confidence_after : item.confidence,
            evolution_mode: res?.evolution_mode ?? item.evolution_mode,
            is_mastered: typeof res?.is_mastered === "boolean" ? res.is_mastered : item.is_mastered,
          }
    );

    const currentProgress = groupProgress[card.id] || { streak: 0, progress: 0, attempts: 0, passed: false };
    const nextProgress: GroupCardProgress = {
      attempts: currentProgress.attempts + 1,
      streak: result === "remembered" ? currentProgress.streak + 1 : 0,
      progress: Math.max(
        0,
        Math.min(
          100,
          currentProgress.progress + (
            result === "remembered" ? 34 :
            result === "fuzzy" ? 15 :
            -20
          )
        )
      ),
      passed: false,
    };
    nextProgress.passed = nextProgress.streak >= PASS_STREAK_TARGET || nextProgress.progress >= 100;
    const updatedProgress = { ...groupProgress, [card.id]: nextProgress };
    const remainingQueue = nextProgress.passed
      ? queueSynced.filter((item) => item.id !== card.id)
      : queueSynced;
    const nextIndex = nextProgress.passed
      ? reviewIndex % Math.max(remainingQueue.length, 1)
      : (reviewIndex + 1) % Math.max(remainingQueue.length, 1);

    // Keep local queue in sync with server fields while feedback is shown (before advance / 继续)
    setReviewQueue(queueSynced);

    setLastCASRResult(res);
    // Auto-populate AI diagnosis from evaluate response
    if (res?.ai_diagnosis) {
      setAiDiagnosis(res.ai_diagnosis);
    }
    setGroupProgress(updatedProgress);
    setReviewSessionStats(prev => ({ ...prev, [result]: prev[result] + 1 }));

    // ── Gamification: update streak & score ──
    setGame(prev => {
      const isCorrect = result === "remembered" || result === "fuzzy";
      const newStreak = isCorrect ? prev.globalStreak + 1 : 0;
      const newBest = Math.max(prev.bestStreak, newStreak);
      const multiplier = getComboMultiplier(newStreak);
      const basePoints = result === "remembered" ? 10 : result === "fuzzy" ? 5 : 0;
      const isFirstCorrect = currentProgress.attempts === 0 && isCorrect;
      const bonusPoints = isFirstCorrect ? 5 : 0;
      const delta = Math.round((basePoints + bonusPoints) * multiplier);
      const milestone = getStreakMilestone(newStreak);

      if (milestone && streakMilestoneTimerRef.current) {
        clearTimeout(streakMilestoneTimerRef.current);
      }
      if (milestone) {
        streakMilestoneTimerRef.current = setTimeout(() => {
          setGame(g => ({ ...g, streakMilestone: null }));
        }, 1500);
      }

      return {
        globalStreak: newStreak,
        bestStreak: newBest,
        totalScore: prev.totalScore + delta,
        sessionScore: prev.sessionScore + delta,
        lastScoreDelta: delta,
        streakMilestone: milestone,
      };
    });

    if (nextProgress.passed) {
      setGroupPassed(prev => prev + 1);
    }

    if (remainingQueue.length === 0) {
      pendingAdvanceRef.current = null;
      setAwaitingManualAdvance(false);
      if (reviewSource === "wrongbook" && nextProgress.passed) {
        try {
          await api.post(`/memory/wrongbook/${card.id}/clear`);
        } catch {
          toast.error("清除错题记录失败");
        }
      }
      setSessionComplete(true);
      setReviewStepLocked(false);
      fetchCards();
      fetchStats();
      fetchWrongbook();
      fetchSessionSummary();
      // Fetch AI session insight
      fetchSessionInsight();
    } else {
      const nextMode = (remainingQueue[nextIndex]?.mode || reviewMode) as
        "standard" | "write_en_to_zh" | "write_zh_to_en" | "cloze" | "paragraph";
      pendingAdvanceRef.current = {
        remainingQueue,
        nextIndex,
        nextMode,
      };
      setAwaitingManualAdvance(true);
      if (reviewSource === "wrongbook" && nextProgress.passed) {
        try {
          await api.post(`/memory/wrongbook/${card.id}/clear`);
        } catch {
          toast.error("清除错题记录失败");
        }
      }
    }
  };

  const submitCASRReview = async (result: "forgot" | "fuzzy" | "remembered") => {
    const card = reviewQueue[reviewIndex];
    if (!card || reviewStepLocked || lastCASRResult) return;
    setReviewStepLocked(true);

    const think_time = flippedAt ? flippedAt - cardShownAt : 0;
    const verify_time = flippedAt ? Date.now() - flippedAt : 0;

    try {
      const res = await api.post(`/memory/casr/review/${card.id}`, {
        result,
        think_time,
        verify_time,
        flip_count: Math.max(flipCount, 1),
      }) as any;

      await completeReviewStep(res);
    } catch {
      setReviewStepLocked(false);
      toast.error("Review failed");
    }
  };

  const submitWrittenAnswer = async () => {
    const card = reviewQueue[reviewIndex];
    if (!card || reviewStepLocked || lastCASRResult || showAnswer) return;
    const actual = String(answerText || "");
    if (!actual.trim()) return;
    setReviewStepLocked(true);

    const submittedAt = Date.now();
    try {
      const res = await api.post(`/memory/train/evaluate/${card.id}`, {
        answer: actual,
        mode: card.mode || reviewMode,
        think_time: Math.max(submittedAt - cardShownAt, 0),
        verify_time: 0,
        flip_count: Math.max(flipCount, 1),
      }) as any;
      setShowAnswer(true);
      setFlippedAt(submittedAt);
      await completeReviewStep(res);
    } catch {
      setReviewStepLocked(false);
      toast.error("Answer evaluation failed");
    }
  };

  /** 仅揭晓参考答案，不提交 CASR；用户再点 忘了/模糊/记得 与翻转卡流程一致 */
  const revealWrittenAnswer = () => {
    const card = reviewQueue[reviewIndex];
    if (!card || reviewStepLocked || lastCASRResult || showAnswer) return;
    const revealedAt = Date.now();
    setShowAnswer(true);
    setFlippedAt(revealedAt);
    setFlipCount((prev) => prev + 1);
  };

  // ── Filtered ──

  const domains = useMemo(() => [...new Set(cards.map((c) => c.domain))], [cards]);

  // Re-fetch when filters change
  useEffect(() => {
    setPage(1);
  }, [filterSet, filterStatus, sortBy, sortOrder]);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => { fetchCards(); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Timed mode: auto-flip after 5 seconds with countdown ──
  const [timedCountdown, setTimedCountdown] = useState(0);

  useEffect(() => {
    if (!reviewing || sessionComplete || reviewQueue.length === 0) {
      setTimedCountdown(0);
      return;
    }
    const card = reviewQueue[reviewIndex];
    if (!card) return;
    const mode = card.evolution_mode || "standard";
    if (mode !== "timed" || showAnswer || reviewStepLocked || lastCASRResult) {
      setTimedCountdown(0);
      return;
    }

    setTimedCountdown(5);
    const timer = setTimeout(() => {
      handleFlip();
      setTimedCountdown(0);
    }, 5000);

    const countdownInterval = setInterval(() => {
      setTimedCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(countdownInterval);
    };
  }, [reviewing, sessionComplete, reviewIndex, reviewQueue, showAnswer, reviewStepLocked, lastCASRResult]);

  // ── Flash mode: show answer for 1.5s then hide ──
  useEffect(() => {
    if (!reviewing || sessionComplete || reviewQueue.length === 0) return;
    const card = reviewQueue[reviewIndex];
    if (!card) return;
    const mode = card.evolution_mode || "standard";
    if (mode !== "flash" || !showAnswer || reviewStepLocked || lastCASRResult) return;

    const delay = 1500;
    const timer = setTimeout(() => {
      setShowAnswer(false);
    }, delay);
    return () => clearTimeout(timer);
  }, [reviewing, sessionComplete, reviewIndex, reviewQueue, showAnswer, reviewStepLocked, lastCASRResult]);

  // ── Render ──

  if (loading) return <AppLayout><ListSkeleton count={5} /></AppLayout>;
  if (error) return <AppLayout><ErrorState message={error} onRetry={fetchCards} /></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("memory.title")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {stats?.total || 0} {t("memory.cards")} · {stats?.due_today || 0} {t("memory.dueToday")}
              {(stats?.unreleased ?? 0) > 0 && (
                <span className="text-amber-500 ml-1">· {stats!.unreleased} 待释放</span>
              )}
            </p>
          </div>
          {activeTab === "library" && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={openImportDialog} className="rounded-xl border-border/50 hover:bg-muted/50">
                <Upload className="h-4 w-4 mr-1" />
                {t("memory.importCards")}
              </Button>
              <Button onClick={openCreateDialog} className="rounded-xl bg-gradient-brand hover:opacity-90 shadow-lg shadow-primary/20 btn-press">
                <Plus className="h-4 w-4 mr-1" />
                {t("memory.newCard")}
              </Button>
            </div>
          )}
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 bg-muted/50 backdrop-blur-sm rounded-xl p-1 border border-border/50">
          {([
            { key: "review" as const, label: "学习", icon: Brain },
            { key: "library" as const, label: "卡片库", icon: BookOpen },
            { key: "stats" as const, label: t("memory.tabStats"), icon: BarChart3 },
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

        {/* ═══ Library Tab ═══ */}
        {activeTab === "library" && (
          <>
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder={t("memory.searchPlaceholder")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <select value={filterSet} onChange={(e) => setFilterSet(e.target.value)}
                  className="h-9 rounded-lg border border-border/50 bg-card px-2 text-sm backdrop-blur-sm">
                  <option value="all">{t("memory.allSets")}</option>
                  {cardSets.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.card_count})</option>)}
                </select>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                  className="h-9 rounded-lg border border-border/50 bg-card px-2 text-sm backdrop-blur-sm">
                  <option value="all">{t("memory.allStatus")}</option>
                  <option value="new">{t("memory.statusNew")}</option>
                  <option value="learning">{t("memory.statusLearning")}</option>
                  <option value="mastered">{t("memory.statusMastered")}</option>
                </select>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
                  className="h-9 rounded-lg border border-border/50 bg-card px-2 text-sm backdrop-blur-sm">
                  <option value="created">{t("memory.sortCreated")}</option>
                  <option value="review_count">{t("memory.sortReviews")}</option>
                  <option value="source_text">{t("memory.sortAlpha")}</option>
                </select>
                <button onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                  className="h-9 w-9 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 flex items-center justify-center text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
                  {sortOrder === "asc" ? "↑" : "↓"}
                </button>
              </div>
            </div>

            {/* Card Table */}
            {cards.length === 0 ? (
              <EmptyState
                title={t("memory.noCards")}
                description={t("memory.noCardsDesc")}
                action={<Button onClick={openCreateDialog}><Plus className="h-4 w-4 mr-1" />{t("memory.newCard")}</Button>}
              />
            ) : (
              <div className="border rounded-lg overflow-hidden">
                {/* Table header */}
                <div className="text-xs text-muted-foreground px-3 py-1.5 bg-muted/50 border-b flex items-center justify-between">
                  <span>
                    {totalCards > pageSize
                      ? `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, totalCards)} / ${totalCards}`
                      : `${totalCards}`}
                    {" "}{t("memory.cards")}
                    {filterSet !== "all" && (
                      <button onClick={() => setFilterSet("all")} className="ml-2 text-indigo-500 hover:underline">
                        {t("memory.clearFilter")}
                      </button>
                    )}
                  </span>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 inline-block" /> {t("memory.statusNew")}</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> {t("memory.statusLearning")}</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> {t("memory.mastered")}</span>
                  </div>
                </div>

                {/* Rows */}
                <div className="divide-y max-h-[65vh] overflow-y-auto">
                  {cards.map((card, idx) => {
                    const setName = cardSets.find(s => s.id === card.card_set_id)?.name || "";
                    const statusColor = card.is_mastered
                      ? "bg-green-500"
                      : card.review_count === 0
                        ? "bg-gray-300 dark:bg-gray-600"
                        : card.review_count <= 2
                          ? "bg-red-400"
                          : card.review_count <= 5
                            ? "bg-yellow-400"
                            : "bg-green-400";
                    return (
                      <div key={card.id}
                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 group text-sm cursor-pointer transition-colors"
                        onClick={() => openDetail(card)}>
                        <span className={`w-1.5 h-6 rounded-full shrink-0 ${statusColor}`} />
                        <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-3 gap-y-0">
                          <p className="truncate text-foreground leading-5">{card.source_text}</p>
                          <p className="truncate text-muted-foreground leading-5">{card.target_text}</p>
                        </div>
                        {setName && (
                          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md shrink-0 max-w-[80px] truncate hidden sm:inline-block">{setName}</span>
                        )}
                        <CountdownBadge card={card} nowMs={nowMs} />
                        <span className="text-[11px] text-muted-foreground w-6 text-center shrink-0 tabular-nums">{card.review_count > 0 ? `${card.review_count}×` : "—"}</span>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => openEditDialog(card)} className="p-1 rounded hover:bg-muted">
                            <Edit3 className="h-3 w-3 text-muted-foreground" />
                          </button>
                          <button onClick={() => deleteCard(card.id)} className="p-1 rounded hover:bg-red-500/10">
                            <Trash2 className="h-3 w-3 text-red-400" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalCards > pageSize && (
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-t text-sm">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >←</button>
                    <span className="text-xs text-gray-500">{t("memory.pageInfo", { page, total: Math.ceil(totalCards / pageSize) })}</span>
                    <button
                      onClick={() => setPage(p => p + 1)}
                      disabled={page * pageSize >= totalCards}
                      className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >→</button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ═══ Card Detail Panel ═══ */}
        {detailOpen && detailCard && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDetailOpen(false)}>
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-5 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">{t("memory.cardDetail")}</h3>
                  <button onClick={() => setDetailOpen(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Card content */}
                <div className="space-y-2">
                  <p className="text-lg font-medium">{detailCard.source_text}</p>
                  <p className="text-base text-indigo-600 dark:text-indigo-400">{detailCard.target_text}</p>
                </div>

                {/* Confidence meter */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">{t("memory.confidence")}</span>
                    <span className="font-mono font-medium">{Math.round(detailCard.confidence || 0)} / 100</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        (detailCard.confidence || 0) < 25 ? "bg-red-400" :
                        (detailCard.confidence || 0) < 50 ? "bg-yellow-400" :
                        (detailCard.confidence || 0) < 75 ? "bg-blue-400" : "bg-green-400"
                      }`}
                      style={{ width: `${Math.min(100, detailCard.confidence || 0)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-indigo-400/20 bg-indigo-500/10 px-3 py-2">
                    <span className="text-xs text-muted-foreground">距离遗忘触发</span>
                    <CountdownBadge card={detailCard} nowMs={nowMs} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-gray-500">
                    <div>
                      <span className="text-gray-400">{t("memory.avgThinkTime")}</span>
                      <p className="font-mono">{detailCard.avg_think_time ? `${(detailCard.avg_think_time / 1000).toFixed(1)}s` : "—"}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">{t("memory.avgFlips")}</span>
                      <p className="font-mono">{detailCard.avg_flips ? detailCard.avg_flips.toFixed(1) : "—"}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">{t("memory.totalReviews")}</span>
                      <p className="font-mono">{detailCard.review_count}</p>
                    </div>
                  </div>
                </div>

                {/* Encounter history */}
                {encounters.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-gray-500">{t("memory.encounterHistory")}</h4>
                    <div className="space-y-1.5">
                      {[...encounters].reverse().map((enc: any, i: number) => (
                        <div key={enc.id || i} className="flex items-center gap-2 text-xs bg-gray-50 dark:bg-gray-800/50 rounded px-2.5 py-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            enc.result === "remembered" ? "bg-green-500" :
                            enc.result === "fuzzy" ? "bg-yellow-500" : "bg-red-500"
                          }`} />
                          <span className="w-10 font-mono text-gray-400">{enc.confidence_before}→{enc.confidence_after}</span>
                          <span className="flex-1 text-gray-500">
                            {(enc.think_time / 1000).toFixed(1)}s
                            {enc.flip_count > 1 && <span className="ml-1">×{enc.flip_count}</span>}
                          </span>
                          <span className="text-gray-400">
                            {enc.result === "remembered" ? "✓" : enc.result === "fuzzy" ? "~" : "✗"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {encounters.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">{t("memory.noEncounters")}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ Review Tab ═══ */}
        {activeTab === "review" && !reviewing && (
          <div className="mx-auto max-w-4xl space-y-4">
            <Card className="overflow-hidden border-primary/20 bg-card/80 shadow-xl shadow-primary/5">
              <CardContent className="space-y-5 p-5 sm:p-6">
                <div className="space-y-1.5">
                  <Badge variant="secondary" className="w-fit">智能训练台</Badge>
                  <h2 className="text-2xl font-bold tracking-tight">选择今天要做的事</h2>
                  <p className="text-sm text-muted-foreground">
                    只保留三个入口：初见、复习、碎片时间测。进入后系统自动分组、循环和判定通过。
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">范围</label>
                    <select
                      value={reviewDeckId}
                      onChange={(e) => setReviewDeckId(e.target.value)}
                      className="h-10 w-full rounded-lg border border-border/60 bg-card px-3 text-sm"
                    >
                      <option value="all">全部卡片，由算法安排</option>
                      {cardSets.map((set) => (
                        <option key={set.id} value={set.id}>{set.name} ({set.card_count})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">复习策略</label>
                    <select
                      value={reviewScope}
                      onChange={(e) => setReviewScope(e.target.value as "due" | "recent" | "random" | "wrongbook")}
                      className="h-10 w-full rounded-lg border border-border/60 bg-card px-3 text-sm"
                    >
                      <option value="due">到期优先</option>
                      <option value="recent">近期学习</option>
                      <option value="random">随机抽测</option>
                      <option value="wrongbook">错题优先</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">组容量</label>
                    <select
                      value={groupSize}
                      onChange={(e) => setGroupSize(Number(e.target.value))}
                      className="h-10 w-full rounded-lg border border-border/60 bg-card px-3 text-sm"
                    >
                      {GROUP_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>{size} 张/组</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    {
                      title: "初见",
                      desc: "只学新内容。每组反复强化，连续答对 3 次或进度满格后进入长期记忆。",
                      meta: `${cards.filter((card) => card.review_count === 0).length} 张新卡`,
                      action: () => startSmartSession("first"),
                    },
                    {
                      title: "复习",
                      desc: modeRecommendation ? `${modeRecommendation.mode_label} — ${modeRecommendation.reason}` : "按遗忘周期、近期学习、错题或随机范围抽取已学内容，重新加固记忆。",
                      meta: `${stats?.due_today || 0} 张到期 · ${wrongbook.length} 错题`,
                      action: () => startSmartSession("review"),
                    },
                    {
                      title: "碎片时间测",
                      desc: "从已学内容里快速随机抽测，混合英中、中英、填空多题型。",
                      meta: "多题型随机",
                      action: () => startSmartSession("fragment"),
                    },
                  ].map((entry) => (
                    <button
                      key={entry.title}
                      onClick={entry.action}
                      className="group rounded-2xl border border-border/60 bg-muted/20 p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5 hover:shadow-lg hover:shadow-primary/10"
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <span className="text-xl font-bold">{entry.title}</span>
                        <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">{entry.meta}</span>
                      </div>
                      <p className="min-h-16 text-sm leading-6 text-muted-foreground">{entry.desc}</p>
                      <div className="mt-4 inline-flex items-center text-sm font-medium text-primary">
                        开始 <Play className="ml-1 h-4 w-4 transition group-hover:translate-x-0.5" />
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ═══ Wrongbook Tab ═══ */}
        {activeTab === "wrongbook" && (
          <div className="space-y-4">
            {/* Error pattern analysis */}
            {Object.keys(wrongbookReasonDist).length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">错因分布</CardTitle></CardHeader>
                <CardContent>
                  {/* Proportion bar */}
                  <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-muted">
                    {Object.entries(wrongbookReasonDist).map(([reason, count]) => {
                      const total = Object.values(wrongbookReasonDist).reduce((a: number, b: number) => a + b, 0);
                      const pct = (count / total) * 100;
                      const colorMap: Record<string, string> = {
                        spelling: "bg-orange-400",
                        word_order: "bg-blue-400",
                        omission: "bg-amber-400",
                        confusion: "bg-purple-400",
                        grammar: "bg-cyan-400",
                        forgot: "bg-red-400",
                        mismatch: "bg-red-400",
                        partial_match: "bg-yellow-400",
                        missing_content: "bg-rose-400",
                      };
                      return (
                        <div
                          key={reason}
                          className={`${colorMap[reason] || "bg-gray-400"} transition-all duration-300`}
                          style={{ width: `${pct}%` }}
                          title={`${WRONG_REASON_LABELS_MAP[reason] || reason}: ${count} (${pct.toFixed(1)}%)`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setWrongbookFilter("all")}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        wrongbookFilter === "all"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      全部 ({wrongbook.length})
                    </button>
                    {Object.entries(wrongbookReasonDist).map(([reason, count]) => (
                      <button
                        key={reason}
                        onClick={() => setWrongbookFilter(reason)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                          wrongbookFilter === reason
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        {WRONG_REASON_LABELS_MAP[reason] || reason} ({count})
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{t("memory.wrongbookTitle")}</CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={fetchWrongbook}>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    {t("common.retry")}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {wrongbook.length === 0 ? (
                  <EmptyState title={t("memory.wrongbookEmpty")} description={t("memory.wrongbookEmptyDesc")} />
                ) : (
                  <div className="space-y-2">
                    <Button onClick={startWrongbookReview} className="mb-2">{t("memory.reviewWrongbook")}</Button>
                    {wrongbook
                      .filter((card) => wrongbookFilter === "all" || card.last_wrong_reason === wrongbookFilter)
                      .map((card) => (
                      <div key={card.id} className="rounded-lg border">
                        <div
                          className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => setExpandedWrongCard(expandedWrongCard === card.id ? null : card.id)}
                        >
                          <span className="text-xs text-red-500 font-semibold shrink-0">x{card.wrong_count || 0}</span>
                          {card.last_wrong_reason && (
                            <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${WRONG_REASON_COLORS[card.last_wrong_reason] || "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                              {WRONG_REASON_LABELS_MAP[card.last_wrong_reason] || card.last_wrong_reason}
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="truncate text-sm">{card.source_text}</p>
                            <p className="truncate text-xs text-muted-foreground">{card.target_text}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {card.confidence != null && (
                              <span className={`text-[11px] font-medium ${card.confidence >= 70 ? "text-green-600" : card.confidence >= 40 ? "text-yellow-600" : "text-red-600"}`}>
                                {Math.round(card.confidence)}%
                              </span>
                            )}
                            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedWrongCard === card.id ? "rotate-180" : ""}`} />
                          </div>
                        </div>
                        {expandedWrongCard === card.id && (
                          <div className="border-t px-3 py-2 space-y-2 bg-muted/20">
                            {/* Wrong history */}
                            {Array.isArray(card.wrong_history) && card.wrong_history.length > 0 ? (
                              <div className="space-y-1.5">
                                <p className="text-[11px] font-medium text-muted-foreground">最近错误记录</p>
                                {card.wrong_history.map((h: any, idx: number) => (
                                  <div key={idx} className="flex items-center gap-2 text-xs">
                                    <span className={`shrink-0 ${h.result === "forgot" ? "text-red-500" : "text-yellow-500"}`}>
                                      {h.result === "forgot" ? "✗" : "~"}
                                    </span>
                                    {h.wrong_reason && (
                                      <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${WRONG_REASON_COLORS[h.wrong_reason] || "bg-gray-100 text-gray-600"}`}>
                                        {WRONG_REASON_LABELS_MAP[h.wrong_reason] || h.wrong_reason}
                                      </span>
                                    )}
                                    <span className="text-muted-foreground ml-auto">
                                      {h.confidence_before}% → {h.confidence_after}%
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">暂无详细错误记录</p>
                            )}
                            <div className="flex justify-end pt-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs text-muted-foreground"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await api.post(`/memory/wrongbook/${card.id}/clear`);
                                  fetchWrongbook();
                                }}
                              >
                                {t("memory.removeFromWrongbook")}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {wrongbook.filter((card) => wrongbookFilter === "all" || card.last_wrong_reason === wrongbookFilter).length === 0 && (
                      <p className="text-center text-sm text-muted-foreground py-4">该分类下暂无错题</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}


        {/* ═══ Session Complete Summary ═══ */}
        {activeTab === "review" && sessionComplete && reviewing && (
          <>
          <Confetti active={true} />
          <div className="max-w-lg mx-auto space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-violet-500/5">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-xl">🎉 训练完成!</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Score highlight */}
                <div className="text-center">
                  <div className="text-4xl font-black text-primary">⭐ {game.sessionScore}</div>
                  <p className="text-sm text-muted-foreground mt-1">本次积分</p>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border bg-background/50 p-3 text-center">
                    <div className="text-2xl font-bold text-emerald-500">
                      {reviewSessionStats.remembered}
                    </div>
                    <p className="text-xs text-muted-foreground">正确</p>
                  </div>
                  <div className="rounded-lg border bg-background/50 p-3 text-center">
                    <div className="text-2xl font-bold text-amber-500">
                      {reviewSessionStats.fuzzy}
                    </div>
                    <p className="text-xs text-muted-foreground">模糊</p>
                  </div>
                  <div className="rounded-lg border bg-background/50 p-3 text-center">
                    <div className="text-2xl font-bold text-red-500">
                      {reviewSessionStats.forgot}
                    </div>
                    <p className="text-xs text-muted-foreground">忘记</p>
                  </div>
                  <div className="rounded-lg border bg-background/50 p-3 text-center">
                    <div className="text-2xl font-bold text-orange-500">
                      🔥 {game.bestStreak}
                    </div>
                    <p className="text-xs text-muted-foreground">最高连击</p>
                  </div>
                </div>

                {/* Accuracy bar */}
                {(() => {
                  const total = reviewSessionStats.remembered + reviewSessionStats.fuzzy + reviewSessionStats.forgot;
                  const accuracy = total > 0 ? Math.round(((reviewSessionStats.remembered + reviewSessionStats.fuzzy) / total) * 100) : 0;
                  return (
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">正确率</span>
                        <span className="font-semibold">{accuracy}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2.5">
                        <div
                          className={`h-2.5 rounded-full transition-all duration-700 ${
                            accuracy >= 90 ? "bg-gradient-to-r from-emerald-400 to-green-500" :
                            accuracy >= 70 ? "bg-gradient-to-r from-amber-400 to-yellow-500" :
                            "bg-gradient-to-r from-red-400 to-orange-500"
                          }`}
                          style={{ width: `${accuracy}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}

                {/* Mastery progress */}
                <div className="rounded-lg border bg-background/50 p-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">本组掌握</span>
                    <span className="font-semibold">{groupPassed} / {groupTotal}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div className="bg-gradient-to-r from-primary to-violet-400 h-2 rounded-full transition-all duration-700"
                      style={{ width: `${groupTotal > 0 ? (groupPassed / groupTotal) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* Mode recommendation */}
                {modeRecommendation && (
                  <div className="rounded-lg border border-primary/20 bg-gradient-to-r from-primary/5 to-violet-500/5 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium text-primary">
                        <Sparkles className="h-4 w-4" />
                        推荐下一步：{MODE_LABELS[modeRecommendation.recommended_mode] || modeRecommendation.mode_label}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => {
                          setSessionComplete(false);
                          setReviewing(false);
                          setTimeout(() => startSmartSession("review"), 100);
                        }}
                      >
                        立即开始
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">{modeRecommendation.reason}</p>
                    {modeRecommendation.signals?.top_error && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                          {WRONG_REASON_LABELS_MAP[modeRecommendation.signals.top_error] || modeRecommendation.signals.top_error}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          近期 {modeRecommendation.signals.top_error_count} 次
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* AI Session Insight */}
                {(insightLoading || sessionInsight) && (
                  <div className="rounded-lg border bg-gradient-to-br from-violet-500/5 to-indigo-500/5 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <WandSparkles className="h-4 w-4 text-violet-500" />
                      <span className="text-sm font-medium">AI 学习洞察</span>
                    </div>
                    {insightLoading ? (
                      <div className="space-y-2">
                        <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
                        <div className="h-3 bg-muted rounded w-1/2 animate-pulse" />
                        <div className="h-3 bg-muted rounded w-2/3 animate-pulse" />
                      </div>
                    ) : sessionInsight ? (
                      <>
                        {sessionInsight.summary && (
                          <p className="text-sm text-foreground">{sessionInsight.summary}</p>
                        )}
                        {sessionInsight.weak_points?.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-orange-600 dark:text-orange-400">薄弱环节</p>
                            {sessionInsight.weak_points.map((wp, i) => (
                              <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                <span className="text-orange-500 mt-0.5">•</span>{wp}
                              </p>
                            ))}
                          </div>
                        )}
                        {sessionInsight.suggestions?.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-blue-600 dark:text-blue-400">学习建议</p>
                            {sessionInsight.suggestions.map((s, i) => (
                              <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                <span className="text-blue-500 mt-0.5">→</span>{s}
                              </p>
                            ))}
                          </div>
                        )}
                        {sessionInsight.encouragement && (
                          <p className="text-xs text-violet-600 dark:text-violet-400 italic mt-1">{sessionInsight.encouragement}</p>
                        )}
                      </>
                    ) : null}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <Button
                    className="flex-1"
                    onClick={() => {
                      setSessionComplete(false);
                      setReviewing(false);
                    }}
                  >
                    返回
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setSessionComplete(false);
                      startSmartSession("review");
                    }}
                  >
                    再来一轮
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
          </>
        )}

        {/* ═══ Active CASR Review Session ═══ */}
        {activeTab === "review" && reviewing && !sessionComplete && reviewQueue.length > 0 && (() => {
          const card = reviewQueue[reviewIndex];
          const mode = card.evolution_mode || "standard";
          const currentMode = card.mode || reviewMode;
          const isHint = mode === "hint";
          const isFlash = mode === "flash";
          const isTimed = mode === "timed";
          const isWrittenReview = currentMode !== "standard";
          const shouldRevealAnswer = showAnswer || (!isWrittenReview && isHint);
          const currentCardProgress = groupProgress[card.id] || { streak: 0, progress: 0, attempts: 0, passed: false };
          // Detect algorithm override: user said remembered but confidence barely changed
          const algoAdjusted = lastCASRResult && lastCASRResult.result === "remembered"
            && (lastCASRResult.confidence_after - lastCASRResult.confidence_before) < 5;
          return (
          <div className="max-w-lg mx-auto space-y-4">
            <div className="flex items-center justify-between text-sm text-gray-500">
            <div className="flex items-center gap-2">
              {currentMode !== "standard" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {MODE_ICONS[currentMode] || "📝"}{MODE_LABELS[currentMode] || currentMode}
                </span>
              )}
              <span>本组通过 {groupPassed} / {groupTotal} · 剩余 {reviewQueue.length}</span>
            </div>
              <div className="flex items-center gap-3">
                <span className="text-xs">
                  {reviewSessionStats.forgot > 0 && <span className="text-red-500">✗{reviewSessionStats.forgot}</span>}
                  {reviewSessionStats.fuzzy > 0 && <span className="text-yellow-500 ml-1">~{reviewSessionStats.fuzzy}</span>}
                  {reviewSessionStats.remembered > 0 && <span className="text-green-500 ml-1">✓{reviewSessionStats.remembered}</span>}
                </span>
                <button
                  onClick={() => {
                    pendingAdvanceRef.current = null;
                    setAwaitingManualAdvance(false);
                    setReviewing(false);
                  }}
                  className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
              <div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: `${groupTotal > 0 ? (groupPassed / groupTotal) * 100 : 0}%` }} />
            </div>

            {/* ── Gamification HUD ── */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {game.globalStreak > 0 && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold transition-all ${
                    game.globalStreak >= 10 ? "bg-orange-500/20 text-orange-400" :
                    game.globalStreak >= 5 ? "bg-amber-500/20 text-amber-400" :
                    "bg-yellow-500/15 text-yellow-500"
                  }`}>
                    🔥 {game.globalStreak}
                  </span>
                )}
                {game.lastScoreDelta > 0 && (
                  <span className="text-xs font-semibold text-emerald-400 animate-in fade-in slide-in-from-bottom-1">
                    +{game.lastScoreDelta}
                  </span>
                )}
              </div>
              <span className="text-xs font-mono text-muted-foreground tabular-nums">
                ⭐ {game.sessionScore}
              </span>
            </div>

            {/* ── Streak Milestone Animation ── */}
            {game.streakMilestone && (
              <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
                <div className="streak-pop text-center">
                  <div className="text-7xl font-black bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 bg-clip-text text-transparent drop-shadow-lg">
                    {game.streakMilestone}
                  </div>
                  <div className="text-xl font-bold text-amber-500 mt-1">
                    🔥 连击达成！
                  </div>
                </div>
              </div>
            )}

            <Card
              className={`relative touch-pan-y overflow-visible transition-all duration-300 ${
                lastCASRResult
                  ? lastCASRResult.result === "remembered"
                    ? "feedback-correct"
                    : lastCASRResult.result === "fuzzy"
                    ? "feedback-fuzzy"
                    : "feedback-wrong"
                  : ""
              }`}
              onTouchStart={(e) => {
                (e.currentTarget as any).dataset.touchX = String(e.changedTouches[0]?.clientX ?? 0);
              }}
              onTouchEnd={(e) => {
                const startX = Number((e.currentTarget as any).dataset.touchX || 0);
                const endX = Number(e.changedTouches[0]?.clientX ?? 0);
                const deltaX = endX - startX;
                if (Math.abs(deltaX) < 60 || reviewStepLocked || lastCASRResult) return;
                // Written mode: swipe left to reveal answer (only before submission)
                if (currentMode !== "standard" && !showAnswer) {
                  if (deltaX < 0) {
                    revealWrittenAnswer();
                  }
                  return;
                }
                // Standard mode: swipe left to flip (only before answer is shown)
                if (currentMode === "standard" && !showAnswer) {
                  if (deltaX < 0) {
                    handleFlip();
                  }
                  return;
                }
                // After answer is revealed: disable swipe gestures, require button tap
                // This prevents accidental submission while reading the answer
              }}
            >
              {mode !== "standard" && (
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {mode === "hint" ? "💡 " : mode === "timed" ? "⏱ " : "⚡ "}
                    {t(`memory.mode_${mode}`)}
                  </Badge>
                  {isTimed && timedCountdown > 0 && (
                    <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30 font-mono tabular-nums">
                      {timedCountdown}s
                    </Badge>
                  )}
                </div>
              )}

              <CardContent className="p-6 flex flex-col items-center justify-start text-center space-y-4">
                <p className={`text-2xl font-semibold leading-relaxed ${isFlash && shouldRevealAnswer ? "opacity-0" : ""}`}>
                  {card.prompt_text || card.source_text}
                </p>

                {shouldRevealAnswer && (
                  <div className="space-y-2 answer-reveal">
                    <div className="w-12 h-px bg-gray-300 dark:bg-gray-600 mx-auto" />
                    <p className="text-xl text-indigo-600 dark:text-indigo-400 leading-relaxed">
                      {card.expected_answer || card.target_text}
                    </p>
                  </div>
                )}

                <div className="flex flex-col items-center gap-2 text-xs text-gray-400">
                    <div className="flex items-center gap-2">
                      <span>算法信心</span>
                      <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${
                            card.confidence < 25 ? "bg-red-400" :
                            card.confidence < 50 ? "bg-yellow-400" :
                            card.confidence < 75 ? "bg-blue-400" : "bg-green-400"
                          }`}
                          style={{ width: `${Math.min(100, card.confidence)}%` }}
                        />
                      </div>
                      <span>{Math.round(card.confidence)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>本组进度</span>
                      <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full bg-emerald-400 transition-all"
                        style={{ width: `${currentCardProgress.progress}%` }}
                      />
                      </div>
                      <span>{currentCardProgress.streak}/{PASS_STREAK_TARGET} 连对</span>
                    </div>
                  </div>

                {currentMode === "standard" && !shouldRevealAnswer ? (
                  <button
                    onClick={handleFlip}
                    className="mt-4 px-6 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    {t("memory.flipCard")}
                  </button>
                ) : currentMode !== "standard" && !lastCASRResult && !showAnswer ? (
                  <div className="w-full mt-4 space-y-2 md:static sticky bottom-20 bg-background/95 backdrop-blur p-2 rounded-lg">
                    <Input
                      value={answerText}
                      onChange={(e) => setAnswerText(e.target.value)}
                      placeholder={t("memory.answerPlaceholder")}
                      disabled={reviewStepLocked}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          submitWrittenAnswer();
                        }
                      }}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Button onClick={submitWrittenAnswer} disabled={!answerText.trim() || reviewStepLocked}>
                        {t("memory.submitAnswer")}
                      </Button>
                      <Button variant="outline" onClick={revealWrittenAnswer} disabled={reviewStepLocked}>
                        {t("memory.showAnswer")}
                      </Button>
                    </div>
                  </div>
                ) : currentMode !== "standard" && !lastCASRResult && showAnswer ? (
                  <div className="grid grid-cols-3 gap-3 w-full mt-4">
                    <button
                      type="button"
                      onClick={() => submitCASRReview("forgot")}
                      className="bg-red-500 hover:bg-red-600 text-white rounded-lg py-3 text-sm font-medium transition-colors"
                    >
                      {t("memory.casrForgot")}
                    </button>
                    <button
                      type="button"
                      onClick={() => submitCASRReview("fuzzy")}
                      className="bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg py-3 text-sm font-medium transition-colors"
                    >
                      {t("memory.casrFuzzy")}
                    </button>
                    <button
                      type="button"
                      onClick={() => submitCASRReview("remembered")}
                      className="bg-green-500 hover:bg-green-600 text-white rounded-lg py-3 text-sm font-medium transition-colors"
                    >
                      {t("memory.casrRemembered")}
                    </button>
                  </div>
                ) : !lastCASRResult ? (
                  <div className="grid grid-cols-3 gap-3 w-full mt-4">
                    <button
                      onClick={() => submitCASRReview("forgot")}
                      className="bg-red-500 hover:bg-red-600 text-white rounded-lg py-3 text-sm font-medium transition-colors"
                    >
                      {t("memory.casrForgot")}
                    </button>
                    <button
                      onClick={() => submitCASRReview("fuzzy")}
                      className="bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg py-3 text-sm font-medium transition-colors"
                    >
                      {t("memory.casrFuzzy")}
                    </button>
                    <button
                      onClick={() => submitCASRReview("remembered")}
                      className="bg-green-500 hover:bg-green-600 text-white rounded-lg py-3 text-sm font-medium transition-colors"
                    >
                      {t("memory.casrRemembered")}
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 animate-in fade-in duration-200 space-y-1">
                    <div className={`text-sm font-medium ${
                      lastCASRResult.result === "remembered" ? "text-green-600" :
                      lastCASRResult.result === "fuzzy" ? "text-yellow-600" : "text-red-600"
                    }`}>
                      {lastCASRResult.result === "remembered" ? t("memory.casrFeedbackRemembered") :
                       lastCASRResult.result === "fuzzy" ? t("memory.casrFeedbackFuzzy") :
                       t("memory.casrFeedbackForgot")}
                      <span className="ml-2 text-gray-400">
                        {lastCASRResult.confidence_before} → {lastCASRResult.confidence_after}
                      </span>
                    </div>
                    {lastCASRResult.score !== undefined && (
                      <p className="text-xs text-muted-foreground">
                        Score {lastCASRResult.score}/100 · {lastCASRResult.verdict}
                      </p>
                    )}
                    {lastCASRResult.wrong_reason && (
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${WRONG_REASON_COLORS[lastCASRResult.wrong_reason] || "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                          {lastCASRResult.wrong_reason_icon}{WRONG_REASON_LABELS_MAP[lastCASRResult.wrong_reason] || lastCASRResult.wrong_reason}
                        </span>
                      </div>
                    )}
                    {Array.isArray(lastCASRResult.feedback) && lastCASRResult.feedback.length > 0 && (
                      <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
                        {lastCASRResult.feedback.map((tip: string, idx: number) => (
                          <p key={`${tip}-${idx}`}>- {tip}</p>
                        ))}
                      </div>
                    )}
                    {lastCASRResult.result !== "remembered" && !aiDiagnosis && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-primary hover:text-primary/80"
                        onClick={requestAiDiagnosis}
                        disabled={diagnosing}
                      >
                        <Sparkles className="h-3 w-3 mr-1" />
                        {diagnosing ? "AI 分析中..." : "AI 详细分析"}
                      </Button>
                    )}
                    {aiDiagnosis && (
                      <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs space-y-1.5 animate-in fade-in duration-300">
                        <div className="flex items-center gap-1.5 font-medium text-primary">
                          <Sparkles className="h-3 w-3" />
                          AI 诊断：{aiDiagnosis.error_type}
                        </div>
                        <p className="text-muted-foreground">{aiDiagnosis.error_detail}</p>
                        {Array.isArray(aiDiagnosis.suggestions) && aiDiagnosis.suggestions.length > 0 && (
                          <ul className="space-y-0.5 text-muted-foreground">
                            {aiDiagnosis.suggestions.map((s: string, i: number) => (
                              <li key={i}>💡 {s}</li>
                            ))}
                          </ul>
                        )}
                        {aiDiagnosis.encouragement && (
                          <p className="text-primary/70 italic">{aiDiagnosis.encouragement}</p>
                        )}
                      </div>
                    )}
                    {algoAdjusted && (
                      <p className="text-[11px] text-gray-400">{t("memory.algorithmAdjusted")}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {lastCASRResult && (
              <Button
                type="button"
                size="lg"
                className="w-full shrink-0 shadow-md"
                onClick={continueToNextCard}
              >
                {t("memory.continueAfterWrong")}
              </Button>
            )}
          </div>
          );
        })()}

        {/* ═══ Stats Tab ═══ */}
        {activeTab === "stats" && stats && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: t("memory.totalCards"), value: stats.total, color: "text-primary" },
                { label: t("memory.mastered"), value: stats.mastered, color: "text-emerald-500" },
                { label: t("memory.totalReviews"), value: stats.total_reviews, color: "text-blue-500" },
                { label: t("memory.avgEase"), value: stats.avg_ease.toFixed(2), color: "text-violet-500" },
              ].map((s) => (
                <Card key={s.label} className="card-hover">
                  <CardContent className="p-4 text-center">
                    <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {sessionSummary && (
              <Card>
                <CardHeader><CardTitle className="text-base">近 24 小时训练表现</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div className="rounded-md border px-3 py-2">
                      <p className="text-muted-foreground">作答次数</p>
                      <p className="font-semibold">{sessionSummary.total}</p>
                    </div>
                    <div className="rounded-md border px-3 py-2">
                      <p className="text-muted-foreground">正确率</p>
                      <p className="font-semibold">{sessionSummary.correct_rate}%</p>
                    </div>
                    <div className="rounded-md border px-3 py-2">
                      <p className="text-muted-foreground">平均思考</p>
                      <p className="font-semibold">{(sessionSummary.avg_think_time_ms / 1000).toFixed(1)}s</p>
                    </div>
                    <div className="rounded-md border px-3 py-2">
                      <p className="text-muted-foreground">平均确认</p>
                      <p className="font-semibold">{(sessionSummary.avg_verify_time_ms / 1000).toFixed(1)}s</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Domain distribution */}
            <Card>
              <CardHeader><CardTitle className="text-base">{t("memory.domainDistribution")}</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(stats.domains).sort((a, b) => b[1] - a[1]).map(([domain, count]) => (
                    <div key={domain} className="flex items-center gap-3">
                      <span className="text-sm w-20 truncate">{domain}</span>
                      <div className="flex-1 bg-muted rounded-full h-3">
                        <div className="bg-gradient-to-r from-primary to-violet-400 h-3 rounded-full" style={{ width: `${stats.total > 0 ? (count / stats.total) * 100 : 0}%` }} />
                      </div>
                      <span className="text-sm text-muted-foreground w-8 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Difficulty distribution */}
            <Card>
              <CardHeader><CardTitle className="text-base">{t("memory.difficultyDistribution")}</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 h-32">
                  {[1,2,3,4,5].map((d) => {
                    const effCount = stats.effective_difficulties?.[String(d)] || 0;
                    const presetCount = stats.difficulties?.[String(d)] || 0;
                    const dataSource = stats.effective_difficulties ? effCount : presetCount;
                    const allValues = stats.effective_difficulties
                      ? Object.values(stats.effective_difficulties)
                      : Object.values(stats.difficulties || { "1": 1 });
                    const maxCount = Math.max(...allValues, 1);
                    return (
                      <div key={d} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs text-gray-500">{dataSource}</span>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-t relative" style={{ height: "100px" }}>
                          <div className={`absolute bottom-0 left-0 right-0 rounded-t transition-all duration-500 ${
                            d === 1 ? "bg-green-400 dark:bg-green-500" :
                            d === 2 ? "bg-emerald-400 dark:bg-emerald-500" :
                            d === 3 ? "bg-yellow-400 dark:bg-yellow-500" :
                            d === 4 ? "bg-orange-400 dark:bg-orange-500" :
                            "bg-red-400 dark:bg-red-500"
                          }`} style={{ height: `${(dataSource / maxCount) * 100}%` }} />
                        </div>
                        <span className="text-xs">{t(`memory.difficulty${d}`)}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 text-center">
                  {stats.effective_difficulties ? "基于实际掌握程度" : "基于预设难度"}
                </p>
              </CardContent>
            </Card>
            {stats.weak_domains && stats.weak_domains.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">薄弱领域 Top</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {stats.weak_domains.map((item) => (
                      <div key={item.domain} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                        <span>{item.domain}</span>
                        <Badge variant="outline">错题 {item.wrong_total}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            {stats.wrong_reasons && stats.wrong_reasons.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">常见错因</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {stats.wrong_reasons.map((item) => (
                      <div key={item.reason} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                        <span>{item.label}</span>
                        <Badge variant="outline">{item.count}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            {stats.wrong_reason_trend && stats.wrong_reason_trend.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">近 7 天错因趋势</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {stats.wrong_reason_trend.slice(-14).map((item, idx) => (
                      <div key={`${item.day}-${item.reason}-${idx}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                        <span>{item.day} · {item.label}</span>
                        <Badge variant="outline">{item.count}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* ═══ Create/Edit Dialog ═══ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCard ? t("memory.editCard") : t("memory.newCard")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">{t("memory.sourceText")}</label>
              <textarea value={formData.source_text} onChange={(e) => setFormData({ ...formData, source_text: e.target.value })}
                placeholder={t("memory.sourceTextPlaceholder")} rows={3}
                className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="text-sm font-medium">{t("memory.targetText")}</label>
              <textarea value={formData.target_text} onChange={(e) => setFormData({ ...formData, target_text: e.target.value })}
                placeholder={t("memory.targetTextPlaceholder")} rows={3}
                className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t("memory.domain")}</label>
                <select value={formData.domain} onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                  className="mt-1 w-full h-9 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm">
                  {["通用", "英语", "日语", "韩语", "法语", "德语", "编程", "医学", "法律", "其他"].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">{t("memory.difficulty")}</label>
                <select value={formData.difficulty} onChange={(e) => setFormData({ ...formData, difficulty: parseInt(e.target.value) })}
                  className="mt-1 w-full h-9 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm">
                  {[1,2,3,4,5].map((d) => <option key={d} value={d}>{t(`memory.difficulty${d}`)}</option>)}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={saveCard} disabled={saving || !formData.source_text.trim() || !formData.target_text.trim()}>
              {saving ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("memory.importCards")}</DialogTitle>
          </DialogHeader>

          {!importResult ? (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">{t("memory.setName")}</label>
                <Input
                  placeholder={t("memory.setNamePlaceholder")}
                  value={importSetName}
                  onChange={(e) => setImportSetName(e.target.value)}
                />
              </div>

              <div
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-primary dark:hover:border-primary transition-colors"
                onClick={() => document.getElementById("import-file-input")?.click()}
              >
                {importing ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-gray-500">{t("memory.importing")}</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-gray-400" />
                    <p className="text-sm text-gray-500">
                      {t("memory.importHint")}
                    </p>
                    <p className="text-xs text-gray-400">.xlsx .docx .txt</p>
                  </div>
                )}
                <input
                  id="import-file-input"
                  type="file"
                  accept=".xlsx,.docx,.txt,.csv"
                  className="hidden"
                  onChange={handleFileImport}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Input
                    value={importSetName}
                    onChange={(e) => setImportSetName(e.target.value)}
                    className="font-medium text-lg h-8 border-0 p-0 focus-visible:ring-0"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {importResult.source_type === "excel" ? "Excel" : importResult.source_type === "word" ? "Word" : "Text"}
                    {" · "}
                    {importResult.card_count} {t("memory.cards")}
                  </p>
                </div>
                <Badge variant="secondary">{importResult.card_count}</Badge>
              </div>

              <div className="border rounded-lg max-h-60 overflow-y-auto">
                <div className="divide-y">
                  {importResult.preview.map((card, i) => (
                    <div key={i} className="px-3 py-2 text-sm">
                      <p className="text-gray-800 dark:text-gray-200 truncate">{card.source_text}</p>
                      <p className="text-gray-500 dark:text-gray-400 truncate text-xs mt-0.5">{card.target_text}</p>
                    </div>
                  ))}
                </div>
                {importResult.card_count > 5 && (
                  <div className="px-3 py-2 text-center text-xs text-gray-400 bg-gray-50 dark:bg-gray-800/50">
                    {t("memory.previewMore", { count: importResult.card_count - 5 })}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => { setImportResult(null); }}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={confirmImport} disabled={importConfirmed}>
                  {importConfirmed ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> {t("memory.importing")}</>
                  ) : (
                    <><Check className="h-4 w-4 mr-1" /> {t("memory.confirmImport", { count: importResult.card_count })}</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </AppLayout>
  );
}
