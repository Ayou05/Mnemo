"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Sparkles, BookX, CheckCircle, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useSettingsStore } from "@/stores/settings";
import { GOAL_PROMPTS, getGoalKey } from "../lib/data";
import type { ChatMessage, PracticeSetData, QuizResultData } from "../lib/data";

interface Props {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onStartQuiz: (set: PracticeSetData) => void;
}

export function ChatView({ messages, setMessages, onStartQuiz }: Props) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { practiceGoal } = useSettingsStore();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  /** Find the most recent quiz result in chat history for context. */
  const getRecentQuizContext = (): QuizResultData | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].quizResult) return messages[i].quizResult!;
    }
    return null;
  };

  const sendMessage = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || sending) return;
    setInput("");
    setSending(true);

    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: msg };
    const loadingMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: "assistant", content: "", loading: true };
    setMessages((prev) => [...prev, userMsg, loadingMsg]);

    try {
      const quizCtx = getRecentQuizContext();
      const useTutor = quizCtx && quizCtx.wrongQuestions.length > 0;

      let res: any;
      if (useTutor) {
        res = await api.post("/practice/tutor", {
          message: msg,
          history: messages
            .filter((m) => !m.loading && !m.practiceSet && !m.quizResult)
            .slice(-10)
            .map((m) => ({ role: m.role, content: m.content })),
          wrong_questions: quizCtx.wrongQuestions,
          quiz_title: quizCtx.title,
        });
      } else {
        res = await api.post("/practice/generate", {
          prompt: msg,
          goal: practiceGoal || undefined,
        });
      }

      if (useTutor) {
        const assistantMsg: ChatMessage = {
          id: (Date.now() + 2).toString(),
          role: "assistant",
          content: res?.content || res?.text || "无法回复，请重试",
        };
        setMessages((prev) => prev.filter((m) => !m.loading).concat(assistantMsg));
      } else if (res?.set_id) {
        const practiceSet: PracticeSetData = {
          set_id: res.set_id,
          title: res.title || msg.slice(0, 30),
          count: res.questions?.length || 0,
          questions: res.questions || [],
        };
        const assistantMsg: ChatMessage = {
          id: (Date.now() + 2).toString(),
          role: "assistant",
          content: `已生成 ${practiceSet.count} 道题目，点击下方按钮开始练习！`,
          practiceSet,
        };
        setMessages((prev) => prev.filter((m) => !m.loading).concat(assistantMsg));
      } else {
        const assistantMsg: ChatMessage = {
          id: (Date.now() + 2).toString(),
          role: "assistant",
          content: res?.content || res?.text || "生成失败，请重试",
        };
        setMessages((prev) => prev.filter((m) => !m.loading).concat(assistantMsg));
      }
    } catch {
      const errMsg: ChatMessage = {
        id: (Date.now() + 2).toString(),
        role: "assistant",
        content: "请求失败，请检查网络后重试",
      };
      setMessages((prev) => prev.filter((m) => !m.loading).concat(errMsg));
    } finally {
      setSending(false);
    }
  };

  const goalKey = getGoalKey(practiceGoal);
  const prompts = GOAL_PROMPTS[goalKey] || GOAL_PROMPTS.default;

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] md:h-auto gap-4">
      {/* Quick prompts */}
      {messages.length === 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 shrink-0">
          {prompts.map((p, i) => (
            <button key={i} onClick={() => sendMessage(p.prompt)}
              className="flex items-center gap-2 p-3 rounded-xl border border-border/50 bg-card hover:bg-muted/50 transition-colors text-left">
              <span className="text-lg">{p.icon}</span>
              <span className="text-sm font-medium">{p.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Messages — scroll area, respects mobile bottom nav (pb-24) and input area */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto pb-24 md:pb-0 space-y-3"
      >
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-primary text-primary-foreground"
                : "bg-muted"
            }`}>
              {msg.loading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>思考中...</span>
                </div>
              ) : msg.quizResult ? (
                <div className="space-y-2">
                  <p className="font-medium">{msg.content}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-background/50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-primary">{msg.quizResult.correct}/{msg.quizResult.total}</p>
                      <p className="text-muted-foreground">答对</p>
                    </div>
                    <div className="bg-background/50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-red-500">{msg.quizResult.wrongQuestions.length}</p>
                      <p className="text-muted-foreground">错题</p>
                    </div>
                  </div>
                  {msg.quizResult.wrongQuestions.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">错题列表（点击可讨论）：</p>
                      {msg.quizResult.wrongQuestions.map((wq, i) => (
                        <button
                          key={i}
                          onClick={() => sendMessage(`请帮我分析第${i + 1}道错题：${wq.question.slice(0, 50)}... 我选了${wq.user_answer}，正确答案是${wq.correct_answer}，我不太明白为什么`)}
                          className="w-full text-left p-2 rounded-lg bg-background/50 hover:bg-background/80 transition-colors text-xs space-y-0.5"
                        >
                          <p className="font-medium truncate">{wq.question}</p>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <span className="text-red-500 flex items-center gap-0.5"><XCircle className="h-3 w-3" />{wq.user_answer}</span>
                            <span className="text-green-600 flex items-center gap-0.5"><CheckCircle className="h-3 w-3" />{wq.correct_answer}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground pt-1">
                    💬 你可以点击上方错题直接讨论，或输入任何问题，AI 会结合你的练习情况回答。
                  </p>
                </div>
              ) : (
                <>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.practiceSet && (
                    <Button size="sm" className="mt-2 rounded-xl"
                      onClick={() => onStartQuiz(msg.practiceSet!)}>
                      <Sparkles className="h-3.5 w-3.5 mr-1" />
                      开始做题 ({msg.practiceSet.count}题)
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input — fixed at bottom with padding for mobile nav */}
      <div className="flex gap-2 shrink-0 pb-24 md:pb-0">
        <Input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
          placeholder="描述你想练习的内容，或向 AI 请教任何问题..." className="rounded-xl" disabled={sending} />
        <Button onClick={() => sendMessage()} disabled={sending || !input.trim()} className="rounded-xl shrink-0">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}