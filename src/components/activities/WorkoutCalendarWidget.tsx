"use client";

import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Dumbbell,
  ArrowRight,
} from "lucide-react";
import type { WorkoutCalendarItem } from "@/lib/api";
import { formatDate, formatInteger } from "@/lib/i18n";


interface WorkoutCalendarWidgetProps {
  calendarDays: Record<string, WorkoutCalendarItem[]>;
  isLoading?: boolean;
}

export default function WorkoutCalendarWidget({
  calendarDays = {},
  isLoading = false,
}: WorkoutCalendarWidgetProps) {
  const { t, i18n } = useTranslation();

  // Selected viewing month (default to current month)
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  const [selectedDate, setSelectedDate] = useState<string | null>(todayStr);

  const formatDurationText = (seconds: number) => {
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const handlePrevMonth = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() - 1);
      return next;
    });
  };

  const handleNextMonth = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() + 1);
      return next;
    });
  };

  const monthYearLabel = useMemo(() => {
    return currentDate.toLocaleDateString(i18n.language || "pt", {
      month: "long",
      year: "numeric",
    });
  }, [currentDate, i18n.language]);

  // Calendar cells computation (Sunday to Saturday)
  const calendarCells = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sunday
    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells: {
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      workouts: WorkoutCalendarItem[];
    }[] = [];

    // Prev month days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevDate = new Date(year, month - 1, dayNum);
      const y = prevDate.getFullYear();
      const m = String(prevDate.getMonth() + 1).padStart(2, "0");
      const d = String(dayNum).padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;

      cells.push({
        dateStr,
        dayNumber: dayNum,
        isCurrentMonth: false,
        workouts: calendarDays[dateStr] || [],
      });
    }

    // Current month days
    for (let day = 1; day <= daysInCurrentMonth; day++) {
      const y = year;
      const m = String(month + 1).padStart(2, "0");
      const d = String(day).padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;

      cells.push({
        dateStr,
        dayNumber: day,
        isCurrentMonth: true,
        workouts: calendarDays[dateStr] || [],
      });
    }

    // Next month days to complete grid (multiples of 7, up to 35 or 42)
    const totalSlots = cells.length > 35 ? 42 : 35;
    const remainingSlots = totalSlots - cells.length;
    for (let day = 1; day <= remainingSlots; day++) {
      const nextDate = new Date(year, month + 1, day);
      const y = nextDate.getFullYear();
      const m = String(nextDate.getMonth() + 1).padStart(2, "0");
      const d = String(day).padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;

      cells.push({
        dateStr,
        dayNumber: day,
        isCurrentMonth: false,
        workouts: calendarDays[dateStr] || [],
      });
    }

    return cells;
  }, [currentDate, calendarDays]);

  // Count total workouts in the viewed month
  const monthlyWorkoutsCount = useMemo(() => {
    let count = 0;
    for (const cell of calendarCells) {
      if (cell.isCurrentMonth && cell.workouts.length > 0) {
        count += cell.workouts.length;
      }
    }
    return count;
  }, [calendarCells]);

  const selectedWorkouts = selectedDate ? calendarDays[selectedDate] || [] : [];

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 shadow-xs animate-pulse flex flex-col justify-between h-[360px]">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 w-28 bg-muted rounded" />
          <div className="h-6 w-36 bg-muted rounded" />
        </div>
        <div className="grid grid-cols-7 gap-2 my-auto">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-7 w-7 rounded-full bg-muted/40 mx-auto" />
          ))}
        </div>
      </div>
    );
  }

  const weekDayHeaders = [
    t("dashboard.calendar.days.sun"),
    t("dashboard.calendar.days.mon"),
    t("dashboard.calendar.days.tue"),
    t("dashboard.calendar.days.wed"),
    t("dashboard.calendar.days.thu"),
    t("dashboard.calendar.days.fri"),
    t("dashboard.calendar.days.sat"),
  ];

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-xs flex flex-col justify-between relative overflow-hidden">
      <div>
        {/* Header: Title & Month Navigation */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <CalendarIcon className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-foreground">
              {t("dashboard.calendar.title")}
            </h3>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Previous Month"
              className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-semibold text-foreground capitalize px-1 min-w-[110px] text-center">
              {monthYearLabel}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Next Month"
              className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Days of Week Header */}
        <div className="grid grid-cols-7 gap-1 text-center mb-2">
          {weekDayHeaders.map((dayLabel, idx) => (
            <span
              key={idx}
              className="text-[11px] font-semibold text-muted-foreground uppercase py-1"
            >
              {dayLabel}
            </span>
          ))}
        </div>

        {/* Calendar Days Grid */}
        <div className="grid grid-cols-7 gap-y-2 gap-x-1 text-center">
          {calendarCells.map((cell) => {
            const hasWorkouts = cell.workouts.length > 0;
            const isToday = cell.dateStr === todayStr;
            const isSelected = cell.dateStr === selectedDate;

            let buttonClass =
              "w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs font-medium mx-auto flex items-center justify-center transition-all cursor-pointer ";

            if (!cell.isCurrentMonth) {
              buttonClass += "text-muted-foreground/30 hover:bg-muted/20 ";
            } else if (hasWorkouts) {
              buttonClass +=
                "bg-primary text-primary-foreground font-bold shadow-xs hover:scale-105 active:scale-95 ";
              if (isSelected) {
                buttonClass += "ring-2 ring-primary ring-offset-2 ring-offset-card ";
              }
            } else if (isToday) {
              buttonClass +=
                "border border-primary text-primary font-bold hover:bg-primary/10 ";
              if (isSelected) {
                buttonClass += "bg-primary/15 ";
              }
            } else if (isSelected) {
              buttonClass += "bg-muted text-foreground font-bold ";
            } else {
              buttonClass +=
                "text-foreground/80 hover:bg-muted/60 hover:text-foreground ";
            }

            return (
              <div key={cell.dateStr} className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setSelectedDate(cell.dateStr)}
                  className={buttonClass}
                  title={
                    hasWorkouts
                      ? `${cell.workouts.length} workout(s) on ${cell.dateStr}`
                      : cell.dateStr
                  }
                >
                  {cell.dayNumber}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Day Details Section */}
      <div className="pt-3 mt-4 border-t border-border">
        {selectedDate && selectedWorkouts.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">
                {t("dashboard.calendar.workoutsOn", {
                  date: formatDate(selectedDate, {
                    day: "numeric",
                    month: "short",
                  }),
                })}
              </span>
              <span className="text-[11px] text-muted-foreground font-medium">
                {selectedWorkouts.length}{" "}
                {selectedWorkouts.length === 1
                  ? t("activities.set")
                  : t("activities.sets")}
              </span>
            </div>

            <div className="space-y-1.5 max-h-[100px] overflow-y-auto pr-1">
              {selectedWorkouts.map((w) => (
                <div
                  key={w.id}
                  className="p-2 rounded-xl bg-muted/40 border border-border/60 flex items-center justify-between text-xs hover:bg-muted/60 transition-colors"
                >
                  <div className="truncate mr-2">
                    <span className="font-semibold text-foreground block truncate">
                      {w.title}
                    </span>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <Clock className="h-3 w-3" />
                      {formatDurationText(w.durationSeconds)}
                      <span>•</span>
                      <Dumbbell className="h-3 w-3" />
                      {formatInteger(w.totalVolumeKg)} kg
                    </span>
                  </div>
                  <Link
                    href="/activities"
                    className="p-1 rounded-lg text-primary hover:bg-primary/10 transition-colors shrink-0"
                    title={t("activities.viewWorkouts")}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ) : selectedDate ? (
          <div className="flex items-center justify-between text-xs text-muted-foreground py-1">
            <span>
              {formatDate(selectedDate, { day: "numeric", month: "short" })}:{" "}
              {t("dashboard.calendar.noWorkoutsOnDay")}
            </span>
            <span className="text-[11px] font-medium text-foreground/80">
              {t("dashboard.calendar.sessionsThisMonth", { count: monthlyWorkoutsCount })}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs text-muted-foreground py-1">
            <span>
              {t("dashboard.calendar.sessionsThisMonth", { count: monthlyWorkoutsCount })}
            </span>
          </div>
        )}

        <div className="pt-2 mt-2 border-t border-border/50 flex justify-end">
          <Link
            href="/activities"
            className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            <span>{t("dashboard.calendar.viewAll")}</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
