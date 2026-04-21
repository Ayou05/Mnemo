"use client";

import { useCallback, useMemo } from "react";
import { useLocaleStore } from "@/stores/locale";
import zh from "@/i18n/zh.json";
import en from "@/i18n/en.json";

const messages: Record<string, Record<string, unknown>> = { zh, en };

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return path; // fallback to key path
    }
  }
  return typeof current === "string" ? current : path;
}

export function useTranslation() {
  const { locale } = useLocaleStore();

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      let value = getNestedValue(
        (messages[locale] || messages.zh) as Record<string, unknown>,
        key
      );
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          value = value.replace(`{${k}}`, String(v));
        });
      }
      return value;
    },
    [locale]
  );

  const localeValue = locale;

  return { t, locale: localeValue };
}
