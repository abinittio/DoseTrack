// ============================================
// LogSleep — Quick sleep logging bottom sheet
// ============================================
'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';

const SLEEP_PRESETS = [
  { label: 'Full night', hours: 8, color: '#10B981' },
  { label: 'Decent', hours: 7, color: '#6366F1' },
  { label: 'Short', hours: 6, color: '#F59E0B' },
  { label: 'Poor', hours: 4, color: '#EF4444' },
];

interface LogSleepProps {
  onClose: () => void;
}

export default function LogSleep({ onClose }: LogSleepProps) {
  const addSleepLog = useStore((s) => s.addSleepLog);

  const [hours, setHours] = useState(7);
  const [quality, setQuality] = useState(3);
  const [date, setDate] = useState(() => {
    // Default to last night (yesterday)
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  });
  const [logged, setLogged] = useState(false);

  const handleLog = () => {
    addSleepLog(date, hours, quality);
    setLogged(true);
    setTimeout(() => onClose(), 1200);
  };

  if (logged) {
    return (
      <>
        <div className="sheet-overlay" onClick={onClose} />
        <div className="sheet-content" style={{ padding: '32px 24px' }}>
          <div className="text-center animate-fade-in">
            <div className="text-5xl mb-3">&#x1F634;</div>
            <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              Logged {hours}h sleep
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              Sleep debt model updated
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
          <p className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
            Log Sleep
          </p>

          {/* Date picker */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Night of
            </p>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm"
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Quick presets */}
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
            Quick pick
          </p>
          <div className="grid grid-cols-4 gap-2 mb-5">
            {SLEEP_PRESETS.map((preset) => {
              const isSelected = hours === preset.hours;
              return (
                <button
                  key={preset.label}
                  onClick={() => setHours(preset.hours)}
                  className="py-2.5 rounded-xl text-center transition-all"
                  style={{
                    background: isSelected
                      ? `${preset.color}15`
                      : 'var(--bg-primary)',
                    border: isSelected
                      ? `2px solid ${preset.color}`
                      : '1px solid var(--border-light)',
                  }}
                >
                  <p className="text-sm font-bold" style={{ color: isSelected ? preset.color : 'var(--text-primary)' }}>
                    {preset.hours}h
                  </p>
                  <p className="text-[9px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
                    {preset.label}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Custom slider */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Hours slept
              </p>
              <span
                className="text-lg font-bold tabular-nums"
                style={{
                  color: hours >= 7 ? '#10B981' : hours >= 5 ? '#F59E0B' : '#EF4444',
                }}
              >
                {hours}h
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={12}
              step={0.5}
              value={hours}
              onChange={(e) => setHours(parseFloat(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-[9px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
              <span>0h</span>
              <span>6h</span>
              <span>12h</span>
            </div>
          </div>

          {/* Quality rating */}
          <div className="mb-6">
            <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
              Quality
            </p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((q) => {
                const isSelected = quality === q;
                const labels = ['Awful', 'Poor', 'OK', 'Good', 'Great'];
                return (
                  <button
                    key={q}
                    onClick={() => setQuality(q)}
                    className="flex-1 py-2 rounded-xl text-center transition-all"
                    style={{
                      background: isSelected ? 'var(--accent-primary)' : 'var(--bg-primary)',
                      color: isSelected ? 'white' : 'var(--text-secondary)',
                      border: isSelected ? 'none' : '1px solid var(--border-light)',
                    }}
                  >
                    <p className="text-xs font-semibold">{q}</p>
                    <p className="text-[8px]">{labels[q - 1]}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Log button */}
          <button
            onClick={handleLog}
            className="w-full py-4 rounded-xl text-white font-semibold text-base"
            style={{
              background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
            }}
          >
            Log {hours}h Sleep
          </button>
        </div>
      </div>
    </>
  );
}
