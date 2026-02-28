// ============================================
// InsightsView — Trends, patterns, and personalised callouts
// ============================================
'use client';

import { useMemo, useRef } from 'react';
import { useStore } from '@/lib/store';
import { useDayScores, useToleranceState, useSleepDebtIndex, useRecentSleepLogs } from '@/lib/hooks';
import { generateInsights } from '@/lib/insights';
import { Insight } from '@/lib/types';
import {
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
  ComposedChart,
} from 'recharts';

const SEVERITY_STYLES: Record<Insight['severity'], { bg: string; border: string; icon: string }> = {
  info: { bg: '#EEF2FF', border: '#C7D2FE', icon: '\u{1F4A1}' },
  positive: { bg: '#ECFDF5', border: '#A7F3D0', icon: '\u{2705}' },
  caution: { bg: '#FFFBEB', border: '#FDE68A', icon: '\u{26A0}\uFE0F' },
};

export default function InsightsView() {
  const doses = useStore((s) => s.doses);
  const subjectiveLogs = useStore((s) => s.subjectiveLogs);
  const sleepLogs = useStore((s) => s.sleepLogs);
  const profile = useStore((s) => s.profile);
  const dayScores = useDayScores();
  const tolerance = useToleranceState();
  const sdi = useSleepDebtIndex();
  const recentSleep = useRecentSleepLogs();

  const insights = useMemo(
    () => generateInsights(doses, subjectiveLogs, dayScores, sleepLogs),
    [doses, subjectiveLogs, dayScores, sleepLogs]
  );

  // Weekly trend data for chart
  const weeklyData = useMemo(() => {
    if (dayScores.length < 3) return [];
    const scored = dayScores.filter((d) => d.entryCount > 0);
    // Group by week
    const weeks: { label: string; focus: number; mood: number; crash: number }[] = [];
    let weekBucket: typeof scored = [];
    let weekLabel = '';

    for (const day of scored) {
      const d = new Date(day.date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const label = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      if (label !== weekLabel && weekBucket.length > 0) {
        const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
        weeks.push({
          label: weekLabel,
          focus: Math.round(avg(weekBucket.map((d) => d.avgFocus)) * 10) / 10,
          mood: Math.round(avg(weekBucket.map((d) => d.avgMood)) * 10) / 10,
          crash: Math.round(avg(weekBucket.map((d) => d.avgCrash)) * 10) / 10,
        });
        weekBucket = [];
      }
      weekLabel = label;
      weekBucket.push(day);
    }
    if (weekBucket.length > 0) {
      const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
      weeks.push({
        label: weekLabel,
        focus: Math.round(avg(weekBucket.map((d) => d.avgFocus)) * 10) / 10,
        mood: Math.round(avg(weekBucket.map((d) => d.avgMood)) * 10) / 10,
        crash: Math.round(avg(weekBucket.map((d) => d.avgCrash)) * 10) / 10,
      });
    }
    return weeks;
  }, [dayScores]);

  // Summary stats
  const stats = useMemo(() => {
    return {
      totalDoses: doses.length,
      totalCheckIns: subjectiveLogs.length,
      daysTracked: dayScores.length,
      avgFocus: subjectiveLogs.length > 0
        ? Math.round((subjectiveLogs.reduce((s, l) => s + l.focus, 0) / subjectiveLogs.length) * 10) / 10
        : 0,
    };
  }, [doses, subjectiveLogs, dayScores]);

  return (
    <div className="px-4 pt-4 pb-4 space-y-4">
      <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
        Insights
      </h2>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Days', value: stats.daysTracked, color: 'var(--accent-primary)' },
          { label: 'Doses', value: stats.totalDoses, color: 'var(--accent-warm)' },
          { label: 'Check-ins', value: stats.totalCheckIns, color: 'var(--zone-therapeutic)' },
          { label: 'Avg Focus', value: stats.avgFocus, color: 'var(--accent-secondary)' },
        ].map((s) => (
          <div key={s.label} className="card text-center" style={{ padding: '10px 4px' }}>
            <p className="text-xl font-bold tabular-nums" style={{ color: s.color }}>
              {s.value}
            </p>
            <p className="text-[9px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Weekly trend chart */}
      {weeklyData.length >= 2 && (
        <div className="card" style={{ padding: '12px 4px 4px' }}>
          <p className="text-xs font-semibold px-3 mb-2" style={{ color: 'var(--text-secondary)' }}>
            Weekly Trends
          </p>
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart data={weeklyData} margin={{ top: 4, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" strokeOpacity={0.5} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: '#94A3B8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 10]}
                tick={{ fontSize: 9, fill: '#94A3B8' }}
                axisLine={false}
                tickLine={false}
              />
              <Line type="monotone" dataKey="focus" stroke="#6366F1" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              <Line type="monotone" dataKey="mood" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              <Line type="monotone" dataKey="crash" stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 3" isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-1 pb-1">
            {[
              { label: 'Focus', color: '#6366F1' },
              { label: 'Mood', color: '#10B981' },
              { label: 'Crash', color: '#EF4444' },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-1">
                <div className="w-2.5 h-0.5 rounded" style={{ background: l.color }} />
                <span className="text-[9px] font-medium" style={{ color: 'var(--text-tertiary)' }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tolerance Tracker */}
      <div className="card" style={{ padding: '12px 16px' }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
            Tolerance Tracker
          </p>
          <span className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
            EC50 shift: +{Math.round((tolerance.combinedModifier - 1) * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>Sensitivity</span>
              <span className="text-sm font-bold tabular-nums" style={{
                color: tolerance.sensitivityPct > 80 ? '#10B981'
                  : tolerance.sensitivityPct > 50 ? '#F59E0B' : '#EF4444'
              }}>
                {tolerance.sensitivityPct}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full" style={{ background: 'var(--border-light)' }}>
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${tolerance.sensitivityPct}%`,
                  background: tolerance.sensitivityPct > 80 ? '#10B981'
                    : tolerance.sensitivityPct > 50 ? '#F59E0B' : '#EF4444',
                }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[8px]" style={{ color: 'var(--text-tertiary)' }}>
                Acute: {Math.round(tolerance.acuteTolerance * 100)}%
              </span>
              <span className="text-[8px]" style={{ color: 'var(--text-tertiary)' }}>
                Chronic: {Math.round(tolerance.chronicTolerance * 100)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sleep Health */}
      <div className="card" style={{ padding: '12px 16px' }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
            Sleep Health
          </p>
          <span
            className="text-xs font-bold tabular-nums"
            style={{
              color: sdi <= 4 ? '#10B981' : sdi <= 8 ? '#F59E0B' : '#EF4444',
            }}
          >
            {sdi.toFixed(1)}h debt
          </span>
        </div>
        {recentSleep.length > 0 ? (
          <div className="flex gap-1">
            {recentSleep.map((s) => {
              const barHeight = Math.max(8, (s.hoursSlept / 10) * 40);
              return (
                <div key={s.id} className="flex-1 flex flex-col items-center gap-0.5">
                  <div
                    className="w-full rounded-sm"
                    style={{
                      height: barHeight,
                      background: s.hoursSlept >= 7 ? '#10B981'
                        : s.hoursSlept >= 5 ? '#F59E0B' : '#EF4444',
                      opacity: 0.7,
                    }}
                  />
                  <span className="text-[7px] font-medium tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                    {s.hoursSlept}h
                  </span>
                  <span className="text-[6px]" style={{ color: 'var(--text-tertiary)' }}>
                    {new Date(s.date + 'T12:00').toLocaleDateString('en-US', { weekday: 'narrow' })}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
            No sleep data logged yet. Log sleep to see how rest affects your cognitive activation.
          </p>
        )}
      </div>

      {/* Insight cards */}
      <div className="space-y-3">
        {insights.map((insight) => {
          const style = SEVERITY_STYLES[insight.severity];
          return (
            <div
              key={insight.id}
              className="rounded-xl p-4"
              style={{
                background: style.bg,
                border: `1px solid ${style.border}`,
              }}
            >
              <div className="flex items-start gap-2.5">
                <span className="text-lg flex-shrink-0">{style.icon}</span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {insight.title}
                  </p>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {insight.body}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Personal model info */}
      {profile && (
        <div className="card" style={{ padding: '12px 16px' }}>
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
            Your Personal Model
          </p>
          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            <span>ke0: {profile.ke0Personal.toFixed(3)} h<sup>-1</sup></span>
            <span>Weight: {profile.weightKg}kg</span>
            <span>Default: {profile.defaultDoseMg}mg</span>
          </div>
          <p className="text-[10px] mt-2 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
            Your ke0 parameter controls how quickly the model predicts your brain responds to drug level changes.
            {subjectiveLogs.length >= 10
              ? ' With enough check-ins, this value auto-calibrates to match your experience.'
              : ` Log ${Math.max(0, 10 - subjectiveLogs.length)} more check-ins for auto-calibration.`}
          </p>
        </div>
      )}

      {/* Data management */}
      <DataManagement />
    </div>
  );
}

function DataManagement() {
  const doses = useStore((s) => s.doses);
  const subjectiveLogs = useStore((s) => s.subjectiveLogs);
  const exportData = useStore((s) => s.exportData);
  const importData = useStore((s) => s.importData);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dataInfo = useMemo(() => {
    const allTimestamps = [
      ...doses.map((d) => new Date(d.takenAt).getTime()),
      ...subjectiveLogs.map((s) => new Date(s.timestamp).getTime()),
    ];
    const earliest = allTimestamps.length > 0 ? new Date(Math.min(...allTimestamps)) : null;
    const latest = allTimestamps.length > 0 ? new Date(Math.max(...allTimestamps)) : null;
    return {
      doseCount: doses.length,
      checkInCount: subjectiveLogs.length,
      earliest: earliest?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      latest: latest?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    };
  }, [doses, subjectiveLogs]);

  const handleExport = () => {
    const json = exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vytrack-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importData(reader.result as string);
        alert('Data imported successfully!');
      } catch {
        alert('Failed to import — invalid file format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="card" style={{ padding: '12px 16px' }}>
      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
        Data Management
      </p>
      <p className="text-[10px] leading-relaxed mb-3" style={{ color: 'var(--text-tertiary)' }}>
        All data is stored locally on your device. Nothing is sent to any server.
        {dataInfo.doseCount > 0 && (
          <> · {dataInfo.doseCount} doses, {dataInfo.checkInCount} check-ins
            {dataInfo.earliest && dataInfo.latest && dataInfo.earliest !== dataInfo.latest
              ? ` (${dataInfo.earliest} — ${dataInfo.latest})`
              : dataInfo.earliest ? ` (${dataInfo.earliest})` : ''}
          </>
        )}
      </p>
      <div className="flex gap-2">
        <button
          onClick={handleExport}
          className="flex-1 rounded-xl text-xs font-semibold py-2.5"
          style={{
            background: 'var(--accent-primary)',
            color: '#fff',
          }}
        >
          Export JSON
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 rounded-xl text-xs font-semibold py-2.5"
          style={{
            border: '1px solid var(--border-medium)',
            color: 'var(--text-secondary)',
            background: 'var(--bg-primary)',
          }}
        >
          Import Backup
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          className="hidden"
        />
      </div>
    </div>
  );
}
