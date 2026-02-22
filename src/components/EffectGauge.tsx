// ============================================
// EffectGauge — Circular ring showing current effect level
// ============================================
'use client';

import { EffectStatus, ZONE_COLORS, TherapeuticZone } from '@/lib/types';

interface EffectGaugeProps {
  status: EffectStatus | null;
  size?: number;
}

export default function EffectGauge({ status, size = 160 }: EffectGaugeProps) {
  const level = status?.currentLevel ?? 0;
  const zone = status?.zone ?? 'baseline';
  const color = ZONE_COLORS[zone];

  // SVG circle parameters
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, Math.max(0, level));
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border-light)"
          strokeWidth={strokeWidth}
        />
        {/* Zone background bands (subtle) */}
        {level > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.5s ease',
              animation: 'gaugeReveal 1.2s ease-out',
            }}
          />
        )}
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="tabular-nums font-bold leading-none"
          style={{
            fontSize: size * 0.28,
            color: level > 0 ? color : 'var(--text-tertiary)',
          }}
        >
          {Math.round(level)}
        </span>
        <span
          className="text-xs font-medium mt-0.5"
          style={{ color: 'var(--text-tertiary)', fontSize: size * 0.075 }}
        >
          % effect
        </span>
      </div>
    </div>
  );
}

// Small inline version for the dashboard header
export function EffectGaugeMini({ zone, level }: { zone: TherapeuticZone; level: number }) {
  const color = ZONE_COLORS[zone];
  const r = 14;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (Math.min(100, level) / 100) * circumference;

  return (
    <div className="relative" style={{ width: 36, height: 36 }}>
      <svg width={36} height={36} className="transform -rotate-90">
        <circle cx={18} cy={18} r={r} fill="none" stroke="var(--border-light)" strokeWidth={3} />
        <circle
          cx={18} cy={18} r={r} fill="none"
          stroke={color} strokeWidth={3}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[9px] font-bold tabular-nums" style={{ color }}>
          {Math.round(level)}
        </span>
      </div>
    </div>
  );
}
