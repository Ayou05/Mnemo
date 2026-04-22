// ── Types ──

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  practiceSet?: PracticeSetData;
  quizResult?: QuizResultData;
  loading?: boolean;
}

export interface PracticeSetData {
  set_id: string;
  title: string;
  count: number;
  questions: QuestionData[];
}

export interface QuestionData {
  id: string;
  question: string;
  options?: string[];
  answer?: string;
  explanation?: string;
  type: string;
  category: string;
  topic?: string;
  difficulty: number;
  wrong_count?: number;
  review_count?: number;
}

export interface AnswerRecord {
  user_answer: string;
  is_correct: boolean;
  think_time_ms: number;
  correct_answer?: string;
  explanation?: string;
}

export interface QuizState {
  active: boolean;
  set: PracticeSetData;
  currentIndex: number;
  answers: Record<string, AnswerRecord>;
  startTime: number;
  showResult: boolean;
  currentAnswer: string;
  submitted: boolean;
}

/** Injected into chat when quiz completes, so AI has context for follow-up discussion. */
export interface QuizResultData {
  title: string;
  total: number;
  correct: number;
  wrongQuestions: Array<{
    question: string;
    user_answer: string;
    correct_answer: string;
    explanation?: string;
  }>;
}

export interface HistoryItem {
  set_id: string;
  title: string;
  question_count: number;
  total_answered: number;
  correct_count: number;
  accuracy: number;
  created_at: string;
}

/** Per-question tutor chat message (during quiz). */
export interface TutorChat {
  [questionId: string]: Array<{ role: "user" | "assistant"; content: string }>;
}

// ── Session Storage ──

const QUIZ_KEY = "mnemo_practice_quiz";
const MESSAGES_KEY = "mnemo_practice_messages";

export function saveQuizState(q: QuizState | null) {
  try { sessionStorage.setItem(QUIZ_KEY, JSON.stringify(q)); } catch {}
}

export function loadQuizState(): QuizState | null {
  try {
    const r = sessionStorage.getItem(QUIZ_KEY);
    return r ? JSON.parse(r) : null;
  } catch {
    return null;
  }
}

export function saveMessages(msgs: ChatMessage[]) {
  try { sessionStorage.setItem(MESSAGES_KEY, JSON.stringify(msgs)); } catch {}
}

export function loadMessages(): ChatMessage[] {
  try {
    const r = sessionStorage.getItem(MESSAGES_KEY);
    return r ? JSON.parse(r) : [];
  } catch {
    return [];
  }
}

// ── Helpers ──

export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}:${sec.toString().padStart(2, "0")}` : `${sec}s`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── Goal Prompts ──

export const GOAL_PROMPTS: Record<string, { icon: string; label: string; prompt: string }[]> = {
  default: [
    { icon: "📝", label: "语法练习", prompt: "出5道语法选择题" },
    { icon: "📖", label: "阅读理解", prompt: "出一篇阅读理解，3道选择题" },
    { icon: "🔄", label: "翻译练习", prompt: "出3道中译英翻译题" },
    { icon: "✍️", label: "写作练习", prompt: "出一道写作练习题" },
    { icon: "🧠", label: "词汇辨析", prompt: "出5道近义词辨析题" },
    { icon: "🎯", label: "综合测试", prompt: "出一套综合测试，包含语法、阅读、翻译各2题" },
  ],
  "专四": [
    { icon: "📝", label: "语法词汇", prompt: "出5道专四语法词汇选择题" },
    { icon: "📖", label: "阅读理解", prompt: "出一篇专四难度的阅读理解，4道选择题" },
    { icon: "✍️", label: "写作", prompt: "出一道专四写作题，提供范文" },
    { icon: "👂", label: "听力理解", prompt: "出3道听力理解选择题（专四难度）" },
    { icon: "🔄", label: "翻译", prompt: "出3道专四翻译题" },
    { icon: "🎯", label: "模拟测试", prompt: "出一套专四模拟题，语法5题+阅读2篇+翻译2题" },
  ],
  "专八": [
    { icon: "📝", label: "语法词汇", prompt: "出5道专八语法词汇选择题" },
    { icon: "📖", label: "阅读理解", prompt: "出一篇专八难度的阅读理解，5道选择题" },
    { icon: "🔄", label: "翻译", prompt: "出2道专八翻译题（中译英+英译中）" },
    { icon: "📝", label: "改错", prompt: "出3道专八改错题" },
    { icon: "✍️", label: "写作", prompt: "出一道专八写作题" },
    { icon: "🎯", label: "模拟测试", prompt: "出一套专八模拟题" },
  ],
  "四级": [
    { icon: "📝", label: "语法词汇", prompt: "出5道四级语法词汇选择题" },
    { icon: "📖", label: "阅读理解", prompt: "出一篇四级阅读理解，3道选择题" },
    { icon: "🔄", label: "翻译", prompt: "出3道四级翻译题" },
    { icon: "✍️", label: "写作", prompt: "出一道四级写作题" },
    { icon: "🎯", label: "模拟测试", prompt: "出一套四级模拟题" },
  ],
  "六级": [
    { icon: "📝", label: "语法词汇", prompt: "出5道六级语法词汇选择题" },
    { icon: "📖", label: "阅读理解", prompt: "出一篇六级阅读理解，4道选择题" },
    { icon: "🔄", label: "翻译", prompt: "出3道六级翻译题" },
    { icon: "✍️", label: "写作", prompt: "出一道六级写作题" },
    { icon: "🎯", label: "模拟测试", prompt: "出一套六级模拟题" },
  ],
  "考研英语": [
    { icon: "📝", label: "完形填空", prompt: "出一篇考研完形填空，10个空" },
    { icon: "📖", label: "阅读理解", prompt: "出一篇考研阅读理解，4道选择题" },
    { icon: "🔄", label: "翻译", prompt: "出2道考研翻译题（英译中长难句）" },
    { icon: "✍️", label: "写作", prompt: "出一道考研写作题（小作文+大作文）" },
    { icon: "🎯", label: "模拟测试", prompt: "出一套考研英语模拟题" },
  ],
  "雅思": [
    { icon: "📝", label: "语法词汇", prompt: "出5道雅思语法词汇题" },
    { icon: "📖", label: "阅读", prompt: "出一篇雅思阅读理解，3道题" },
    { icon: "✍️", label: "写作Task1", prompt: "出一道雅思小作文（图表描述）" },
    { icon: "✍️", label: "写作Task2", prompt: "出一道雅思大作文（议论文）" },
    { icon: "🎯", label: "模拟测试", prompt: "出一套雅思模拟题" },
  ],
  "托福": [
    { icon: "📝", label: "语法词汇", prompt: "出5道托福语法词汇题" },
    { icon: "📖", label: "阅读", prompt: "出一篇托福阅读理解，3道题" },
    { icon: "✍️", label: "写作", prompt: "出一道托福独立写作题" },
    { icon: "🎯", label: "模拟测试", prompt: "出一套托福模拟题" },
  ],
  "MTI": [
    { icon: "🔄", label: "英译汉", prompt: "出3道MTI英译汉翻译题" },
    { icon: "🔄", label: "汉译英", prompt: "出3道MTI汉译英翻译题" },
    { icon: "📝", label: "词汇翻译", prompt: "出10道MTI词汇翻译题（术语/缩略语）" },
    { icon: "📖", label: "百科知识", prompt: "出5道MTI百科知识选择题" },
    { icon: "✍️", label: "应用文写作", prompt: "出一道MTI应用文写作题" },
    { icon: "🎯", label: "模拟测试", prompt: "出一套MTI模拟题" },
  ],
  "GRE": [
    { icon: "📝", label: "填空", prompt: "出5道GRE填空题" },
    { icon: "📖", label: "阅读", prompt: "出一篇GRE阅读理解" },
    { icon: "📝", label: "同义词", prompt: "出10道GRE同义词/反义词题" },
    { icon: "✍️", label: "写作Issue", prompt: "出一道GRE Issue写作题" },
    { icon: "✍️", label: "写作Argument", prompt: "出一道GRE Argument写作题" },
  ],
};

export function getGoalKey(goal: string | null): string {
  if (!goal) return "default";
  for (const key of Object.keys(GOAL_PROMPTS)) {
    if (key !== "default" && goal.includes(key)) return key;
  }
  return "default";
}
