"use client";

import React, { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { X, Search, ChevronDown } from "lucide-react";

const EXAM_CATEGORIES = [
  {
    name: "语言类",
    icon: "🌐",
    exams: [
      "大学英语四级(CET-4)", "大学英语六级(CET-6)", "英语专业四级(TEM-4)",
      "英语专业八级(TEM-8)", "考研英语一", "考研英语二",
      "MTI翻译硕士", "雅思(IELTS)", "托福(TOEFL)", "GRE",
      "日语N2", "日语N1", "韩语TOPIK",
    ],
  },
  {
    name: "升学考试",
    icon: "🎓",
    exams: ["高考语文", "高考数学", "高考英语", "高考文综", "高考理综", "中考全科"],
  },
  {
    name: "考研",
    icon: "📚",
    exams: [
      "考研政治", "考研数学一", "考研数学二", "考研数学三",
      "考研教育学", "考研心理学", "考研历史学", "考研计算机",
      "考研管理学", "考研经济学", "考研法学",
    ],
  },
  {
    name: "教师资格",
    icon: "👩‍🏫",
    exams: ["幼教资格证", "小学教师资格证", "初中教师资格证", "高中教师资格证", "中职教师资格证"],
  },
  {
    name: "公务员/事业编",
    icon: "🏛️",
    exams: ["国考行测", "国考申论", "省考行测", "省考申论", "事业单位综合知识", "事业单位职测"],
  },
  {
    name: "财会金融",
    icon: "💰",
    exams: ["初级会计", "中级会计", "CPA", "CFA", "银行从业", "证券从业", "基金从业"],
  },
  {
    name: "法律",
    icon: "⚖️",
    exams: ["法考客观题", "法考主观题", "法律硕士(非法学)", "法律硕士(法学)"],
  },
  {
    name: "医学",
    icon: "🏥",
    exams: ["执业医师", "执业药师", "护士执业资格", "考研西医综合"],
  },
  {
    name: "工程",
    icon: "🔧",
    exams: ["一级建造师", "二级建造师", "注册结构工程师", "注册电气工程师", "软考"],
  },
  {
    name: "其他资格",
    icon: "📋",
    exams: ["导游资格证", "人力资源管理师", "心理咨询师", "计算机二级", "PMP项目管理", "软考"],
  },
];

interface GoalPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (goal: string) => void;
  currentGoal: string | null;
}

export function GoalPicker({ open, onClose, onSelect, currentGoal }: GoalPickerProps) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return EXAM_CATEGORIES;
    const q = search.toLowerCase();
    return EXAM_CATEGORIES
      .map(cat => ({
        ...cat,
        exams: cat.exams.filter(e => e.toLowerCase().includes(q)),
      }))
      .filter(cat => cat.exams.length > 0);
  }, [search]);

  useEffect(() => {
    if (open) { setSearch(""); setExpanded(null); }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* Sheet */}
      <div className="relative bg-background rounded-t-2xl max-h-[80vh] flex flex-col animate-in slide-in-from-bottom duration-300">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3">
          <h3 className="text-base font-bold">选择备考目标</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索考试名称..."
              className="pl-9"
            />
          </div>
        </div>
        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2">
          {filtered.map(cat => (
            <div key={cat.name}>
              <button
                onClick={() => setExpanded(expanded === cat.name ? null : cat.name)}
                className="w-full flex items-center justify-between py-2 text-sm font-medium"
              >
                <span className="flex items-center gap-2">
                  <span>{cat.icon}</span>
                  {cat.name}
                  <span className="text-xs text-muted-foreground">({cat.exams.length})</span>
                </span>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded === cat.name && "rotate-180")} />
              </button>
              {expanded === cat.name && (
                <div className="grid grid-cols-2 gap-1.5 pb-2 pl-6">
                  {cat.exams.map(exam => (
                    <button
                      key={exam}
                      onClick={() => { onSelect(exam); onClose(); }}
                      className={cn(
                        "text-left text-xs px-3 py-2 rounded-lg border transition-all",
                        currentGoal === exam
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border/50 hover:border-primary/50 hover:bg-primary/5"
                      )}
                    >
                      {exam}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
