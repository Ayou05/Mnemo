// memory-types.ts — Types, constants, and pure functions for the memory module
// Extracted from page.tsx for maintainability

// ── Types ──

export interface MemoryCard {
  id: string;
  card_set_id?: string;
  source_text: string;
  target_text: string;
  source_lang: string;
  target_lang: string;
  domain: string;
  difficulty: number;
  card_type: string;
  next_review?: string;
  review_count: number;
  wrong_count?: number;
  ease_factor: number;
  interval_days: number;
  is_mastered: boolean;
  sort_order: number;
  confidence?: number;
  last_score?: number;
  last_wrong_reason?: string;
  created_at: string;
  updated_at?: string;
}

export interface CardSet {
  id: string;
  name: string;
  description?: string;
  source_type: string;
  card_count: number;
  is_pinned: boolean;
  created_at: string;
}

export interface MemoryStats {
  total: number;
  mastered: number;
  due_today: number;
  total_reviews: number;
  avg_ease: number;
  mastery_rate: number;
  domains: Record<string, number>;
  difficulties: Record<string, number>;
  effective_difficulties?: Record<string, number>;
  weak_domains?: Array<{ domain: string; wrong_total: number }>;
  wrong_reasons?: Array<{ reason: string; label: string; count: number }>;
  wrong_reason_trend?: Array<{ day: string; reason: string; label: string; count: number }>;
  unreleased?: number;
}

export interface TrainingSessionSummary {
  hours: number;
  total: number;
  correct_rate: number;
  avg_think_time_ms: number;
  avg_verify_time_ms: number;
}

export interface GroupCardProgress {
  streak: number;
  progress: number;
  attempts: number;
  passed: boolean;
}

export interface GamificationState {
  globalStreak: number;
  bestStreak: number;
  totalScore: number;
  sessionScore: number;
  lastScoreDelta: number;
  streakMilestone: string | null; // "x3" | "x5" | "x10" | null — triggers animation
}

export const GROUP_SIZE_OPTIONS = [5, 10, 15, 20];
export const PASS_STREAK_TARGET = 3;

export const WRONG_REASON_LABELS_MAP: Record<string, string> = {
  mismatch: "答案不匹配",
  partial_match: "部分匹配",
  missing_content: "段落缺失",
  spelling: "拼写错误",
  word_order: "词序错误",
  omission: "内容遗漏",
  confusion: "形近/意近混淆",
  grammar: "语法错误",
  forgot: "完全遗忘",
};

export const WRONG_REASON_COLORS: Record<string, string> = {
  spelling: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  word_order: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  omission: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  confusion: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  grammar: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  forgot: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  mismatch: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  partial_match: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  missing_content: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
};

export const MODE_LABELS: Record<string, string> = {
  write_en_to_zh: "英→中默写",
  write_zh_to_en: "中→英默写",
  cloze: "完形填空",
  paragraph: "段落默写",
};

export const MODE_DESCRIPTIONS: Record<string, string> = {
  write_en_to_zh: "看英文，写出中文释义",
  write_zh_to_en: "看中文，写出英文原文",
  cloze: "英文挖空，补全缺失单词",
  paragraph: "看中文提示，默写整段英文",
};

export const MODE_ICONS: Record<string, string> = {
  write_en_to_zh: "📝",
  write_zh_to_en: "🔄",
  cloze: "🧩",
  paragraph: "📄",
};

export function getComboMultiplier(streak: number): number {
  if (streak >= 20) return 2.5;
  if (streak >= 10) return 2.0;
  if (streak >= 5) return 1.5;
  return 1.0;
}

export function getStreakMilestone(streak: number): string | null {
  if (streak === 3) return "x3";
  if (streak === 5) return "x5";
  if (streak === 10) return "x10";
  if (streak === 15) return "x15";
  if (streak === 20) return "x20";
  if (streak > 0 && streak % 10 === 0) return `x${streak}`;
  return null;
}

export function getReviewCountdown(card: MemoryCard, nowMs: number) {
  if (!card.next_review || card.review_count === 0) {
    return { label: "初见", tone: "new" as const, due: false };
  }

  const diffMs = new Date(card.next_review).getTime() - nowMs;
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return { label: "现在复习", tone: "due" as const, due: true };
  }

  const totalMinutes = Math.ceil(diffMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const label = days > 0
    ? `${days}d ${String(hours).padStart(2, "0")}h`
    : `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;

  return { label, tone: days > 0 ? "later" as const : "soon" as const, due: false };
}

export function CountdownBadge({ card, nowMs }: { card: MemoryCard; nowMs: number }) {
  const countdown = getReviewCountdown(card, nowMs);
  const toneClass = {
    new: "border-slate-500/30 bg-slate-500/10 text-slate-300",
    due: "border-emerald-400/40 bg-emerald-500/15 text-emerald-300",
    soon: "border-amber-400/40 bg-amber-500/15 text-amber-300",
    later: "border-indigo-400/30 bg-indigo-500/10 text-indigo-300",
  }[countdown.tone];

  return (
    <span className={`inline-flex min-w-[86px] justify-center rounded-md border px-2 py-1 font-mono text-[11px] tabular-nums shadow-inner ${toneClass}`}>
      {countdown.label}
    </span>
  );
}