// ============================================
// VyTrack — React Hooks for PKPD Computations
// ============================================

import { useMemo, useState, useEffect } from 'react';
import { useStore } from './store';
import { simulatePKPD, getCurrentEffectStatus, getCurveForDay, PK, computeToleranceState, computeSleepDebtIndex, computeRiskFlags } from './pkpd-engine';
import { DoseEntry, SubjectiveEntry, SleepEntry, DayScore, CurvePoint, EffectStatus, ToleranceState, RiskFlags } from './types';

// ---- Current Effect (updates every 60s) ----

export function useCurrentEffect(): EffectStatus | null {
  const doses = useStore((s) => s.doses);
  const profile = useStore((s) => s.profile);
  const sleepLogs = useStore((s) => s.sleepLogs);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    if (!profile) return null;
    return getCurrentEffectStatus(doses, profile.weightKg, profile.ke0Personal, sleepLogs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doses, profile, sleepLogs, tick]);
}

// ---- 24h Curve (last 18h + next 6h) ----

export function useCurve24h(): CurvePoint[] {
  const doses = useStore((s) => s.doses);
  const profile = useStore((s) => s.profile);
  const sleepLogs = useStore((s) => s.sleepLogs);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 120_000); // every 2 min
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    if (!profile) return [];
    const now = Date.now();
    return simulatePKPD(
      doses,
      profile.weightKg,
      profile.ke0Personal,
      now - 18 * 3600_000,
      now + 6 * 3600_000,
      3,
      sleepLogs
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doses, profile, sleepLogs, tick]);
}

// ---- Curve for a specific day ----

export function useCurveForDay(date: Date): CurvePoint[] {
  const doses = useStore((s) => s.doses);
  const profile = useStore((s) => s.profile);
  const sleepLogs = useStore((s) => s.sleepLogs);
  const dateStr = date.toDateString();

  return useMemo(() => {
    if (!profile) return [];
    return getCurveForDay(doses, profile.weightKg, profile.ke0Personal, new Date(dateStr), sleepLogs);
  }, [doses, profile, sleepLogs, dateStr]);
}

// ---- Tolerance State ----

export function useToleranceState(): ToleranceState {
  const doses = useStore((s) => s.doses);
  return useMemo(() => computeToleranceState(doses, Date.now()), [doses]);
}

// ---- Sleep Debt Index ----

export function useSleepDebtIndex(): number {
  const sleepLogs = useStore((s) => s.sleepLogs);
  return useMemo(() => computeSleepDebtIndex(sleepLogs), [sleepLogs]);
}

// ---- Risk Flags ----

export function useRiskFlags(): RiskFlags {
  const doses = useStore((s) => s.doses);
  const sleepLogs = useStore((s) => s.sleepLogs);
  const status = useCurrentEffect();
  return useMemo(() => {
    const tolerance = computeToleranceState(doses, Date.now());
    const sdi = computeSleepDebtIndex(sleepLogs);
    return computeRiskFlags(doses, Date.now(), sdi, tolerance, status?.currentLevel ?? 0);
  }, [doses, sleepLogs, status]);
}

// ---- Recent Sleep Logs (last 7 days) ----

export function useRecentSleepLogs(): SleepEntry[] {
  const sleepLogs = useStore((s) => s.sleepLogs);
  return useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];
    return sleepLogs
      .filter((s) => s.date >= weekAgoStr)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [sleepLogs]);
}

// ---- Today's doses ----

export function useTodayDoses(): DoseEntry[] {
  const doses = useStore((s) => s.doses);
  const today = new Date().toDateString();
  return useMemo(
    () =>
      doses
        .filter((d) => new Date(d.takenAt).toDateString() === today)
        .sort((a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime()),
    [doses, today]
  );
}

// ---- Today's subjective logs ----

export function useTodaySubjective(): SubjectiveEntry[] {
  const logs = useStore((s) => s.subjectiveLogs);
  const today = new Date().toDateString();
  return useMemo(
    () =>
      logs
        .filter((s) => new Date(s.timestamp).toDateString() === today)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [logs, today]
  );
}

// ---- Subjective logs for a specific date ----

export function useSubjectiveForDate(date: Date): SubjectiveEntry[] {
  const logs = useStore((s) => s.subjectiveLogs);
  const dateStr = date.toDateString();
  return useMemo(
    () =>
      logs
        .filter((s) => new Date(s.timestamp).toDateString() === dateStr)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [logs, dateStr]
  );
}

// ---- Doses for a specific date ----

export function useDosesForDate(date: Date): DoseEntry[] {
  const doses = useStore((s) => s.doses);
  const dateStr = date.toDateString();
  return useMemo(
    () =>
      doses
        .filter((d) => new Date(d.takenAt).toDateString() === dateStr)
        .sort((a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime()),
    [doses, dateStr]
  );
}

// ---- Day scores (for calendar heatmap) ----

export function useDayScores(): DayScore[] {
  const subjectiveLogs = useStore((s) => s.subjectiveLogs);
  const doses = useStore((s) => s.doses);

  return useMemo(() => {
    const scoreMap = new Map<string, {
      focuses: number[];
      moods: number[];
      appetites: number[];
      crashes: number[];
      doseMgs: number[];
    }>();

    // Aggregate subjective logs by date
    for (const log of subjectiveLogs) {
      const date = new Date(log.timestamp).toISOString().split('T')[0];
      if (!scoreMap.has(date)) {
        scoreMap.set(date, { focuses: [], moods: [], appetites: [], crashes: [], doseMgs: [] });
      }
      const entry = scoreMap.get(date)!;
      entry.focuses.push(log.focus);
      entry.moods.push(log.mood);
      entry.appetites.push(log.appetite);
      entry.crashes.push(log.crash);
    }

    // Add dose data
    for (const dose of doses) {
      const date = new Date(dose.takenAt).toISOString().split('T')[0];
      if (!scoreMap.has(date)) {
        scoreMap.set(date, { focuses: [], moods: [], appetites: [], crashes: [], doseMgs: [] });
      }
      scoreMap.get(date)!.doseMgs.push(dose.doseMg);
    }

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    return Array.from(scoreMap.entries())
      .map(([date, data]) => {
        const avgFocus = avg(data.focuses);
        const avgMood = avg(data.moods);
        const avgAppetite = avg(data.appetites);
        const avgCrash = avg(data.crashes);
        // Overall: higher is better. Crash is inverted (high crash = bad)
        const overallScore = data.focuses.length > 0
          ? (avgFocus + avgMood + avgAppetite + (10 - avgCrash)) / 4
          : 0;

        return {
          date,
          avgFocus: Math.round(avgFocus * 10) / 10,
          avgMood: Math.round(avgMood * 10) / 10,
          avgAppetite: Math.round(avgAppetite * 10) / 10,
          avgCrash: Math.round(avgCrash * 10) / 10,
          overallScore: Math.round(overallScore * 10) / 10,
          doseCount: data.doseMgs.length,
          totalDoseMg: data.doseMgs.reduce((a, b) => a + b, 0),
          entryCount: data.focuses.length,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [subjectiveLogs, doses]);
}

// ---- All dates that have dose or subjective data ----

export function useActiveDates(): Set<string> {
  const doses = useStore((s) => s.doses);
  const logs = useStore((s) => s.subjectiveLogs);

  return useMemo(() => {
    const dates = new Set<string>();
    for (const d of doses) dates.add(new Date(d.takenAt).toISOString().split('T')[0]);
    for (const l of logs) dates.add(new Date(l.timestamp).toISOString().split('T')[0]);
    return dates;
  }, [doses, logs]);
}

// ---- Yesterday's doses ----

export function useYesterdayDoses(): DoseEntry[] {
  const doses = useStore((s) => s.doses);
  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toDateString();
  }, []);
  return useMemo(
    () =>
      doses
        .filter((d) => new Date(d.takenAt).toDateString() === yesterday)
        .sort((a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime()),
    [doses, yesterday]
  );
}

// ---- Yesterday's subjective logs ----

export function useYesterdaySubjective(): SubjectiveEntry[] {
  const logs = useStore((s) => s.subjectiveLogs);
  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toDateString();
  }, []);
  return useMemo(
    () =>
      logs
        .filter((s) => new Date(s.timestamp).toDateString() === yesterday)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [logs, yesterday]
  );
}

// ---- Recent stats (all-time + week) ----

export function useRecentStats() {
  const doses = useStore((s) => s.doses);
  const subjectiveLogs = useStore((s) => s.subjectiveLogs);

  return useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 3600_000;

    const weekDoses = doses.filter((d) => new Date(d.takenAt).getTime() >= weekAgo);
    const weekLogs = subjectiveLogs.filter((s) => new Date(s.timestamp).getTime() >= weekAgo);

    // Days tracked (unique dates with any data)
    const allDates = new Set<string>();
    for (const d of doses) allDates.add(new Date(d.takenAt).toDateString());
    for (const s of subjectiveLogs) allDates.add(new Date(s.timestamp).toDateString());

    // Current streak (consecutive days from today going back)
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() - i);
      if (allDates.has(checkDate.toDateString())) {
        streak++;
      } else {
        break;
      }
    }

    // First data date
    let firstDate: string | null = null;
    if (doses.length > 0 || subjectiveLogs.length > 0) {
      const allTimestamps = [
        ...doses.map((d) => new Date(d.takenAt).getTime()),
        ...subjectiveLogs.map((s) => new Date(s.timestamp).getTime()),
      ];
      firstDate = new Date(Math.min(...allTimestamps)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    return {
      totalDoses: doses.length,
      totalCheckIns: subjectiveLogs.length,
      daysTracked: allDates.size,
      weekDoses: weekDoses.length,
      weekCheckIns: weekLogs.length,
      streak,
      firstDate,
    };
  }, [doses, subjectiveLogs]);
}

// ---- Ke0 calibration from subjective history ----
// If the user's subjective peaks consistently lag/lead the model,
// nudge ke0 towards better alignment.

export function useCalibratedKe0(): number {
  const profile = useStore((s) => s.profile);
  const subjectiveLogs = useStore((s) => s.subjectiveLogs);
  const doses = useStore((s) => s.doses);

  return useMemo(() => {
    if (!profile || subjectiveLogs.length < 5) return profile?.ke0Personal ?? PK.ke0Default;

    // Compare predicted vs actual focus ratings
    // If focus is consistently HIGHER than predicted → effect arrives earlier → ke0 too low
    // If focus is consistently LOWER than predicted → effect lags → ke0 too high
    let totalError = 0;
    let count = 0;

    for (const log of subjectiveLogs) {
      // Focus rating normalized to 0-100 scale
      const actualFocus = (log.focus / 10) * 100;
      const predicted = log.predictedEffectPct;

      if (predicted > 5) {
        totalError += (actualFocus - predicted);
        count++;
      }
    }

    if (count < 5) return profile.ke0Personal;

    const meanError = totalError / count;
    // If mean error is positive (actual > predicted), effect arrives earlier → increase ke0
    // If mean error is negative (actual < predicted), effect lags → decrease ke0
    const adjustment = meanError * 0.001; // very gentle nudge
    const newKe0 = Math.max(0.1, Math.min(0.8, profile.ke0Personal + adjustment));

    return Math.round(newKe0 * 1000) / 1000;
  }, [profile, subjectiveLogs, doses]);
}
