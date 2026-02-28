// ============================================
// VyTrack — Zustand Store (localStorage persistence)
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { DoseEntry, SubjectiveEntry, SleepEntry, UserProfile } from './types';

interface VyTrackState {
  // User profile
  profile: UserProfile | null;
  setProfile: (updates: Partial<UserProfile>) => void;
  completeOnboarding: () => void;

  // Dose log
  doses: DoseEntry[];
  addDose: (doseMg: number, takenAt: Date, withFood: boolean, notes?: string) => void;
  removeDose: (id: string) => void;
  editDose: (id: string, updates: Partial<Pick<DoseEntry, 'doseMg' | 'takenAt' | 'withFood' | 'notes'>>) => void;

  // Subjective logs
  subjectiveLogs: SubjectiveEntry[];
  addSubjectiveLog: (focus: number, mood: number, appetite: number, crash: number, predictedEffectPct: number, notes?: string) => void;
  removeSubjectiveLog: (id: string) => void;

  // Sleep logs
  sleepLogs: SleepEntry[];
  addSleepLog: (date: string, hoursSlept: number, quality?: number) => void;
  removeSleepLog: (id: string) => void;
  editSleepLog: (id: string, updates: Partial<Pick<SleepEntry, 'date' | 'hoursSlept' | 'quality'>>) => void;

  // Calibration
  updateKe0: (newKe0: number) => void;

  // Data management
  exportData: () => string;
  importData: (json: string) => void;
  resetAllData: () => void;
}

export const useStore = create<VyTrackState>()(
  persist(
    (set, get) => ({
      // Profile
      profile: null,
      setProfile: (updates) =>
        set((state) => ({
          profile: state.profile
            ? { ...state.profile, ...updates }
            : {
                name: '',
                weightKg: 70,
                defaultDoseMg: 30,
                ke0Personal: 0.3,
                onboardingComplete: false,
                createdAt: new Date().toISOString(),
                ...updates,
              },
        })),
      completeOnboarding: () =>
        set((state) => ({
          profile: state.profile
            ? { ...state.profile, onboardingComplete: true }
            : null,
        })),

      // Doses
      doses: [],
      addDose: (doseMg, takenAt, withFood, notes) =>
        set((state) => ({
          doses: [
            ...state.doses,
            {
              id: uuidv4(),
              doseMg,
              takenAt: takenAt.toISOString(),
              withFood,
              notes,
            },
          ],
        })),
      removeDose: (id) =>
        set((state) => ({
          doses: state.doses.filter((d) => d.id !== id),
        })),
      editDose: (id, updates) =>
        set((state) => ({
          doses: state.doses.map((d) =>
            d.id === id
              ? {
                  ...d,
                  ...(updates.doseMg !== undefined && { doseMg: updates.doseMg }),
                  ...(updates.takenAt !== undefined && { takenAt: new Date(updates.takenAt).toISOString() }),
                  ...(updates.withFood !== undefined && { withFood: updates.withFood }),
                  ...(updates.notes !== undefined && { notes: updates.notes }),
                }
              : d
          ),
        })),

      // Subjective logs
      subjectiveLogs: [],
      addSubjectiveLog: (focus, mood, appetite, crash, predictedEffectPct, notes) =>
        set((state) => ({
          subjectiveLogs: [
            ...state.subjectiveLogs,
            {
              id: uuidv4(),
              timestamp: new Date().toISOString(),
              focus,
              mood,
              appetite,
              crash,
              predictedEffectPct,
              notes,
            },
          ],
        })),
      removeSubjectiveLog: (id) =>
        set((state) => ({
          subjectiveLogs: state.subjectiveLogs.filter((s) => s.id !== id),
        })),

      // Sleep logs
      sleepLogs: [],
      addSleepLog: (date, hoursSlept, quality) =>
        set((state) => ({
          sleepLogs: [
            ...state.sleepLogs,
            {
              id: uuidv4(),
              date,
              hoursSlept,
              quality,
            },
          ],
        })),
      removeSleepLog: (id) =>
        set((state) => ({
          sleepLogs: state.sleepLogs.filter((s) => s.id !== id),
        })),
      editSleepLog: (id, updates) =>
        set((state) => ({
          sleepLogs: state.sleepLogs.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        })),

      // Calibration
      updateKe0: (newKe0) =>
        set((state) => ({
          profile: state.profile
            ? { ...state.profile, ke0Personal: newKe0 }
            : null,
        })),

      // Data management
      exportData: () => {
        const state = get();
        return JSON.stringify(
          {
            version: 2,
            exportDate: new Date().toISOString(),
            profile: state.profile,
            doses: state.doses,
            subjectiveLogs: state.subjectiveLogs,
            sleepLogs: state.sleepLogs,
          },
          null,
          2
        );
      },
      importData: (json: string) => {
        const data = JSON.parse(json) as Record<string, unknown>;
        if (!data || typeof data !== 'object') throw new Error('Invalid data');
        const patch: Partial<Pick<VyTrackState, 'profile' | 'doses' | 'subjectiveLogs' | 'sleepLogs'>> = {};
        if (data.profile) patch.profile = data.profile as UserProfile;
        if (Array.isArray(data.doses)) patch.doses = data.doses as DoseEntry[];
        if (Array.isArray(data.subjectiveLogs)) patch.subjectiveLogs = data.subjectiveLogs as SubjectiveEntry[];
        if (Array.isArray(data.sleepLogs)) patch.sleepLogs = data.sleepLogs as SleepEntry[];
        set(patch);
      },
      resetAllData: () => {
        set({
          profile: null,
          doses: [],
          subjectiveLogs: [],
          sleepLogs: [],
        });
      },
    }),
    {
      name: 'vytrack-storage',
      version: 2,
      migrate: (persisted: unknown, version: number) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const state = persisted as any;
        if (version < 2) {
          // v1 → v2: add sleepLogs array
          return { ...state, sleepLogs: [] };
        }
        return state;
      },
      onRehydrateStorage: () => {
        return (state) => {
          // After rehydration, create a backup of current data
          if (state && (state.doses.length > 0 || state.subjectiveLogs.length > 0)) {
            try {
              const backup = JSON.stringify({
                profile: state.profile,
                doses: state.doses,
                subjectiveLogs: state.subjectiveLogs,
                sleepLogs: state.sleepLogs,
                backedUpAt: new Date().toISOString(),
              });
              localStorage.setItem('vytrack-storage-backup', backup);
            } catch {
              // localStorage might be full, ignore
            }
          } else if (state && state.doses.length === 0 && state.subjectiveLogs.length === 0) {
            // Primary store is empty — try restoring from backup
            try {
              const backupStr = localStorage.getItem('vytrack-storage-backup');
              if (backupStr) {
                const backup = JSON.parse(backupStr);
                if (backup.doses?.length > 0 || backup.subjectiveLogs?.length > 0) {
                  console.log('[VyTrack] Restoring from backup — primary store was empty');
                  useStore.setState({
                    profile: backup.profile || state.profile,
                    doses: backup.doses || [],
                    subjectiveLogs: backup.subjectiveLogs || [],
                    sleepLogs: backup.sleepLogs || [],
                  });
                }
              }
            } catch {
              // Backup corrupted or not available
            }
          }
        };
      },
    }
  )
);
