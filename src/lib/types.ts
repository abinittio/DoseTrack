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

export interface SleepEntry {
  id: string;
  date: string;        // YYYY-MM-DD (night of sleep)
  hoursSlept: number;  // total hours
  quality?: number;    // 1-5 optional quality rating
  bedtime?: string;    // ISO string
  wakeTime?: string;   // ISO string
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

export interface ToleranceState {
  acuteTolerance: number;    // 0-1, cumulative 24h exposure factor
  chronicTolerance: number;  // 0-1, 7-day rolling average factor
  combinedModifier: number;  // final EC50 multiplier (>1 = tolerance, shifts EC50 up)
  sensitivityPct: number;    // 100 = full sensitivity, 0 = fully tolerant (display value)
}

export type CrashRiskLevel = 'low' | 'moderate' | 'high';

export interface CrashRisk {
  level: CrashRiskLevel;
  score: number;             // 0-1 composite
  factors: {
    declineRate: number;     // contribution from rapid effect decline
    sleepDebt: number;       // contribution from sleep debt
    tolerance: number;       // contribution from tolerance
    lateDosing: number;      // contribution from dosing after 2pm
  };
}

export interface RiskFlags {
  overstimulation: boolean;  // daily total > 140mg dAMP-equivalent or effectPct > 95
  sleepDisruption: boolean;  // dose taken after 2pm with effect extending past 11pm
  escalationPattern: boolean; // 7-day dose trend rising >20% week-over-week
  doseStacking: boolean;     // 2+ doses within 3h of each other
  activeFlags: string[];     // human-readable labels for display
}

export interface CurvePoint {
  timestamp: number;             // ms since epoch
  hoursFromNow: number;          // negative = past, positive = future
  plasmaConc: number;            // d-amphetamine plasma concentration (ng/mL)
  effectConc: number;            // effect site concentration (ng/mL)
  effectPct: number;             // normalized 0-100 effect level (= CA for backwards compat)
  centralActivation: number;     // 0-100 cognitive activation (focus, executive function)
  peripheralActivation: number;  // 0-100 sympathetic activation (heart rate, appetite suppression)
  zone: TherapeuticZone;
  crashRate: number;             // rate of effect decline (%/h, negative = falling)
  crashRisk?: CrashRisk;        // multi-factor crash risk at this point
}

export interface EffectStatus {
  currentLevel: number;       // 0-100 (= CA for backwards compat)
  centralActivation: number;  // 0-100
  peripheralActivation: number; // 0-100
  zone: TherapeuticZone;
  zoneColor: string;
  zoneLabel: string;
  peakTimestamp: number | null;
  timeToPeakHours: number;    // negative = past peak
  timeToSubTherapeuticHours: number;
  isActive: boolean;
  crashScore: number;         // 0-10
  crashRisk: CrashRisk;
  plasmaConc: number;         // current ng/mL
  effectConc: number;         // current ng/mL
  toleranceState: ToleranceState;
  sleepDebtIndex: number;     // hours of deficit from ideal 8h over last 7 days
  riskFlags: RiskFlags;
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
  type: 'peak_timing' | 'crash_pattern' | 'dose_response' | 'tolerance' | 'food_effect' | 'general' | 'sleep_debt' | 'escalation' | 'acute_tolerance' | 'chronic_tolerance';
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
