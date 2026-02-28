// ============================================
// EffectGauge — Circular ring showing current effect level
// Supports dual mode: primary ring (CA) + optional secondary ring (PA)
// ============================================
'use client';

import { EffectStatus, ZONE_COLORS, TherapeuticZone } from '@/lib/types';

interface EffectGaugeProps {
  status: EffectStatus | null;
  size?: number;
  label?: string;           // optional label like "Cognitive" or "Physical"
  secondaryLevel?: number;  // optional PA level for secondary ring
}

export default function EffectGauge({ status, size = 160, label, secondaryLevel }: EffectGaugeProps) {
  const level = status?.currentLevel ?? 0;
  const zone = status?.zone ?? 'baseline';
  const color = ZONE_COLORS[zone];

  // SVG circle parameters
  const strokeWidth = 10;
  const secondaryStrokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, Math.max(0, level));
  const offset = circumference - (progress / 100) * circumference;

  // Secondary ring (inner, for PA)
  const secondaryRadius = radius - strokeWidth - 2;
  const secondaryCircumference = 2 * Math.PI * secondaryRadius;
  const secondaryProgress = Math.min(100, Math.max(0, secondaryLevel ?? 0));
  const secondaryOffset = secondaryCircumference - (secondaryProgress / 100) * secondaryCircumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background track (primary) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border-light)"
          strokeWidth={strokeWidth}
        />
        {/* Primary ring (CA / effect) */}
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
        {/* Secondary ring (PA) — inner, orange */}
        {secondaryLevel !== undefined && secondaryLevel > 0 && (
          <>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={secondaryRadius}
              fill="none"
              stroke="var(--border-light)"
              strokeWidth={secondaryStrokeWidth}
              strokeOpacity={0.4}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={secondaryRadius}
              fill="none"
              stroke="#F97316"
              strokeWidth={secondaryStrokeWidth}
              strokeDasharray={secondaryCircumference}
              strokeDashoffset={secondaryOffset}
              strokeLinecap="round"
              strokeOpacity={0.7}
              style={{
                transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            />
          </>
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
          {label ? label : '% effect'}
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
