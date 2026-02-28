// ============================================
// VyTrack — Pharmacokinetic Engine (Bateman)
// ============================================
//
// One-compartment oral absorption model (Bateman function)
// per dose, summed for multiple doses.
//
// C(t) = (F·D·mwRatio / Vd) · (ka/(ka-ke)) · (e^(-ke·t) - e^(-ka·t))
//
// Parameters from published Vyvanse clinical PK:
//   Tmax (fasting) ≈ 3.8h  → ka = 0.85 h⁻¹
//   Tmax (fed)     ≈ 4.7h  → ka = 0.50 h⁻¹
//   t½  (d-AMP)   ≈ 11h   → ke = ln(2)/11
//
// Keeps full tolerance, sleep debt, crash risk, and risk flag logic.

import {
  CurvePoint,
  EffectStatus,
  TherapeuticZone,
  DoseEntry,
  SleepEntry,
  ToleranceState,
  CrashRisk,
  CrashRiskLevel,
  RiskFlags,
  ZONE_COLORS,
  ZONE_LABELS,
} from './types';

// ============================================
// PK Parameters
// ============================================

export const PK = {
  kaFasting: 0.85,       // h⁻¹ — absorption rate fasting  (Tmax ≈ 3.8h)
  kaFed:     0.50,       // h⁻¹ — absorption rate with food (Tmax ≈ 4.7h)
  F:         0.96,       // oral bioavailability
  mwRatio:   0.5135,     // d-AMP / LDX molecular weight ratio
  ke:        Math.log(2) / 11,  // h⁻¹ — elimination rate (t½ = 11h)
  vdPerKg:   3.5,        // L/kg — volume of distribution
  EC50:      30,         // ng/mL — plasma concentration for 50% effect
  gamma:     1.5,        // Hill coefficient
};

// ============================================
// Tolerance Parameters
// ============================================

export const TOLERANCE = {
  acuteHalfLifeH:    4,
  acuteCoeff:        0.012,
  acuteMax:          0.35,
  chronicWindowDays: 7,
  chronicCoeff:      0.004,
  chronicMax:        0.45,
  maxTotalShift:     0.6,
};

export const ACTIVATION = {
  centralFraction:       0.65,
  peripheralFraction:    0.35,
  peripheralEC50Ratio:   0.7,
  peripheralGamma:       1.2,
  sleepDebtThresholdH:   6,
  sleepDebtMaxPenalty:   0.30,
  idealSleepH:           8,
};

// ============================================
// Zone classification
// ============================================

export function getZone(effectPct: number): TherapeuticZone {
  if (effectPct >= 85) return 'supratherapeutic';
  if (effectPct >= 65) return 'peak';
  if (effectPct >= 40) return 'therapeutic';
  if (effectPct >= 15) return 'subtherapeutic';
  return 'baseline';
}

export function getZoneColor(zone: TherapeuticZone): string {
  return ZONE_COLORS[zone];
}

export function getZoneLabel(zone: TherapeuticZone): string {
  return ZONE_LABELS[zone];
}

// ============================================
// Bateman function — plasma conc for one dose
// ============================================

function batemanConc(
  tHours: number,     // hours since dose
  doseMg: number,
  withFood: boolean,
  weightKg: number,
): number {
  if (tHours <= 0) return 0;
  const ka = withFood ? PK.kaFed : PK.kaFasting;
  const ke = PK.ke;
  if (Math.abs(ka - ke) < 1e-9) return 0; // degenerate case
  const Vd = PK.vdPerKg * weightKg; // L
  // ng/mL = (mg * 1000) / L
  const cMax = (PK.F * PK.mwRatio * doseMg * 1000) / Vd;
  return cMax * (ka / (ka - ke)) * (Math.exp(-ke * tHours) - Math.exp(-ka * tHours));
}

// ============================================
// Tolerance
// ============================================

export function computeAcuteTolerance(doses: DoseEntry[], timeMs: number): number {
  const keAcute = Math.log(2) / TOLERANCE.acuteHalfLifeH;
  let exposure = 0;
  for (const d of doses) {
    const hoursAgo = (timeMs - new Date(d.takenAt).getTime()) / 3_600_000;
    if (hoursAgo < 0 || hoursAgo > 24) continue;
    exposure += d.doseMg * PK.mwRatio * PK.F * Math.exp(-keAcute * hoursAgo);
  }
  return Math.min(TOLERANCE.acuteMax, TOLERANCE.acuteCoeff * exposure);
}

export function computeChronicTolerance(doses: DoseEntry[], timeMs: number): number {
  const dayMs = 24 * 3_600_000;
  let totalDampEquiv = 0;
  for (let day = 0; day < TOLERANCE.chronicWindowDays; day++) {
    const dayStart = timeMs - (day + 1) * dayMs;
    const dayEnd   = timeMs - day * dayMs;
    for (const d of doses) {
      const dt = new Date(d.takenAt).getTime();
      if (dt >= dayStart && dt < dayEnd) {
        totalDampEquiv += d.doseMg * PK.mwRatio * PK.F;
      }
    }
  }
  const avgDaily = totalDampEquiv / TOLERANCE.chronicWindowDays;
  return Math.min(TOLERANCE.chronicMax, TOLERANCE.chronicCoeff * avgDaily);
}

export function computeToleranceState(doses: DoseEntry[], timeMs: number): ToleranceState {
  const acute    = computeAcuteTolerance(doses, timeMs);
  const chronic  = computeChronicTolerance(doses, timeMs);
  const combined = Math.min(TOLERANCE.maxTotalShift, acute + chronic);
  const modifier = 1 + combined;
  const sensitivityPct = Math.round((1 - combined / TOLERANCE.maxTotalShift) * 100);
  return {
    acuteTolerance:    Math.round(acute    * 1000) / 1000,
    chronicTolerance:  Math.round(chronic  * 1000) / 1000,
    combinedModifier:  Math.round(modifier * 1000) / 1000,
    sensitivityPct:    Math.max(0, Math.min(100, sensitivityPct)),
  };
}

// ============================================
// Sleep debt
// ============================================

export function computeSleepDebtIndex(sleepLogs: SleepEntry[]): number {
  const now = new Date();
  let totalDeficit = 0;
  for (let daysAgo = 0; daysAgo < 7; daysAgo++) {
    const d = new Date(now);
    d.setDate(now.getDate() - daysAgo);
    const dateStr = d.toISOString().split('T')[0];
    const entry = sleepLogs.find((s) => s.date === dateStr);
    if (entry) totalDeficit += Math.max(0, ACTIVATION.idealSleepH - entry.hoursSlept);
  }
  return Math.round(totalDeficit * 10) / 10;
}

function sleepDebtPenalty(sdi: number): number {
  if (sdi <= ACTIVATION.sleepDebtThresholdH) return 1.0;
  const excess    = sdi - ACTIVATION.sleepDebtThresholdH;
  const maxExcess = 28  - ACTIVATION.sleepDebtThresholdH;
  return 1 - ACTIVATION.sleepDebtMaxPenalty * Math.min(1, excess / maxExcess);
}

// ============================================
// Crash risk
// ============================================

export function computeCrashRisk(
  curve: CurvePoint[],
  idx: number,
  tolerance: ToleranceState,
  sdi: number,
  doses: DoseEntry[],
  timeMs: number,
): CrashRisk {
  const point = curve[idx];
  const declineContrib = point.crashRate < -2
    ? Math.min(1, Math.abs(point.crashRate) / 15) : 0;
  const sleepContrib = Math.min(1, Math.max(0, sdi - 4) / 16);
  const tolContrib   = Math.min(1, (tolerance.combinedModifier - 1) / TOLERANCE.maxTotalShift);

  let lateContrib = 0;
  if (new Date(timeMs).getHours() >= 20) {
    const hasLateDose = doses.some((d) => {
      const dh = new Date(d.takenAt).getHours();
      const dt = new Date(d.takenAt).getTime();
      return dh >= 14 && (timeMs - dt) < 12 * 3_600_000;
    });
    if (hasLateDose) lateContrib = 0.6;
  }

  const score = Math.min(1, Math.max(0,
    declineContrib * 0.4 + sleepContrib * 0.2 + tolContrib * 0.2 + lateContrib * 0.2
  ));

  let level: CrashRiskLevel = 'low';
  if (score >= 0.6) level = 'high';
  else if (score >= 0.3) level = 'moderate';

  return {
    level,
    score: Math.round(score * 100) / 100,
    factors: {
      declineRate: Math.round(declineContrib * 100) / 100,
      sleepDebt:   Math.round(sleepContrib   * 100) / 100,
      tolerance:   Math.round(tolContrib     * 100) / 100,
      lateDosing:  Math.round(lateContrib    * 100) / 100,
    },
  };
}

// ============================================
// Risk flags
// ============================================

export function computeRiskFlags(
  doses: DoseEntry[],
  timeMs: number,
  sdi: number,
  tolerance: ToleranceState,
  currentEffectPct: number,
): RiskFlags {
  const flags: RiskFlags = {
    overstimulation:   false,
    sleepDisruption:   false,
    escalationPattern: false,
    doseStacking:      false,
    activeFlags:       [],
  };

  const today       = new Date(timeMs).toDateString();
  const todayDoses  = doses.filter((d) => new Date(d.takenAt).toDateString() === today);
  const todayTotal  = todayDoses.reduce((s, d) => s + d.doseMg, 0) * PK.mwRatio * PK.F;

  if (todayTotal > 70 || currentEffectPct > 95) {
    flags.overstimulation = true;
    flags.activeFlags.push('Overstimulation risk');
  }

  if (todayDoses.some((d) => new Date(d.takenAt).getHours() >= 14)) {
    flags.sleepDisruption = true;
    flags.activeFlags.push('Late dose — sleep risk');
  }

  const dayMs = 24 * 3_600_000;
  let thisWeekMg = 0, lastWeekMg = 0;
  for (const d of doses) {
    const daysAgo = (timeMs - new Date(d.takenAt).getTime()) / dayMs;
    if (daysAgo >= 0 && daysAgo < 7)  thisWeekMg += d.doseMg;
    if (daysAgo >= 7 && daysAgo < 14) lastWeekMg += d.doseMg;
  }
  if (lastWeekMg > 0 && thisWeekMg > lastWeekMg * 1.2) {
    flags.escalationPattern = true;
    flags.activeFlags.push('Escalation pattern');
  }

  outer: for (let i = 0; i < todayDoses.length; i++) {
    for (let j = i + 1; j < todayDoses.length; j++) {
      const gapH = Math.abs(
        new Date(todayDoses[i].takenAt).getTime() - new Date(todayDoses[j].takenAt).getTime()
      ) / 3_600_000;
      if (gapH < 3) {
        flags.doseStacking = true;
        flags.activeFlags.push('Doses stacked (<3h apart)');
        break outer;
      }
    }
  }

  return flags;
}

// ============================================
// Sigmoid Emax
// ============================================

function sigmoidEmax(c: number, ec50: number, gamma: number): number {
  if (c <= 0) return 0;
  const cG = Math.pow(c, gamma);
  const eG = Math.pow(ec50, gamma);
  return 100 * cG / (eG + cG);
}

// ============================================
// Main simulation — analytic Bateman sum
// ============================================

export function simulatePKPD(
  doses: DoseEntry[],
  weightKg: number,
  ke0: number,           // kept in signature for API compat, not used in Bateman
  startMs: number,
  endMs: number,
  resolutionMin: number  = 3,
  sleepLogs: SleepEntry[] = [],
): CurvePoint[] {
  const totalHours   = (endMs - startMs) / 3_600_000;
  const outputStepH  = resolutionMin / 60;
  const simMidMs     = (startMs + endMs) / 2;

  const chronicTol   = computeChronicTolerance(doses, simMidMs);
  const sdi          = computeSleepDebtIndex(sleepLogs);
  const penaltySleep = sleepDebtPenalty(sdi);

  // Only include doses within 48h before start through end
  const relevantDoses = doses.filter((d) => {
    const hoursFromStart = (new Date(d.takenAt).getTime() - startMs) / 3_600_000;
    return hoursFromStart >= -48 && hoursFromStart <= totalHours;
  });

  const points: CurvePoint[] = [];
  const nSteps = Math.ceil(totalHours / outputStepH);

  for (let step = 0; step <= nSteps; step++) {
    const currentH   = step * outputStepH;
    const timestampMs = startMs + currentH * 3_600_000;

    // Sum Bateman contributions from all relevant doses
    let plasmaConc = 0;
    for (const d of relevantDoses) {
      const tH = (timestampMs - new Date(d.takenAt).getTime()) / 3_600_000;
      plasmaConc += batemanConc(tH, d.doseMg, d.withFood, weightKg);
    }
    plasmaConc = Math.max(0, plasmaConc);

    // Tolerance-adjusted EC50
    const acuteTol       = computeAcuteTolerance(doses, timestampMs);
    const combinedTol    = Math.min(TOLERANCE.maxTotalShift, acuteTol + chronicTol);
    const adjustedEC50   = PK.EC50 * (1 + combinedTol);

    // Central activation (cognitive)
    const ca = sigmoidEmax(plasmaConc, adjustedEC50, PK.gamma) * penaltySleep;

    // Peripheral activation (sympathetic)
    const peripheralEC50 = adjustedEC50 * ACTIVATION.peripheralEC50Ratio;
    const pa = sigmoidEmax(plasmaConc, peripheralEC50, ACTIVATION.peripheralGamma);

    const effectPct = ca;
    const zone      = getZone(effectPct);

    points.push({
      timestamp:            timestampMs,
      hoursFromNow:         (timestampMs - Date.now()) / 3_600_000,
      plasmaConc:           Math.round(plasmaConc * 100) / 100,
      effectConc:           Math.round(plasmaConc * 100) / 100, // same as plasma in 1-cpt
      effectPct:            Math.round(effectPct  * 10)  / 10,
      centralActivation:    Math.round(ca * 10)          / 10,
      peripheralActivation: Math.round(pa * 10)          / 10,
      zone,
      crashRate: 0,
    });
  }

  // Post-process: crash rates + crash risk
  const toleranceState = computeToleranceState(doses, simMidMs);
  for (let i = 1; i < points.length; i++) {
    const dtH = (points[i].timestamp - points[i - 1].timestamp) / 3_600_000;
    if (dtH > 0) {
      points[i].crashRate = Math.round(
        ((points[i].effectPct - points[i - 1].effectPct) / dtH) * 10
      ) / 10;
    }
    points[i].crashRisk = computeCrashRisk(points, i, toleranceState, sdi, doses, points[i].timestamp);
  }
  if (points.length > 0) {
    points[0].crashRate  = 0;
    points[0].crashRisk  = { level: 'low', score: 0, factors: { declineRate: 0, sleepDebt: 0, tolerance: 0, lateDosing: 0 } };
  }

  return points;
}

// ============================================
// Current effect status
// ============================================

export function getCurrentEffectStatus(
  doses: DoseEntry[],
  weightKg: number,
  ke0: number,
  sleepLogs: SleepEntry[] = [],
): EffectStatus {
  const now    = Date.now();
  const startMs = now - 7 * 24 * 3_600_000;
  const endMs   = now + 18 * 3_600_000;   // 18h forward — safely captures any peak
  const curve   = simulatePKPD(doses, weightKg, ke0, startMs, endMs, 2, sleepLogs);

  if (curve.length === 0) return emptyStatus();

  // Current point
  let currentIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < curve.length; i++) {
    const diff = Math.abs(curve[i].timestamp - now);
    if (diff < minDiff) { minDiff = diff; currentIdx = i; }
  }

  // Peak (only look forward from now)
  let peakIdx = currentIdx;
  for (let i = currentIdx; i < curve.length; i++) {
    if (curve[i].effectPct > curve[peakIdx].effectPct) peakIdx = i;
  }

  const current         = curve[currentIdx];
  const peakTimestamp   = curve[peakIdx].timestamp;
  const timeToPeakHours = (peakTimestamp - now) / 3_600_000;

  // Time until subtherapeutic
  let timeToSubTherapeutic = 0;
  for (let i = currentIdx; i < curve.length; i++) {
    if (curve[i].effectPct < 15) {
      timeToSubTherapeutic = (curve[i].timestamp - now) / 3_600_000;
      break;
    }
    if (i === curve.length - 1) {
      timeToSubTherapeutic = (curve[i].timestamp - now) / 3_600_000;
    }
  }

  // Crash score
  let crashScore = 0;
  if (current.crashRate < -1 && current.effectPct > 20) {
    const recentPeak = Math.max(
      ...curve.filter((p) => p.timestamp >= now - 4 * 3_600_000 && p.timestamp <= now).map((p) => p.effectPct)
    );
    crashScore = Math.min(10, ((recentPeak - current.effectPct) / 50) * (Math.abs(current.crashRate) / 5) * 10);
    crashScore = Math.round(crashScore * 10) / 10;
  }

  const toleranceState = computeToleranceState(doses, now);
  const sdi            = computeSleepDebtIndex(sleepLogs);
  const crashRisk      = current.crashRisk ?? { level: 'low' as const, score: 0, factors: { declineRate: 0, sleepDebt: 0, tolerance: 0, lateDosing: 0 } };
  const riskFlags      = computeRiskFlags(doses, now, sdi, toleranceState, current.effectPct);

  return {
    currentLevel:              Math.round(current.effectPct            * 10) / 10,
    centralActivation:         Math.round(current.centralActivation    * 10) / 10,
    peripheralActivation:      Math.round(current.peripheralActivation * 10) / 10,
    zone:                      current.zone,
    zoneColor:                 getZoneColor(current.zone),
    zoneLabel:                 getZoneLabel(current.zone),
    peakTimestamp:             curve[peakIdx].effectPct > 5 ? peakTimestamp : null,
    timeToPeakHours:           Math.round(timeToPeakHours        * 10) / 10,
    timeToSubTherapeuticHours: Math.round(timeToSubTherapeutic   * 10) / 10,
    isActive:                  current.effectPct > 5 || current.plasmaConc > 1,
    crashScore,
    crashRisk,
    plasmaConc:                current.plasmaConc,
    effectConc:                current.effectConc,
    toleranceState,
    sleepDebtIndex:            sdi,
    riskFlags,
  };
}

function emptyStatus(): EffectStatus {
  return {
    currentLevel: 0, centralActivation: 0, peripheralActivation: 0,
    zone: 'baseline', zoneColor: ZONE_COLORS.baseline, zoneLabel: ZONE_LABELS.baseline,
    peakTimestamp: null, timeToPeakHours: 0, timeToSubTherapeuticHours: 0,
    isActive: false, crashScore: 0,
    crashRisk: { level: 'low', score: 0, factors: { declineRate: 0, sleepDebt: 0, tolerance: 0, lateDosing: 0 } },
    plasmaConc: 0, effectConc: 0,
    toleranceState: { acuteTolerance: 0, chronicTolerance: 0, combinedModifier: 1, sensitivityPct: 100 },
    sleepDebtIndex: 0,
    riskFlags: { overstimulation: false, sleepDisruption: false, escalationPattern: false, doseStacking: false, activeFlags: [] },
  };
}

// ============================================
// Convenience exports
// ============================================

export function getCurve24h(
  doses: DoseEntry[], weightKg: number, ke0: number, sleepLogs: SleepEntry[] = [],
): CurvePoint[] {
  const now = Date.now();
  return simulatePKPD(doses, weightKg, ke0, now - 18 * 3_600_000, now + 8 * 3_600_000, 3, sleepLogs);
}

export function getCurveForDay(
  doses: DoseEntry[], weightKg: number, ke0: number, date: Date, sleepLogs: SleepEntry[] = [],
): CurvePoint[] {
  const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
  const dayEnd   = new Date(date); dayEnd.setHours(23, 59, 59, 999);
  const simStart = dayStart.getTime() - 24 * 3_600_000;
  const full = simulatePKPD(doses, weightKg, ke0, simStart, dayEnd.getTime(), 3, sleepLogs);
  return full.filter((p) => p.timestamp >= dayStart.getTime());
}

export function getEffectAtTime(
  doses: DoseEntry[], weightKg: number, ke0: number, timestamp: number, sleepLogs: SleepEntry[] = [],
): { effectPct: number; zone: TherapeuticZone; plasmaConc: number; effectConc: number } {
  const startMs = timestamp - 7 * 24 * 3_600_000;
  const curve   = simulatePKPD(doses, weightKg, ke0, startMs, timestamp + 60_000, 1, sleepLogs);
  if (curve.length === 0) return { effectPct: 0, zone: 'baseline', plasmaConc: 0, effectConc: 0 };
  let best = curve[0], bestDiff = Infinity;
  for (const p of curve) {
    const diff = Math.abs(p.timestamp - timestamp);
    if (diff < bestDiff) { bestDiff = diff; best = p; }
  }
  return { effectPct: best.effectPct, zone: best.zone, plasmaConc: best.plasmaConc, effectConc: best.effectConc };
}
