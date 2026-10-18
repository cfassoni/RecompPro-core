"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { DragEvent, ChangeEvent } from "react";
import { api } from "@/lib/api";
import type { UploadResponse } from "@/lib/api";
import { formatDecimal } from "@/lib/i18n";

import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Database,
  RefreshCw,
  Plus,
} from "lucide-react";

interface CSVImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess?: (result: UploadResponse) => void;
}

export default function CSVImportModal({
  isOpen,
  onClose,
  onImportSuccess,
}: CSVImportModalProps) {
  const { t } = useTranslation();
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const handleClose = useCallback(() => {
    setFile(null);
    setError(null);
    setResult(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setError(null);
      setResult(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith(".csv") || droppedFile.type === "text/csv") {
        setFile(droppedFile);
        setError(null);
        setResult(null);
      } else {
        setError(t("import.invalidDrop"));
      }
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.name.endsWith(".csv") || selectedFile.type === "text/csv") {
        setFile(selectedFile);
        setError(null);
        setResult(null);
      } else {
        setError(t("import.invalidSelect"));
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setError(null);
    setIsUploading(true);
    setResult(null);

    try {
      const response = await api.uploadCSV(file);
      setResult(response);
      setFile(null);
      if (onImportSuccess) {
        onImportSuccess(response);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg || t("import.uploadError"));
    } finally {
      setIsUploading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${formatDecimal(bytes / Math.pow(k, i), 2)} ${sizes[i]}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 cursor-pointer"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-xl bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer"
          aria-label={t("common.close")}
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">{t("import.title")}</h2>
              <p className="text-xs text-muted-foreground">{t("import.subtitle")}</p>
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/25 text-destructive rounded-xl flex items-center gap-2 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-xs">{error}</span>
          </div>
        )}

        {/* Success State */}
        {result ? (
          <div className="flex flex-col items-center text-center space-y-4 py-2">
            <div className="h-14 w-14 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-foreground">{t("import.success")}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {t("import.successDesc", {
                  total: result.total_processed,
                  inserted: result.inserted,
                  updated: result.updated,
                })}
              </p>
            </div>

            {/* Stats Breakdown */}
            <div className="grid grid-cols-3 gap-3 w-full bg-muted/40 border border-border p-3 rounded-xl">
              <div className="text-center space-y-0.5">
                <div className="mx-auto h-6 w-6 rounded-md bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                  <Database className="h-3.5 w-3.5" />
                </div>
                <span className="block text-[10px] text-muted-foreground uppercase font-semibold">
                  {t("import.processed")}
                </span>
                <span className="text-sm font-bold">{result.total_processed}</span>
              </div>

              <div className="text-center space-y-0.5 border-x border-border">
                <div className="mx-auto h-6 w-6 rounded-md bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <Plus className="h-3.5 w-3.5" />
                </div>
                <span className="block text-[10px] text-muted-foreground uppercase font-semibold">
                  {t("import.inserted")}
                </span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {result.inserted}
                </span>
              </div>

              <div className="text-center space-y-0.5">
                <div className="mx-auto h-6 w-6 rounded-md bg-amber-500/10 text-amber-500 flex items-center justify-center">
                  <RefreshCw className="h-3.5 w-3.5" />
                </div>
                <span className="block text-[10px] text-muted-foreground uppercase font-semibold">
                  {t("import.updated")}
                </span>
                <span className="text-sm font-bold text-amber-600 dark:text-amber-500">{result.updated}</span>
              </div>
            </div>

            <div className="flex gap-2 w-full pt-2">
              <button
                onClick={() => setResult(null)}
                className="flex-1 py-2.5 border border-border rounded-xl text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                {t("import.importAnother")}
              </button>
              <button
                onClick={handleClose}
                className="flex-1 py-2.5 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs rounded-xl transition-colors shadow-sm cursor-pointer"
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        ) : (
          /* Dropzone & Upload State */
          <div className="space-y-4">
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center transition-all ${
                dragActive
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : "border-border hover:border-primary/50 bg-muted/20"
              }`}
            >
              <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
                <Upload className="h-6 w-6" />
              </div>

              <p className="text-sm font-medium text-foreground mb-1">
                {t("import.dropActive")}
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                {t("import.csvFormatNote")}
              </p>

              <label className="relative inline-flex items-center justify-center px-4 py-2 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg cursor-pointer transition-colors border border-primary/20">
                <span>{t("import.browseBtn")}</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            </div>

            {/* Selected File Details */}
            {file && (
              <div className="flex items-center justify-between p-3 bg-muted/50 border border-border rounded-xl">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{file.name}</p>
                    <p className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</p>
                  </div>
                </div>
                <button
                  onClick={() => setFile(null)}
                  className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer"
                  aria-label={t("common.remove")}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 border border-border rounded-xl text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={!file || isUploading}
                onClick={handleUpload}
                className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs rounded-xl transition-all shadow-md shadow-primary/10 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t("import.uploading")}</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    <span>{t("import.btnUpload")}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
