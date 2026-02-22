// ============================================
// History — Calendar heatmap + day detail view
// ============================================
'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { useDayScores, useCurveForDay, useDosesForDate, useSubjectiveForDate } from '@/lib/hooks';
import { DayScore, ZONE_COLORS } from '@/lib/types';
import {
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ComposedChart,
  Scatter,
} from 'recharts';

export default function History() {
  const dayScores = useDayScores();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  return (
    <div className="px-4 pt-4 pb-4 space-y-4">
      <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
        History
      </h2>

      <CalendarHeatmap
        dayScores={dayScores}
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
      />

      {selectedDate && (
        <DayDetail
          date={selectedDate}
          score={dayScores.find((d) => d.date === selectedDate)}
        />
      )}

      {!selectedDate && dayScores.length > 0 && (
        <div className="card text-center" style={{ padding: '20px 16px' }}>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Tap a day on the calendar to see details
          </p>
        </div>
      )}

      {dayScores.length === 0 && (
        <div className="card text-center" style={{ padding: '32px 16px' }}>
          <div className="text-4xl mb-3">&#x1F4C5;</div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            No history yet
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            Start logging doses and check-ins to build your history
          </p>
        </div>
      )}
    </div>
  );
}

// ---- Calendar Heatmap ----

function CalendarHeatmap({
  dayScores,
  selectedDate,
  onSelect,
}: {
  dayScores: DayScore[];
  selectedDate: string | null;
  onSelect: (date: string | null) => void;
}) {
  const [monthOffset, setMonthOffset] = useState(0);

  const today = useMemo(() => new Date(), []);
  const viewDate = useMemo(() => {
    const d = new Date(today);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [today, monthOffset]);

  const scoreMap = useMemo(() => {
    const map = new Map<string, DayScore>();
    for (const s of dayScores) map.set(s.date, s);
    return map;
  }, [dayScores]);

  const month = viewDate.getMonth();
  const year = viewDate.getFullYear();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  function getHeatColor(score: number): string {
    if (score >= 7.5) return '#059669';
    if (score >= 6) return '#10B981';
    if (score >= 4.5) return '#34D399';
    if (score >= 3) return '#F59E0B';
    return '#EF4444';
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setMonthOffset((o) => o - 1)}
          className="w-8 h-8 flex items-center justify-center rounded-lg"
          style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-light)' }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth={2}><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{monthLabel}</span>
        <button
          onClick={() => setMonthOffset((o) => Math.min(0, o + 1))}
          disabled={monthOffset >= 0}
          className="w-8 h-8 flex items-center justify-center rounded-lg"
          style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-light)',
            opacity: monthOffset >= 0 ? 0.3 : 1,
          }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth={2}><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const cellDate = new Date(year, month, day);
          const isToday = cellDate.toDateString() === today.toDateString();
          const isFuture = cellDate > today;
          const isSelected = dateStr === selectedDate;
          const score = scoreMap.get(dateStr);

          return (
            <button
              key={day}
              disabled={isFuture}
              onClick={() => onSelect(isSelected ? null : dateStr)}
              className="relative aspect-square flex items-center justify-center rounded-lg text-xs font-medium transition-all"
              style={{
                background: isSelected
                  ? 'var(--accent-primary)'
                  : score && score.entryCount > 0
                  ? getHeatColor(score.overallScore)
                  : score
                  ? '#E2E8F0'
                  : 'transparent',
                color: isSelected || (score && score.entryCount > 0) ? 'white' : isFuture ? 'var(--text-tertiary)' : 'var(--text-primary)',
                border: isToday ? '2px solid var(--accent-primary)' : 'none',
                opacity: isFuture ? 0.3 : 1,
                boxShadow: isSelected ? '0 2px 8px rgba(99, 102, 241, 0.3)' : 'none',
              }}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-1.5 mt-3">
        <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>Tough</span>
        {['#EF4444', '#F59E0B', '#34D399', '#10B981', '#059669'].map((c, i) => (
          <div key={i} className="w-3 h-3 rounded-sm" style={{ background: c }} />
        ))}
        <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>Great</span>
      </div>
    </div>
  );
}

// ---- Day Detail ----

function DayDetail({ date, score }: { date: string; score?: DayScore }) {
  const dateObj = useMemo(() => new Date(date + 'T12:00:00'), [date]);
  const curve = useCurveForDay(dateObj);
  const doses = useDosesForDate(dateObj);
  const subjective = useSubjectiveForDate(dateObj);

  const dayLabel = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const chartData = useMemo(() => {
    return curve.map((p) => {
      const d = new Date(p.timestamp);
      const h = d.getHours() + d.getMinutes() / 60;
      return { time: h, effect: Math.round(p.effectPct * 10) / 10 };
    });
  }, [curve]);

  const subjectivePoints = useMemo(() => {
    return subjective.map((s) => {
      const t = new Date(s.timestamp);
      const h = t.getHours() + t.getMinutes() / 60;
      return { time: h, focus: (s.focus / 10) * 100 };
    });
  }, [subjective]);

  const formatHour = (h: number) => {
    const norm = ((Math.round(h) % 24) + 24) % 24;
    const ampm = norm >= 12 ? 'p' : 'a';
    const display = norm > 12 ? norm - 12 : norm === 0 ? 12 : norm;
    return `${display}${ampm}`;
  };

  return (
    <div className="card animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{dayLabel}</p>
        {score && score.entryCount > 0 && (
          <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--accent-primary)' }}>
            Score: {score.overallScore}/10
          </span>
        )}
      </div>

      {/* Mini curve */}
      {chartData.length > 0 && (
        <div className="mb-3" style={{ marginLeft: -8, marginRight: -8 }}>
          <ResponsiveContainer width="100%" height={120}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <XAxis
                dataKey="time"
                tickFormatter={formatHour}
                tick={{ fontSize: 9, fill: '#94A3B8' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis domain={[0, 100]} tick={false} axisLine={false} tickLine={false} width={0} />

              <defs>
                <linearGradient id={`dayGrad-${date}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366F1" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#6366F1" stopOpacity={0.01} />
                </linearGradient>
              </defs>

              <Area
                type="monotone"
                dataKey="effect"
                stroke="#6366F1"
                strokeWidth={2}
                fill={`url(#dayGrad-${date})`}
                dot={false}
                isAnimationActive={false}
              />

              {subjectivePoints.length > 0 && (
                <Scatter data={subjectivePoints} dataKey="focus" fill="#10B981" stroke="white" strokeWidth={2} r={5} isAnimationActive={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Doses */}
      {doses.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Doses ({doses.length})
          </p>
          <div className="space-y-1">
            {doses.map((dose) => {
              const time = new Date(dose.takenAt);
              return (
                <div key={dose.id} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-primary)' }}>
                  <span>&#x1F48A;</span>
                  <span className="font-semibold">{dose.doseMg}mg</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>
                    {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {dose.withFood ? ' (with food)' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Subjective ratings */}
      {score && score.entryCount > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Focus', value: score.avgFocus, color: 'var(--accent-primary)' },
            { label: 'Mood', value: score.avgMood, color: 'var(--zone-therapeutic)' },
            { label: 'Appetite', value: score.avgAppetite, color: 'var(--accent-warm)' },
            { label: 'Crash', value: score.avgCrash, color: 'var(--zone-supra)' },
          ].map((m) => (
            <div key={m.label} className="text-center px-2 py-1.5 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
              <p className="text-base font-bold tabular-nums" style={{ color: m.color }}>
                {m.value.toFixed(1)}
              </p>
              <p className="text-[9px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
                {m.label}
              </p>
            </div>
          ))}
        </div>
      )}

      {chartData.length === 0 && doses.length === 0 && (
        <p className="text-sm text-center py-3" style={{ color: 'var(--text-tertiary)' }}>
          No data for this day
        </p>
      )}
    </div>
  );
}
