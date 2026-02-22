// ============================================
// LogSubjective — Quick-capture subjective state
// ============================================
'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { useCurrentEffect } from '@/lib/hooks';

interface LogSubjectiveProps {
  onClose: () => void;
  onSwitchToDose: () => void;
}

// Quick presets for 2-tap logging
const PRESETS = [
  { label: 'Dialled In', emoji: '\u{1F525}', focus: 9, mood: 8, appetite: 5, crash: 1 },
  { label: 'Doing Good', emoji: '\u{1F44D}', focus: 7, mood: 7, appetite: 6, crash: 2 },
  { label: 'Just OK', emoji: '\u{1F610}', focus: 5, mood: 5, appetite: 5, crash: 4 },
  { label: 'Crashing', emoji: '\u{1F62E}\u200D\u{1F4A8}', focus: 3, mood: 3, appetite: 7, crash: 8 },
];

const DIMENSIONS = [
  { key: 'focus' as const, label: 'Focus', color: 'var(--accent-primary)', emoji: '\u{1F3AF}' },
  { key: 'mood' as const, label: 'Mood', color: 'var(--zone-therapeutic)', emoji: '\u{1F60A}' },
  { key: 'appetite' as const, label: 'Appetite', color: 'var(--accent-warm)', emoji: '\u{1F37D}\uFE0F' },
  { key: 'crash' as const, label: 'Crash', color: 'var(--zone-supra)', emoji: '\u{1F4A5}' },
];

export default function LogSubjective({ onClose, onSwitchToDose }: LogSubjectiveProps) {
  const addSubjectiveLog = useStore((s) => s.addSubjectiveLog);
  const status = useCurrentEffect();

  const [showCustom, setShowCustom] = useState(false);
  const [focus, setFocus] = useState(5);
  const [mood, setMood] = useState(5);
  const [appetite, setAppetite] = useState(5);
  const [crash, setCrash] = useState(3);
  const [notes, setNotes] = useState('');
  const [logged, setLogged] = useState(false);

  const setters: Record<string, (v: number) => void> = {
    focus: setFocus,
    mood: setMood,
    appetite: setAppetite,
    crash: setCrash,
  };

  const values: Record<string, number> = { focus, mood, appetite, crash };

  const handlePreset = (preset: typeof PRESETS[number]) => {
    const predictedPct = status?.currentLevel ?? 0;
    addSubjectiveLog(preset.focus, preset.mood, preset.appetite, preset.crash, predictedPct);
    setLogged(true);
    setTimeout(() => onClose(), 1200);
  };

  const handleCustomSubmit = () => {
    const predictedPct = status?.currentLevel ?? 0;
    addSubjectiveLog(focus, mood, appetite, crash, predictedPct, notes || undefined);
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
              Check-in logged
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              This helps personalise your predictions
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
            <button
              onClick={onSwitchToDose}
              className="flex-1 py-2.5 text-center text-sm font-semibold"
              style={{ background: 'white', color: 'var(--text-secondary)' }}
            >
              Log Dose
            </button>
            <div
              className="flex-1 py-2.5 text-center text-sm font-semibold"
              style={{ background: 'var(--accent-primary)', color: 'white' }}
            >
              How I Feel
            </div>
          </div>

          {/* Current predicted level */}
          {status?.isActive && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl mb-4"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)' }}
            >
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Model predicts:
              </span>
              <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--accent-primary)' }}>
                {Math.round(status.currentLevel)}% effect
              </span>
            </div>
          )}

          {!showCustom ? (
            <>
              {/* Quick presets */}
              <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                Quick check-in
              </p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => handlePreset(preset)}
                    className="flex items-center gap-2.5 p-3.5 rounded-xl text-left transition-all active:scale-95"
                    style={{
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-light)',
                    }}
                  >
                    <span className="text-2xl">{preset.emoji}</span>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {preset.label}
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                        F:{preset.focus} M:{preset.mood} A:{preset.appetite} C:{preset.crash}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              <button
                onClick={() => setShowCustom(true)}
                className="w-full py-3 rounded-xl text-sm font-semibold"
                style={{
                  background: 'white',
                  border: '1px solid var(--border-light)',
                  color: 'var(--accent-primary)',
                }}
              >
                Customise ratings
              </button>
            </>
          ) : (
            <>
              {/* Custom ratings */}
              <div className="space-y-4 mb-4">
                {DIMENSIONS.map((dim) => (
                  <div key={dim.key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {dim.emoji} {dim.label}
                      </span>
                      <span className="text-sm font-bold tabular-nums" style={{ color: dim.color }}>
                        {values[dim.key]}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <button
                          key={n}
                          onClick={() => setters[dim.key](n)}
                          className="rating-btn flex-1"
                          style={
                            values[dim.key] >= n
                              ? {
                                  background: dim.color,
                                  borderColor: dim.color,
                                  color: 'white',
                                  boxShadow: values[dim.key] === n ? `0 2px 8px ${dim.color}40` : 'none',
                                }
                              : {}
                          }
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Notes */}
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes..."
                rows={2}
                className="w-full px-3 py-2 rounded-xl text-sm mb-4 focus:outline-none"
                style={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-light)',
                  color: 'var(--text-primary)',
                  resize: 'none',
                }}
              />

              <div className="flex gap-2">
                <button
                  onClick={() => setShowCustom(false)}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold"
                  style={{
                    background: 'white',
                    border: '1px solid var(--border-light)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Back
                </button>
                <button
                  onClick={handleCustomSubmit}
                  className="flex-1 py-3 rounded-xl text-white font-semibold text-sm"
                  style={{
                    background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                  }}
                >
                  Log Check-in
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
