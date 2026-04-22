"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, BookX, History, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import type { HistoryItem, QuestionData } from "../lib/data";
import { formatDate } from "../lib/data";

// ── Wrong Book ──

export function WrongBook() {
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/practice/wrong") as any;
        setQuestions(res || []);
      } catch {} finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <BookX className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-lg font-medium">暂无错题</p>
        <p className="text-sm mt-1">做题后答错的题目会出现在这里</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">共 {questions.length} 道错题</p>
      {questions.map((q) => (
        <Card key={q.id}>
          <CardContent className="p-4 space-y-2">
            <p className="font-medium text-sm">{q.question}</p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{q.type}</span>
              {q.category && <span>{q.category}</span>}
              {q.wrong_count !== undefined && <span>错 {q.wrong_count} 次</span>}
            </div>
            {q.answer && (
              <div className="text-xs bg-green-50 dark:bg-green-950/20 rounded-lg p-2">
                <span className="text-green-600 font-medium">答案: </span>
                {q.answer}
              </div>
            )}
            {q.explanation && (
              <p className="text-xs text-muted-foreground">{q.explanation}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── History ──

export function HistoryView() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/practice/history") as any;
        setItems(res || []);
      } catch {} finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-lg font-medium">暂无练习记录</p>
        <p className="text-sm mt-1">完成一次练习后记录会出现在这里</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Card key={item.set_id} className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-medium">{item.title}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{item.question_count} 题</span>
                  <span>答对 {item.correct_count}/{item.total_answered}</span>
                  <span>{formatDate(item.created_at)}</span>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-lg font-bold ${item.accuracy >= 80 ? "text-green-600" : item.accuracy >= 60 ? "text-amber-600" : "text-red-500"}`}>
                  {item.accuracy}%
                </p>
                <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
