"use client";

import { create } from "zustand";
import { api } from "@/lib/api";

type ReviewMode = "standard" | "write_en_to_zh" | "write_zh_to_en" | "cloze" | "paragraph";

interface SettingsState {
  defaultReviewMode: ReviewMode;
  enableReviewReminder: boolean;
  reminderTime: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  practiceGoal: string | null;
  // Actions
  setDefaultReviewMode: (mode: ReviewMode) => void;
  setEnableReviewReminder: (enabled: boolean) => void;
  setReminderTime: (time: string) => void;
  setQuietHoursStart: (time: string) => void;
  setQuietHoursEnd: (time: string) => void;
  setPracticeGoal: (goal: string | null) => void;
  hydrate: () => Promise<void>;
  _sync: (patch: Record<string, unknown>) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  defaultReviewMode: "write_en_to_zh",
  enableReviewReminder: true,
  reminderTime: "20:00",
  quietHoursStart: "23:00",
  quietHoursEnd: "07:00",
  practiceGoal: null,

  setDefaultReviewMode: (mode) => {
    set({ defaultReviewMode: mode });
    get()._sync({ defaultReviewMode: mode });
  },
  setEnableReviewReminder: (enabled) => {
    set({ enableReviewReminder: enabled });
    get()._sync({ enableReviewReminder: enabled });
  },
  setReminderTime: (time) => {
    set({ reminderTime: time });
    get()._sync({ reminderTime: time });
  },
  setQuietHoursStart: (time) => {
    set({ quietHoursStart: time });
    get()._sync({ quietHoursStart: time });
  },
  setQuietHoursEnd: (time) => {
    set({ quietHoursEnd: time });
    get()._sync({ quietHoursEnd: time });
  },
  setPracticeGoal: (goal) => {
    set({ practiceGoal: goal });
    get()._sync({ practiceGoal: goal });
  },

  hydrate: async () => {
    try {
      const s = await api.get<Record<string, unknown>>("/auth/settings") as any;
      if (!s) return;
      if (typeof s.defaultReviewMode === "string" && ["standard", "write_en_to_zh", "write_zh_to_en", "cloze", "paragraph"].includes(s.defaultReviewMode)) {
        set({ defaultReviewMode: s.defaultReviewMode });
      }
      if (typeof s.enableReviewReminder === "boolean") {
        set({ enableReviewReminder: s.enableReviewReminder });
      }
      if (typeof s.reminderTime === "string") {
        set({ reminderTime: s.reminderTime });
      }
      if (typeof s.quietHoursStart === "string") {
        set({ quietHoursStart: s.quietHoursStart });
      }
      if (typeof s.quietHoursEnd === "string") {
        set({ quietHoursEnd: s.quietHoursEnd });
      }
      if (typeof s.practiceGoal === "string") {
        set({ practiceGoal: s.practiceGoal });
      }
    } catch {
      // Not logged in or network error — use defaults
    }
  },

  // Internal: sync a patch to server (fire-and-forget)
  _sync: (patch: Record<string, unknown>) => {
    if (typeof window === "undefined") return;
    api.put("/auth/settings", { settings: patch }).catch(() => {
      // Silently fail — will sync next time
    });
  },
}));
