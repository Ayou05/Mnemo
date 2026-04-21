"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { useLocaleStore } from "@/stores/locale";
import { useTheme } from "next-themes";
import { useSettingsStore } from "@/stores/settings";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { RotateCcw, Droplets, AlertTriangle, Loader2 } from "lucide-react";

interface ImportPreview {
  apply: boolean;
  backup_version?: string;
  version_compatible?: boolean;
  template_mode?: string;
  detected: Record<string, number>;
  imported: Record<string, number>;
  conflicts?: {
    task_title_duplicates?: string[];
    template_month_duplicates?: string[];
    risk_level?: "low" | "high";
  };
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocaleStore();
  const { theme, setTheme } = useTheme();
  const {
    defaultReviewMode,
    enableReviewReminder,
    reminderTime,
    quietHoursStart,
    quietHoursEnd,
    setDefaultReviewMode,
    setEnableReviewReminder,
    setReminderTime,
    setQuietHoursStart,
    setQuietHoursEnd,
    hydrate,
  } = useSettingsStore();
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [templateImportMode, setTemplateImportMode] = useState<"append" | "replace_by_month">("append");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [resetting, setResetting] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [dripStatus, setDripStatus] = useState<{ total: number; released: number; unreleased: number } | null>(null);

  useEffect(() => {
    hydrate();
    // Fetch drip-feed status
    api.get("/memory/drip-feed/status").then((res: any) => {
      setDripStatus(res);
    }).catch(() => {});
  }, [hydrate]);

  const resetProgress = async (scope: "all" | "domain" | "card_set", domain?: string, cardSetId?: string) => {
    const scopeLabel = scope === "all" ? "全部卡片" : scope === "domain" ? `领域「${domain}」` : "选中卡组";
    if (!confirm(`⚠️ 确定要重置 ${scopeLabel} 的学习进度吗？\n\n这将清除所有复习记录和 CASR 状态，卡片本身不会被删除。此操作不可撤销。`)) return;
    setResetting(true);
    try {
      const res = await api.post("/memory/reset", { scope, domain, card_set_id: cardSetId }) as any;
      toast.success(res.message || `已重置 ${res.reset_count} 张卡片`);
      // Refresh drip status
      const status = await api.get("/memory/drip-feed/status") as any;
      setDripStatus(status);
    } catch {
      toast.error("重置失败");
    } finally {
      setResetting(false);
    }
  };

  const releaseNewCards = async (count: number = 20) => {
    setReleasing(true);
    try {
      const res = await api.post(`/memory/drip-feed/release?limit=${count}`) as any;
      toast.success(`已释放 ${res.released_count} 张新卡片到复习队列`);
      const status = await api.get("/memory/drip-feed/status") as any;
      setDripStatus(status);
    } catch {
      toast.error("释放失败");
    } finally {
      setReleasing(false);
    }
  };

  const exportAllData = async () => {
    try {
      const data = await api.get("/system/data/export/all") as Record<string, unknown>;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mnemo_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("已导出完整数据备份");
    } catch {
      toast.error("导出备份失败");
    }
  };

  const readBackupJson = async (): Promise<Record<string, unknown> | null> => {
    if (!backupFile) {
      toast.error("请先选择备份 JSON 文件");
      return null;
    }
    try {
      const raw = await backupFile.text();
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      toast.error("备份文件解析失败，请确认是有效 JSON");
      return null;
    }
  };

  const previewImportAllData = async () => {
    const data = await readBackupJson();
    if (!data) return;
    try {
      const res = await api.post(`/system/data/import/all?apply=false&template_mode=${templateImportMode}`, data) as ImportPreview;
      setImportPreview(res);
      if (res.version_compatible === false) {
        toast.error(`备份版本不兼容：${res.backup_version || "unknown"}`);
        return;
      }
      toast.success("已完成导入预检");
    } catch {
      toast.error("导入预检失败");
    }
  };

  const applyImportAllData = async () => {
    const data = await readBackupJson();
    if (!data) return;
    const modeText = templateImportMode === "replace_by_month" ? "按月份替换计划模板" : "追加导入";
    if (!confirm(`将把备份数据导入当前账号（${modeText}）。确认继续？`)) return;
    try {
      const res = await api.post(`/system/data/import/all?apply=true&template_mode=${templateImportMode}`, data) as ImportPreview;
      setImportPreview(res);
      toast.success("数据导入完成");
    } catch {
      toast.error("数据导入失败");
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("settings.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("settings.subtitle")}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.appearance")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{t("settings.theme")}</p>
                <p className="text-sm text-muted-foreground">{t("settings.themeDesc")}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant={theme === "light" ? "default" : "outline"} onClick={() => setTheme("light")}>
                  {t("settings.light")}
                </Button>
                <Button variant={theme === "dark" ? "default" : "outline"} onClick={() => setTheme("dark")}>
                  {t("settings.dark")}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{t("settings.language")}</p>
                <p className="text-sm text-muted-foreground">{t("settings.languageDesc")}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant={locale === "zh" ? "default" : "outline"} onClick={() => setLocale("zh")}>
                  中文
                </Button>
                <Button variant={locale === "en" ? "default" : "outline"} onClick={() => setLocale("en")}>
                  English
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.training")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{t("settings.defaultReviewMode")}</p>
                <p className="text-sm text-muted-foreground">{t("settings.defaultReviewModeDesc")}</p>
              </div>
              <select
                value={defaultReviewMode}
                onChange={(e) => setDefaultReviewMode(e.target.value as any)}
                className="h-9 rounded-lg border border-border bg-card px-3 text-sm"
              >
                <option value="write_en_to_zh">{t("memory.modeWriteEnToZh")}</option>
                <option value="write_zh_to_en">{t("memory.modeWriteZhToEn")}</option>
                <option value="cloze">{t("memory.modeClozeInput")}</option>
                <option value="standard">{t("memory.modeStandard")}</option>
              </select>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{t("settings.reviewReminder")}</p>
                <p className="text-sm text-muted-foreground">{t("settings.reviewReminderDesc")}</p>
              </div>
              <Button
                variant={enableReviewReminder ? "default" : "outline"}
                onClick={() => setEnableReviewReminder(!enableReviewReminder)}
              >
                {enableReviewReminder ? t("common.on") : t("common.off")}
              </Button>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{t("settings.reminderTime")}</p>
                <p className="text-sm text-muted-foreground">{t("settings.reminderTimeDesc")}</p>
              </div>
              <input
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
                className="h-9 rounded-lg border border-border bg-card px-3 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="font-medium">{t("settings.quietStart")}</p>
                <input
                  type="time"
                  value={quietHoursStart}
                  onChange={(e) => setQuietHoursStart(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm"
                />
              </div>
              <div className="space-y-1">
                <p className="font-medium">{t("settings.quietEnd")}</p>
                <input
                  type="time"
                  value={quietHoursEnd}
                  onChange={(e) => setQuietHoursEnd(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ═══ 学习进度管理 ═══ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-orange-500" />
              学习进度管理
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              重置学习进度会清除所有复习记录和 CASR 算法状态，卡片本身不会被删除。适用于测试阶段或想重新开始学习的情况。
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => resetProgress("all")}
                disabled={resetting}
              >
                {resetting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <AlertTriangle className="h-4 w-4 mr-1" />}
                重置全部进度
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ═══ 新卡释放 (Drip-feed) ═══ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Droplets className="h-5 w-5 text-blue-500" />
              新卡释放
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              导入的卡片不会一次性全部进入复习队列，而是逐步释放，避免被大量新卡淹没。
            </p>
            {dripStatus && (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border bg-muted/30 p-3 text-center">
                  <div className="text-xl font-bold">{dripStatus.total}</div>
                  <p className="text-xs text-muted-foreground">总卡片</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 text-center">
                  <div className="text-xl font-bold text-emerald-500">{dripStatus.released}</div>
                  <p className="text-xs text-muted-foreground">已释放</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 text-center">
                  <div className="text-xl font-bold text-amber-500">{dripStatus.unreleased}</div>
                  <p className="text-xs text-muted-foreground">待释放</p>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => releaseNewCards(10)}
                disabled={releasing || (dripStatus?.unreleased ?? 0) === 0}
              >
                {releasing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Droplets className="h-4 w-4 mr-1" />}
                释放 10 张
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => releaseNewCards(20)}
                disabled={releasing || (dripStatus?.unreleased ?? 0) === 0}
              >
                释放 20 张
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => releaseNewCards(50)}
                disabled={releasing || (dripStatus?.unreleased ?? 0) === 0}
              >
                释放 50 张
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => releaseNewCards(9999)}
                disabled={releasing || (dripStatus?.unreleased ?? 0) === 0}
              >
                全部释放
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>数据管理</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={exportAllData}>导出全部数据(JSON)</Button>
              <label className="inline-flex">
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => setBackupFile(e.target.files?.[0] || null)}
                />
                <Button variant="outline">选择备份文件</Button>
              </label>
              <Button variant="outline" onClick={previewImportAllData} disabled={!backupFile}>预检导入</Button>
              <Button onClick={applyImportAllData} disabled={!backupFile}>确认导入</Button>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">计划模板导入策略</span>
              <select
                value={templateImportMode}
                onChange={(e) => setTemplateImportMode(e.target.value as "append" | "replace_by_month")}
                className="h-9 rounded-lg border border-border bg-card px-3 text-sm"
              >
                <option value="append">追加导入</option>
                <option value="replace_by_month">按月份替换</option>
              </select>
            </div>
            <p className="text-sm text-muted-foreground">
              {backupFile ? `当前备份文件：${backupFile.name}` : "尚未选择备份文件"}
            </p>
            {importPreview && (
              <div className="rounded-md border p-2 text-xs space-y-1">
                <p className="font-medium">{importPreview.apply ? "导入结果" : "预检结果"}</p>
                <p>版本：{importPreview.backup_version || "unknown"}（{importPreview.version_compatible ? "兼容" : "不兼容"}）</p>
                <p>模板策略：{importPreview.template_mode || "-"}</p>
                <p>冲突风险：{importPreview.conflicts?.risk_level === "high" ? "高" : "低"}</p>
                {!!importPreview.conflicts?.task_title_duplicates?.length && (
                  <p className="text-amber-600">
                    重复任务标题：{importPreview.conflicts.task_title_duplicates.slice(0, 6).join("、")}
                  </p>
                )}
                {!!importPreview.conflicts?.template_month_duplicates?.length && (
                  <p className="text-amber-600">
                    重复模板月份：{importPreview.conflicts.template_month_duplicates.join("、")}
                  </p>
                )}
                <p>检测到：{Object.entries(importPreview.detected || {}).map(([k, v]) => `${k}:${v}`).join(" · ")}</p>
                <p>已导入：{Object.entries(importPreview.imported || {}).map(([k, v]) => `${k}:${v}`).join(" · ")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

