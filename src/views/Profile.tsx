"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import type { User } from "@/lib/api";
import { formatDate } from "@/lib/i18n";
import {
  Mail,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Ruler,
  Weight,
  Globe,
  Upload,
  Camera,
  Edit2,
  Pencil,
  X,
  ShieldAlert,
  RefreshCw,
  Trash2,
  Eye,
  EyeOff,
  AlertTriangle,
  Shield,
  User as UserIcon,
  Activity,
  KeyRound,
  Lock,
  Link2,
} from "lucide-react";
import OtpInput from "@/components/OtpInput";
import IntegrationsTab from "./profile/IntegrationsTab";

interface ProfileProps {
  user: User | null;
  onProfileUpdated: (updatedUser: User) => void;
}

type ProfileTab = "account" | "personal" | "security" | "privacy" | "integrations";

export default function Profile({ user, onProfileUpdated }: ProfileProps) {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<ProfileTab>("account");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (
        tabParam &&
        ["account", "personal", "security", "privacy", "integrations"].includes(tabParam)
      ) {
        setActiveTab(tabParam as ProfileTab);
      }
    }
  }, []);

  // Account Information Fields
  const [email, setEmail] = useState(user?.email || "");
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [preferredLanguage, setPreferredLanguage] = useState(user?.preferred_language || "en");
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountSuccess, setAccountSuccess] = useState(false);

  // Personal Details Fields
  const [gender, setGender] = useState<"male" | "female">((user?.gender as "male" | "female") || "male");
  const [birthDay, setBirthDay] = useState(() => {
    const parts = (user?.birthday || "").split("-");
    return parts[2] || "";
  });
  const [birthMonth, setBirthMonth] = useState(() => {
    const parts = (user?.birthday || "").split("-");
    return parts[1] || "";
  });
  const [birthYear, setBirthYear] = useState(() => {
    const parts = (user?.birthday || "").split("-");
    return parts[0] || "";
  });
  const [heightCm, setHeightCm] = useState(user?.height_cm ? String(user.height_cm) : "");
  const [targetWeightKg, setTargetWeightKg] = useState(user?.target_weight_kg ? String(user.target_weight_kg) : "");
  const [isSavingPersonal, setIsSavingPersonal] = useState(false);
  const [personalError, setPersonalError] = useState<string | null>(null);
  const [personalSuccess, setPersonalSuccess] = useState(false);

  // Security (Change Password) Fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [isSavingSecurity, setIsSavingSecurity] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [securitySuccess, setSecuritySuccess] = useState(false);

  // OTP Modal State for pending email verification
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyModalCode, setVerifyModalCode] = useState("");
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [verifyModalError, setVerifyModalError] = useState<string | null>(null);

  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  // Photo upload state
  const [isPhotoLoading, setIsPhotoLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data Deletion Modal state (Option A)
  const [showDeleteDataModal, setShowDeleteDataModal] = useState(false);
  const [deleteDataPassword, setDeleteDataPassword] = useState("");
  const [showDeleteDataPassword, setShowDeleteDataPassword] = useState(false);
  const [isDeletingData, setIsDeletingData] = useState(false);
  const [deleteDataError, setDeleteDataError] = useState<string | null>(null);
  const [deleteDataSuccess, setDeleteDataSuccess] = useState<string | null>(null);

  // Account Deletion Modal state (Option B)
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState("");
  const [showDeleteAccountPassword, setShowDeleteAccountPassword] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const getDaysInMonth = (monthStr: string, yearStr: string) => {
    const month = parseInt(monthStr, 10);
    const year = parseInt(yearStr, 10);
    if (!month) return 31;
    if (month === 2) {
      if (year && ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)) {
        return 29;
      }
      return 28;
    }
    if ([4, 6, 9, 11].includes(month)) {
      return 30;
    }
    return 31;
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => String(currentYear - i));

  const months = Array.from({ length: 12 }, (_, i) => {
    const value = String(i + 1).padStart(2, "0");
    const date = new Date(2026, i, 1);
    const label = new Intl.DateTimeFormat(i18n.language || "en", { month: "long" }).format(date);
    const capitalizedLabel = label.charAt(0).toUpperCase() + label.slice(1);
    return { value, label: capitalizedLabel };
  });

  const daysCount = getDaysInMonth(birthMonth, birthYear);
  const days = Array.from({ length: daysCount }, (_, i) => String(i + 1).padStart(2, "0"));

  useEffect(() => {
    if (birthDay && birthMonth) {
      const maxDays = getDaysInMonth(birthMonth, birthYear);
      if (parseInt(birthDay, 10) > maxDays) {
        setBirthDay(String(maxDays).padStart(2, "0"));
      }
    }
  }, [birthMonth, birthYear, birthDay]);

  const calculateAge = (day: string, month: string, year: string): number | null => {
    if (!day || !month || !year) return null;
    const d = parseInt(day, 10);
    const m = parseInt(month, 10) - 1;
    const y = parseInt(year, 10);
    if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
    const birthDate = new Date(y, m, d);
    if (isNaN(birthDate.getTime())) return null;
    const today = new Date();
    let calculated = today.getFullYear() - birthDate.getFullYear();
    const mDiff = today.getMonth() - birthDate.getMonth();
    if (mDiff < 0 || (mDiff === 0 && today.getDate() < birthDate.getDate())) {
      calculated--;
    }
    return calculated >= 0 ? calculated : null;
  };

  const calculatedAge = calculateAge(birthDay, birthMonth, birthYear);
  const ageDisplay =
    calculatedAge !== null
      ? t("profile.fields.ageUnit", { count: calculatedAge })
      : t("profile.fields.ageUnset");

  const birthday = birthYear && birthMonth && birthDay ? `${birthYear}-${birthMonth}-${birthDay}` : "";

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      alert(t("profile.avatarPanel.photoErrorSize"));
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      alert(t("profile.avatarPanel.photoErrorType"));
      return;
    }

    setIsPhotoLoading(true);
    try {
      const updatedUser = await api.uploadProfilePicture(file);
      onProfileUpdated(updatedUser);
    } catch {
      alert(t("profile.uploadPhotoError"));
    } finally {
      setIsPhotoLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingAccount(true);
    setAccountError(null);
    setAccountSuccess(false);

    try {
      const payload: Partial<Omit<User, "id" | "created_at" | "profile_image_path" | "profile_image_url">> = {
        display_name: displayName,
        preferred_language: preferredLanguage,
      };

      if (isEditingEmail && email !== user?.email) {
        payload.email = email;
      }

      const updatedUser = await api.updateProfile(payload);
      onProfileUpdated(updatedUser);
      setAccountSuccess(true);
      setTimeout(() => setAccountSuccess(false), 3000);

      if (isEditingEmail && email !== user?.email) {
        setShowVerifyModal(true);
      }
      setIsEditingEmail(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("profile.updateError");
      setAccountError(msg);
    } finally {
      setIsSavingAccount(false);
    }
  };

  const handleSavePersonal = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPersonal(true);
    setPersonalError(null);
    setPersonalSuccess(false);

    try {
      const payload: Partial<Omit<User, "id" | "created_at" | "profile_image_path" | "profile_image_url">> = {
        gender,
        birthday: birthday || null,
        height_cm: heightCm ? parseFloat(heightCm) : null,
        target_weight_kg: targetWeightKg ? parseFloat(targetWeightKg) : null,
      };

      const updatedUser = await api.updateProfile(payload);
      onProfileUpdated(updatedUser);
      setPersonalSuccess(true);
      setTimeout(() => setPersonalSuccess(false), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("profile.updateError");
      setPersonalError(msg);
    } finally {
      setIsSavingPersonal(false);
    }
  };

  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityError(null);
    setSecuritySuccess(false);

    if (newPassword !== confirmNewPassword) {
      setSecurityError(t("profile.security.passwordsDoNotMatch"));
      return;
    }

    if (newPassword.length < 6) {
      setSecurityError(t("profile.security.passwordTooShort"));
      return;
    }

    setIsSavingSecurity(true);

    try {
      await api.changePassword(currentPassword, newPassword);
      setSecuritySuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setTimeout(() => setSecuritySuccess(false), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("common.error");
      setSecurityError(msg);
    } finally {
      setIsSavingSecurity(false);
    }
  };

  const handleResendPendingEmailCode = async () => {
    if (!user?.pending_email || resendCooldown > 0 || isResending) return;
    setIsResending(true);
    setResendMessage(null);
    try {
      await api.resendVerification(user.pending_email);
      setResendCooldown(60);
      setResendMessage(t("profile.codeSent", { email: user.pending_email }));
      setTimeout(() => setResendMessage(null), 5000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("common.error");
      setAccountError(msg);
    } finally {
      setIsResending(false);
    }
  };

  const handleCancelPendingEmailChange = async () => {
    try {
      await api.cancelEmailChange();
      const me = await api.getMe();
      onProfileUpdated(me);
      setEmail(me.email);
      setIsEditingEmail(false);
      setShowVerifyModal(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("common.error");
      setAccountError(msg);
    }
  };

  const handleVerifyPendingEmailCode = async (codeToVerify?: string) => {
    const code = codeToVerify || verifyModalCode;
    if (!code || code.length !== 6 || !user?.pending_email) return;

    setIsVerifyingCode(true);
    setVerifyModalError(null);

    try {
      await api.verifyCode(user.pending_email, code);
      const me = await api.getMe();
      onProfileUpdated(me);
      setEmail(me.email);
      setShowVerifyModal(false);
      setVerifyModalCode("");
      setAccountSuccess(true);
      setTimeout(() => setAccountSuccess(false), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("verifyEmail.errorTitle");
      setVerifyModalError(msg);
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleDeleteUserData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteDataPassword) return;
    setIsDeletingData(true);
    setDeleteDataError(null);
    try {
      await api.deleteUserData(deleteDataPassword);
      setShowDeleteDataModal(false);
      setDeleteDataPassword("");
      setDeleteDataSuccess(t("profile.dataManagement.dataDeleteSuccess"));
      setTimeout(() => setDeleteDataSuccess(null), 5000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("profile.dataManagement.genericError");
      if (msg.toLowerCase().includes("password")) {
        setDeleteDataError(t("profile.dataManagement.invalidPassword"));
      } else {
        setDeleteDataError(msg);
      }
    } finally {
      setIsDeletingData(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteAccountPassword) return;
    setIsDeletingAccount(true);
    setDeleteAccountError(null);
    try {
      await api.deleteAccount(deleteAccountPassword);
      setShowDeleteAccountModal(false);
      setDeleteAccountPassword("");
      window.dispatchEvent(new CustomEvent("auth-session-expired"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("profile.dataManagement.genericError");
      if (msg.toLowerCase().includes("password")) {
        setDeleteAccountError(t("profile.dataManagement.invalidPassword"));
      } else {
        setDeleteAccountError(msg);
      }
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const tabs: Array<{ id: ProfileTab; label: string; icon: typeof UserIcon }> = [
    { id: "account", label: t("profile.tabs.account"), icon: UserIcon },
    { id: "personal", label: t("profile.tabs.personal"), icon: Activity },
    { id: "security", label: t("profile.tabs.security"), icon: KeyRound },
    { id: "privacy", label: t("profile.tabs.privacy"), icon: Shield },
    { id: "integrations", label: t("profile.tabs.integrations"), icon: Link2 },
  ];

  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const nextIndex = (index + 1) % tabs.length;
      setActiveTab(tabs[nextIndex].id);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prevIndex = (index - 1 + tabs.length) % tabs.length;
      setActiveTab(tabs[prevIndex].id);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveTab(tabs[0].id);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveTab(tabs[tabs.length - 1].id);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-background">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Page Title */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("profile.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("profile.subtitle")}</p>
        </div>

        {/* Pending Email Alert Banner */}
        {user?.pending_email && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                    {t("profile.pendingEmailNotice", { email: user.pending_email })}
                  </h4>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    {t("profile.verifyModalSubtitle", { email: user.pending_email })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelPendingEmailChange}
                className="text-muted-foreground hover:text-foreground text-xs underline cursor-pointer shrink-0"
              >
                {t("profile.cancelEmailChange")}
              </button>
            </div>

            {resendMessage && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{resendMessage}</p>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setVerifyModalCode("");
                  setVerifyModalError(null);
                  setShowVerifyModal(true);
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer shadow-xs"
              >
                {t("profile.enterVerificationCode")}
              </button>
              <button
                type="button"
                onClick={handleResendPendingEmailCode}
                disabled={resendCooldown > 0 || isResending}
                className="px-3 py-1.5 rounded-lg border border-amber-500/30 hover:bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs font-medium cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {isResending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                <span>
                  {resendCooldown > 0
                    ? `${t("profile.resendVerificationCode")} (${resendCooldown}s)`
                    : t("profile.resendVerificationCode")}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Persistent Avatar & Profile Overview Card */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center justify-center text-center relative overflow-hidden shadow-xs">
              <div
                className="relative group cursor-pointer mb-4"
                onClick={() => fileInputRef.current?.click()}
                title={t("profile.avatarPanel.changePhoto")}
              >
                {user?.profile_image_path ? (
                  <img
                    src={`/uploads/profile_pics/${user.profile_image_path.split(/[\\/]/).pop()}`}
                    alt={user.display_name || user.email}
                    className="h-32 w-32 rounded-full object-cover border-2 border-primary/20 bg-muted"
                  />
                ) : (
                  <div className="h-32 w-32 rounded-full overflow-hidden border-2 border-primary/20 bg-muted flex items-center justify-center relative">
                    <span className="text-4xl font-bold text-primary">
                      {user?.display_name
                        ? user.display_name.substring(0, 2).toUpperCase()
                        : user?.email.substring(0, 2).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <Camera className="h-8 w-8 text-white" />
                </div>
              </div>

              <h2 className="text-lg font-bold text-foreground">
                {user?.display_name || user?.email.split("@")[0]}
              </h2>
              <p className="text-xs text-muted-foreground mt-1 mb-1">{user?.email}</p>
              {user?.created_at && (
                <p className="text-[11px] text-muted-foreground/70 mb-4">{formatDate(user.created_at)}</p>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handlePhotoUpload}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isPhotoLoading}
                className="px-4 py-2 rounded-lg border border-input bg-background hover:bg-muted text-sm font-medium text-foreground transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isPhotoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                <span>{t("profile.avatarPanel.changePhoto")}</span>
              </button>
            </div>

            {/* Navigation Tabs for Desktop Vertical Sidebar */}
            <div
              className="hidden lg:block bg-card border border-border rounded-xl p-2 shadow-xs"
              role="tablist"
              aria-orientation="vertical"
            >
              {tabs.map((tab, idx) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`tab-${tab.id}`}
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`panel-${tab.id}`}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => setActiveTab(tab.id)}
                    onKeyDown={(e) => handleTabKeyDown(e, idx)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors cursor-pointer text-left ${
                      isActive
                        ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        isActive ? "text-primary-foreground" : "text-muted-foreground"
                      }`}
                    />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Tab Panels */}
          <div className="lg:col-span-2 space-y-4">
            {/* Horizontal Tabs Bar for Mobile/Tablet Screens */}
            <div
              className="lg:hidden flex overflow-x-auto p-1 bg-muted/60 border border-border rounded-xl gap-1"
              role="tablist"
              aria-orientation="horizontal"
            >
              {tabs.map((tab, idx) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`tab-mobile-${tab.id}`}
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`panel-${tab.id}`}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => setActiveTab(tab.id)}
                    onKeyDown={(e) => handleTabKeyDown(e, idx)}
                    className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                      isActive
                        ? "bg-card text-foreground font-semibold shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* TAB 1: Account Information */}
            {activeTab === "account" && (
              <div
                id="panel-account"
                role="tabpanel"
                aria-labelledby="tab-account"
                className="bg-card border border-border rounded-xl p-6 shadow-xs animate-in fade-in-50 duration-200"
              >
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <UserIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{t("profile.tabs.account")}</h3>
                    <p className="text-xs text-muted-foreground">{t("profile.subtitle")}</p>
                  </div>
                </div>

                {accountSuccess && (
                  <div className="mb-6 flex items-start gap-2 p-3 bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs animate-in fade-in duration-200">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{t("profile.successMsg")}</span>
                  </div>
                )}

                {accountError && (
                  <div className="mb-6 flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/25 text-destructive rounded-lg text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{accountError}</span>
                  </div>
                )}

                <form onSubmit={handleSaveAccount} className="space-y-6">
                  {/* Email Address */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="account-email">
                      {t("profile.fields.email")}
                    </label>
                    <div className="relative flex items-center">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted-foreground pointer-events-none">
                        <Mail className="h-4 w-4" />
                      </span>
                      <input
                        id="account-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={!isEditingEmail}
                        className={`w-full pl-9 pr-10 py-2.5 rounded-lg border text-sm transition-colors ${
                          !isEditingEmail
                            ? "bg-muted/40 text-muted-foreground border-input cursor-not-allowed select-none"
                            : "bg-background text-foreground border-input focus:outline-hidden focus:ring-2 focus:ring-primary"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (isEditingEmail) {
                            setEmail(user?.email || "");
                            setIsEditingEmail(false);
                          } else {
                            setIsEditingEmail(true);
                          }
                        }}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground cursor-pointer"
                        title={isEditingEmail ? t("common.cancel") : t("profile.editEmail")}
                      >
                        {isEditingEmail ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Display Name */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="account-display-name">
                      {t("profile.fields.displayName")}
                    </label>
                    <div className="relative flex items-center">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted-foreground pointer-events-none">
                        <Edit2 className="h-4 w-4" />
                      </span>
                      <input
                        id="account-display-name"
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>

                  {/* Preferred Language */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="account-language">
                      {t("profile.fields.language")}
                    </label>
                    <div className="relative flex items-center">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted-foreground pointer-events-none">
                        <Globe className="h-4 w-4" />
                      </span>
                      <select
                        id="account-language"
                        value={preferredLanguage}
                        onChange={(e) => setPreferredLanguage(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
                      >
                        <option value="en">English (US)</option>
                        <option value="pt">Português (BR)</option>
                        <option value="es">Español</option>
                      </select>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="flex justify-end pt-4 border-t border-border">
                    <button
                      type="submit"
                      disabled={isSavingAccount}
                      className="px-6 py-2.5 rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-sm transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50 shadow-xs"
                    >
                      {isSavingAccount ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>{t("common.saving")}</span>
                        </>
                      ) : (
                        <span>{t("common.save")}</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TAB 2: Personal Details */}
            {activeTab === "personal" && (
              <div
                id="panel-personal"
                role="tabpanel"
                aria-labelledby="tab-personal"
                className="bg-card border border-border rounded-xl p-6 shadow-xs animate-in fade-in-50 duration-200"
              >
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{t("profile.tabs.personal")}</h3>
                    <p className="text-xs text-muted-foreground">{t("profile.sections.physical")}</p>
                  </div>
                </div>

                {personalSuccess && (
                  <div className="mb-6 flex items-start gap-2 p-3 bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs animate-in fade-in duration-200">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{t("profile.successMsg")}</span>
                  </div>
                )}

                {personalError && (
                  <div className="mb-6 flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/25 text-destructive rounded-lg text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{personalError}</span>
                  </div>
                )}

                <form onSubmit={handleSavePersonal} className="space-y-6">
                  {/* Birthday and Real-Time Age */}
                  <div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                      <div className="md:col-span-3">
                        <label className="block text-sm font-medium text-foreground mb-1.5">
                          {t("profile.fields.birthday")}
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          <select
                            id="birthday-month"
                            aria-label={t("profile.fields.birthday")}
                            value={birthMonth}
                            onChange={(e) => setBirthMonth(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
                          >
                            <option value="">
                              {i18n.language === "pt" ? "Mês" : i18n.language === "es" ? "Mes" : "Month"}
                            </option>
                            {months.map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.label}
                              </option>
                            ))}
                          </select>

                          <select
                            id="birthday-day"
                            aria-label={t("profile.fields.birthday")}
                            value={birthDay}
                            onChange={(e) => setBirthDay(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
                          >
                            <option value="">
                              {i18n.language === "pt" ? "Dia" : i18n.language === "es" ? "Día" : "Day"}
                            </option>
                            {days.map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                          </select>

                          <select
                            id="birthday-year"
                            aria-label={t("profile.fields.birthday")}
                            value={birthYear}
                            onChange={(e) => setBirthYear(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
                          >
                            <option value="">
                              {i18n.language === "pt" ? "Ano" : i18n.language === "es" ? "Año" : "Year"}
                            </option>
                            {years.map((y) => (
                              <option key={y} value={y}>
                                {y}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Read-Only Calculated Age Field */}
                      <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="personal-age">
                          {t("profile.fields.age")}
                        </label>
                        <input
                          id="personal-age"
                          type="text"
                          readOnly
                          value={ageDisplay}
                          className="w-full px-3 py-2.5 rounded-lg border border-input bg-muted/50 text-foreground font-medium text-sm cursor-not-allowed select-none text-center"
                          title={t("profile.fields.age")}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Gender Selector */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      {t("profile.fields.gender")}
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setGender("male")}
                        className={`py-2.5 px-4 rounded-lg border text-sm font-medium transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                          gender === "male"
                            ? "bg-primary/10 border-primary text-primary font-semibold"
                            : "border-input hover:bg-muted text-muted-foreground"
                        }`}
                      >
                        <span>👨 {i18n.language === "pt" ? "Masculino" : i18n.language === "es" ? "Masculino" : "Male"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setGender("female")}
                        className={`py-2.5 px-4 rounded-lg border text-sm font-medium transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                          gender === "female"
                            ? "bg-primary/10 border-primary text-primary font-semibold"
                            : "border-input hover:bg-muted text-muted-foreground"
                        }`}
                      >
                        <span>👩 {i18n.language === "pt" ? "Feminino" : i18n.language === "es" ? "Femenino" : "Female"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Height and Target Weight */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="personal-height">
                        {t("profile.fields.height")}
                      </label>
                      <div className="relative flex items-center">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted-foreground pointer-events-none">
                          <Ruler className="h-4 w-4" />
                        </span>
                        <input
                          id="personal-height"
                          type="number"
                          step="0.1"
                          min="50"
                          max="250"
                          value={heightCm}
                          onChange={(e) => setHeightCm(e.target.value)}
                          placeholder="175"
                          className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="personal-weight">
                        {t("profile.fields.weight")}
                      </label>
                      <div className="relative flex items-center">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted-foreground pointer-events-none">
                          <Weight className="h-4 w-4" />
                        </span>
                        <input
                          id="personal-weight"
                          type="number"
                          step="0.1"
                          min="20"
                          max="300"
                          value={targetWeightKg}
                          onChange={(e) => setTargetWeightKg(e.target.value)}
                          placeholder="70.0"
                          className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="flex justify-end pt-4 border-t border-border">
                    <button
                      type="submit"
                      disabled={isSavingPersonal}
                      className="px-6 py-2.5 rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-sm transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50 shadow-xs"
                    >
                      {isSavingPersonal ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>{t("common.saving")}</span>
                        </>
                      ) : (
                        <span>{t("common.save")}</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TAB 3: Security */}
            {activeTab === "security" && (
              <div
                id="panel-security"
                role="tabpanel"
                aria-labelledby="tab-security"
                className="bg-card border border-border rounded-xl p-6 shadow-xs animate-in fade-in-50 duration-200"
              >
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{t("profile.security.title")}</h3>
                    <p className="text-xs text-muted-foreground">{t("profile.security.subtitle")}</p>
                  </div>
                </div>

                {securitySuccess && (
                  <div className="mb-6 flex items-start gap-2 p-3 bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs animate-in fade-in duration-200">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{t("profile.security.passwordChangedSuccess")}</span>
                  </div>
                )}

                {securityError && (
                  <div className="mb-6 flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/25 text-destructive rounded-lg text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{securityError}</span>
                  </div>
                )}

                <form onSubmit={handleSaveSecurity} className="space-y-4">
                  {/* Current Password */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="current-password">
                      {t("profile.security.currentPassword")}
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted-foreground pointer-events-none">
                        <Lock className="h-4 w-4" />
                      </span>
                      <input
                        id="current-password"
                        type={showCurrentPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder={t("profile.security.currentPasswordPlaceholder")}
                        required
                        className="w-full pl-9 pr-10 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground cursor-pointer"
                        tabIndex={-1}
                      >
                        {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="new-password">
                      {t("profile.security.newPassword")}
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted-foreground pointer-events-none">
                        <Lock className="h-4 w-4" />
                      </span>
                      <input
                        id="new-password"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder={t("profile.security.newPasswordPlaceholder")}
                        required
                        minLength={6}
                        className="w-full pl-9 pr-10 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground cursor-pointer"
                        tabIndex={-1}
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm New Password */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="confirm-new-password">
                      {t("profile.security.confirmPassword")}
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-muted-foreground pointer-events-none">
                        <Lock className="h-4 w-4" />
                      </span>
                      <input
                        id="confirm-new-password"
                        type={showConfirmNewPassword ? "text" : "password"}
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder={t("profile.security.confirmPasswordPlaceholder")}
                        required
                        minLength={6}
                        className="w-full pl-9 pr-10 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground cursor-pointer"
                        tabIndex={-1}
                      >
                        {showConfirmNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="flex justify-end pt-4 border-t border-border">
                    <button
                      type="submit"
                      disabled={isSavingSecurity || !currentPassword || !newPassword || !confirmNewPassword}
                      className="px-6 py-2.5 rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-sm transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50 shadow-xs"
                    >
                      {isSavingSecurity ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>{t("common.saving")}</span>
                        </>
                      ) : (
                        <span>{t("profile.security.changePasswordBtn")}</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TAB 4: Privacy & Data Management */}
            {activeTab === "privacy" && (
              <div
                id="panel-privacy"
                role="tabpanel"
                aria-labelledby="tab-privacy"
                className="bg-card border border-border rounded-xl p-6 shadow-xs animate-in fade-in-50 duration-200"
              >
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
                  <div className="p-2 rounded-lg bg-destructive/10 text-destructive">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{t("profile.dataManagement.title")}</h3>
                    <p className="text-xs text-muted-foreground">{t("profile.dataManagement.subtitle")}</p>
                  </div>
                </div>

                {deleteDataSuccess && (
                  <div className="mb-6 flex items-start gap-2 p-3 bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs animate-in fade-in duration-200">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{deleteDataSuccess}</span>
                  </div>
                )}

                <div className="space-y-6">
                  {/* Option A: Delete Health Data */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border border-border bg-background/50 hover:bg-muted/20 transition-colors">
                    <div className="space-y-1 max-w-xl">
                      <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Trash2 className="h-4 w-4 text-amber-500" />
                        {t("profile.dataManagement.deleteDataTitle")}
                      </h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {t("profile.dataManagement.deleteDataDesc")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteDataPassword("");
                        setDeleteDataError(null);
                        setShowDeleteDataModal(true);
                      }}
                      className="px-4 py-2 rounded-lg border border-amber-500/40 hover:border-amber-500 hover:bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shadow-xs self-start sm:self-center"
                    >
                      {t("profile.dataManagement.deleteDataBtn")}
                    </button>
                  </div>

                  {/* Option B: Delete Account */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border border-destructive/25 bg-destructive/5 hover:bg-destructive/10 transition-colors">
                    <div className="space-y-1 max-w-xl">
                      <h4 className="text-sm font-semibold text-destructive flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        {t("profile.dataManagement.deleteAccountTitle")}
                      </h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {t("profile.dataManagement.deleteAccountDesc")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteAccountPassword("");
                        setDeleteAccountError(null);
                        setShowDeleteAccountModal(true);
                      }}
                      className="px-4 py-2 rounded-lg bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shadow-xs self-start sm:self-center"
                    >
                      {t("profile.dataManagement.deleteAccountBtn")}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: Connected Integrations */}
            {activeTab === "integrations" && <IntegrationsTab />}
          </div>
        </div>

        {/* Modal for Option A: Delete User Data */}
        {showDeleteDataModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
              <button
                type="button"
                onClick={() => setShowDeleteDataModal(false)}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="text-center mb-5">
                <div className="h-12 w-12 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto mb-3">
                  <Trash2 className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-1">
                  {t("profile.dataManagement.deleteDataModalTitle")}
                </h3>
                <p className="text-xs text-muted-foreground">{t("profile.dataManagement.deleteDataModalDesc")}</p>
              </div>

              <div className="mb-4 p-3 bg-muted/50 border border-border rounded-lg text-xs text-muted-foreground">
                ℹ️ {t("profile.dataManagement.deleteDataKeepNote")}
              </div>

              {deleteDataError && (
                <div className="mb-4 flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/25 text-destructive rounded-lg text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{deleteDataError}</span>
                </div>
              )}

              <form onSubmit={handleDeleteUserData} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    {t("profile.dataManagement.passwordPrompt")}
                  </label>
                  <div className="relative">
                    <input
                      type={showDeleteDataPassword ? "text" : "password"}
                      value={deleteDataPassword}
                      onChange={(e) => setDeleteDataPassword(e.target.value)}
                      placeholder={t("profile.dataManagement.passwordPlaceholder")}
                      required
                      className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground pr-10 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowDeleteDataPassword(!showDeleteDataPassword)}
                      className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                      tabIndex={-1}
                    >
                      {showDeleteDataPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowDeleteDataModal(false)}
                    className="flex-1 py-2.5 rounded-lg border border-input bg-background hover:bg-muted text-foreground text-sm font-medium cursor-pointer"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={isDeletingData || !deleteDataPassword}
                    className="flex-1 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isDeletingData ? <Loader2 className="h-4 w-4 animate-spin" /> : t("profile.dataManagement.confirmDeleteDataBtn")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal for Option B: Delete Account */}
        {showDeleteAccountModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-card border border-destructive/30 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
              <button
                type="button"
                onClick={() => setShowDeleteAccountModal(false)}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="text-center mb-5">
                <div className="h-12 w-12 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-3">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-destructive mb-1">
                  {t("profile.dataManagement.deleteAccountModalTitle")}
                </h3>
                <p className="text-xs text-muted-foreground">{t("profile.dataManagement.deleteAccountModalDesc")}</p>
              </div>

              {deleteAccountError && (
                <div className="mb-4 flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/25 text-destructive rounded-lg text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{deleteAccountError}</span>
                </div>
              )}

              <form onSubmit={handleDeleteAccount} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    {t("profile.dataManagement.passwordPrompt")}
                  </label>
                  <div className="relative">
                    <input
                      type={showDeleteAccountPassword ? "text" : "password"}
                      value={deleteAccountPassword}
                      onChange={(e) => setDeleteAccountPassword(e.target.value)}
                      placeholder={t("profile.dataManagement.passwordPlaceholder")}
                      required
                      className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground pr-10 focus:outline-hidden focus:ring-2 focus:ring-destructive"
                    />
                    <button
                      type="button"
                      onClick={() => setShowDeleteAccountPassword(!showDeleteAccountPassword)}
                      className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                      tabIndex={-1}
                    >
                      {showDeleteAccountPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowDeleteAccountModal(false)}
                    className="flex-1 py-2.5 rounded-lg border border-input bg-background hover:bg-muted text-foreground text-sm font-medium cursor-pointer"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={isDeletingAccount || !deleteAccountPassword}
                    className="flex-1 py-2.5 rounded-lg bg-destructive hover:bg-destructive/90 text-destructive-foreground text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isDeletingAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : t("profile.dataManagement.confirmDeleteAccountBtn")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal for Verifying Pending Email */}
        {showVerifyModal && user?.pending_email && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
              <button
                type="button"
                onClick={() => setShowVerifyModal(false)}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="text-center mb-6">
                <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                  <Mail className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-1">{t("profile.verifyModalTitle")}</h3>
                <p className="text-xs text-muted-foreground">
                  {t("profile.verifyModalSubtitle", { email: user.pending_email })}
                </p>
              </div>

              {verifyModalError && (
                <div className="mb-6 flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/25 text-destructive rounded-lg text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{verifyModalError}</span>
                </div>
              )}

              <div className="space-y-6">
                <OtpInput
                  length={6}
                  value={verifyModalCode}
                  onChange={setVerifyModalCode}
                  onComplete={(completedCode) => {
                    handleVerifyPendingEmailCode(completedCode);
                  }}
                  disabled={isVerifyingCode}
                  hasError={Boolean(verifyModalError)}
                />

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowVerifyModal(false)}
                    className="flex-1 py-2.5 rounded-lg border border-input bg-background hover:bg-muted text-foreground text-sm font-medium cursor-pointer"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleVerifyPendingEmailCode()}
                    disabled={isVerifyingCode || verifyModalCode.length !== 6}
                    className="flex-1 py-2.5 rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isVerifyingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : t("verifyEmail.verifyButton")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
