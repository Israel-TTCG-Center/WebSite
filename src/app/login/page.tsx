"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { User, Lock, Mail, ArrowRight, Globe } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NameFields } from "@/components/ui/name-fields";
import { normalizeName, type Name } from "@/lib/name";
import {
  Card,
  CardHeader,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AuthFormValues {
  name: Name;
  email: string;
  password: string;
}

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit } = useForm<AuthFormValues>({
    defaultValues: {
      name: {
        firstName: "",
        middleName: "",
        lastName: "",
      },
      email: "",
      password: "",
    },
  });

  const { setUser, deliveryAddress, paymentMethod } = useCart();
  const { locale, setLocale, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  const onSubmit = async (values: AuthFormValues) => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          name: normalizeName(
            values.name,
            values.email.split("@")[0] || "Guest",
            "Player"
          ),
          email: values.email,
          password: values.password,
          deliveryAddress,
          paymentMethod,
          preferences: { locale, theme },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Authentication failed");
      } else {
        setUser(data.user);
        if (data.user?.preferences?.locale) {
          setLocale(data.user.preferences.locale);
        }
        if (data.user?.preferences?.theme) {
          setTheme(data.user.preferences.theme);
        }
        router.push("/account");
      }
    } catch {
      setError("Network error while connecting to server.");
    } finally {
      setLoading(false);
    }
  };

  const handleThirdPartyGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      // One-click Google Sign-In via Auth0: uses the Google account email directly without requiring email input
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "third-party",
          provider: "google",
          deliveryAddress,
          paymentMethod,
          preferences: { locale, theme },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Third-party authentication failed");
      } else {
        setUser(data.user);
        router.push("/account");
      }
    } catch {
      setError("Network error while connecting to Google provider.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      aria-labelledby="auth-page-heading"
      className="max-w-md mx-auto px-4 py-16"
    >
      <Card className="p-2">
        <CardHeader className="space-y-4">
          <Tabs
            value={mode}
            onValueChange={(v) => setMode(v as "login" | "register")}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">{t.auth.signInTab}</TabsTrigger>
              <TabsTrigger value="register" data-testid="auth-register-tab">
                {t.auth.registerTab}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div>
            <h1
              id="auth-page-heading"
              data-testid="auth-page-heading"
              className="text-2xl font-bold leading-none tracking-tight text-slate-900 dark:text-white"
            >
              {mode === "login" ? t.auth.welcomeBack : t.auth.createAccount}
            </h1>
            <CardDescription className="mt-1">
              {t.auth.subtitle}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-medium"
            >
              {error}
            </div>
          )}

          {/* One-Click Google Registration / Sign-In (No email input needed; Google email is used for newsletters) */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="lg"
              data-testid="google-auth-btn"
              onClick={handleThirdPartyGoogle}
              disabled={loading}
              className="w-full font-bold"
            >
              <Globe className="w-4 h-4 text-brand-500" />
              <span>{t.thirdParty.googleBtn}</span>
            </Button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {mode === "register" && (
              <NameFields
                register={register}
                fieldPrefix="name"
                testIdPrefix="auth-name"
                label={t.auth.playerName}
                required={mode === "register"}
              />
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                {t.auth.email}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute start-3.5 top-3" />
                <Input
                  type="email"
                  required
                  data-testid="auth-email-input"
                  placeholder="player@example.com"
                  className="ps-10"
                  {...register("email", { required: true })}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                {t.auth.password}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute start-3.5 top-3" />
                <Input
                  type="password"
                  required
                  data-testid="auth-password-input"
                  placeholder="••••••••"
                  className="ps-10"
                  {...register("password", { required: true })}
                />
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              data-testid="auth-submit-btn"
              className="w-full"
              disabled={loading}
            >
              <span>
                {loading
                  ? t.auth.pleaseWait
                  : mode === "login"
                  ? t.auth.signInBtn
                  : t.auth.registerBtn}
              </span>
              <ArrowRight className="w-4 h-4" />
            </Button>

            <p
              data-testid="login-privacy-section11-notice"
              className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed pt-1"
            >
              {t.privacy.section11Notice}{" "}
              <Link
                href="/privacy"
                className="text-teal-600 dark:text-teal-400 underline font-semibold"
              >
                {t.footer.privacyPolicyLink}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
