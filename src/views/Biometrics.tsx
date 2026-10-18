"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import LocalizedDatePicker from "@/components/LocalizedDatePicker";
import CSVImportModal from "@/components/CSVImportModal";
import type { RecompRecord } from "@/lib/api";
import { formatDate, formatDateTime, formatInteger, formatDecimal } from "@/lib/i18n";

import { copyTextToClipboard } from "@/lib/clipboard";
import {
  Loader2,
  Search,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  Trash2,
  AlertTriangle,
  Paperclip,
  FileUp,
  ExternalLink,
  Share2,
  Copy,
  Check,
  Star,
  Upload,
  RefreshCw,
  Flame,
  Target,
  Sparkles,
} from "lucide-react";

export default function Biometrics({
  onLinksUpdated,
}: {
  onLinksUpdated?: (count: number) => void;
} = {}) {
  const { t, i18n } = useTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [records, setRecords] = useState<RecompRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // CSV Import Modal state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Cloud Integrations & Sync state
  const [hasIntegration, setHasIntegration] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    api
      .getIntegrations()
      .then((list) => {
        const connected = list.some((i) => i.status === "connected");
        setHasIntegration(connected);
      })
      .catch(() => {
        setHasIntegration(false);
      });
  }, []);

  // Check URL query param ?import=open to automatically open import modal
  useEffect(() => {
    if (searchParams.get("import") === "open") {
      setIsImportModalOpen(true);
      router.replace("/biometrics");
    }
  }, [searchParams, router]);

  // Report attachment states
  const [activeMenuRecordId, setActiveMenuRecordId] = useState<number | null>(null);
  const [uploadRecordId, setUploadRecordId] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleOutsideClick = () => {
      setActiveMenuRecordId(null);
    };
    window.addEventListener("click", handleOutsideClick);
    return () => {
      window.removeEventListener("click", handleOutsideClick);
    };
  }, []);

  // Table search, filter, period and sort states
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStarredOnly, setFilterStarredOnly] = useState(false);
  const [timeRangeFilter, setTimeRangeFilter] = useState<"all" | "1m" | "3m" | "6m" | "1y">("all");
  const [sortField, setSortField] = useState<keyof RecompRecord>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reset pagination to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStarredOnly, timeRangeFilter, pageSize]);

  // Drawer state
  const [selectedRecord, setSelectedRecord] = useState<RecompRecord | null>(null);

  // Deletion States
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [idsToDelete, setIdsToDelete] = useState<number[]>([]);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState<{
    success: boolean;
    title?: string;
    message: string;
  } | null>(null);

  // Share Modal States
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareDescription, setShareDescription] = useState("");
  const [sharePassword, setSharePassword] = useState("");
  const [shareIncludeAttachments, setShareIncludeAttachments] = useState(true);
  const [shareAutoShareStarred, setShareAutoShareStarred] = useState(false);
  const [shareExpiration, setShareExpiration] = useState<"never" | "1d" | "7d" | "30d" | "custom">("never");
  const [shareCustomExpiryDate, setShareCustomExpiryDate] = useState("");
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [createdShareLink, setCreatedShareLink] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const fetchRecords = useCallback(async (showFullLoader = false) => {
    try {
      if (showFullLoader) {
        setIsLoading(true);
      }
      setError(null);
      const data = await api.getRecords();
      setRecords(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg || "error");
    } finally {
      if (showFullLoader) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchRecords(true);
  }, [fetchRecords]);

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const res = await api.syncFitdays(false);
      await fetchRecords(false);
      const inserted = res.result?.inserted ?? 0;
      const updated = res.result?.updated ?? 0;
      const message =
        inserted > 0 || updated > 0
          ? t("biometrics.syncSuccess", { inserted, updated })
          : t("biometrics.syncNoChanges");
      setSyncFeedback({
        success: true,
        message,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setSyncFeedback({
        success: false,
        message: msg ? `${t("biometrics.syncError")}: ${msg}` : t("biometrics.syncError"),
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Derived bioimpedance highlights for Stitch Bento cards
  const { earliestRecord, latestRecord, bmrValue, weightChange, fatChange, muscleChange } =
    useMemo(() => {
      if (records.length === 0) {
        return {
          earliestRecord: null,
          latestRecord: null,
          bmrValue: null,
          weightChange: 0,
          fatChange: 0,
          muscleChange: 0,
        };
      }
      const sortedByDate = [...records].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      const earliest = sortedByDate[0];
      const latest = sortedByDate[sortedByDate.length - 1];

      return {
        earliestRecord: earliest,
        latestRecord: latest,
        bmrValue: latest.bmr,
        weightChange: latest.weight - earliest.weight,
        fatChange: latest.body_fat_pct - earliest.body_fat_pct,
        muscleChange: latest.skeletal_muscle_mass - earliest.skeletal_muscle_mass,
      };
    }, [records]);

  const handleCopyCreatedShareLink = async () => {
    if (!createdShareLink) return;
    const copied = await copyTextToClipboard(createdShareLink);
    if (copied) {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleCreateShareSubmit = async () => {
    if (!shareDescription.trim()) {
      setShareError(t("common.required"));
      return;
    }

    if (selectedIds.length === 0 && !shareAutoShareStarred) {
      setShareError(t("sharing.noRecordsSelectedError"));
      return;
    }

    try {
      setIsCreatingShare(true);
      setShareError(null);

      let expires_at: string | null = null;
      if (shareExpiration === "1d") {
        expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      } else if (shareExpiration === "7d") {
        expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (shareExpiration === "30d") {
        expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      } else if (shareExpiration === "custom" && shareCustomExpiryDate) {
        expires_at = new Date(shareCustomExpiryDate + "T23:59:59").toISOString();
      }

      const response = await api.createSharedLink(
        shareDescription,
        sharePassword || null,
        shareIncludeAttachments,
        expires_at,
        selectedIds,
        shareAutoShareStarred
      );

      if (onLinksUpdated) {
        try {
          const links = await api.getSharedLinks();
          const count = links.filter((l) => !l.expires_at || new Date(l.expires_at) > new Date()).length;
          onLinksUpdated(count);
        } catch (err) {
          console.error("Failed to update active link count:", err);
        }
      }

      const linkUrl = `${window.location.origin}/shared/${response.token}`;
      setCreatedShareLink(linkUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setShareError(msg || t("sharing.limitError"));
    } finally {
      setIsCreatingShare(false);
    }
  };

  const handleCloseShareModal = () => {
    setIsShareModalOpen(false);
    setShareDescription("");
    setSharePassword("");
    setShareIncludeAttachments(true);
    setShareAutoShareStarred(false);
    setShareExpiration("never");
    setShareCustomExpiryDate("");
    setCreatedShareLink(null);
    setShareError(null);
    setIsCopied(false);
  };

  // Close drawer, modals or dropdown menus when pressing Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedRecord) {
          setSelectedRecord(null);
        } else if (isImportModalOpen) {
          setIsImportModalOpen(false);
        } else if (isShareModalOpen) {
          handleCloseShareModal();
        } else if (isDeleteConfirmOpen) {
          setIsDeleteConfirmOpen(false);
          setIdsToDelete([]);
        } else if (uploadRecordId) {
          setUploadRecordId(null);
          setSelectedFile(null);
          setUploadError(null);
        } else if (activeMenuRecordId) {
          setActiveMenuRecordId(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    selectedRecord,
    isImportModalOpen,
    isShareModalOpen,
    isDeleteConfirmOpen,
    uploadRecordId,
    activeMenuRecordId,
  ]);

  const handleDeleteConfirm = async () => {
    try {
      setIsDeleting(true);
      const res = await api.deleteRecords(idsToDelete);

      const successCount = res.deleted.length;
      const failCount = res.failed.length;

      if (successCount > 0) {
        setRecords((prev) => prev.filter((r) => !res.deleted.includes(r.id)));
        setSelectedIds((prev) => prev.filter((id) => !res.deleted.includes(id)));
      }

      if (failCount === 0) {
        setDeleteFeedback({
          success: true,
          title: t("history.deletePrompt.successTitle"),
          message:
            successCount === 1
              ? t("history.deletePrompt.successSingle")
              : t("history.deletePrompt.successMultiple", { deletedCount: successCount }),
        });
      } else {
        const failReasons = res.failed.map((f) => `ID ${f.id}: ${f.reason}`).join("\n");
        setDeleteFeedback({
          success: false,
          title: t("history.deletePrompt.failedTitle"),
          message: `${t("history.deletePrompt.successMultiple", {
            deletedCount: successCount,
          })}, ${t("history.deletePrompt.failedCount", { failedCount: failCount })}.\n${failReasons}`,
        });
      }

      setIsDeleteConfirmOpen(false);
      setIdsToDelete([]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setDeleteFeedback({
        success: false,
        title: t("history.deletePrompt.failedTitle"),
        message: msg || t("history.deletePrompt.errorGeneric"),
      });
      setIsDeleteConfirmOpen(false);
      setIdsToDelete([]);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const validateAndSetFile = (file: File) => {
    setUploadError(null);
    const ALLOWED_TYPES = ["image/png", "image/jpeg", "application/pdf"];
    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError(t("history.report.pdfOnly"));
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_SIZE) {
      setUploadError(t("history.report.exceedsSize"));
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      validateAndSetFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleUploadSubmit = async () => {
    if (!uploadRecordId || !selectedFile) return;

    try {
      setUploadProgress(t("history.report.uploading"));
      setUploadError(null);
      const newReport = await api.uploadReport(uploadRecordId, selectedFile);

      setRecords((prev) =>
        prev.map((r) => {
          if (r.id === uploadRecordId) {
            return { ...r, report: newReport };
          }
          return r;
        })
      );

      setDeleteFeedback({
        success: true,
        title: t("history.report.uploadSuccessTitle"),
        message: t("history.report.uploadSuccess"),
      });

      setUploadRecordId(null);
      setSelectedFile(null);
      setUploadProgress(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setUploadError(msg || t("history.reportUploadError"));
      setUploadProgress(null);
    }
  };

  const handleDeleteReport = async (recordId: number) => {
    if (!confirm(t("history.report.deleteConfirm"))) return;
    try {
      await api.deleteReport(recordId);
      setRecords((prev) =>
        prev.map((r) => {
          if (r.id === recordId) {
            return { ...r, report: null };
          }
          return r;
        })
      );
      setDeleteFeedback({
        success: true,
        title: t("history.report.deleteSuccessTitle"),
        message: t("history.report.deleteSuccess"),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setDeleteFeedback({
        success: false,
        title: t("history.report.deleteFailedTitle"),
        message: msg || t("history.report.deleteFailed"),
      });
    }
  };

  const handleToggleStar = async (recordId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setRecords((prev) =>
      prev.map((r) => (r.id === recordId ? { ...r, starred: !r.starred } : r))
    );
    try {
      await api.toggleRecordStar(recordId);
    } catch (err) {
      console.error("Failed to toggle star:", err);
      setRecords((prev) =>
        prev.map((r) => (r.id === recordId ? { ...r, starred: !r.starred } : r))
      );
      setDeleteFeedback({
        success: false,
        title: t("common.error"),
        message: t("history.starError"),
      });
    }
  };

  const handleSort = (field: keyof RecompRecord) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const getSortedRecords = () => {
    if (records.length === 0) return [];
    const referenceTime = Math.max(...records.map((r) => new Date(r.date).getTime()));

    return [...records]
      .filter((record) => {
        if (filterStarredOnly && !record.starred) {
          return false;
        }

        if (timeRangeFilter !== "all") {
          let days = 30;
          if (timeRangeFilter === "1m") days = 30;
          else if (timeRangeFilter === "3m") days = 90;
          else if (timeRangeFilter === "6m") days = 180;
          else if (timeRangeFilter === "1y") days = 365;

          const cutoffTime = referenceTime - days * 24 * 60 * 60 * 1000;
          if (new Date(record.date).getTime() < cutoffTime) {
            return false;
          }
        }

        const formattedDate = formatDate(record.date).toLowerCase();
        return formattedDate.includes(searchTerm.toLowerCase());
      })
      .sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        if (sortField === "date") {
          valA = new Date(a.date).getTime() as never;
          valB = new Date(b.date).getTime() as never;
        } else if (sortField === "starred") {
          valA = (a.starred ? 1 : 0) as never;
          valB = (b.starred ? 1 : 0) as never;
        }

        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;

        if (valA < valB) return sortDirection === "asc" ? -1 : 1;
        if (valA > valB) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
  };

  const renderSortIcon = (field: keyof RecompRecord) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? (
      <ChevronUp className="h-4 w-4 inline ml-1 text-primary" />
    ) : (
      <ChevronDown className="h-4 w-4 inline ml-1 text-primary" />
    );
  };

  const formatSegmentValue = (value: number | null | undefined, unit = "") => {
    if (value === null || value === undefined) return "-";
    return `${formatDecimal(value, 2)}${unit}`;
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">{t("history.loading")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <div className="bg-destructive/10 border border-destructive/25 text-destructive p-4 rounded-xl flex items-center gap-3">
          <X className="h-5 w-5 shrink-0" />
          <div>
            <h3 className="font-semibold text-sm">{t("history.errorTitle")}</h3>
            <p className="text-xs opacity-90">{error === "error" ? t("history.errorLoad") : error}</p>
          </div>
        </div>
      </div>
    );
  }

  const sortedRecords = getSortedRecords();
  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedRecords = sortedRecords.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  );

  return (
    <div className="flex-1 p-6 overflow-y-auto max-w-7xl mx-auto w-full space-y-6 animate-in fade-in duration-300">
      {/* Header with Title and Prominent Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground m-0">
              {t("biometrics.title")}
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {t("biometrics.activeTag")}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {t("biometrics.subtitle")}
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-center flex-wrap">
          {hasIntegration && (
            <button
              type="button"
              disabled={isSyncing}
              onClick={handleSync}
              className="flex items-center gap-2 px-4 py-2 bg-card border border-border hover:bg-muted text-foreground text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
              title={t("biometrics.syncBtn")}
            >
              <RefreshCw
                className={`h-4 w-4 text-emerald-600 dark:text-emerald-400 ${
                  isSyncing ? "animate-spin" : ""
                }`}
              />
              <span>{isSyncing ? t("biometrics.syncingBtn") : t("biometrics.syncBtn")}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-semibold rounded-xl shadow-md shadow-primary/15 transition-all cursor-pointer"
          >
            <Upload className="h-4 w-4" />
            <span>{t("biometrics.importBtn")}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (selectedIds.length === 0) {
                setShareAutoShareStarred(true);
              }
              setIsShareModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-card border border-border hover:bg-muted text-foreground text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Share2 className="h-4 w-4 text-primary" />
            <span>
              {selectedIds.length > 0
                ? `${t("sharing.shareAction")} (${selectedIds.length})`
                : t("sharing.shareAction")}
            </span>
          </button>
        </div>
      </div>

      {/* Sync Feedback Alert */}
      {syncFeedback && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 animate-in fade-in slide-in-from-top duration-300 ${
            syncFeedback.success
              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-800 dark:text-emerald-300"
              : "bg-amber-500/10 border-amber-500/25 text-amber-800 dark:text-amber-300"
          }`}
        >
          {syncFeedback.success ? (
            <Check className="h-5 w-5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          )}
          <div className="flex-1">
            <p className="text-sm font-semibold">
              {syncFeedback.success
                ? t("biometrics.syncSuccessTitle")
                : t("biometrics.syncErrorTitle")}
            </p>
            <p className="text-xs opacity-90 mt-0.5 whitespace-pre-line">
              {syncFeedback.message}
            </p>
          </div>
          <button
            onClick={() => setSyncFeedback(null)}
            aria-label={t("common.close")}
            className="p-1 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Stitch Bento Highlights Row (TMB Highlight + Current vs Target comparison) */}
      {records.length > 0 && latestRecord && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* TMB Highlight Card (5 cols) */}
          <div className="lg:col-span-5 bg-card border border-border rounded-2xl p-6 shadow-xs flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-36 h-36 bg-primary/5 rounded-full blur-2xl pointer-events-none" />

            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <Flame className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="font-label-caps text-muted-foreground block">
                      {t("biometrics.tmbLabel")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("biometrics.tmbSubtitle")}
                    </span>
                  </div>
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  {t("biometrics.tmbBadge")}
                </span>
              </div>

              <div className="my-3">
                <div className="font-display-metrics text-foreground tracking-tight">
                  {bmrValue ? formatInteger(bmrValue) : "—"}
                  <span className="text-lg font-normal text-muted-foreground ml-2">
                    {t("biometrics.kcalDay")}
                  </span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                {t("biometrics.tmbDesc")}
              </p>
            </div>

            <div className="pt-4 mt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("biometrics.latestMeasurement")}</span>
              <span className="font-data-mono font-semibold text-foreground">
                {formatDate(latestRecord.date)}
              </span>
            </div>
          </div>

          {/* Current vs Target / Baseline Comparison Card (7 cols) */}
          <div className="lg:col-span-7 bg-card border border-border rounded-2xl p-6 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    {t("biometrics.evolutionComparison")}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {t("biometrics.evolutionDesc")}
                  </p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground font-data-mono">
                {records.length} {t("biometrics.totalEvaluations")}
              </span>
            </div>

            {/* 3 Progress Bars: Weight, Body Fat, Muscle Mass */}
            <div className="space-y-4 my-2">
              {/* Weight */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{t("dashboard.weight")}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-data-mono font-bold">{formatDecimal(latestRecord.weight, 1)} kg</span>
                    <span
                      className={`font-data-mono text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                        weightChange <= 0
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {weightChange > 0 ? "+" : ""}
                      {formatDecimal(weightChange, 1)} kg
                    </span>
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(15, (latestRecord.weight / 120) * 100))}%`,
                    }}
                  />
                </div>
              </div>

              {/* Body Fat % */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{t("dashboard.bodyFat")}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-data-mono font-bold">{formatDecimal(latestRecord.body_fat_pct, 1)}%</span>
                    <span
                      className={`font-data-mono text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                        fatChange <= 0
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {fatChange > 0 ? "+" : ""}
                      {formatDecimal(fatChange, 1)}%
                    </span>
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-rose-500 h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(10, latestRecord.body_fat_pct * 2))}%`,
                    }}
                  />
                </div>
              </div>

              {/* Skeletal Muscle Mass */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{t("dashboard.skeletalMuscle")}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-data-mono font-bold">
                      {formatDecimal(latestRecord.skeletal_muscle_mass, 1)} kg
                    </span>
                    <span
                      className={`font-data-mono text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                        muscleChange >= 0
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {muscleChange > 0 ? "+" : ""}
                      {formatDecimal(muscleChange, 1)} kg
                    </span>
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(15, (latestRecord.skeletal_muscle_mass / 60) * 100)
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("biometrics.baselineDate")} {formatDate(earliestRecord?.date)}</span>
              <span className="text-primary font-medium flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                {t("biometrics.activeRecomp")}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Delete Feedback Alert */}
      {deleteFeedback && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 animate-in fade-in slide-in-from-top duration-300 ${
            deleteFeedback.success
              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-800 dark:text-emerald-300"
              : "bg-amber-500/10 border-amber-500/25 text-amber-800 dark:text-amber-300"
          }`}
        >
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold">
              {deleteFeedback.title ||
                (deleteFeedback.success
                  ? t("history.deletePrompt.successTitle")
                  : t("history.deletePrompt.failedTitle"))}
            </p>
            <p className="text-xs opacity-90 mt-0.5 whitespace-pre-line">
              {deleteFeedback.message}
            </p>
          </div>
          <button
            onClick={() => setDeleteFeedback(null)}
            aria-label={t("common.close")}
            className="p-1 rounded-md hover:bg-muted/50 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Table Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Input */}
          <div className="relative w-full sm:w-60">
            <Search className="absolute inset-y-0 left-0 pl-3 h-full w-4 text-muted-foreground flex items-center pointer-events-none" />
            <input
              type="text"
              placeholder={t("history.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-muted-foreground transition-all"
            />
          </div>

          {/* Star Filter Pill */}
          <button
            type="button"
            onClick={() => setFilterStarredOnly((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer shrink-0 ${
              filterStarredOnly
                ? "bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400 shadow-xs"
                : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
            title={filterStarredOnly ? t("history.filterAll") : t("history.filterStarred")}
            aria-label={filterStarredOnly ? t("history.filterAll") : t("history.filterStarred")}
          >
            <Star
              className={`h-3.5 w-3.5 ${
                filterStarredOnly ? "fill-amber-400 text-amber-400" : ""
              }`}
            />
            <span>{filterStarredOnly ? t("history.filterStarred") : t("history.filterStarred")}</span>
          </button>

          {/* Time Range Pills: Todos, 1M, 3M, 6M, 1A */}
          <div className="flex bg-muted p-0.5 rounded-lg border border-border text-xs font-semibold shrink-0">
            {(["all", "1m", "3m", "6m", "1y"] as const).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setTimeRangeFilter(period)}
                className={`px-2.5 py-1.5 rounded-md transition-all cursor-pointer ${
                  timeRangeFilter === period
                    ? "bg-card text-foreground shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(`history.period_${period}`) || period.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Selected Action: Delete */}
          {selectedIds.length > 0 && (
            <button
              onClick={() => {
                setIdsToDelete(selectedIds);
                setIsDeleteConfirmOpen(true);
              }}
              className="flex items-center justify-center bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg transition-all cursor-pointer shadow-sm animate-in fade-in zoom-in-95 duration-250 shrink-0 h-[34px] w-[34px]"
              title={t("history.deleteSelected", { count: selectedIds.length })}
              aria-label={t("history.deleteSelected", { count: selectedIds.length })}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Right side of Toolbar: Items per page selector + Showing summary */}
        <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{t("history.perPageLabel")}</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer font-medium"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>

          <div className="text-xs text-muted-foreground font-medium">
            {t("history.showingRecords", {
              count: paginatedRecords.length,
              total: sortedRecords.length,
            }) || `Showing ${paginatedRecords.length} of ${sortedRecords.length} records`}
          </div>
        </div>
      </div>

      {/* Main Records Table Card */}
      <div className="bg-card border border-border rounded-xl shadow-xs overflow-hidden flex flex-col">
        {sortedRecords.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            {t("history.noMatch")}
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
            <table className="w-full border-collapse text-left text-sm text-foreground">
              <thead className="bg-muted/95 backdrop-blur-xs sticky top-0 z-10 border-b border-border text-muted-foreground font-semibold font-label-caps tracking-wider">
                <tr>
                  <th className="px-6 py-4 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={
                        paginatedRecords.length > 0 &&
                        paginatedRecords.every((r) => selectedIds.includes(r.id))
                      }
                      onChange={() => {
                        const pageIds = paginatedRecords.map((r) => r.id);
                        const allSelected = pageIds.every((id) => selectedIds.includes(id));
                        if (allSelected) {
                          setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
                        } else {
                          setSelectedIds((prev) => {
                            const next = [...prev];
                            pageIds.forEach((id) => {
                              if (!next.includes(id)) next.push(id);
                            });
                            return next;
                          });
                        }
                      }}
                      className="rounded border-border text-primary focus:ring-primary h-4 w-4 bg-card cursor-pointer"
                      title={t("history.selectAllPage")}
                      aria-label={t("history.selectAllPage")}
                    />
                  </th>
                  <th
                    onClick={() => handleSort("date")}
                    className="px-6 py-4 cursor-pointer hover:bg-muted/80 transition-colors select-none"
                  >
                    {t("history.table.date")} {renderSortIcon("date")}
                  </th>
                  <th
                    onClick={() => handleSort("weight")}
                    className="px-6 py-4 cursor-pointer hover:bg-muted/80 transition-colors select-none"
                  >
                    {t("history.table.weight")} (kg) {renderSortIcon("weight")}
                  </th>
                  <th
                    onClick={() => handleSort("bmi")}
                    className="px-6 py-4 cursor-pointer hover:bg-muted/80 transition-colors select-none"
                  >
                    {t("history.table.bmi")} {renderSortIcon("bmi")}
                  </th>
                  <th
                    onClick={() => handleSort("body_fat_pct")}
                    className="px-6 py-4 cursor-pointer hover:bg-muted/80 transition-colors select-none"
                  >
                    {t("history.table.bodyFat")} (%) {renderSortIcon("body_fat_pct")}
                  </th>
                  <th
                    onClick={() => handleSort("skeletal_muscle_mass")}
                    className="px-6 py-4 cursor-pointer hover:bg-muted/80 transition-colors select-none"
                  >
                    {t("history.table.skeletalMuscle")} (kg) {renderSortIcon("skeletal_muscle_mass")}
                  </th>
                  <th
                    onClick={() => handleSort("body_score")}
                    className="px-6 py-4 cursor-pointer hover:bg-muted/80 transition-colors select-none"
                  >
                    {t("history.table.bodyScore")} {renderSortIcon("body_score")}
                  </th>
                  <th className="px-6 py-4 text-right pr-6">{t("history.table.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedRecords.map((record) => (
                  <tr
                    key={record.id}
                    onClick={() => setSelectedRecord(record)}
                    className="hover:bg-muted/30 transition-colors cursor-pointer group"
                  >
                    <td
                      className="px-6 py-4 text-center whitespace-nowrap w-12"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(record.id)}
                        onChange={() => {
                          setSelectedIds((prev) =>
                            prev.includes(record.id)
                              ? prev.filter((id) => id !== record.id)
                              : [...prev, record.id]
                          );
                        }}
                        className="rounded border-border text-primary focus:ring-primary h-4 w-4 bg-card cursor-pointer"
                      />
                    </td>
                    <td className="px-6 py-4 font-medium whitespace-nowrap">
                      <span className="font-data-mono">
                        {formatDateTime(record.date, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-data-mono font-medium">
                      {formatDecimal(record.weight, 1)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-data-mono">
                      {record.bmi !== null && record.bmi !== undefined ? formatDecimal(record.bmi, 1) : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-data-mono">
                      {record.body_fat_pct !== null && record.body_fat_pct !== undefined ? `${formatDecimal(record.body_fat_pct, 1)}%` : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-data-mono">
                      {record.skeletal_muscle_mass !== null && record.skeletal_muscle_mass !== undefined ? formatDecimal(record.skeletal_muscle_mass, 1) : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {record.body_score ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold font-data-mono bg-primary/10 text-primary">
                          {record.body_score}
                        </span>
                      ) : (
                        <span className="font-data-mono text-muted-foreground">-</span>
                      )}
                    </td>
                    <td
                      className="px-6 py-4 whitespace-nowrap text-right pr-6"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center gap-1">
                        {/* 1. Star (Favorite) */}
                        <button
                          type="button"
                          onClick={(e) => handleToggleStar(record.id, e)}
                          className="p-1.5 rounded-lg hover:bg-muted/80 transition-all cursor-pointer"
                          title={
                            record.starred
                              ? t("history.unstarTooltip")
                              : t("history.starTooltip")
                          }
                          aria-label={
                            record.starred
                              ? t("history.unstarTooltip")
                              : t("history.starTooltip")
                          }
                        >
                          <Star
                            className={`h-4 w-4 transition-all ${
                              record.starred
                                ? "text-amber-400 fill-amber-400 scale-110"
                                : "text-muted-foreground/30 hover:text-amber-400 hover:scale-110"
                            }`}
                          />
                        </button>

                        {/* 2. Paperclip (Attachment) */}
                        <div className="relative inline-block text-left">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuRecordId(
                                activeMenuRecordId === record.id ? null : record.id
                              );
                            }}
                            className={`p-1.5 rounded-lg transition-colors hover:bg-muted cursor-pointer ${
                              record.report
                                ? "text-primary hover:text-primary/90"
                                : "text-muted-foreground/35 hover:text-muted-foreground"
                            }`}
                            title={
                              record.report
                                ? t("history.reportAttached")
                                : t("history.noReportAttached")
                            }
                            aria-label={
                              record.report
                                ? t("history.reportAttached")
                                : t("history.noReportAttached")
                            }
                          >
                            <Paperclip className="h-4 w-4" />
                          </button>

                          {activeMenuRecordId === record.id && (
                            <div
                              className="absolute right-0 mt-2 w-48 rounded-xl shadow-xl bg-card border border-border ring-1 ring-black/5 focus:outline-none z-50 animate-in fade-in slide-in-from-top-1 duration-200 text-left"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="py-1" role="menu" aria-orientation="vertical">
                                {record.report ? (
                                  <>
                                    <a
                                      href={record.report.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2 px-4 py-2 text-xs text-foreground hover:bg-muted transition-colors cursor-pointer w-full text-left"
                                      role="menuitem"
                                      onClick={() => setActiveMenuRecordId(null)}
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                      <span>{t("history.report.view")}</span>
                                    </a>
                                    <button
                                      onClick={() => {
                                        setActiveMenuRecordId(null);
                                        setUploadRecordId(record.id);
                                      }}
                                      className="flex items-center gap-2 px-4 py-2 text-xs text-foreground hover:bg-muted transition-colors cursor-pointer w-full text-left"
                                      role="menuitem"
                                    >
                                      <FileUp className="h-3.5 w-3.5" />
                                      <span>{t("history.report.upload")}</span>
                                    </button>
                                    <button
                                      onClick={() => {
                                        setActiveMenuRecordId(null);
                                        handleDeleteReport(record.id);
                                      }}
                                      className="flex items-center gap-2 px-4 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors cursor-pointer w-full text-left"
                                      role="menuitem"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      <span>{t("history.report.delete")}</span>
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setActiveMenuRecordId(null);
                                      setUploadRecordId(record.id);
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 text-xs text-foreground hover:bg-muted transition-colors cursor-pointer w-full text-left"
                                    role="menuitem"
                                  >
                                    <FileUp className="h-3.5 w-3.5" />
                                    <span>{t("history.report.upload")}</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 3. Eye (Details Drawer) */}
                        <button
                          type="button"
                          onClick={() => setSelectedRecord(record)}
                          className="p-1.5 rounded-lg hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                          title={t("history.table.details")}
                          aria-label={t("history.table.details")}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-3.5 border-t border-border bg-muted/20">
            <div className="text-xs text-muted-foreground">
              {t("history.pagination.showingRange", {
                start: (safeCurrentPage - 1) * pageSize + 1,
                end: Math.min(safeCurrentPage * pageSize, sortedRecords.length),
                total: sortedRecords.length,
              }) ||
                `Showing ${(safeCurrentPage - 1) * pageSize + 1}–${Math.min(
                  safeCurrentPage * pageSize,
                  sortedRecords.length
                )} of ${sortedRecords.length}`}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safeCurrentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                title={t("history.pagination.previous")}
                aria-label={t("history.pagination.previous")}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                if (
                  totalPages > 7 &&
                  page !== 1 &&
                  page !== totalPages &&
                  Math.abs(page - safeCurrentPage) > 1
                ) {
                  if (page === 2 || page === totalPages - 1) {
                    return (
                      <span key={page} className="px-1.5 text-xs text-muted-foreground select-none">
                        ...
                      </span>
                    );
                  }
                  return null;
                }

                return (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    className={`min-w-8 h-8 px-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      safeCurrentPage === page
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "border border-border bg-card hover:bg-muted text-foreground"
                    }`}
                  >
                    {page}
                  </button>
                );
              })}

              <button
                type="button"
                disabled={safeCurrentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                title={t("history.pagination.next")}
                aria-label={t("history.pagination.next")}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CSV Import Modal Component */}
      <CSVImportModal
        isOpen={isImportModalOpen}
        onClose={() => {
          setIsImportModalOpen(false);
          fetchRecords(false);
        }}
        onImportSuccess={() => {
          fetchRecords(false);
        }}
      />

      {/* Share Modal */}
      {isShareModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 cursor-pointer"
          onClick={handleCloseShareModal}
        >
          <div
            className="relative w-full max-w-lg bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 duration-200 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleCloseShareModal}
              className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer"
              aria-label={t("common.close")}
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                <Share2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  {t("sharing.modalTitle")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {selectedIds.length > 0
                    ? t("sharing.selectedRecordsCount", { count: selectedIds.length })
                    : t("sharing.autoShareEmptySelectionNotice")}
                </p>
              </div>
            </div>

            {createdShareLink ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-center gap-3">
                  <Check className="h-5 w-5 shrink-0" />
                  <p className="text-sm font-semibold">{t("sharing.createSuccess")}</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">
                    {t("sharing.shareableUrl")}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createdShareLink}
                      className="flex-1 px-3 py-2 bg-muted/40 border border-border rounded-lg text-xs font-data-mono text-foreground focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCopyCreatedShareLink}
                      className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground font-semibold text-xs rounded-lg hover:bg-primary/95 transition-all shadow-xs cursor-pointer"
                    >
                      {isCopied ? (
                        <>
                          <Check className="h-4 w-4" />
                          <span>{t("sharing.copied")}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          <span>{t("sharing.copiedBtn")}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleCloseShareModal}
                    className="px-5 py-2 bg-primary text-primary-foreground font-semibold text-xs rounded-lg hover:bg-primary/95 transition-all cursor-pointer"
                  >
                    {t("common.done")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {shareError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/25 text-destructive rounded-xl text-xs">
                    {shareError}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">
                    {t("sharing.descriptionLabel")} *
                  </label>
                  <input
                    type="text"
                    placeholder={t("sharing.descriptionPlaceholder")}
                    value={shareDescription}
                    onChange={(e) => setShareDescription(e.target.value)}
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-muted-foreground"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">
                    {t("sharing.passwordLabel")}
                  </label>
                  <input
                    type="password"
                    placeholder={t("sharing.passwordPlaceholder")}
                    value={sharePassword}
                    onChange={(e) => setSharePassword(e.target.value)}
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-muted-foreground"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">
                    {t("sharing.expiresLabel")}
                  </label>
                  <select
                    value={shareExpiration}
                    onChange={(e) => setShareExpiration(e.target.value as never)}
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent cursor-pointer"
                  >
                    <option value="never">{t("sharing.expiresNever")}</option>
                    <option value="1d">{t("sharing.expires1d")}</option>
                    <option value="7d">{t("sharing.expires7d")}</option>
                    <option value="30d">{t("sharing.expires30d")}</option>
                    <option value="custom">{t("sharing.expiresCustom")}</option>
                  </select>
                </div>

                {shareExpiration === "custom" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">
                      {t("sharing.customDateLabel")}
                    </label>
                    <LocalizedDatePicker
                      value={shareCustomExpiryDate}
                      onChange={(newDate) => setShareCustomExpiryDate(newDate)}
                      lang={i18n.language}
                      min={new Date().toISOString().split("T")[0]}
                    />
                  </div>
                )}

                <div className="pt-2 space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shareIncludeAttachments}
                      onChange={(e) => setShareIncludeAttachments(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary h-4 w-4 bg-card cursor-pointer"
                    />
                    <span className="text-xs text-foreground font-medium">
                      {t("sharing.includeAttachmentsLabel")}
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shareAutoShareStarred}
                      onChange={(e) => setShareAutoShareStarred(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary h-4 w-4 bg-card cursor-pointer"
                    />
                    <span className="text-xs text-foreground font-medium">
                      {t("sharing.autoShareStarredLabel")}
                    </span>
                  </label>
                </div>

                <div className="pt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCloseShareModal}
                    className="px-4 py-2 border border-border rounded-lg text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    disabled={isCreatingShare}
                    onClick={handleCreateShareSubmit}
                    className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs rounded-lg transition-all shadow-md shadow-primary/10 disabled:opacity-50 cursor-pointer"
                  >
                    {isCreatingShare ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{t("common.saving")}</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="h-4 w-4" />
                        <span>{t("sharing.shareButton")}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 cursor-pointer"
          onClick={() => {
            setIsDeleteConfirmOpen(false);
            setIdsToDelete([]);
          }}
        >
          <div
            className="relative w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-destructive mb-4">
              <div className="p-2.5 rounded-xl bg-destructive/10">
                <Trash2 className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-foreground">
                {t("history.deletePrompt.title")}
              </h3>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed mb-6">
              {idsToDelete.length === 1
                ? t("history.deletePrompt.confirmSingle")
                : t("history.deletePrompt.confirmMultiple", { count: idsToDelete.length })}
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteConfirmOpen(false);
                  setIdsToDelete([]);
                }}
                className="px-4 py-2 border border-border rounded-lg text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteConfirm}
                className="flex items-center gap-2 px-5 py-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold text-xs rounded-lg transition-all shadow-md shadow-destructive/10 disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t("history.deleting")}</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    <span>{t("history.deletePrompt.deleteBtn")}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Attachment Upload Modal */}
      {uploadRecordId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 cursor-pointer"
          onClick={() => {
            setUploadRecordId(null);
            setSelectedFile(null);
            setUploadError(null);
          }}
        >
          <div
            className="relative w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setUploadRecordId(null);
                setSelectedFile(null);
                setUploadError(null);
              }}
              className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer"
              aria-label={t("common.close")}
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                <FileUp className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  {t("history.report.modalTitle")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t("history.report.allowedTypes")}
                </p>
              </div>
            </div>

            {uploadError && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/25 text-destructive rounded-xl text-xs">
                {uploadError}
              </div>
            )}

            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center transition-all ${
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 bg-muted/20"
              }`}
            >
              <Paperclip className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-xs font-medium text-foreground mb-1">
                {t("history.report.dragDrop")}
              </p>
              <p className="text-[10px] text-muted-foreground mb-3">
                {t("history.report.allowedTypes")}
              </p>
              <label className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg cursor-pointer transition-colors border border-primary/20">
                <span>{t("history.report.browseDevice")}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            </div>

            {selectedFile && (
              <div className="mt-3 p-2.5 bg-muted/40 border border-border rounded-lg flex items-center justify-between text-xs">
                <span className="truncate max-w-[250px] font-medium text-foreground">
                  {selectedFile.name}
                </span>
                <span className="text-muted-foreground">
                  {formatDecimal(selectedFile.size / (1024 * 1024), 2)} MB
                </span>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setUploadRecordId(null);
                  setSelectedFile(null);
                  setUploadError(null);
                }}
                className="px-4 py-2 border border-border rounded-lg text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={!selectedFile || !!uploadProgress}
                onClick={handleUploadSubmit}
                className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs rounded-lg transition-all shadow-md shadow-primary/10 disabled:opacity-50 cursor-pointer"
              >
                {uploadProgress ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{uploadProgress}</span>
                  </>
                ) : (
                  <>
                    <FileUp className="h-4 w-4" />
                    <span>{t("history.report.upload")}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-over Drawer for Record Details */}
      {selectedRecord && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 cursor-pointer"
          onClick={() => setSelectedRecord(null)}
          data-testid="drawer-backdrop"
        >
          <div
            className="w-full max-w-xl bg-card border-l border-border h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-250 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="p-6 border-b border-border flex items-center justify-between bg-muted/20">
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  {t("history.drawer.reportTitle")}
                </h3>
                <p className="text-xs text-muted-foreground font-data-mono">
                  {formatDateTime(selectedRecord.date)}
                </p>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer"
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Body Metrics Grid */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Primary Metrics Card */}
              <div className="bg-muted/30 border border-border rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                    {t("dashboard.weight")}
                  </span>
                  <div className="font-data-mono font-bold text-lg text-foreground mt-0.5">
                    {formatDecimal(selectedRecord.weight, 1)} <span className="text-xs font-normal">kg</span>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                    {t("dashboard.bodyFat")}
                  </span>
                  <div className="font-data-mono font-bold text-lg text-foreground mt-0.5">
                    {selectedRecord.body_fat_pct !== null && selectedRecord.body_fat_pct !== undefined ? `${formatDecimal(selectedRecord.body_fat_pct, 1)}%` : "-"}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                    {t("dashboard.skeletalMuscle")}
                  </span>
                  <div className="font-data-mono font-bold text-lg text-foreground mt-0.5">
                    {selectedRecord.skeletal_muscle_mass !== null && selectedRecord.skeletal_muscle_mass !== undefined ? (
                      <>
                        {formatDecimal(selectedRecord.skeletal_muscle_mass, 1)} <span className="text-xs font-normal">kg</span>
                      </>
                    ) : "-"}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                    BMI
                  </span>
                  <div className="font-data-mono font-bold text-lg text-foreground mt-0.5">
                    {selectedRecord.bmi !== null && selectedRecord.bmi !== undefined ? formatDecimal(selectedRecord.bmi, 1) : "-"}
                  </div>
                </div>
              </div>

              {/* Comprehensive Bioimpedance Grid */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {t("history.drawer.bodyCompositionDetails")}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-card border border-border rounded-lg flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t("history.drawer.bmr")}</span>
                    <span className="font-data-mono font-bold text-xs text-foreground">
                      {selectedRecord.bmr ? `${formatInteger(selectedRecord.bmr)} kcal` : "-"}
                    </span>
                  </div>
                  <div className="p-3 bg-card border border-border rounded-lg flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t("history.drawer.visceralFatLevel")}</span>
                    <span className="font-data-mono font-bold text-xs text-foreground">
                      {selectedRecord.visceral_fat || "-"}
                    </span>
                  </div>
                  <div className="p-3 bg-card border border-border rounded-lg flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t("history.drawer.moistureContent")}</span>
                    <span className="font-data-mono font-bold text-xs text-foreground">
                      {formatSegmentValue(selectedRecord.moisture_content, " kg")}
                    </span>
                  </div>
                  <div className="p-3 bg-card border border-border rounded-lg flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t("history.drawer.boneMass")}</span>
                    <span className="font-data-mono font-bold text-xs text-foreground">
                      {formatSegmentValue(selectedRecord.bone_mass, " kg")}
                    </span>
                  </div>
                  <div className="p-3 bg-card border border-border rounded-lg flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t("history.drawer.proteinPct")}</span>
                    <span className="font-data-mono font-bold text-xs text-foreground">
                      {formatSegmentValue(selectedRecord.protein_mass, " kg")}
                    </span>
                  </div>
                  <div className="p-3 bg-card border border-border rounded-lg flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t("history.drawer.metabolicAge")}</span>
                    <span className="font-data-mono font-bold text-xs text-foreground">
                      {selectedRecord.metabolic_age || "-"}
                    </span>
                  </div>
                  <div className="p-3 bg-card border border-border rounded-lg flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t("history.drawer.fatFreeMass")}</span>
                    <span className="font-data-mono font-bold text-xs text-foreground">
                      {formatSegmentValue(selectedRecord.fat_free_mass, " kg")}
                    </span>
                  </div>
                  <div className="p-3 bg-card border border-border rounded-lg flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t("history.drawer.subcutaneousFat")}</span>
                    <span className="font-data-mono font-bold text-xs text-foreground">
                      {formatSegmentValue(selectedRecord.subcutaneous_fat_pct, "%")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Segmental Analysis if available */}
              {(selectedRecord.left_arm_fat_mass ||
                selectedRecord.right_arm_fat_mass ||
                selectedRecord.trunk_fat_mass ||
                selectedRecord.left_leg_fat_mass ||
                selectedRecord.right_leg_fat_mass) && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    {t("history.drawer.segmentalTitle")}
                  </h4>
                  <div className="bg-card border border-border rounded-xl p-4 space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">{t("history.drawer.segments.trunk")}</span>
                      <span className="font-data-mono font-bold">
                        {formatSegmentValue(selectedRecord.trunk_fat_mass, ` ${t("history.drawer.fatUnit")}`)} /{" "}
                        {formatSegmentValue(selectedRecord.trunk_muscle_mass, ` ${t("history.drawer.muscleUnit")}`)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">{t("history.drawer.segments.leftArm")}</span>
                      <span className="font-data-mono font-bold">
                        {formatSegmentValue(selectedRecord.left_arm_fat_mass, ` ${t("history.drawer.fatUnit")}`)} /{" "}
                        {formatSegmentValue(selectedRecord.left_arm_muscle_mass, ` ${t("history.drawer.muscleUnit")}`)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">{t("history.drawer.segments.rightArm")}</span>
                      <span className="font-data-mono font-bold">
                        {formatSegmentValue(selectedRecord.right_arm_fat_mass, ` ${t("history.drawer.fatUnit")}`)} /{" "}
                        {formatSegmentValue(selectedRecord.right_arm_muscle_mass, ` ${t("history.drawer.muscleUnit")}`)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">{t("history.drawer.segments.leftLeg")}</span>
                      <span className="font-data-mono font-bold">
                        {formatSegmentValue(selectedRecord.left_leg_fat_mass, ` ${t("history.drawer.fatUnit")}`)} /{" "}
                        {formatSegmentValue(selectedRecord.left_leg_muscle_mass, ` ${t("history.drawer.muscleUnit")}`)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-muted-foreground">{t("history.drawer.segments.rightLeg")}</span>
                      <span className="font-data-mono font-bold">
                        {formatSegmentValue(selectedRecord.right_leg_fat_mass, ` ${t("history.drawer.fatUnit")}`)} /{" "}
                        {formatSegmentValue(selectedRecord.right_leg_muscle_mass, ` ${t("history.drawer.muscleUnit")}`)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-border bg-muted/20 flex justify-end">
              <button
                onClick={() => setSelectedRecord(null)}
                className="px-4 py-2 bg-primary text-primary-foreground font-semibold text-xs rounded-lg hover:bg-primary/95 transition-all cursor-pointer"
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
