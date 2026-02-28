// ============================================
// LogDose — Log a dose + manage existing entries
// ============================================
'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { DoseEntry } from '@/lib/types';

const DOSE_OPTIONS = [10, 20, 30, 40, 50, 60, 70];

interface LogDoseProps {
  onClose: () => void;
  onSwitchToSubjective: () => void;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ---- Inline edit row ----
function DoseRow({ dose, onDeleted }: { dose: DoseEntry; onDeleted?: () => void }) {
  const removeDose = useStore((s) => s.removeDose);
  const editDose = useStore((s) => s.editDose);
  const [editing, setEditing] = useState(false);
  const [editDoseMg, setEditDoseMg] = useState(dose.doseMg);
  const [editDate, setEditDate] = useState(dose.takenAt.slice(0, 10));
  const [editTime, setEditTime] = useState(() => {
    const d = new Date(dose.takenAt);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });

  const handleSave = () => {
    const [h, m] = editTime.split(':').map(Number);
    const [y, mo, d] = editDate.split('-').map(Number);
    editDose(dose.id, { doseMg: editDoseMg, takenAt: new Date(y, mo - 1, d, h, m, 0, 0) });
    setEditing(false);
  };

  const handleDelete = () => {
    removeDose(dose.id);
    onDeleted?.();
  };

  if (editing) {
    return (
      <div className="rounded-xl p-3 mb-2" style={{ background: 'var(--bg-primary)', border: '1px solid var(--accent-primary)' }}>
        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Edit dose</p>
        <div className="flex gap-2 mb-2">
          <select
            value={editDoseMg}
            onChange={(e) => setEditDoseMg(Number(e.target.value))}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
          >
            {DOSE_OPTIONS.map((d) => <option key={d} value={d}>{d}mg</option>)}
          </select>
          <input
            type="date"
            value={editDate}
            onChange={(e) => setEditDate(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
          />
          <input
            type="time"
            value={editTime}
            onChange={(e) => setEditTime(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
          />
        </div>
        <div className="flex gap-2">
          <button onClick={handleSave} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--accent-primary)' }}>
            Save
          </button>
          <button onClick={() => setEditing(false)} className="flex-1 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-2" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)' }}>
      <span className="text-base">&#x1F48A;</span>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{dose.doseMg}mg</span>
        <span className="text-xs ml-2" style={{ color: 'var(--text-tertiary)' }}>
          {formatDate(dose.takenAt)} · {formatTime(dose.takenAt)}
          {dose.withFood ? ' · with food' : ''}
        </span>
      </div>
      <button onClick={() => setEditing(true)} className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ color: 'var(--accent-primary)', background: 'rgba(99,102,241,0.1)' }}>
        Edit
      </button>
      <button onClick={handleDelete} className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ color: '#EF4444', background: 'rgba(239,68,68,0.1)' }}>
        Delete
      </button>
    </div>
  );
}

// ---- Main component ----
export default function LogDose({ onClose, onSwitchToSubjective }: LogDoseProps) {
  const profile = useStore((s) => s.profile);
  const addDose = useStore((s) => s.addDose);
  const doses = useStore((s) => s.doses);

  const lastDose = useMemo(() => {
    if (doses.length > 0) return doses[doses.length - 1].doseMg;
    return profile?.defaultDoseMg ?? 30;
  }, [doses, profile]);

  const [selectedDose, setSelectedDose] = useState(lastDose);
  const [withFood, setWithFood] = useState(false);
  const [dateValue, setDateValue] = useState(() => new Date().toISOString().slice(0, 10));
  const [timeValue, setTimeValue] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [logged, setLogged] = useState(false);

  // Recent doses (last 7 days, most recent first)
  const recentDoses = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return [...doses]
      .filter((d) => new Date(d.takenAt).getTime() > cutoff)
      .sort((a, b) => new Date(b.takenAt).getTime() - new Date(a.takenAt).getTime());
  }, [doses]);

  const handleLog = () => {
    const [h, m] = timeValue.split(':').map(Number);
    const [y, mo, d] = dateValue.split('-').map(Number);
    const takenAt = new Date(y, mo - 1, d, h, m, 0, 0);
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
            <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Logged {selectedDose}mg</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Your curve is updating now</p>
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
            <div className="flex-1 py-2.5 text-center text-sm font-semibold" style={{ background: 'var(--accent-primary)', color: 'white' }}>
              Log Dose
            </div>
            <button onClick={onSwitchToSubjective} className="flex-1 py-2.5 text-center text-sm font-semibold" style={{ background: 'white', color: 'var(--text-secondary)' }}>
              How I Feel
            </button>
          </div>

          {/* Dose selector */}
          <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Dose (mg)</p>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {DOSE_OPTIONS.map((dose) => {
              const isSelected = selectedDose === dose;
              const isDefault = dose === profile?.defaultDoseMg;
              return (
                <button
                  key={dose}
                  onClick={() => setSelectedDose(dose)}
                  className="py-3 rounded-xl font-bold text-sm transition-all relative"
                  style={{
                    background: isSelected ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' : 'var(--bg-primary)',
                    color: isSelected ? 'white' : 'var(--text-primary)',
                    border: isSelected ? 'none' : '1px solid var(--border-light)',
                    boxShadow: isSelected ? '0 4px 12px rgba(99,102,241,0.3)' : 'none',
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

          {/* Date + Time — always visible */}
          <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Date & Time</p>
          <div className="flex gap-2 mb-4">
            <input
              type="date"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
              className="flex-1 px-3 py-3 rounded-xl text-sm font-medium"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
            />
            <input
              type="time"
              value={timeValue}
              onChange={(e) => setTimeValue(e.target.value)}
              className="flex-1 px-3 py-3 rounded-xl text-sm font-medium"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
            />
          </div>

          {/* With food */}
          <button
            onClick={() => setWithFood(!withFood)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl mb-4"
            style={{ background: withFood ? '#ECFDF5' : 'var(--bg-primary)', border: withFood ? '1px solid #A7F3D0' : '1px solid var(--border-light)' }}
          >
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Taken with food</span>
            <div className="w-10 h-6 rounded-full flex items-center transition-all px-0.5" style={{ background: withFood ? 'var(--zone-therapeutic)' : 'var(--border-light)', justifyContent: withFood ? 'flex-end' : 'flex-start' }}>
              <div className="w-5 h-5 rounded-full bg-white" style={{ boxShadow: 'var(--shadow-sm)' }} />
            </div>
          </button>

          {/* Log button */}
          <button
            onClick={handleLog}
            className="w-full py-4 rounded-xl text-white font-semibold text-base mb-5"
            style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', boxShadow: '0 4px 12px rgba(99,102,241,0.4)' }}
          >
            Log {selectedDose}mg Vyvanse
          </button>

          {/* Recent doses */}
          {recentDoses.length > 0 && (
            <>
              <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                Recent doses
              </p>
              {recentDoses.map((dose) => (
                <DoseRow key={dose.id} dose={dose} />
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
