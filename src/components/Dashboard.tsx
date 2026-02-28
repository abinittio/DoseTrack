// ============================================
// Dashboard — Home screen: gauge, mini-curve, today's doses, quick stats
// ============================================
'use client';

import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { useCurrentEffect, useCurve24h, useTodayDoses, useTodaySubjective, useYesterdayDoses, useYesterdaySubjective, useRecentStats } from '@/lib/hooks';
import { ZONE_COLORS, ZONE_LABELS, TabId } from '@/lib/types';
import EffectGauge from './EffectGauge';
import {
  Area,
  Line,
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
  onLogSleep?: () => void;
}

export default function Dashboard({ onNavigate, onLogSubjective, onLogSleep }: DashboardProps) {
  const profile = useStore((s) => s.profile);
  const status = useCurrentEffect();
  const curve = useCurve24h();
  const todayDoses = useTodayDoses();
  const todaySubjective = useTodaySubjective();
  const yesterdayDoses = useYesterdayDoses();
  const yesterdaySubjective = useYesterdaySubjective();
  const stats = useRecentStats();

  const nowMs = useMemo(() => Date.now(), []);

  // Chart data: hours-from-now (continuous, no midnight wrapping)
  const chartData = useMemo(() => {
    return curve.map((p) => ({
      time: Math.round(((p.timestamp - nowMs) / 3600_000) * 100) / 100,
      effect: Math.round(p.centralActivation * 10) / 10,
      pa: Math.round(p.peripheralActivation * 10) / 10,
      timestamp: p.timestamp,
    }));
  }, [curve, nowMs]);

  const formatHour = (hFromNow: number) => {
    const d = new Date(nowMs + hFromNow * 3600_000);
    const h = d.getHours();
    const ampm = h >= 12 ? 'p' : 'a';
    const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
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

      {/* Risk Flags Banner */}
      {status?.riskFlags && status.riskFlags.activeFlags.length > 0 && (
        <div
          className="rounded-xl px-4 py-3 flex items-start gap-2.5"
          style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}
        >
          <span className="text-base flex-shrink-0">&#x26A0;&#xFE0F;</span>
          <div>
            {status.riskFlags.activeFlags.map((flag, i) => (
              <p key={i} className="text-xs font-semibold" style={{ color: '#DC2626' }}>
                {flag}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Effect Gauge Card — dual: CA (primary ring) + PA (secondary ring) */}
      <div className="card-elevated" style={{ padding: '24px 16px' }}>
        <div className="flex items-center gap-4">
          <EffectGauge
            status={status}
            size={140}
            label="Cognitive"
            secondaryLevel={status?.peripheralActivation}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Current Effect
            </p>
            <p
              className="text-3xl font-bold tabular-nums mt-1"
              style={{ color: status?.isActive ? ZONE_COLORS[status.zone] : 'var(--text-tertiary)' }}
            >
              {status?.isActive ? `${Math.round(status.centralActivation)}%` : 'Inactive'}
            </p>
            {status?.isActive && status.peripheralActivation > 0 && (
              <div className="flex items-center gap-1.5 mt-1">
                <div className="w-2 h-2 rounded-full" style={{ background: '#F97316' }} />
                <p className="text-xs font-medium" style={{ color: '#F97316' }}>
                  Physical: {Math.round(status.peripheralActivation)}%
                </p>
              </div>
            )}
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

        {/* Tolerance + Sleep Debt indicators */}
        {status?.isActive && (
          <div className="flex gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--border-light)' }}>
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
              <span className="text-xs">&#x1F9EC;</span>
              <div>
                <p className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>Sensitivity</p>
                <p className="text-sm font-bold tabular-nums" style={{
                  color: status.toleranceState.sensitivityPct > 80 ? '#10B981'
                    : status.toleranceState.sensitivityPct > 50 ? '#F59E0B' : '#EF4444'
                }}>
                  {status.toleranceState.sensitivityPct}%
                </p>
              </div>
            </div>
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-primary)' }}>
              <span className="text-xs">&#x1F634;</span>
              <div>
                <p className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>Sleep debt</p>
                <p className="text-sm font-bold tabular-nums" style={{
                  color: status.sleepDebtIndex <= 4 ? '#10B981'
                    : status.sleepDebtIndex <= 8 ? '#F59E0B' : '#EF4444'
                }}>
                  {status.sleepDebtIndex.toFixed(1)}h
                </p>
              </div>
            </div>
            {status.crashRisk.level !== 'low' && (
              <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg" style={{
                background: status.crashRisk.level === 'high' ? '#FEF2F2' : '#FFFBEB'
              }}>
                <span className="text-xs">&#x1F4C9;</span>
                <div>
                  <p className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>Crash risk</p>
                  <p className="text-sm font-bold" style={{
                    color: status.crashRisk.level === 'high' ? '#EF4444' : '#F59E0B'
                  }}>
                    {status.crashRisk.level}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
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
                type="number"
                domain={[-18, 6]}
                tickFormatter={formatHour}
                tick={{ fontSize: 9, fill: '#94A3B8' }}
                axisLine={false}
                tickLine={false}
                ticks={[-18, -12, -6, 0, 6]}
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

              {/* PA line (dashed, orange) */}
              <Line
                type="monotone"
                dataKey="pa"
                stroke="#F97316"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                isAnimationActive={false}
              />

              {/* Now line */}
              <ReferenceLine
                x={0}
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

      {/* Yesterday's Summary (show when today is empty or always as context) */}
      {yesterdayDoses.length > 0 && (
        <div className="card" style={{ opacity: todayDoses.length === 0 ? 1 : 0.8 }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Yesterday
            </p>
            <span className="text-xs font-medium tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
              {yesterdayDoses.length} dose{yesterdayDoses.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-1">
            {yesterdayDoses.map((dose) => {
              const time = new Date(dose.takenAt);
              return (
                <div
                  key={dose.id}
                  className="flex items-center gap-2 px-2 py-1 rounded-lg text-xs"
                  style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                >
                  <span>&#x1F48A;</span>
                  <span className="font-medium">{dose.doseMg}mg</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>
                    {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {dose.withFood ? ' · food' : ''}
                  </span>
                </div>
              );
            })}
          </div>
          {yesterdaySubjective.length > 0 && (
            <div className="flex gap-3 mt-2 pt-2" style={{ borderTop: '1px solid var(--border-light)' }}>
              {[
                { label: 'Focus', value: avg(yesterdaySubjective.map((s) => s.focus)), color: 'var(--accent-primary)' },
                { label: 'Mood', value: avg(yesterdaySubjective.map((s) => s.mood)), color: 'var(--zone-therapeutic)' },
              ].map((m) => (
                <div key={m.label} className="text-center flex-1">
                  <p className="text-sm font-bold tabular-nums" style={{ color: m.color }}>
                    {m.value.toFixed(1)}
                  </p>
                  <p className="text-[9px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
                    {m.label}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* All-time Data Summary */}
      {stats.totalDoses > 0 && (
        <button
          onClick={() => onNavigate('history')}
          className="w-full card flex items-center gap-3 text-left"
          style={{ padding: '12px 16px' }}
        >
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <div className="text-center">
                <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--accent-primary)' }}>
                  {stats.totalDoses}
                </p>
                <p className="text-[9px] font-medium" style={{ color: 'var(--text-tertiary)' }}>doses</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--zone-therapeutic)' }}>
                  {stats.daysTracked}
                </p>
                <p className="text-[9px] font-medium" style={{ color: 'var(--text-tertiary)' }}>days</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--accent-warm)' }}>
                  {stats.totalCheckIns}
                </p>
                <p className="text-[9px] font-medium" style={{ color: 'var(--text-tertiary)' }}>check-ins</p>
              </div>
              {stats.streak > 1 && (
                <div className="text-center">
                  <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--accent-secondary)' }}>
                    {stats.streak}
                  </p>
                  <p className="text-[9px] font-medium" style={{ color: 'var(--text-tertiary)' }}>streak</p>
                </div>
              )}
            </div>
            {stats.firstDate && (
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Tracking since {stats.firstDate} &middot; Tap for full history
              </p>
            )}
          </div>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={2}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

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

      {/* Log Sleep Button */}
      {onLogSleep && (
        <button
          onClick={onLogSleep}
          className="w-full card-elevated flex items-center gap-3 text-left"
          style={{
            padding: '14px 16px',
            background: 'linear-gradient(135deg, #EFF6FF, #EEF2FF)',
            border: '1px solid #BFDBFE',
          }}
        >
          <div className="text-2xl">&#x1F634;</div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: '#2563EB' }}>
              Log Sleep
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Track sleep to improve crash &amp; tolerance predictions
            </p>
          </div>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth={2}>
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
