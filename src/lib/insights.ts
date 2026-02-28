// ============================================
// VyTrack — Insight Generation Engine
// ============================================

import { DoseEntry, SubjectiveEntry, SleepEntry, Insight, DayScore, ToleranceState } from './types';
import { v4 as uuidv4 } from 'uuid';
import { computeToleranceState, computeSleepDebtIndex, PK } from './pkpd-engine';

/**
 * Generate personalised insights from cumulative dose + subjective history.
 * Called from the Insights tab. Returns up to 10 most relevant insights.
 */
export function generateInsights(
  doses: DoseEntry[],
  subjectiveLogs: SubjectiveEntry[],
  dayScores: DayScore[],
  sleepLogs: SleepEntry[] = [],
): Insight[] {
  const insights: Insight[] = [];
  const now = new Date().toISOString();

  if (subjectiveLogs.length < 3 && doses.length < 3) {
    insights.push({
      id: uuidv4(),
      type: 'general',
      title: 'Keep logging!',
      body: `You have ${doses.length} dose${doses.length !== 1 ? 's' : ''} and ${subjectiveLogs.length} check-in${subjectiveLogs.length !== 1 ? 's' : ''} logged. We need at least a few days of data to spot patterns. Keep going!`,
      severity: 'info',
      generatedAt: now,
    });
    return insights;
  }

  // ---- 1. Peak timing insight ----
  const peakFocusHours = analyzePeakTiming(subjectiveLogs);
  if (peakFocusHours !== null) {
    const hrs = Math.floor(peakFocusHours);
    const mins = Math.round((peakFocusHours - hrs) * 60);
    insights.push({
      id: uuidv4(),
      type: 'peak_timing',
      title: 'Your focus peak',
      body: `Your highest focus ratings tend to come around ${hrs}h ${mins > 0 ? `${mins}m` : ''} after taking your dose. The model predicts peak effect around 5-6h — ${peakFocusHours < 5 ? 'yours kicks in a bit earlier than average.' : peakFocusHours > 6 ? 'yours seems to take a bit longer than average.' : 'right in line with what we\'d expect.'}`,
      severity: 'positive',
      generatedAt: now,
    });
  }

  // ---- 2. Crash pattern ----
  const crashInsight = analyzeCrashPattern(subjectiveLogs, doses);
  if (crashInsight) {
    insights.push({
      id: uuidv4(),
      type: 'crash_pattern',
      ...crashInsight,
      generatedAt: now,
    });
  }

  // ---- 3. Dose-response relationship ----
  const doseResponseInsight = analyzeDoseResponse(subjectiveLogs, doses);
  if (doseResponseInsight) {
    insights.push({
      id: uuidv4(),
      type: 'dose_response',
      ...doseResponseInsight,
      generatedAt: now,
    });
  }

  // ---- 4. Food effect ----
  const foodInsight = analyzeFoodEffect(subjectiveLogs, doses);
  if (foodInsight) {
    insights.push({
      id: uuidv4(),
      type: 'food_effect',
      ...foodInsight,
      generatedAt: now,
    });
  }

  // ---- 5. Weekly trend ----
  const trendInsight = analyzeWeeklyTrend(dayScores);
  if (trendInsight) {
    insights.push({
      id: uuidv4(),
      type: 'tolerance',
      ...trendInsight,
      generatedAt: now,
    });
  }

  // ---- 6. Best day analysis ----
  if (dayScores.length >= 3) {
    const scored = dayScores.filter((d) => d.entryCount > 0);
    if (scored.length >= 3) {
      const best = scored.reduce((a, b) => (a.overallScore > b.overallScore ? a : b));
      const dayName = new Date(best.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      insights.push({
        id: uuidv4(),
        type: 'general',
        title: 'Your best day',
        body: `${dayName} was your highest-rated day (score: ${best.overallScore}/10). You took ${best.totalDoseMg}mg total that day. Focus averaged ${best.avgFocus}/10.`,
        severity: 'positive',
        generatedAt: now,
      });
    }
  }

  // ---- 7. Tolerance insights ----
  if (doses.length >= 5) {
    const now = Date.now();
    const tolerance = computeToleranceState(doses, now);

    if (tolerance.chronicTolerance > 0.15) {
      insights.push({
        id: uuidv4(),
        type: 'chronic_tolerance',
        title: 'Chronic tolerance building',
        body: `Your 7-day dosing pattern suggests tolerance is developing (sensitivity at ${tolerance.sensitivityPct}%). The model shifts your EC50 up by ${Math.round((tolerance.combinedModifier - 1) * 100)}%, meaning you need higher concentrations for the same effect. A drug holiday or dose review with your prescriber could help.`,
        severity: 'caution',
        generatedAt: now.toString(),
      });
    } else if (tolerance.acuteTolerance > 0.1) {
      insights.push({
        id: uuidv4(),
        type: 'acute_tolerance',
        title: 'Within-day tolerance',
        body: `Multiple recent doses are causing acute tachyphylaxis. Your second dose today will be less effective than the first — the model accounts for this with a ${Math.round(tolerance.acuteTolerance * 100)}% EC50 shift.`,
        severity: 'info',
        generatedAt: now.toString(),
      });
    }
  }

  // ---- 8. Sleep debt insight ----
  if (sleepLogs.length >= 3) {
    const sdi = computeSleepDebtIndex(sleepLogs);
    if (sdi > 8) {
      insights.push({
        id: uuidv4(),
        type: 'sleep_debt',
        title: 'Sleep debt is high',
        body: `You have ${sdi.toFixed(1)}h of sleep debt over the last 7 days. This reduces your cognitive activation by up to ${Math.round(Math.min(30, (sdi - 6) / 22 * 30))}% — Vyvanse can't fully compensate for lost sleep. Prioritise rest to get the most from your medication.`,
        severity: 'caution',
        generatedAt: new Date().toISOString(),
      });
    } else if (sdi <= 4 && sleepLogs.length >= 5) {
      insights.push({
        id: uuidv4(),
        type: 'sleep_debt',
        title: 'Sleep is on point',
        body: `Only ${sdi.toFixed(1)}h of sleep debt this week. Well-rested brains respond better to stimulants — your CA is running at full capacity.`,
        severity: 'positive',
        generatedAt: new Date().toISOString(),
      });
    }
  }

  // ---- 9. Escalation pattern ----
  if (doses.length >= 14) {
    const now = Date.now();
    const dayMs = 24 * 3600_000;
    let thisWeekMg = 0;
    let lastWeekMg = 0;
    for (const d of doses) {
      const dt = new Date(d.takenAt).getTime();
      const daysAgo = (now - dt) / dayMs;
      if (daysAgo >= 0 && daysAgo < 7) thisWeekMg += d.doseMg;
      else if (daysAgo >= 7 && daysAgo < 14) lastWeekMg += d.doseMg;
    }
    if (lastWeekMg > 0 && thisWeekMg > lastWeekMg * 1.2) {
      const pctIncrease = Math.round(((thisWeekMg - lastWeekMg) / lastWeekMg) * 100);
      insights.push({
        id: uuidv4(),
        type: 'escalation',
        title: 'Dose escalation detected',
        body: `This week's total (${thisWeekMg}mg) is ${pctIncrease}% higher than last week (${lastWeekMg}mg). Escalation can indicate developing tolerance. Discuss with your prescriber if this trend continues.`,
        severity: 'caution',
        generatedAt: new Date().toISOString(),
      });
    }
  }

  // ---- 10. Consistency insight ----
  if (doses.length >= 7) {
    const doseTimes = doses.map((d) => {
      const t = new Date(d.takenAt);
      return t.getHours() + t.getMinutes() / 60;
    });
    const avgTime = doseTimes.reduce((a, b) => a + b, 0) / doseTimes.length;
    const variance = doseTimes.reduce((s, t) => s + Math.pow(t - avgTime, 2), 0) / doseTimes.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev < 1) {
      insights.push({
        id: uuidv4(),
        type: 'general',
        title: 'Consistent timing',
        body: `You typically take your dose around ${formatHour(avgTime)} (within about ${Math.round(stdDev * 60)} minutes). Consistent timing helps maintain steady therapeutic levels.`,
        severity: 'positive',
        generatedAt: now,
      });
    } else if (stdDev > 2.5) {
      insights.push({
        id: uuidv4(),
        type: 'general',
        title: 'Variable timing',
        body: `Your dose timing varies quite a bit (std dev: ${stdDev.toFixed(1)}h). Taking your dose at a consistent time each day can help you predict and rely on the effect pattern.`,
        severity: 'caution',
        generatedAt: now,
      });
    }
  }

  return insights.slice(0, 10);
}

// ---- Helper: Peak timing analysis ----

function analyzePeakTiming(logs: SubjectiveEntry[]): number | null {
  if (logs.length < 3) return null;

  // Find logs with high focus (7+) and see when they typically occur
  // relative to the most recent prior dose
  // For simplicity, we use the time of day as a proxy
  const highFocusHours: number[] = [];
  for (const log of logs) {
    if (log.focus >= 7) {
      const t = new Date(log.timestamp);
      highFocusHours.push(t.getHours() + t.getMinutes() / 60);
    }
  }

  if (highFocusHours.length < 2) return null;
  // This is time-of-day, not time-after-dose. Good enough for a rough insight.
  // A more precise version would compute time delta from most recent dose.
  return null; // Disable for now unless we have dose-aligned data
}

// ---- Helper: Crash pattern analysis ----

function analyzeCrashPattern(
  logs: SubjectiveEntry[],
  doses: DoseEntry[],
): { title: string; body: string; severity: 'info' | 'positive' | 'caution' } | null {
  if (logs.length < 5) return null;

  const highCrashLogs = logs.filter((l) => l.crash >= 7);
  const lowCrashLogs = logs.filter((l) => l.crash <= 3);

  if (highCrashLogs.length < 2) return null;

  const crashRate = (highCrashLogs.length / logs.length) * 100;

  // Check if high crash correlates with higher doses
  const avgDoseOnCrashDays = getAvgDoseForLogs(highCrashLogs, doses);
  const avgDoseOnGoodDays = getAvgDoseForLogs(lowCrashLogs, doses);

  if (avgDoseOnCrashDays > 0 && avgDoseOnGoodDays > 0 && avgDoseOnCrashDays > avgDoseOnGoodDays + 5) {
    return {
      title: 'Crash linked to dose',
      body: `You report worse crashes (7+/10) on days when you take higher doses (avg ${Math.round(avgDoseOnCrashDays)}mg vs ${Math.round(avgDoseOnGoodDays)}mg on good days). ${crashRate > 30 ? 'This is happening frequently.' : ''}`,
      severity: 'caution',
    };
  }

  if (crashRate > 40) {
    return {
      title: 'Frequent crashes',
      body: `You rate crash severity at 7+ in ${Math.round(crashRate)}% of your check-ins. Consider discussing dose timing or extended-release strategies with your prescriber.`,
      severity: 'caution',
    };
  }

  return null;
}

// ---- Helper: Dose-response ----

function analyzeDoseResponse(
  logs: SubjectiveEntry[],
  doses: DoseEntry[],
): { title: string; body: string; severity: 'info' | 'positive' | 'caution' } | null {
  if (logs.length < 5 || doses.length < 5) return null;

  // Group by dose amount and compute avg focus
  const doseGroups = new Map<number, number[]>();
  for (const dose of doses) {
    const date = new Date(dose.takenAt).toDateString();
    const dayLogs = logs.filter((l) => new Date(l.timestamp).toDateString() === date);
    if (dayLogs.length > 0) {
      if (!doseGroups.has(dose.doseMg)) doseGroups.set(dose.doseMg, []);
      const avgFocus = dayLogs.reduce((s, l) => s + l.focus, 0) / dayLogs.length;
      doseGroups.get(dose.doseMg)!.push(avgFocus);
    }
  }

  if (doseGroups.size < 2) return null;

  const entries = Array.from(doseGroups.entries())
    .map(([dose, focuses]) => ({
      dose,
      avgFocus: focuses.reduce((a, b) => a + b, 0) / focuses.length,
      n: focuses.length,
    }))
    .filter((e) => e.n >= 2)
    .sort((a, b) => a.dose - b.dose);

  if (entries.length < 2) return null;

  const lowest = entries[0];
  const highest = entries[entries.length - 1];

  if (highest.avgFocus > lowest.avgFocus + 1) {
    return {
      title: 'Higher dose, better focus',
      body: `On ${highest.dose}mg days, your average focus is ${highest.avgFocus.toFixed(1)}/10 vs ${lowest.avgFocus.toFixed(1)}/10 on ${lowest.dose}mg days. The higher dose appears to work better for you.`,
      severity: 'info',
    };
  } else if (lowest.avgFocus > highest.avgFocus + 1) {
    return {
      title: 'Lower dose might be enough',
      body: `Interestingly, your focus is actually better on ${lowest.dose}mg (${lowest.avgFocus.toFixed(1)}/10) than on ${highest.dose}mg (${highest.avgFocus.toFixed(1)}/10). The higher dose may be causing overstimulation.`,
      severity: 'caution',
    };
  }

  return null;
}

// ---- Helper: Food effect ----

function analyzeFoodEffect(
  logs: SubjectiveEntry[],
  doses: DoseEntry[],
): { title: string; body: string; severity: 'info' | 'positive' | 'caution' } | null {
  const fedDoses = doses.filter((d) => d.withFood);
  const fastingDoses = doses.filter((d) => !d.withFood);

  if (fedDoses.length < 3 || fastingDoses.length < 3) return null;

  const avgFocusFed = getAvgMetricForDoses(fedDoses, logs, 'focus');
  const avgFocusFasting = getAvgMetricForDoses(fastingDoses, logs, 'focus');
  const avgCrashFed = getAvgMetricForDoses(fedDoses, logs, 'crash');
  const avgCrashFasting = getAvgMetricForDoses(fastingDoses, logs, 'crash');

  if (avgFocusFed === null || avgFocusFasting === null) return null;

  const focusDiff = avgFocusFed - avgFocusFasting;
  const crashDiff = (avgCrashFed ?? 0) - (avgCrashFasting ?? 0);

  if (Math.abs(focusDiff) > 0.5 || Math.abs(crashDiff) > 0.5) {
    const betterWith = focusDiff > 0 ? 'food' : 'empty stomach';
    return {
      title: 'Food matters',
      body: `Your focus averages ${focusDiff > 0 ? 'higher' : 'lower'} when you take Vyvanse with food (${avgFocusFed!.toFixed(1)}/10) vs fasting (${avgFocusFasting!.toFixed(1)}/10). ${crashDiff < -0.5 ? 'Crashes are also milder with food.' : crashDiff > 0.5 ? 'Though crashes may be slightly worse with food.' : ''} Taking it on a ${betterWith} seems to work better for you.`,
      severity: 'info',
    };
  }

  return null;
}

// ---- Helper: Weekly trend (tolerance) ----

function analyzeWeeklyTrend(
  dayScores: DayScore[],
): { title: string; body: string; severity: 'info' | 'positive' | 'caution' } | null {
  const scored = dayScores.filter((d) => d.entryCount > 0);
  if (scored.length < 14) return null; // need 2+ weeks

  // Split into first half and second half
  const mid = Math.floor(scored.length / 2);
  const firstHalf = scored.slice(0, mid);
  const secondHalf = scored.slice(mid);

  const avg1 = firstHalf.reduce((s, d) => s + d.avgFocus, 0) / firstHalf.length;
  const avg2 = secondHalf.reduce((s, d) => s + d.avgFocus, 0) / secondHalf.length;

  const diff = avg2 - avg1;

  if (diff < -1) {
    return {
      title: 'Focus declining over time',
      body: `Your average focus has dropped from ${avg1.toFixed(1)}/10 in earlier weeks to ${avg2.toFixed(1)}/10 more recently. This could suggest developing tolerance. Worth discussing with your prescriber.`,
      severity: 'caution',
    };
  } else if (diff > 1) {
    return {
      title: 'Focus improving over time',
      body: `Your average focus has improved from ${avg1.toFixed(1)}/10 to ${avg2.toFixed(1)}/10 recently. The medication (and perhaps your habits) seem to be working well.`,
      severity: 'positive',
    };
  }

  return null;
}

// ---- Utilities ----

function getAvgDoseForLogs(logs: SubjectiveEntry[], doses: DoseEntry[]): number {
  const doseMgs: number[] = [];
  for (const log of logs) {
    const logDate = new Date(log.timestamp).toDateString();
    const dayDoses = doses.filter((d) => new Date(d.takenAt).toDateString() === logDate);
    for (const d of dayDoses) doseMgs.push(d.doseMg);
  }
  return doseMgs.length > 0 ? doseMgs.reduce((a, b) => a + b, 0) / doseMgs.length : 0;
}

function getAvgMetricForDoses(
  doses: DoseEntry[],
  logs: SubjectiveEntry[],
  metric: 'focus' | 'mood' | 'appetite' | 'crash',
): number | null {
  const values: number[] = [];
  for (const dose of doses) {
    const doseDate = new Date(dose.takenAt).toDateString();
    const dayLogs = logs.filter((l) => new Date(l.timestamp).toDateString() === doseDate);
    for (const log of dayLogs) {
      values.push(log[metric]);
    }
  }
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function formatHour(h: number): string {
  const hr = Math.floor(h);
  const min = Math.round((h - hr) * 60);
  const ampm = hr >= 12 ? 'PM' : 'AM';
  const display = hr > 12 ? hr - 12 : hr === 0 ? 12 : hr;
  return `${display}:${String(min).padStart(2, '0')} ${ampm}`;
}
