"use client";

import { create } from "zustand";

type ReviewMode = "standard" | "write_en_to_zh" | "write_zh_to_en" | "cloze" | "paragraph";

interface SettingsState {
  defaultReviewMode: ReviewMode;
  enableReviewReminder: boolean;
  reminderTime: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  setDefaultReviewMode: (mode: ReviewMode) => void;
  setEnableReviewReminder: (enabled: boolean) => void;
  setReminderTime: (time: string) => void;
  setQuietHoursStart: (time: string) => void;
  setQuietHoursEnd: (time: string) => void;
  hydrate: () => void;
}

const KEY_MODE = "mnemo_default_review_mode";
const KEY_REMINDER = "mnemo_enable_review_reminder";
const KEY_REMINDER_TIME = "mnemo_reminder_time";
const KEY_QUIET_START = "mnemo_quiet_start";
const KEY_QUIET_END = "mnemo_quiet_end";

export const useSettingsStore = create<SettingsState>((set) => ({
  defaultReviewMode: "write_en_to_zh",
  enableReviewReminder: true,
  reminderTime: "20:00",
  quietHoursStart: "23:00",
  quietHoursEnd: "07:00",
  setDefaultReviewMode: (mode) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(KEY_MODE, mode);
    }
    set({ defaultReviewMode: mode });
  },
  setEnableReviewReminder: (enabled) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(KEY_REMINDER, String(enabled));
    }
    set({ enableReviewReminder: enabled });
  },
  setReminderTime: (time) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(KEY_REMINDER_TIME, time);
    }
    set({ reminderTime: time });
  },
  setQuietHoursStart: (time) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(KEY_QUIET_START, time);
    }
    set({ quietHoursStart: time });
  },
  setQuietHoursEnd: (time) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(KEY_QUIET_END, time);
    }
    set({ quietHoursEnd: time });
  },
  hydrate: () => {
    if (typeof window === "undefined") return;
    const savedMode = localStorage.getItem(KEY_MODE) as ReviewMode | null;
    const savedReminder = localStorage.getItem(KEY_REMINDER);
    const savedReminderTime = localStorage.getItem(KEY_REMINDER_TIME);
    const savedQuietStart = localStorage.getItem(KEY_QUIET_START);
    const savedQuietEnd = localStorage.getItem(KEY_QUIET_END);
    if (savedMode && ["standard", "write_en_to_zh", "write_zh_to_en", "cloze", "paragraph"].includes(savedMode)) {
      set({ defaultReviewMode: savedMode });
    }
    if (savedReminder !== null) {
      set({ enableReviewReminder: savedReminder === "true" });
    }
    if (savedReminderTime) {
      set({ reminderTime: savedReminderTime });
    }
    if (savedQuietStart) {
      set({ quietHoursStart: savedQuietStart });
    }
    if (savedQuietEnd) {
      set({ quietHoursEnd: savedQuietEnd });
    }
  },
}));

