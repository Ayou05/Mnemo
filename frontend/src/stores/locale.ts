"use client";

import { create } from "zustand";

type Locale = "zh" | "en";

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: "zh",
  setLocale: (locale) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("mnemo_locale", locale);
    }
    set({ locale });
  },
  init: () => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mnemo_locale") as Locale | null;
      if (saved && (saved === "zh" || saved === "en")) {
        set({ locale: saved });
      }
    }
  },
}));
