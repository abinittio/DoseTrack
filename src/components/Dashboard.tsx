// ============================================
// Dashboard — Home screen: gauge, mini-curve, today's doses, quick stats
// ============================================
'use client';

import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { useCurrentEffect, useCurve24h, useTodayDoses, useTodaySubjective } from '@/lib/hooks';
import { ZONE_COLORS, ZONE_LABELS, TabId } from '@/lib/types';
import EffectGauge from './EffectGauge';
import {
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ComposedChart,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';

interface DashboardProps {
  onNavigate: (tab: TabId) => void;
  onLogSubjective: () => void;
}

export default function Dashboard({ onNavigate, onLogSubjective }: DashboardProps) {
  const profile = useStore((s) => s.profile);
  const status = useCurrentEffect();
  const curve = useCurve24h();
  const todayDoses = useTodayDoses();
  const todaySubjective = useTodaySubjective();

  const nowHour = useMemo(() => {
    const n = new Date();
    return n.getHours() + n.getMinutes() / 60;
  }, []);

  // Chart data: last 18h + next 6h, keyed by hours-from-midnight
  const chartData = useMemo(() => {
    return curve.map((p) => {
      const d = new Date(p.timestamp);
      const h = d.getHours() + d.getMinutes() / 60;
      return {
        time: h,
        effect: Math.round(p.effectPct * 10) / 10,
        timestamp: p.timestamp,
      };
    });
  }, [curve]);

  const formatHour = (h: number) => {
    const norm = ((Math.round(h) % 24) + 24) % 24;
    const ampm = norm >= 12 ? 'p' : 'a';
    const display = norm > 12 ? norm - 12 : norm === 0 ? 12 : norm;
    return `${display}${ampm}`;
  };

  // Status-dependent messaging
  const statusMessage = useMemo(() => {
    if (!status || !status.isActive) return null;
    const { timeToPeakHours, zone, crashScore } = status;

    if (timeToPeakHours > 0.5) return `Peak in ~${Math.round(timeToPeakHours * 10) / 10}h`;
    if (timeToPeakHours > -0.5) return 'At peak right now';
    if (crashScore > 3) return `Crash intensity: ${Math.round(crashScore)}/10`;
    if (zone === 'therapeutic' || zone === 'peak') return 'In the zone';
    if (zone === 'subtherapeutic') return 'Wearing off';
    return 'Active';
  }, [status]);

  const greeting = useMemo(() => {
    const hr = new Date().getHours();
    if (hr < 12) return 'Good morning';
    if (hr < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  return (
    <div className="px-4 pt-4 pb-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            {greeting}
          </p>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {profile?.name || 'User'}
          </h1>
        </div>
        {status?.isActive && (
          <div className={`zone-badge zone-${status.zone}`}>
            {ZONE_LABELS[status.zone]}
          </div>
        )}
      </div>

      {/* Effect Gauge Card */}
      <div className="card-elevated" style={{ padding: '24px 16px' }}>
        <div className="flex items-center gap-4">
          <EffectGauge status={status} size={140} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Current Effect
            </p>
            <p
              className="text-3xl font-bold tabular-nums mt-1"
              style={{ color: status?.isActive ? ZONE_COLORS[status.zone] : 'var(--text-tertiary)' }}
            >
              {status?.isActive ? `${Math.round(status.currentLevel)}%` : 'Inactive'}
            </p>
            {statusMessage && (
              <p className="text-sm font-medium mt-2" style={{ color: 'var(--text-secondary)' }}>
                {statusMessage}
              </p>
            )}
            {status?.isActive && status.timeToSubTherapeuticHours > 0 && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                ~{Math.round(status.timeToSubTherapeuticHours)}h until baseline
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Mini Curve */}
      {chartData.length > 0 && (
        <div
          className="card cursor-pointer"
          onClick={() => onNavigate('curve')}
          style={{ padding: '12px 8px 8px' }}
        >
          <div className="flex items-center justify-between px-2 mb-1">
            <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              24h Effect Curve
            </p>
            <p className="text-[10px] font-medium" style={{ color: 'var(--accent-primary)' }}>
              Tap for detail
            </p>
          </div>
          <ResponsiveContainer width="100%" height={100}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              {/* Zone bands */}
              <ReferenceArea y1={40} y2={65} fill="#10B981" fillOpacity={0.06} />
              <ReferenceArea y1={65} y2={85} fill="#059669" fillOpacity={0.06} />
              <ReferenceArea y1={85} y2={100} fill="#EF4444" fillOpacity={0.06} />

              <XAxis
                dataKey="time"
                tickFormatter={formatHour}
                tick={{ fontSize: 9, fill: '#94A3B8' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 100]}
                tick={false}
                axisLine={false}
                tickLine={false}
                width={0}
              />

              <defs>
                <linearGradient id="effectGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <Area
                type="monotone"
                dataKey="effect"
                stroke="var(--accent-primary)"
                strokeWidth={2}
                fill="url(#effectGrad)"
                dot={false}
                isAnimationActive={false}
              />

              {/* Now line */}
              <ReferenceLine
                x={nowHour}
                stroke="var(--text-tertiary)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Today's Doses */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Today&apos;s Doses
          </p>
          <span className="text-xs font-medium tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
            {todayDoses.length} logged
          </span>
        </div>
        {todayDoses.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--text-tertiary)' }}>
            No doses logged yet today
          </p>
        ) : (
          <div className="space-y-2">
            {todayDoses.map((dose) => {
              const time = new Date(dose.takenAt);
              return (
                <div
                  key={dose.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl"
                  style={{ background: 'var(--bg-primary)' }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                    style={{ background: '#EEF2FF' }}
                  >
                    &#x1F48A;
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      Vyvanse {dose.doseMg}mg
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {dose.withFood ? ' · with food' : ' · fasting'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Log Button */}
      {status?.isActive && (
        <button
          onClick={onLogSubjective}
          className="w-full card-elevated flex items-center gap-3 text-left"
          style={{
            padding: '14px 16px',
            background: 'linear-gradient(135deg, #EEF2FF, #F5F3FF)',
            border: '1px solid #C7D2FE',
          }}
        >
          <div className="text-2xl">&#x1F9E0;</div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: 'var(--accent-primary)' }}>
              How are you feeling?
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Quick check-in helps personalise predictions
            </p>
          </div>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth={2}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

      {/* Today's check-ins summary */}
      {todaySubjective.length > 0 && (
        <div className="card">
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
            Today&apos;s Check-ins ({todaySubjective.length})
          </p>
          <div className="flex gap-4">
            {[
              { label: 'Focus', value: avg(todaySubjective.map((s) => s.focus)), color: 'var(--accent-primary)' },
              { label: 'Mood', value: avg(todaySubjective.map((s) => s.mood)), color: 'var(--zone-therapeutic)' },
              { label: 'Appetite', value: avg(todaySubjective.map((s) => s.appetite)), color: 'var(--accent-warm)' },
              { label: 'Crash', value: avg(todaySubjective.map((s) => s.crash)), color: 'var(--zone-supra)' },
            ].map((m) => (
              <div key={m.label} className="flex-1 text-center">
                <p className="text-lg font-bold tabular-nums" style={{ color: m.color }}>
                  {m.value.toFixed(1)}
                </p>
                <p className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
                  {m.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}
