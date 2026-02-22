// ============================================
// VyTrack — Zustand Store (localStorage persistence)
// ============================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { DoseEntry, SubjectiveEntry, UserProfile } from './types';

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
            version: 1,
            exportDate: new Date().toISOString(),
            profile: state.profile,
            doses: state.doses,
            subjectiveLogs: state.subjectiveLogs,
          },
          null,
          2
        );
      },
      importData: (json: string) => {
        const data = JSON.parse(json) as Record<string, unknown>;
        if (!data || typeof data !== 'object') throw new Error('Invalid data');
        const patch: Partial<Pick<VyTrackState, 'profile' | 'doses' | 'subjectiveLogs'>> = {};
        if (data.profile) patch.profile = data.profile as UserProfile;
        if (Array.isArray(data.doses)) patch.doses = data.doses as DoseEntry[];
        if (Array.isArray(data.subjectiveLogs)) patch.subjectiveLogs = data.subjectiveLogs as SubjectiveEntry[];
        set(patch);
      },
      resetAllData: () => {
        set({
          profile: null,
          doses: [],
          subjectiveLogs: [],
        });
      },
    }),
    {
      name: 'vytrack-storage',
      version: 1,
    }
  )
);
