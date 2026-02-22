// ============================================
// LogDose — Quick dose logging (3 taps max)
// ============================================
'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';

const DOSE_OPTIONS = [10, 20, 30, 40, 50, 60, 70];

interface LogDoseProps {
  onClose: () => void;
  onSwitchToSubjective: () => void;
}

export default function LogDose({ onClose, onSwitchToSubjective }: LogDoseProps) {
  const profile = useStore((s) => s.profile);
  const addDose = useStore((s) => s.addDose);
  const doses = useStore((s) => s.doses);

  // Pre-fill: last dose amount, or profile default
  const lastDose = useMemo(() => {
    if (doses.length > 0) {
      return doses[doses.length - 1].doseMg;
    }
    return profile?.defaultDoseMg ?? 30;
  }, [doses, profile]);

  const [selectedDose, setSelectedDose] = useState(lastDose);
  const [withFood, setWithFood] = useState(false);
  const [customTime, setCustomTime] = useState(false);
  const [timeValue, setTimeValue] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [logged, setLogged] = useState(false);

  const handleLog = () => {
    let takenAt = new Date();
    if (customTime) {
      const [h, m] = timeValue.split(':').map(Number);
      takenAt.setHours(h, m, 0, 0);
    }
    addDose(selectedDose, takenAt, withFood);
    setLogged(true);
    setTimeout(() => onClose(), 1200);
  };

  if (logged) {
    return (
      <>
        <div className="sheet-overlay" onClick={onClose} />
        <div className="sheet-content" style={{ padding: '32px 24px' }}>
          <div className="text-center animate-fade-in">
            <div className="text-5xl mb-3">&#x2705;</div>
            <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              Logged {selectedDose}mg
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              Your curve is updating now
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet-content">
        <div className="sheet-handle" />

        <div className="px-5 pt-4 pb-6">
          {/* Tab switcher */}
          <div className="flex rounded-xl overflow-hidden mb-5" style={{ border: '1px solid var(--border-light)' }}>
            <div
              className="flex-1 py-2.5 text-center text-sm font-semibold"
              style={{ background: 'var(--accent-primary)', color: 'white' }}
            >
              Log Dose
            </div>
            <button
              onClick={onSwitchToSubjective}
              className="flex-1 py-2.5 text-center text-sm font-semibold"
              style={{ background: 'white', color: 'var(--text-secondary)' }}
            >
              How I Feel
            </button>
          </div>

          {/* Dose selection */}
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            Dose (mg)
          </p>
          <div className="grid grid-cols-4 gap-2 mb-5">
            {DOSE_OPTIONS.map((dose) => {
              const isSelected = selectedDose === dose;
              const isDefault = dose === profile?.defaultDoseMg;
              return (
                <button
                  key={dose}
                  onClick={() => setSelectedDose(dose)}
                  className="py-3 rounded-xl font-bold text-sm transition-all relative"
                  style={{
                    background: isSelected
                      ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                      : 'var(--bg-primary)',
                    color: isSelected ? 'white' : 'var(--text-primary)',
                    border: isSelected ? 'none' : '1px solid var(--border-light)',
                    boxShadow: isSelected ? '0 4px 12px rgba(99, 102, 241, 0.3)' : 'none',
                  }}
                >
                  {dose}
                  {isDefault && !isSelected && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{ background: 'var(--accent-primary)' }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Time */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Time
            </p>
            <button
              onClick={() => setCustomTime(!customTime)}
              className="text-xs font-medium"
              style={{ color: 'var(--accent-primary)' }}
            >
              {customTime ? 'Use now' : 'Change time'}
            </button>
          </div>
          {customTime ? (
            <input
              type="time"
              value={timeValue}
              onChange={(e) => setTimeValue(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-base font-medium mb-4"
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                color: 'var(--text-primary)',
              }}
            />
          ) : (
            <div
              className="px-4 py-3 rounded-xl text-sm font-medium mb-4"
              style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            >
              Now ({new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
            </div>
          )}

          {/* With food toggle */}
          <button
            onClick={() => setWithFood(!withFood)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl mb-6"
            style={{
              background: withFood ? '#ECFDF5' : 'var(--bg-primary)',
              border: withFood ? '1px solid #A7F3D0' : '1px solid var(--border-light)',
            }}
          >
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Taken with food
            </span>
            <div
              className="w-10 h-6 rounded-full flex items-center transition-all px-0.5"
              style={{
                background: withFood ? 'var(--zone-therapeutic)' : 'var(--border-light)',
                justifyContent: withFood ? 'flex-end' : 'flex-start',
              }}
            >
              <div className="w-5 h-5 rounded-full bg-white transition-all" style={{ boxShadow: 'var(--shadow-sm)' }} />
            </div>
          </button>

          {/* Log button */}
          <button
            onClick={handleLog}
            className="w-full py-4 rounded-xl text-white font-semibold text-base"
            style={{
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
            }}
          >
            Log {selectedDose}mg Vyvanse
          </button>
        </div>
      </div>
    </>
  );
}
