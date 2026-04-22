"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { MessageSquare, BookX, History as HistoryIcon } from "lucide-react";
import { ChatView } from "./components/chat-view";
import { QuizView } from "./components/quiz-view";
import { WrongBook, HistoryView } from "./components/sheets";
import { loadQuizState, loadMessages, saveMessages, saveQuizState } from "./lib/data";
import type { QuizState, ChatMessage, PracticeSetData, QuizResultData } from "./lib/data";

type Tab = "chat" | "quiz" | "wrong" | "history";

export default function PracticePage() {
  const [tab, setTab] = useState<Tab>("chat");
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Restore from sessionStorage
  useEffect(() => {
    const saved = loadQuizState();
    if (saved?.active) {
      setQuiz(saved);
      setTab("quiz");
    }
    const savedMsgs = loadMessages();
    if (savedMsgs.length > 0) setMessages(savedMsgs);
  }, []);

  // Persist messages
  useEffect(() => {
    if (messages.length > 0) saveMessages(messages);
  }, [messages]);

  const startQuiz = useCallback((set: PracticeSetData) => {
    const q: QuizState = {
      active: true,
      set,
      currentIndex: 0,
      answers: {},
      startTime: Date.now(),
      showResult: false,
      currentAnswer: "",
      submitted: false,
    };
    setQuiz(q);
    setTab("quiz");
  }, []);

  /** Called when quiz completes. Injects results into chat so AI has context. */
  const handleQuizComplete = useCallback((result: QuizResultData) => {
    // Build a quiz result message and inject into chat
    const resultMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "assistant",
      content: `你完成了「${result.title}」，答对 ${result.correct}/${result.total} 题。以下是错题，你可以点击任意一道跟 AI 讨论：`,
      quizResult: result,
    };

    setMessages((prev) => [...prev, resultMsg]);
    saveQuizState(null);
    setQuiz(null);
    setTab("chat");
  }, []);

  const backToChat = useCallback(() => {
    setQuiz(null);
    setTab("chat");
  }, []);

  // If quiz is active, show quiz view
  if (tab === "quiz" && quiz) {
    return (
      <AppLayout>
        <QuizView quiz={quiz} setQuiz={setQuiz} onBack={backToChat} onComplete={handleQuizComplete} />
      </AppLayout>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "chat", label: "AI 出题", icon: <MessageSquare className="h-4 w-4" /> },
    { key: "wrong", label: "错题本", icon: <BookX className="h-4 w-4" /> },
    { key: "history", label: "历史", icon: <HistoryIcon className="h-4 w-4" /> },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">练习</h1>
            <p className="text-sm text-muted-foreground mt-0.5">AI 智能出题 + 全程辅导</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-2">
          {tabs.map((t) => (
            <Button key={t.key} variant={tab === t.key ? "default" : "outline"}
              onClick={() => setTab(t.key)} className="rounded-xl">
              {t.icon}
              <span className="ml-1.5">{t.label}</span>
            </Button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "chat" && (
          <ChatView messages={messages} setMessages={setMessages} onStartQuiz={startQuiz} />
        )}
        {tab === "wrong" && <WrongBook />}
        {tab === "history" && <HistoryView />}
      </div>
    </AppLayout>
  );
}
