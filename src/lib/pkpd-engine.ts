// ============================================
// VyTrack — Pharmacokinetic/Pharmacodynamic Engine
// ============================================
//
// Vyvanse (lisdexamfetamine) → d-amphetamine prodrug model
//
// Model overview:
//   1. Oral absorption of LDX from gut (first-order, ka)
//   2. Saturable enzymatic conversion of LDX → dAMP in RBCs (Michaelis-Menten)
//   3. First-order elimination of dAMP (ke)
//   4. Effect compartment linked to plasma dAMP via ke0
//   5. Sigmoid Emax for effect normalization (0-100%)
//
// Key feature: dose-dependent Tmax from saturable conversion
//   Low dose (20-30mg) → Tmax ~3.5h
//   High dose (50-70mg) → Tmax ~4.5h
//
// Parameters calibrated against published clinical PK data (FDA Vyvanse label,
// Krishnan & Stark 2008, Ermer et al. 2010)

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
  // Absorption
  kaFasting: 1.2,        // h⁻¹  — LDX absorption rate (fasting)
  kaFed: 0.7,            // h⁻¹  — LDX absorption rate (with food, ~40% slower)
  F: 0.96,               // oral bioavailability

  // Prodrug conversion (Michaelis-Menten, amount-based)
  Vmax: 10,              // mg/h  — max enzymatic conversion rate
  Km: 8,                 // mg    — LDX amount at half-Vmax

  // Molecular weight ratio: d-amphetamine / lisdexamfetamine
  // 135.21 / 263.38 = 0.5135
  mwRatio: 0.5135,

  // d-amphetamine disposition
  halfLife: 11,           // hours
  ke: Math.log(2) / 11,  // h⁻¹  — elimination rate constant (~0.063)
  vdPerKg: 3.5,          // L/kg  — volume of distribution

  // Effect compartment
  ke0Default: 0.3,       // h⁻¹  — effect site equilibration rate

  // Pharmacodynamics (Sigmoid Emax)
  EC50: 30,              // ng/mL — concentration for 50% effect
  gamma: 1.5,            // Hill coefficient
};

// ============================================
// Tolerance & Activation Parameters
// ============================================

export const TOLERANCE = {
  // Acute tolerance: within-day tachyphylaxis
  acuteHalfLifeH: 4,           // acute tolerance decays with 4h half-life
  acuteCoeff: 0.012,            // per-mg contribution to acute tolerance
  acuteMax: 0.35,               // max acute tolerance factor (35% EC50 shift)

  // Chronic tolerance: 7-day rolling average
  chronicWindowDays: 7,
  chronicCoeff: 0.004,          // per-mg-per-day contribution
  chronicMax: 0.45,             // max chronic tolerance factor (45% EC50 shift)

  // Combined
  maxTotalShift: 0.6,           // total EC50 can shift at most 60% upward
};

export const ACTIVATION = {
  // Central (cognitive) vs Peripheral (sympathetic) split
  // At effect site, dAMP activates both pathways but with different sensitivity
  centralFraction: 0.65,        // 65% of effect is cognitive
  peripheralFraction: 0.35,     // 35% is sympathetic
  peripheralEC50Ratio: 0.7,     // peripheral responds at lower concentrations
  peripheralGamma: 1.2,         // slightly less steep Hill curve for peripheral

  // Sleep debt penalty applied to central activation only
  sleepDebtThresholdH: 6,       // below 6h deficit, no penalty
  sleepDebtMaxPenalty: 0.30,    // max 30% reduction in CA at extreme debt
  idealSleepH: 8,               // reference "full night"
};

// ============================================
// Therapeutic zone classification
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
// Tolerance Computation
// ============================================

/**
 * Acute tolerance: cumulative dAMP-equivalent exposure in the last 24h,
 * weighted by exponential decay (recent doses count more).
 */
export function computeAcuteTolerance(doses: DoseEntry[], timeMs: number): number {
  const keAcute = Math.log(2) / TOLERANCE.acuteHalfLifeH;
  let exposure = 0;
  for (const d of doses) {
    const doseTimeMs = new Date(d.takenAt).getTime();
    const hoursAgo = (timeMs - doseTimeMs) / 3600_000;
    if (hoursAgo < 0 || hoursAgo > 24) continue;
    const dampEquiv = d.doseMg * PK.mwRatio * PK.F;
    exposure += dampEquiv * Math.exp(-keAcute * hoursAgo);
  }
  return Math.min(TOLERANCE.acuteMax, TOLERANCE.acuteCoeff * exposure);
}

/**
 * Chronic tolerance: 7-day rolling average daily dAMP-equivalent dose.
 * Pre-computed once per simulation call (day-level granularity).
 */
export function computeChronicTolerance(doses: DoseEntry[], timeMs: number): number {
  const dayMs = 24 * 3600_000;
  let totalDampEquiv = 0;
  let daysWithDoses = 0;
  for (let day = 0; day < TOLERANCE.chronicWindowDays; day++) {
    const dayStart = timeMs - (day + 1) * dayMs;
    const dayEnd = timeMs - day * dayMs;
    let dayTotal = 0;
    for (const d of doses) {
      const dt = new Date(d.takenAt).getTime();
      if (dt >= dayStart && dt < dayEnd) {
        dayTotal += d.doseMg * PK.mwRatio * PK.F;
      }
    }
    if (dayTotal > 0) {
      totalDampEquiv += dayTotal;
      daysWithDoses++;
    }
  }
  const avgDaily = daysWithDoses > 0 ? totalDampEquiv / TOLERANCE.chronicWindowDays : 0;
  return Math.min(TOLERANCE.chronicMax, TOLERANCE.chronicCoeff * avgDaily);
}

/**
 * Combined tolerance modifier → shifts EC50 upward.
 * Returns ToleranceState with all components.
 */
export function computeToleranceState(doses: DoseEntry[], timeMs: number): ToleranceState {
  const acute = computeAcuteTolerance(doses, timeMs);
  const chronic = computeChronicTolerance(doses, timeMs);
  const combined = Math.min(TOLERANCE.maxTotalShift, acute + chronic);
  const modifier = 1 + combined; // EC50 multiplier (>1 = more tolerant)
  const sensitivityPct = Math.round((1 - combined / TOLERANCE.maxTotalShift) * 100);
  return {
    acuteTolerance: Math.round(acute * 1000) / 1000,
    chronicTolerance: Math.round(chronic * 1000) / 1000,
    combinedModifier: Math.round(modifier * 1000) / 1000,
    sensitivityPct: Math.max(0, Math.min(100, sensitivityPct)),
  };
}

// ============================================
// Sleep Debt Index
// ============================================

/**
 * Compute sleep debt index: total hours of deficit from ideal (8h)
 * over the last 7 nights. Range: 0 (perfect) to ~28 (no sleep at all).
 */
export function computeSleepDebtIndex(sleepLogs: SleepEntry[]): number {
  const now = new Date();
  let totalDeficit = 0;
  let nightsCovered = 0;

  for (let daysAgo = 0; daysAgo < 7; daysAgo++) {
    const checkDate = new Date(now);
    checkDate.setDate(now.getDate() - daysAgo);
    const dateStr = checkDate.toISOString().split('T')[0];

    const entry = sleepLogs.find((s) => s.date === dateStr);
    if (entry) {
      totalDeficit += Math.max(0, ACTIVATION.idealSleepH - entry.hoursSlept);
      nightsCovered++;
    } else {
      // Assume ideal sleep for unlogged nights (don't penalize missing data)
    }
  }

  return Math.round(totalDeficit * 10) / 10;
}

/**
 * Sleep debt penalty on central activation.
 * Returns a multiplier 0.7-1.0 applied to CA.
 */
function sleepDebtPenalty(sdi: number): number {
  if (sdi <= ACTIVATION.sleepDebtThresholdH) return 1.0;
  const excess = sdi - ACTIVATION.sleepDebtThresholdH;
  const maxExcess = 28 - ACTIVATION.sleepDebtThresholdH; // theoretical max
  const penalty = ACTIVATION.sleepDebtMaxPenalty * Math.min(1, excess / maxExcess);
  return 1 - penalty;
}

// ============================================
// Crash Risk Computation
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

  // Factor 1: decline rate (how fast effect is dropping)
  let declineContrib = 0;
  if (point.crashRate < -2) {
    declineContrib = Math.min(1, Math.abs(point.crashRate) / 15);
  }

  // Factor 2: sleep debt amplifies crash
  const sleepContrib = Math.min(1, Math.max(0, sdi - 4) / 16);

  // Factor 3: tolerance (higher tolerance = harder crash)
  const tolContrib = Math.min(1, (tolerance.combinedModifier - 1) / TOLERANCE.maxTotalShift);

  // Factor 4: late dosing (dose after 2pm → crash hits during sleep pressure)
  let lateContrib = 0;
  const hour = new Date(timeMs).getHours();
  if (hour >= 20) {
    // Evening: check if any dose was taken after 2pm
    const lateDoses = doses.filter((d) => {
      const dh = new Date(d.takenAt).getHours();
      const dt = new Date(d.takenAt).getTime();
      return dh >= 14 && (timeMs - dt) < 12 * 3600_000;
    });
    if (lateDoses.length > 0) lateContrib = 0.6;
  }

  const score = declineContrib * 0.4 + sleepContrib * 0.2 + tolContrib * 0.2 + lateContrib * 0.2;
  const clampedScore = Math.min(1, Math.max(0, score));

  let level: CrashRiskLevel = 'low';
  if (clampedScore >= 0.6) level = 'high';
  else if (clampedScore >= 0.3) level = 'moderate';

  return {
    level,
    score: Math.round(clampedScore * 100) / 100,
    factors: {
      declineRate: Math.round(declineContrib * 100) / 100,
      sleepDebt: Math.round(sleepContrib * 100) / 100,
      tolerance: Math.round(tolContrib * 100) / 100,
      lateDosing: Math.round(lateContrib * 100) / 100,
    },
  };
}

// ============================================
// Risk Flags
// ============================================

export function computeRiskFlags(
  doses: DoseEntry[],
  timeMs: number,
  sdi: number,
  tolerance: ToleranceState,
  currentEffectPct: number,
): RiskFlags {
  const flags: RiskFlags = {
    overstimulation: false,
    sleepDisruption: false,
    escalationPattern: false,
    doseStacking: false,
    activeFlags: [],
  };

  const today = new Date(timeMs).toDateString();
  const todayDoses = doses.filter((d) => new Date(d.takenAt).toDateString() === today);
  const todayTotalMg = todayDoses.reduce((s, d) => s + d.doseMg, 0);
  const todayDampEquiv = todayTotalMg * PK.mwRatio * PK.F;

  // Overstimulation: daily dAMP-equivalent > 70mg (≈140mg Vyvanse) or effect > 95%
  if (todayDampEquiv > 70 || currentEffectPct > 95) {
    flags.overstimulation = true;
    flags.activeFlags.push('Overstimulation risk');
  }

  // Sleep disruption: dose after 2pm with predicted effect extending past 11pm
  const lateDoses = todayDoses.filter((d) => new Date(d.takenAt).getHours() >= 14);
  if (lateDoses.length > 0) {
    flags.sleepDisruption = true;
    flags.activeFlags.push('Late dose — sleep risk');
  }

  // Escalation: compare this week's total vs last week
  const dayMs = 24 * 3600_000;
  let thisWeekMg = 0;
  let lastWeekMg = 0;
  for (const d of doses) {
    const dt = new Date(d.takenAt).getTime();
    const daysAgo = (timeMs - dt) / dayMs;
    if (daysAgo >= 0 && daysAgo < 7) thisWeekMg += d.doseMg;
    else if (daysAgo >= 7 && daysAgo < 14) lastWeekMg += d.doseMg;
  }
  if (lastWeekMg > 0 && thisWeekMg > lastWeekMg * 1.2) {
    flags.escalationPattern = true;
    flags.activeFlags.push('Escalation pattern');
  }

  // Dose stacking: 2+ doses within 3h
  for (let i = 0; i < todayDoses.length; i++) {
    for (let j = i + 1; j < todayDoses.length; j++) {
      const gap = Math.abs(
        new Date(todayDoses[i].takenAt).getTime() - new Date(todayDoses[j].takenAt).getTime()
      ) / 3600_000;
      if (gap < 3) {
        flags.doseStacking = true;
        flags.activeFlags.push('Doses stacked (<3h apart)');
        break;
      }
    }
    if (flags.doseStacking) break;
  }

  return flags;
}

// ============================================
// Sigmoid Emax model
// ============================================

function sigmoidEmax(ce: number, ec50: number, gamma: number): number {
  if (ce <= 0) return 0;
  const ceG = Math.pow(ce, gamma);
  const ec50G = Math.pow(ec50, gamma);
  return 100 * ceG / (ec50G + ceG);
}

// ============================================
// ODE System
// ============================================
//
// State vector: [gut_0, gut_1, ..., gut_N-1, bloodLDX, bloodDAMP, effectDAMP]
//
// gut_i   = mg of LDX in gut compartment i (one per dose)
// bloodLDX = mg of LDX in systemic circulation
// bloodDAMP = mg of d-amphetamine in body
// effectDAMP = mg of d-amphetamine in effect compartment (virtual)
//
// Each gut compartment has its own ka (fasting vs fed).

function derivatives(
  y: number[],
  nDoses: number,
  gutKa: number[],
  ke0: number,
): number[] {
  const dy = new Array(y.length).fill(0);

  const iLDX = nDoses;
  const iDAMP = nDoses + 1;
  const iEff = nDoses + 2;

  // Gut absorption → blood LDX
  let totalAbsorption = 0;
  for (let i = 0; i < nDoses; i++) {
    const amount = Math.max(0, y[i]);
    const absorbed = gutKa[i] * amount;
    dy[i] = -absorbed;
    totalAbsorption += absorbed;
  }

  // Michaelis-Menten conversion: LDX → dAMP
  const bloodLDX = Math.max(0, y[iLDX]);
  const conversion = PK.Vmax * bloodLDX / (PK.Km + bloodLDX + 1e-15);

  // d-amphetamine disposition
  const bloodDAMP = Math.max(0, y[iDAMP]);
  const effectDAMP = Math.max(0, y[iEff]);

  dy[iLDX] = totalAbsorption * PK.F - conversion;
  dy[iDAMP] = PK.mwRatio * conversion - PK.ke * bloodDAMP;
  dy[iEff] = ke0 * (bloodDAMP - effectDAMP);

  return dy;
}

// ============================================
// RK4 Integrator
// ============================================

function rk4Step(
  y: number[],
  nDoses: number,
  gutKa: number[],
  ke0: number,
  dt: number,
): number[] {
  const n = y.length;

  const k1 = derivatives(y, nDoses, gutKa, ke0);

  const y2 = new Array(n);
  for (let i = 0; i < n; i++) y2[i] = y[i] + 0.5 * dt * k1[i];
  const k2 = derivatives(y2, nDoses, gutKa, ke0);

  const y3 = new Array(n);
  for (let i = 0; i < n; i++) y3[i] = y[i] + 0.5 * dt * k2[i];
  const k3 = derivatives(y3, nDoses, gutKa, ke0);

  const y4 = new Array(n);
  for (let i = 0; i < n; i++) y4[i] = y[i] + dt * k3[i];
  const k4 = derivatives(y4, nDoses, gutKa, ke0);

  const yNew = new Array(n);
  for (let i = 0; i < n; i++) {
    yNew[i] = Math.max(0, y[i] + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  }

  return yNew;
}

// ============================================
// Main Simulation
// ============================================

interface SimDose {
  timeHours: number;  // hours from simulation start
  doseMg: number;
  withFood: boolean;
}

/**
 * Simulate the full PK/PD curve for given doses over a time window.
 *
 * @param doses       Array of dose entries
 * @param weightKg    User's body weight
 * @param ke0         Personal effect compartment rate (h⁻¹)
 * @param startMs     Simulation start time (ms since epoch)
 * @param endMs       Simulation end time (ms since epoch)
 * @param resolutionMin  Output resolution in minutes (default 3)
 * @param sleepLogs   Sleep log entries for sleep debt computation (default [])
 * @returns Array of CurvePoint
 */
export function simulatePKPD(
  doses: DoseEntry[],
  weightKg: number,
  ke0: number,
  startMs: number,
  endMs: number,
  resolutionMin: number = 3,
  sleepLogs: SleepEntry[] = [],
): CurvePoint[] {
  const Vd = PK.vdPerKg * weightKg; // L
  const totalHours = (endMs - startMs) / (3600_000);

  // Pre-compute chronic tolerance once (day-level, doesn't change per output point)
  const simMidMs = (startMs + endMs) / 2;
  const chronicTol = computeChronicTolerance(doses, simMidMs);

  // Pre-compute sleep debt index once
  const sdi = computeSleepDebtIndex(sleepLogs);
  const sleepPenalty = sleepDebtPenalty(sdi);

  // Convert doses to simulation-relative times, filtering to relevant window
  // Include doses up to 48h before start (residual carry-over)
  const simDoses: SimDose[] = doses
    .map(d => ({
      timeHours: (new Date(d.takenAt).getTime() - startMs) / 3600_000,
      doseMg: d.doseMg,
      withFood: d.withFood,
    }))
    .filter(d => d.timeHours >= -48 && d.timeHours <= totalHours)
    .sort((a, b) => a.timeHours - b.timeHours);

  if (simDoses.length === 0) {
    // Return flat baseline
    const points: CurvePoint[] = [];
    const stepH = resolutionMin / 60;
    for (let h = 0; h <= totalHours; h += stepH) {
      points.push({
        timestamp: startMs + h * 3600_000,
        hoursFromNow: (startMs + h * 3600_000 - Date.now()) / 3600_000,
        plasmaConc: 0,
        effectConc: 0,
        effectPct: 0,
        centralActivation: 0,
        peripheralActivation: 0,
        zone: 'baseline',
        crashRate: 0,
      });
    }
    return points;
  }

  // Initialize state vector
  const nDoses = simDoses.length;
  const stateSize = nDoses + 3;
  let y = new Array(stateSize).fill(0);
  const gutKa = simDoses.map(d => d.withFood ? PK.kaFed : PK.kaFasting);

  // Integration parameters
  const internalDtH = 1 / 60; // 1-minute internal step
  const outputStepH = resolutionMin / 60;
  const nInternalSteps = Math.ceil(totalHours / internalDtH);

  const points: CurvePoint[] = [];
  const doseAdded = new Array(nDoses).fill(false);
  let nextOutputH = 0;

  for (let step = 0; step <= nInternalSteps; step++) {
    const currentH = step * internalDtH;

    // Administer doses at their scheduled times
    for (let i = 0; i < nDoses; i++) {
      if (!doseAdded[i] && currentH >= simDoses[i].timeHours) {
        y[i] += simDoses[i].doseMg;
        doseAdded[i] = true;
      }
    }

    // Output point at desired resolution
    if (currentH >= nextOutputH - 1e-9) {
      const iDAMP = nDoses + 1;
      const iEff = nDoses + 2;

      const plasmaConc = (Math.max(0, y[iDAMP]) / Vd) * 1000; // mg/L → ng/mL
      const effectConc = (Math.max(0, y[iEff]) / Vd) * 1000;
      const timestampMs = startMs + currentH * 3600_000;

      // Compute acute tolerance at this specific time point
      const acuteTol = computeAcuteTolerance(doses, timestampMs);
      const combinedTol = Math.min(TOLERANCE.maxTotalShift, acuteTol + chronicTol);
      const toleranceModifier = 1 + combinedTol;

      // Tolerance-adjusted EC50
      const adjustedEC50 = PK.EC50 * toleranceModifier;

      // Central activation (cognitive): uses adjusted EC50, sleep penalty
      const rawCA = sigmoidEmax(effectConc, adjustedEC50, PK.gamma);
      const ca = rawCA * sleepPenalty;

      // Peripheral activation (sympathetic): lower EC50, slightly less steep
      const peripheralEC50 = adjustedEC50 * ACTIVATION.peripheralEC50Ratio;
      const pa = sigmoidEmax(effectConc, peripheralEC50, ACTIVATION.peripheralGamma);

      // effectPct = CA for backwards compatibility
      const effectPct = ca;
      const zone = getZone(effectPct);

      points.push({
        timestamp: timestampMs,
        hoursFromNow: (timestampMs - Date.now()) / 3600_000,
        plasmaConc: Math.round(plasmaConc * 100) / 100,
        effectConc: Math.round(effectConc * 100) / 100,
        effectPct: Math.round(effectPct * 10) / 10,
        centralActivation: Math.round(ca * 10) / 10,
        peripheralActivation: Math.round(pa * 10) / 10,
        zone,
        crashRate: 0, // computed in post-processing
      });

      nextOutputH += outputStepH;
    }

    // RK4 step
    if (step < nInternalSteps) {
      y = rk4Step(y, nDoses, gutKa, ke0, internalDtH);
    }
  }

  // Post-process: compute crash rates (backward difference, %/h) and crash risk
  const toleranceState = computeToleranceState(doses, simMidMs);
  for (let i = 1; i < points.length; i++) {
    const dtH = (points[i].timestamp - points[i - 1].timestamp) / 3600_000;
    if (dtH > 0) {
      points[i].crashRate = Math.round(
        ((points[i].effectPct - points[i - 1].effectPct) / dtH) * 10
      ) / 10;
    }
    points[i].crashRisk = computeCrashRisk(
      points, i, toleranceState, sdi, doses, points[i].timestamp
    );
  }
  if (points.length > 0) {
    points[0].crashRate = 0;
    points[0].crashRisk = { level: 'low', score: 0, factors: { declineRate: 0, sleepDebt: 0, tolerance: 0, lateDosing: 0 } };
  }

  return points;
}

// ============================================
// Current Effect Status (quick snapshot)
// ============================================

export function getCurrentEffectStatus(
  doses: DoseEntry[],
  weightKg: number,
  ke0: number,
  sleepLogs: SleepEntry[] = [],
): EffectStatus {
  const now = Date.now();

  // Simulate: 7 days back to 8h forward (captures residual effects from daily dosing)
  const startMs = now - 7 * 24 * 3600_000;
  const endMs = now + 8 * 3600_000;
  const curve = simulatePKPD(doses, weightKg, ke0, startMs, endMs, 2, sleepLogs);

  if (curve.length === 0) {
    return emptyStatus();
  }

  // Find current point (closest to now)
  let currentIdx = 0;
  let minDiff = Infinity;
  for (let i = 0; i < curve.length; i++) {
    const diff = Math.abs(curve[i].timestamp - now);
    if (diff < minDiff) {
      minDiff = diff;
      currentIdx = i;
    }
  }

  const current = curve[currentIdx];

  // Find peak (max effectPct in entire curve)
  let peakIdx = 0;
  for (let i = 0; i < curve.length; i++) {
    if (curve[i].effectPct > curve[peakIdx].effectPct) {
      peakIdx = i;
    }
  }

  const peakTimestamp = curve[peakIdx].timestamp;
  const timeToPeakHours = (peakTimestamp - now) / 3600_000;

  // Find time until effect drops below subtherapeutic (15%)
  let timeToSubTherapeutic = 0;
  for (let i = currentIdx; i < curve.length; i++) {
    if (curve[i].effectPct < 15) {
      timeToSubTherapeutic = (curve[i].timestamp - now) / 3600_000;
      break;
    }
    if (i === curve.length - 1) {
      timeToSubTherapeutic = (curve[i].timestamp - now) / 3600_000;
    }
  }

  // Compute crash score: how rapidly is effect declining from a high point?
  // Scale: 0-10. High when declining fast from a high level.
  let crashScore = 0;
  if (current.crashRate < -1 && current.effectPct > 20) {
    const recentPeakPct = Math.max(
      ...curve
        .filter(p => p.timestamp >= now - 4 * 3600_000 && p.timestamp <= now)
        .map(p => p.effectPct)
    );
    const dropFromPeak = recentPeakPct - current.effectPct;
    const declineRate = Math.abs(current.crashRate);
    crashScore = Math.min(10, (dropFromPeak / 50) * (declineRate / 5) * 10);
    crashScore = Math.round(crashScore * 10) / 10;
  }

  const isActive = current.effectPct > 5 || current.plasmaConc > 1;

  // Compute tolerance, sleep debt, risk flags
  const toleranceState = computeToleranceState(doses, now);
  const sdi = computeSleepDebtIndex(sleepLogs);
  const crashRisk = current.crashRisk ?? {
    level: 'low' as const,
    score: 0,
    factors: { declineRate: 0, sleepDebt: 0, tolerance: 0, lateDosing: 0 },
  };
  const riskFlags = computeRiskFlags(doses, now, sdi, toleranceState, current.effectPct);

  return {
    currentLevel: Math.round(current.effectPct * 10) / 10,
    centralActivation: Math.round(current.centralActivation * 10) / 10,
    peripheralActivation: Math.round(current.peripheralActivation * 10) / 10,
    zone: current.zone,
    zoneColor: getZoneColor(current.zone),
    zoneLabel: getZoneLabel(current.zone),
    peakTimestamp: curve[peakIdx].effectPct > 5 ? peakTimestamp : null,
    timeToPeakHours: Math.round(timeToPeakHours * 10) / 10,
    timeToSubTherapeuticHours: Math.round(timeToSubTherapeutic * 10) / 10,
    isActive,
    crashScore,
    crashRisk,
    plasmaConc: current.plasmaConc,
    effectConc: current.effectConc,
    toleranceState,
    sleepDebtIndex: sdi,
    riskFlags,
  };
}

function emptyStatus(): EffectStatus {
  return {
    currentLevel: 0,
    centralActivation: 0,
    peripheralActivation: 0,
    zone: 'baseline',
    zoneColor: ZONE_COLORS.baseline,
    zoneLabel: ZONE_LABELS.baseline,
    peakTimestamp: null,
    timeToPeakHours: 0,
    timeToSubTherapeuticHours: 0,
    isActive: false,
    crashScore: 0,
    crashRisk: { level: 'low', score: 0, factors: { declineRate: 0, sleepDebt: 0, tolerance: 0, lateDosing: 0 } },
    plasmaConc: 0,
    effectConc: 0,
    toleranceState: { acuteTolerance: 0, chronicTolerance: 0, combinedModifier: 1, sensitivityPct: 100 },
    sleepDebtIndex: 0,
    riskFlags: { overstimulation: false, sleepDisruption: false, escalationPattern: false, doseStacking: false, activeFlags: [] },
  };
}

// ============================================
// Convenience: 24h curve centered on now
// ============================================

export function getCurve24h(
  doses: DoseEntry[],
  weightKg: number,
  ke0: number,
  sleepLogs: SleepEntry[] = [],
): CurvePoint[] {
  const now = Date.now();
  return simulatePKPD(doses, weightKg, ke0, now - 18 * 3600_000, now + 6 * 3600_000, 3, sleepLogs);
}

// ============================================
// Convenience: curve for a specific calendar day
// ============================================

export function getCurveForDay(
  doses: DoseEntry[],
  weightKg: number,
  ke0: number,
  date: Date,
  sleepLogs: SleepEntry[] = [],
): CurvePoint[] {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  // Start sim 24h before day start (carry-over) but only output from day start
  const simStart = dayStart.getTime() - 24 * 3600_000;
  const fullCurve = simulatePKPD(doses, weightKg, ke0, simStart, dayEnd.getTime(), 3, sleepLogs);

  return fullCurve.filter(p => p.timestamp >= dayStart.getTime());
}

// ============================================
// Get effect at a specific timestamp
// ============================================

export function getEffectAtTime(
  doses: DoseEntry[],
  weightKg: number,
  ke0: number,
  timestamp: number,
  sleepLogs: SleepEntry[] = [],
): { effectPct: number; zone: TherapeuticZone; plasmaConc: number; effectConc: number } {
  // Simulate a small window around the target time
  const startMs = timestamp - 7 * 24 * 3600_000;
  const endMs = timestamp + 60_000; // 1 minute past target
  const curve = simulatePKPD(doses, weightKg, ke0, startMs, endMs, 1, sleepLogs);

  if (curve.length === 0) {
    return { effectPct: 0, zone: 'baseline', plasmaConc: 0, effectConc: 0 };
  }

  // Find closest point
  let best = curve[0];
  let bestDiff = Infinity;
  for (const p of curve) {
    const diff = Math.abs(p.timestamp - timestamp);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = p;
    }
  }

  return {
    effectPct: best.effectPct,
    zone: best.zone,
    plasmaConc: best.plasmaConc,
    effectConc: best.effectConc,
  };
}
