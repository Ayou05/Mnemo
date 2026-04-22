"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Check, X, ChevronLeft, ChevronRight, Clock, Sparkles, Loader2, RotateCcw, BookX, Send, MessageCircle } from "lucide-react";
import type { QuizState, AnswerRecord, TutorChat, QuizResultData } from "../lib/data";
import { saveQuizState, formatTime } from "../lib/data";

interface Props {
  quiz: QuizState;
  setQuiz: React.Dispatch<React.SetStateAction<QuizState | null>>;
  onBack: () => void;
  onComplete: (result: QuizResultData) => void;
}

export function QuizView({ quiz, setQuiz, onBack, onComplete }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const tutorInputRef = useRef<HTMLInputElement>(null);
  const tutorScrollRef = useRef<HTMLDivElement>(null);

  // Per-question tutor chat: { [questionId]: [{role, content}] }
  const [tutorChats, setTutorChats] = useState<TutorChat>({});
  const [tutorInput, setTutorInput] = useState("");
  const [tutoring, setTutoring] = useState<string | null>(null); // question id being tutored
  const [showTutor, setShowTutor] = useState<string | null>(null); // which question's tutor is expanded

  const q = quiz.set.questions[quiz.currentIndex];
  const answer = quiz.answers[q.id];
  const isChoice = q.type === "choice" || q.type === "multiple_choice" || !!q.options;

  // Timer
  useEffect(() => {
    if (!quiz.active || quiz.showResult) return;
    const t = setInterval(() => setElapsed(Date.now() - quiz.startTime), 1000);
    return () => clearInterval(t);
  }, [quiz.active, quiz.showResult]);

  // Focus input on new question
  useEffect(() => {
    if (!isChoice && !answer) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [quiz.currentIndex, isChoice, answer]);

  // Keyboard shortcuts (only when tutor is not active)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showTutor) return; // don't hijack when typing in tutor
      if (isChoice && !answer) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= (q.options?.length || 4)) {
          submitAnswer(String.fromCharCode(64 + num));
        }
      }
      if (answer && e.key === "Enter") {
        nextQuestion();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [quiz.currentIndex, answer, isChoice, q.options, showTutor]);

  // Persist quiz state
  useEffect(() => {
    saveQuizState(quiz);
  }, [quiz]);

  // Auto-scroll tutor chat
  useEffect(() => {
    tutorScrollRef.current?.scrollTo({ top: tutorScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [tutorChats]);

  // ── Submit answer ──

  const submitAnswer = async (ans: string) => {
    if (answer || quiz.submitted) return;
    const thinkTime = Date.now() - quiz.startTime;

    const newAnswer: AnswerRecord = {
      user_answer: ans,
      is_correct: false,
      think_time_ms: thinkTime,
    };

    try {
      const res = await api.post(`/practice/sets/${quiz.set.set_id}/answer`, {
        question_id: q.id,
        user_answer: ans,
        think_time_ms: thinkTime,
      }) as any;

      newAnswer.is_correct = res?.is_correct ?? false;
      newAnswer.correct_answer = res?.correct_answer ?? q.answer;
      newAnswer.explanation = res?.explanation ?? q.explanation;
    } catch {
      newAnswer.is_correct = ans.trim().toLowerCase() === (q.answer || "").trim().toLowerCase();
      newAnswer.correct_answer = q.answer;
      newAnswer.explanation = q.explanation;
    }

    setQuiz((prev) => prev ? {
      ...prev,
      answers: { ...prev.answers, [q.id]: newAnswer },
      submitted: true,
      showResult: true,
    } : null);

    if (newAnswer.is_correct) {
      toast.success("回答正确！");
    } else {
      toast.error("回答错误");
      // Auto-open tutor for wrong answers
      setShowTutor(q.id);
    }
  };

  // ── Next question ──

  const nextQuestion = () => {
    if (quiz.currentIndex + 1 >= quiz.set.questions.length) {
      // Quiz complete — build result and notify parent
      const total = quiz.set.questions.length;
      const allAnswers = quiz.answers;
      const correct = Object.values(allAnswers).filter((a) => a.is_correct).length;
      const wrongEntries = Object.entries(allAnswers).filter(([, a]) => !a.is_correct);

      const result: QuizResultData = {
        title: quiz.set.title,
        total,
        correct,
        wrongQuestions: wrongEntries.map(([qId, a]) => {
          const question = quiz.set.questions.find((qq) => qq.id === qId);
          return {
            question: question?.question || "",
            user_answer: a.user_answer,
            correct_answer: a.correct_answer || "",
            explanation: a.explanation,
          };
        }),
      };

      setQuiz((prev) => prev ? { ...prev, showResult: false, active: false } : null);
      onComplete(result);
      return;
    }
    setQuiz((prev) => prev ? {
      ...prev,
      currentIndex: prev.currentIndex + 1,
      startTime: Date.now(),
      showResult: false,
      submitted: false,
      currentAnswer: "",
    } : null);
    setShowTutor(null);
    setTutorInput("");
  };

  // ── AI Tutor (multi-turn) ──

  const askTutor = async (questionId: string, message: string) => {
    if (!message.trim() || tutoring) return;
    const question = quiz.set.questions.find((qq) => qq.id === questionId);
    const ans = quiz.answers[questionId];
    if (!question || !ans) return;

    const userMsg = { role: "user" as const, content: message.trim() };
    const prevChat = tutorChats[questionId] || [];

    setTutorChats((prev) => ({
      ...prev,
      [questionId]: [...prevChat, userMsg],
    }));
    setTutorInput("");
    setTutoring(questionId);

    try {
      const res = await api.post("/practice/tutor", {
        message: message.trim(),
        history: prevChat,
        question_text: question.question,
        user_answer: ans.user_answer,
        correct_answer: ans.correct_answer,
        explanation: ans.explanation,
      }) as any;

      const aiMsg = { role: "assistant" as const, content: res?.content || "暂无回复" };
      setTutorChats((prev) => ({
        ...prev,
        [questionId]: [...(prev[questionId] || []), aiMsg],
      }));
    } catch {
      const errMsg = { role: "assistant" as const, content: "AI 辅导暂时不可用，请稍后重试。" };
      setTutorChats((prev) => ({
        ...prev,
        [questionId]: [...(prev[questionId] || []), errMsg],
      }));
    } finally {
      setTutoring(null);
    }
  };

  const quitQuiz = () => {
    if (confirm("确定要退出练习吗？进度已保存。")) {
      saveQuizState(null);
      setQuiz(null);
      onBack();
    }
  };

  // ── Quiz complete screen ──

  if (!quiz.active) {
    const total = quiz.set.questions.length;
    const answered = Object.keys(quiz.answers).length;
    const correct = Object.values(quiz.answers).filter((a) => a.is_correct).length;
    const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;
    const totalTime = Object.values(quiz.answers).reduce((sum, a) => sum + a.think_time_ms, 0);
    const wrongItems = Object.entries(quiz.answers).filter(([, a]) => !a.is_correct);

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Card className="overflow-hidden border-primary/20">
          <CardContent className="p-6 text-center space-y-4">
            <div className="text-4xl">{accuracy >= 80 ? "🎉" : accuracy >= 60 ? "👍" : "💪"}</div>
            <h2 className="text-2xl font-bold">练习完成！</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="text-3xl font-bold text-primary">{accuracy}%</p>
                <p className="text-xs text-muted-foreground">正确率</p>
              </div>
              <div className="space-y-1">
                <p className="text-3xl font-bold">{correct}/{answered}</p>
                <p className="text-xs text-muted-foreground">答对/总答</p>
              </div>
              <div className="space-y-1">
                <p className="text-3xl font-bold">{formatTime(totalTime)}</p>
                <p className="text-xs text-muted-foreground">总用时</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {wrongItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BookX className="h-4 w-4 text-red-500" />
                错题回顾 ({wrongItems.length}题)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {wrongItems.map(([qId, ans]) => {
                const question = quiz.set.questions.find((qq) => qq.id === qId);
                if (!question) return null;
                const hasTutorChat = (tutorChats[qId]?.length || 0) > 0;
                return (
                  <div key={qId} className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 space-y-1">
                    <p className="text-sm font-medium">{question.question}</p>
                    <p className="text-xs text-red-600">你的答案: {ans.user_answer}</p>
                    <p className="text-xs text-green-600">正确答案: {ans.correct_answer}</p>
                    {ans.explanation && <p className="text-xs text-muted-foreground">{ans.explanation}</p>}
                    {hasTutorChat && (
                      <p className="text-xs text-primary mt-1">
                        <MessageCircle className="inline h-3 w-3 mr-1" />
                        已有 {tutorChats[qId]!.length / 2} 轮 AI 辅导讨论
                      </p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={quitQuiz} className="rounded-xl">
            <RotateCcw className="h-4 w-4 mr-1" />
            重新出题
          </Button>
          <Button onClick={onBack} className="rounded-xl bg-gradient-brand">
            <MessageCircle className="h-4 w-4 mr-1" />
            继续跟 AI 讨论
          </Button>
        </div>
      </div>
    );
  }

  // ── Active quiz ──

  const progress = (quiz.currentIndex / quiz.set.questions.length) * 100;
  const currentTutorChat = showTutor ? (tutorChats[showTutor] || []) : [];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={quitQuiz} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> 退出
        </button>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatTime(elapsed)}</span>
          <span>{quiz.currentIndex + 1}/{quiz.set.questions.length}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      {/* Question card */}
      <Card className="overflow-hidden">
        <CardContent className="p-5 sm:p-6 space-y-4">
          {/* Question meta */}
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{q.type === "choice" ? "选择题" : q.type === "translation" ? "翻译题" : q.type === "writing" ? "写作题" : q.type}</Badge>
            {q.category && <Badge variant="outline">{q.category}</Badge>}
            {q.difficulty && <Badge variant="outline">难度 {q.difficulty}/5</Badge>}
          </div>

          {/* Question text */}
          <p className="text-lg font-medium leading-relaxed">{q.question}</p>

          {/* Options (choice) */}
          {isChoice && q.options && (
            <div className="space-y-2">
              {q.options.map((opt, i) => {
                const letter = String.fromCharCode(65 + i);
                const isSelected = quiz.currentAnswer === letter || quiz.currentAnswer === opt;
                const isCorrect = answer?.correct_answer === letter || answer?.correct_answer === opt;
                const isWrong = answer && isSelected && !answer.is_correct;
                return (
                  <button key={i} onClick={() => !answer && submitAnswer(letter)}
                    disabled={!!answer}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      answer
                        ? isCorrect
                          ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                          : isWrong
                            ? "border-red-500 bg-red-50 dark:bg-red-950/20"
                            : "border-border/50 opacity-60"
                        : isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border/50 hover:border-primary/50 hover:bg-muted/50"
                    }`}>
                    <span className="font-medium mr-2">{letter}.</span>
                    <span>{opt}</span>
                    {answer && isCorrect && <Check className="inline h-4 w-4 text-green-600 ml-2" />}
                    {answer && isWrong && <X className="inline h-4 w-4 text-red-500 ml-2" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Text input (non-choice) */}
          {!isChoice && (
            <div className="space-y-2">
              <Input ref={inputRef} value={quiz.currentAnswer}
                onChange={(e) => setQuiz((prev) => prev ? { ...prev, currentAnswer: e.target.value } : null)}
                onKeyDown={(e) => e.key === "Enter" && quiz.currentAnswer.trim() && submitAnswer(quiz.currentAnswer.trim())}
                placeholder="输入你的答案..." className="rounded-xl" disabled={!!answer} />
              {!answer && (
                <Button onClick={() => quiz.currentAnswer.trim() && submitAnswer(quiz.currentAnswer.trim())}
                  disabled={!quiz.currentAnswer.trim()} className="rounded-xl bg-gradient-brand">
                  提交答案
                </Button>
              )}
            </div>
          )}

          {/* Result feedback */}
          {answer && (
            <div className={`p-3 rounded-xl ${answer.is_correct ? "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800"}`}>
              <div className="flex items-center gap-2">
                {answer.is_correct ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-red-500" />}
                <span className="font-medium">{answer.is_correct ? "正确！" : "错误"}</span>
                {!answer.is_correct && answer.correct_answer && (
                  <span className="text-sm text-muted-foreground">正确答案: {answer.correct_answer}</span>
                )}
              </div>
              {answer.explanation && (
                <p className="text-sm text-muted-foreground mt-1">{answer.explanation}</p>
              )}

              {/* Toggle tutor chat */}
              {!answer.is_correct && (
                <button
                  onClick={() => setShowTutor(showTutor === q.id ? null : q.id)}
                  className="flex items-center gap-1.5 text-sm text-primary hover:underline mt-2"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {showTutor === q.id ? "收起 AI 辅导" : "向 AI 请教这道题"}
                </button>
              )}
            </div>
          )}

          {/* ── Per-question AI Tutor Chat ── */}
          {showTutor === q.id && answer && (
            <div className="border rounded-xl mt-2 overflow-hidden">
              <div className="bg-muted/50 px-3 py-2 flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-primary" />
                AI 辅导 — 这道题
              </div>
              <div ref={tutorScrollRef} className="max-h-60 md:max-h-80 overflow-y-auto p-3 space-y-2 pb-24 md:pb-0">
                {currentTutorChat.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    对这道题有疑问？直接问 AI，比如"为什么我选的不对？""这个知识点还能怎么考？"
                  </p>
                )}
                {currentTutorChat.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {tutoring === q.id && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground">
                      <Loader2 className="inline h-3 w-3 animate-spin mr-1" />思考中...
                    </div>
                  </div>
                )}
              </div>
              <div className="border-t px-3 py-2 flex gap-2">
                <Input
                  ref={tutorInputRef}
                  value={tutorInput}
                  onChange={(e) => setTutorInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && tutorInput.trim() && askTutor(q.id, tutorInput)}
                  placeholder="问 AI 关于这道题的任何问题..."
                  className="h-8 text-sm rounded-lg"
                  disabled={tutoring === q.id}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => askTutor(q.id, tutorInput)}
                  disabled={!tutorInput.trim() || tutoring === q.id}
                  className="shrink-0 h-8 w-8 p-0"
                >
                  {tutoring === q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Next button */}
      {answer && (
        <div className="flex justify-end">
          <Button onClick={nextQuestion} className="rounded-xl bg-gradient-brand">
            {quiz.currentIndex + 1 >= quiz.set.questions.length ? "查看结果" : "下一题"}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
