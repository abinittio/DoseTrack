// ============================================
// VyTrack — Type Definitions
// ============================================

export interface DoseEntry {
  id: string;
  doseMg: number;
  takenAt: string; // ISO string
  withFood: boolean;
  notes?: string;
}

export interface SubjectiveEntry {
  id: string;
  timestamp: string; // ISO string
  focus: number;     // 1-10
  mood: number;      // 1-10
  appetite: number;  // 1-10
  crash: number;     // 1-10 (10 = worst crash)
  notes?: string;
  predictedEffectPct: number; // model prediction at log time
}

export interface UserProfile {
  name: string;
  weightKg: number;
  defaultDoseMg: number;
  ke0Personal: number;    // personal effect compartment rate (h^-1)
  onboardingComplete: boolean;
  createdAt: string;
}

export type TherapeuticZone =
  | 'baseline'
  | 'subtherapeutic'
  | 'therapeutic'
  | 'peak'
  | 'supratherapeutic';

export interface CurvePoint {
  timestamp: number;     // ms since epoch
  hoursFromNow: number;  // negative = past, positive = future
  plasmaConc: number;    // d-amphetamine plasma concentration (ng/mL)
  effectConc: number;    // effect site concentration (ng/mL)
  effectPct: number;     // normalized 0-100 effect level
  zone: TherapeuticZone;
  crashRate: number;     // rate of effect decline (%/h, negative = falling)
}

export interface EffectStatus {
  currentLevel: number;       // 0-100
  zone: TherapeuticZone;
  zoneColor: string;
  zoneLabel: string;
  peakTimestamp: number | null;
  timeToPeakHours: number;    // negative = past peak
  timeToSubTherapeuticHours: number;
  isActive: boolean;
  crashScore: number;         // 0-10
  plasmaConc: number;         // current ng/mL
  effectConc: number;         // current ng/mL
}

export interface DayScore {
  date: string;           // YYYY-MM-DD
  avgFocus: number;
  avgMood: number;
  avgAppetite: number;
  avgCrash: number;
  overallScore: number;   // 0-10 composite
  doseCount: number;
  totalDoseMg: number;
  entryCount: number;
}

export interface Insight {
  id: string;
  type: 'peak_timing' | 'crash_pattern' | 'dose_response' | 'tolerance' | 'food_effect' | 'general';
  title: string;
  body: string;
  severity: 'info' | 'positive' | 'caution';
  generatedAt: string;
}

export type TabId = 'home' | 'curve' | 'log' | 'history' | 'insights';

// Zone color mapping
export const ZONE_COLORS: Record<TherapeuticZone, string> = {
  baseline: '#94A3B8',
  subtherapeutic: '#F59E0B',
  therapeutic: '#10B981',
  peak: '#059669',
  supratherapeutic: '#EF4444',
};

export const ZONE_LABELS: Record<TherapeuticZone, string> = {
  baseline: 'Baseline',
  subtherapeutic: 'Coming Up / Wearing Off',
  therapeutic: 'In the Zone',
  peak: 'Peak Effect',
  supratherapeutic: 'Strong Effect',
};

export const ZONE_BG: Record<TherapeuticZone, string> = {
  baseline: '#F1F5F9',
  subtherapeutic: '#FFFBEB',
  therapeutic: '#ECFDF5',
  peak: '#D1FAE5',
  supratherapeutic: '#FEF2F2',
};
