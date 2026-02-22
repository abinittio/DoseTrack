// ============================================
// VyTrack — React Hooks for PKPD Computations
// ============================================

import { useMemo, useState, useEffect } from 'react';
import { useStore } from './store';
import { simulatePKPD, getCurrentEffectStatus, getCurveForDay, PK } from './pkpd-engine';
import { DoseEntry, SubjectiveEntry, DayScore, CurvePoint, EffectStatus } from './types';

// ---- Current Effect (updates every 60s) ----

export function useCurrentEffect(): EffectStatus | null {
  const doses = useStore((s) => s.doses);
  const profile = useStore((s) => s.profile);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    if (!profile) return null;
    return getCurrentEffectStatus(doses, profile.weightKg, profile.ke0Personal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doses, profile, tick]);
}

// ---- 24h Curve (last 18h + next 6h) ----

export function useCurve24h(): CurvePoint[] {
  const doses = useStore((s) => s.doses);
  const profile = useStore((s) => s.profile);
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
      3
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doses, profile, tick]);
}

// ---- Curve for a specific day ----

export function useCurveForDay(date: Date): CurvePoint[] {
  const doses = useStore((s) => s.doses);
  const profile = useStore((s) => s.profile);
  const dateStr = date.toDateString();

  return useMemo(() => {
    if (!profile) return [];
    return getCurveForDay(doses, profile.weightKg, profile.ke0Personal, new Date(dateStr));
  }, [doses, profile, dateStr]);
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
