// ============================================
// PKCurve — Full 24h PK/PD curve with zone bands + subjective overlay
// ============================================
'use client';

import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { useCurve24h, useTodayDoses, useTodaySubjective } from '@/lib/hooks';
import { useCurrentEffect } from '@/lib/hooks';
import { ZONE_COLORS } from '@/lib/types';
import {
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  ReferenceLine,
  ReferenceArea,
  Scatter,
  CartesianGrid,
} from 'recharts';

export default function PKCurve() {
  const profile = useStore((s) => s.profile);
  const curve = useCurve24h();
  const todayDoses = useTodayDoses();
  const todaySubjective = useTodaySubjective();
  const status = useCurrentEffect();

  const nowHour = useMemo(() => {
    const n = new Date();
    return n.getHours() + n.getMinutes() / 60;
  }, []);

  // Main chart data
  const chartData = useMemo(() => {
    return curve.map((p) => {
      const d = new Date(p.timestamp);
      const h = d.getHours() + d.getMinutes() / 60;
      return {
        time: h,
        effect: Math.round(p.effectPct * 10) / 10,
        plasma: Math.round(p.plasmaConc * 10) / 10,
        crashRate: p.crashRate,
      };
    });
  }, [curve]);

  // Subjective overlay data (scatter points)
  const subjectivePoints = useMemo(() => {
    return todaySubjective.map((s) => {
      const t = new Date(s.timestamp);
      const h = t.getHours() + t.getMinutes() / 60;
      // Map focus (1-10) to 0-100 scale for overlay
      const focusPct = (s.focus / 10) * 100;
      return {
        time: h,
        focus: Math.round(focusPct),
        mood: s.mood,
        crash: s.crash,
      };
    });
  }, [todaySubjective]);

  // Dose marker times
  const doseMarkers = useMemo(() => {
    return todayDoses.map((d) => {
      const t = new Date(d.takenAt);
      return {
        time: t.getHours() + t.getMinutes() / 60,
        label: `${d.doseMg}mg`,
        withFood: d.withFood,
      };
    });
  }, [todayDoses]);

  const formatHour = (h: number) => {
    const norm = ((Math.round(h) % 24) + 24) % 24;
    const ampm = norm >= 12 ? 'PM' : 'AM';
    const display = norm > 12 ? norm - 12 : norm === 0 ? 12 : norm;
    return `${display} ${ampm}`;
  };

  if (chartData.length === 0) {
    return (
      <div className="px-4 pt-6 text-center">
        <div className="text-5xl mb-4">&#x1F4C8;</div>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
          No Active Curve
        </h2>
        <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
          Log a dose to see your PK/PD curve here.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-4 space-y-4">
      {/* Header with current stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            Effect Curve
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Last 18h + 6h projection
          </p>
        </div>
        {status?.isActive && (
          <div className="text-right">
            <p
              className="text-2xl font-bold tabular-nums"
              style={{ color: ZONE_COLORS[status.zone] }}
            >
              {Math.round(status.currentLevel)}%
            </p>
            <p className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
              current effect
            </p>
          </div>
        )}
      </div>

      {/* Key Metrics */}
      {status?.isActive && (
        <div className="grid grid-cols-3 gap-2">
          <div className="card text-center" style={{ padding: '10px 8px' }}>
            <p className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
              Peak Time
            </p>
            <p className="text-sm font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>
              {status.peakTimestamp
                ? new Date(status.peakTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '--'}
            </p>
          </div>
          <div className="card text-center" style={{ padding: '10px 8px' }}>
            <p className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
              Plasma
            </p>
            <p className="text-sm font-bold mt-0.5" style={{ color: 'var(--accent-warm)' }}>
              {status.plasmaConc.toFixed(1)} ng/mL
            </p>
          </div>
          <div className="card text-center" style={{ padding: '10px 8px' }}>
            <p className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
              Baseline In
            </p>
            <p className="text-sm font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>
              ~{Math.round(status.timeToSubTherapeuticHours)}h
            </p>
          </div>
        </div>
      )}

      {/* Main Chart */}
      <div className="card" style={{ padding: '12px 4px 4px' }}>
        <p className="text-xs font-semibold px-3 mb-2" style={{ color: 'var(--text-secondary)' }}>
          Effect Level (%) &amp; Plasma Concentration
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" strokeOpacity={0.5} />

            {/* Zone bands */}
            <ReferenceArea y1={40} y2={65} fill="#10B981" fillOpacity={0.05} />
            <ReferenceArea y1={65} y2={85} fill="#059669" fillOpacity={0.05} />
            <ReferenceArea y1={85} y2={100} fill="#EF4444" fillOpacity={0.05} />
            <ReferenceArea y1={15} y2={40} fill="#F59E0B" fillOpacity={0.04} />

            <XAxis
              dataKey="time"
              tickFormatter={formatHour}
              tick={{ fontSize: 10, fill: '#94A3B8', fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: '#94A3B8', fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              labelFormatter={(v) => formatHour(v as number)}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={((value: any, name: any) => {
                const v = Number(value ?? 0);
                const n = String(name ?? '');
                if (n === 'effect') return [`${Math.round(v)}%`, 'Effect Level'];
                if (n === 'plasma') return [`${v.toFixed(1)} ng/mL`, 'Plasma dAMP'];
                if (n === 'focus') return [`${Math.round(v)}%`, 'Your Focus'];
                return [v, n];
              }) as never}
              contentStyle={{
                borderRadius: 12,
                border: '1px solid var(--border-light)',
                boxShadow: 'var(--shadow-md)',
                fontSize: 12,
                fontWeight: 500,
                background: 'white',
              }}
            />

            <defs>
              <linearGradient id="effectFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366F1" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#6366F1" stopOpacity={0.01} />
              </linearGradient>
            </defs>

            {/* Effect area */}
            <Area
              type="monotone"
              dataKey="effect"
              stroke="#6366F1"
              strokeWidth={2.5}
              fill="url(#effectFill)"
              dot={false}
              isAnimationActive={false}
            />

            {/* Plasma concentration line */}
            <Line
              type="monotone"
              dataKey="plasma"
              stroke="#F97316"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
              yAxisId={0}
            />

            {/* Subjective focus overlay */}
            {subjectivePoints.length > 0 && (
              <Scatter
                data={subjectivePoints}
                dataKey="focus"
                fill="#10B981"
                stroke="white"
                strokeWidth={2}
                r={6}
                isAnimationActive={false}
              />
            )}

            {/* Dose markers */}
            {doseMarkers.map((m, i) => (
              <ReferenceLine
                key={`dose-${i}`}
                x={m.time}
                stroke="#6366F1"
                strokeDasharray="6 3"
                strokeWidth={1.5}
                label={{
                  value: `&#x1F48A; ${m.label}`,
                  position: 'top',
                  fontSize: 10,
                  fill: '#6366F1',
                  fontWeight: 600,
                }}
              />
            ))}

            {/* Now line */}
            <ReferenceLine
              x={nowHour}
              stroke="#1E293B"
              strokeWidth={1.5}
              strokeDasharray="5 2"
              label={{
                value: 'NOW',
                position: 'insideTopRight',
                fontSize: 9,
                fill: '#1E293B',
                fontWeight: 700,
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex flex-wrap justify-center gap-3 mt-2 px-2 pb-1">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded" style={{ background: '#6366F1' }} />
            <span className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
              Effect
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded" style={{ background: '#F97316', borderTop: '1px dashed #F97316' }} />
            <span className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
              Plasma
            </span>
          </div>
          {subjectivePoints.length > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#10B981' }} />
              <span className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
                Your Focus
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Zone explanation */}
      <div className="card" style={{ padding: '12px 16px' }}>
        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
          Zone Guide
        </p>
        <div className="space-y-1.5">
          {[
            { label: 'Baseline', range: '0-15%', color: '#94A3B8', bg: '#F1F5F9' },
            { label: 'Coming Up / Wearing Off', range: '15-40%', color: '#D97706', bg: '#FFFBEB' },
            { label: 'Therapeutic', range: '40-65%', color: '#059669', bg: '#ECFDF5' },
            { label: 'Peak Effect', range: '65-85%', color: '#047857', bg: '#D1FAE5' },
            { label: 'Strong Effect', range: '85%+', color: '#DC2626', bg: '#FEF2F2' },
          ].map((z) => (
            <div key={z.label} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ background: z.bg, border: `1px solid ${z.color}40` }}
              />
              <span className="text-xs font-medium flex-1" style={{ color: z.color }}>
                {z.label}
              </span>
              <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                {z.range}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
