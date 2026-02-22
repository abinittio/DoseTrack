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
 * @returns Array of CurvePoint
 */
export function simulatePKPD(
  doses: DoseEntry[],
  weightKg: number,
  ke0: number,
  startMs: number,
  endMs: number,
  resolutionMin: number = 3,
): CurvePoint[] {
  const Vd = PK.vdPerKg * weightKg; // L
  const totalHours = (endMs - startMs) / (3600_000);

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
      const effectPct = sigmoidEmax(effectConc, PK.EC50, PK.gamma);
      const zone = getZone(effectPct);
      const timestampMs = startMs + currentH * 3600_000;

      points.push({
        timestamp: timestampMs,
        hoursFromNow: (timestampMs - Date.now()) / 3600_000,
        plasmaConc: Math.round(plasmaConc * 100) / 100,
        effectConc: Math.round(effectConc * 100) / 100,
        effectPct: Math.round(effectPct * 10) / 10,
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

  // Post-process: compute crash rates (backward difference, %/h)
  for (let i = 1; i < points.length; i++) {
    const dtH = (points[i].timestamp - points[i - 1].timestamp) / 3600_000;
    if (dtH > 0) {
      points[i].crashRate = Math.round(
        ((points[i].effectPct - points[i - 1].effectPct) / dtH) * 10
      ) / 10;
    }
  }
  if (points.length > 0) points[0].crashRate = 0;

  return points;
}

// ============================================
// Current Effect Status (quick snapshot)
// ============================================

export function getCurrentEffectStatus(
  doses: DoseEntry[],
  weightKg: number,
  ke0: number,
): EffectStatus {
  const now = Date.now();

  // Simulate: 48h back to 8h forward
  const startMs = now - 48 * 3600_000;
  const endMs = now + 8 * 3600_000;
  const curve = simulatePKPD(doses, weightKg, ke0, startMs, endMs, 2);

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
    // Crash intensity = rate of decline * how high we were recently
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

  return {
    currentLevel: Math.round(current.effectPct * 10) / 10,
    zone: current.zone,
    zoneColor: getZoneColor(current.zone),
    zoneLabel: getZoneLabel(current.zone),
    peakTimestamp: curve[peakIdx].effectPct > 5 ? peakTimestamp : null,
    timeToPeakHours: Math.round(timeToPeakHours * 10) / 10,
    timeToSubTherapeuticHours: Math.round(timeToSubTherapeutic * 10) / 10,
    isActive,
    crashScore,
    plasmaConc: current.plasmaConc,
    effectConc: current.effectConc,
  };
}

function emptyStatus(): EffectStatus {
  return {
    currentLevel: 0,
    zone: 'baseline',
    zoneColor: ZONE_COLORS.baseline,
    zoneLabel: ZONE_LABELS.baseline,
    peakTimestamp: null,
    timeToPeakHours: 0,
    timeToSubTherapeuticHours: 0,
    isActive: false,
    crashScore: 0,
    plasmaConc: 0,
    effectConc: 0,
  };
}

// ============================================
// Convenience: 24h curve centered on now
// ============================================

export function getCurve24h(
  doses: DoseEntry[],
  weightKg: number,
  ke0: number,
): CurvePoint[] {
  const now = Date.now();
  return simulatePKPD(doses, weightKg, ke0, now - 18 * 3600_000, now + 6 * 3600_000, 3);
}

// ============================================
// Convenience: curve for a specific calendar day
// ============================================

export function getCurveForDay(
  doses: DoseEntry[],
  weightKg: number,
  ke0: number,
  date: Date,
): CurvePoint[] {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  // Start sim 24h before day start (carry-over) but only output from day start
  const simStart = dayStart.getTime() - 24 * 3600_000;
  const fullCurve = simulatePKPD(doses, weightKg, ke0, simStart, dayEnd.getTime(), 3);

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
): { effectPct: number; zone: TherapeuticZone; plasmaConc: number; effectConc: number } {
  // Simulate a small window around the target time
  const startMs = timestamp - 48 * 3600_000;
  const endMs = timestamp + 60_000; // 1 minute past target
  const curve = simulatePKPD(doses, weightKg, ke0, startMs, endMs, 1);

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
