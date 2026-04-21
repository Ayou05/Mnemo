"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { useLocaleStore } from "@/stores/locale";
import { useTranslation } from "@/lib/i18n";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Languages, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const { setAuth } = useAuthStore();
  const { locale, setLocale } = useLocaleStore();
  const { t } = useTranslation();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const endpoint = isRegister ? "/auth/register" : "/auth/login";
      const body: Record<string, string> = { username, password };
      if (isRegister) {
        body.email = email;
        if (nickname) body.nickname = nickname;
      }
      const res = await api.post(endpoint, body) as any;
      if (res.access_token && res.user) {
        setAuth(res.user, res.access_token);
        router.push("/dashboard");
      }
    } catch (err: any) {
      setError(err?.message || (isRegister ? t("auth.registerError") : t("auth.loginError")));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-login p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-fade-in-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-brand shadow-xl shadow-primary/25 mb-4">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Mnemo</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("app.tagline")}</p>
        </div>

        {/* Form Card */}
        <div className="rounded-2xl bg-card/80 backdrop-blur-xl border border-border/50 shadow-xl shadow-black/5 p-6">
          <h2 className="text-lg font-semibold text-center mb-5">
            {isRegister ? t("auth.register") : t("auth.login")}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium">{t("auth.username")}</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("auth.usernamePlaceholder")}
                required
                className="h-10 rounded-xl bg-background/50 border-border/50 focus:border-primary/50 focus:ring-primary/20"
              />
            </div>

            {isRegister && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">{t("auth.email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("auth.emailPlaceholder")}
                    required
                    className="h-10 rounded-xl bg-background/50 border-border/50 focus:border-primary/50 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nickname" className="text-sm font-medium">{t("auth.nickname")}</Label>
                  <Input
                    id="nickname"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder={t("auth.nicknamePlaceholder")}
                    className="h-10 rounded-xl bg-background/50 border-border/50 focus:border-primary/50 focus:ring-primary/20"
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">{t("auth.password")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth.passwordPlaceholder")}
                required
                className="h-10 rounded-xl bg-background/50 border-border/50 focus:border-primary/50 focus:ring-primary/20"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3 pt-1">
              <Button
                type="submit"
                className="flex-1 h-10 rounded-xl bg-gradient-brand hover:opacity-90 text-white shadow-lg shadow-primary/20 btn-press"
                disabled={loading}
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                {loading
                  ? (isRegister ? t("auth.registering") : t("auth.loggingIn"))
                  : (isRegister ? t("auth.register") : t("auth.login"))}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-10 rounded-xl border-border/50 hover:bg-muted/50"
                disabled={loading}
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError("");
                }}
              >
                {isRegister ? t("auth.login") : t("auth.register")}
              </Button>
            </div>
          </form>
        </div>

        <div className="flex justify-center mt-5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
            className="gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground rounded-lg"
          >
            <Languages className="h-3.5 w-3.5" />
            {locale === "zh" ? "English" : "中文"}
          </Button>
        </div>
      </div>
    </div>
  );
}
