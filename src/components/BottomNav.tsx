// ============================================
// BottomNav — Tab bar with center action button
// ============================================
'use client';

import { TabId } from '@/lib/types';

interface BottomNavProps {
  activeTab: TabId;
  onSelect: (tab: TabId) => void;
}

const tabs: { id: TabId; icon: string; label: string }[] = [
  { id: 'home', icon: 'home', label: 'Home' },
  { id: 'curve', icon: 'curve', label: 'Curve' },
  { id: 'log', icon: 'plus', label: 'Log' },
  { id: 'history', icon: 'calendar', label: 'History' },
  { id: 'insights', icon: 'bulb', label: 'Insights' },
];

function TabIcon({ name, active }: { name: string; active: boolean }) {
  const color = active ? 'var(--accent-primary)' : 'var(--text-tertiary)';
  const size = 22;

  switch (name) {
    case 'home':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case 'curve':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      );
    case 'calendar':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case 'bulb':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function BottomNav({ activeTab, onSelect }: BottomNavProps) {
  return (
    <nav className="tab-bar">
      {tabs.map((tab) => {
        if (tab.id === 'log') {
          return (
            <button
              key={tab.id}
              className="tab-center-btn"
              onClick={() => onSelect('log')}
              aria-label="Log dose"
            >
              <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          );
        }

        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            className={`tab-item ${isActive ? 'active' : ''}`}
            onClick={() => onSelect(tab.id)}
          >
            <TabIcon name={tab.icon} active={isActive} />
            <span style={{ fontSize: 10, fontWeight: 600 }}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
