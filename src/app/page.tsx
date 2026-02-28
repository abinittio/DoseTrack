// ============================================
// VyTrack — App Shell
// ============================================
'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { TabId } from '@/lib/types';
import Onboarding from '@/components/Onboarding';
import Dashboard from '@/components/Dashboard';
import PKCurve from '@/components/PKCurve';
import History from '@/components/History';
import InsightsView from '@/components/InsightsView';
import LogDose from '@/components/LogDose';
import LogSubjective from '@/components/LogSubjective';
import LogSleep from '@/components/LogSleep';
import BottomNav from '@/components/BottomNav';

export default function App() {
  const profile = useStore((s) => s.profile);
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [showDoseSheet, setShowDoseSheet] = useState(false);
  const [showSubjectiveSheet, setShowSubjectiveSheet] = useState(false);
  const [showSleepSheet, setShowSleepSheet] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  if (!hydrated) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(180deg, #EEF2FF 0%, #F7F8FC 100%)' }}
      >
        <div className="text-center animate-fade-in">
          <div className="text-5xl mb-4">&#x1F48A;</div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            VyTrack
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Loading...
          </p>
        </div>
      </div>
    );
  }

  if (!profile?.onboardingComplete) {
    return <Onboarding />;
  }

  const handleTabSelect = (tab: TabId) => {
    if (tab === 'log') {
      setShowDoseSheet(true);
    } else {
      setActiveTab(tab);
    }
  };

  const closeDoseSheet = () => setShowDoseSheet(false);
  const closeSubjectiveSheet = () => setShowSubjectiveSheet(false);
  const closeSleepSheet = () => setShowSleepSheet(false);

  return (
    <div className="min-h-screen" style={{ paddingBottom: 'var(--nav-height)', background: 'var(--bg-primary)' }}>
      {/* Tab content */}
      <div className="max-w-lg mx-auto">
        {activeTab === 'home' && (
          <Dashboard
            onNavigate={setActiveTab}
            onLogSubjective={() => setShowSubjectiveSheet(true)}
            onLogSleep={() => setShowSleepSheet(true)}
          />
        )}
        {activeTab === 'curve' && <PKCurve />}
        {activeTab === 'history' && <History />}
        {activeTab === 'insights' && <InsightsView />}
      </div>

      {/* Bottom sheets */}
      {showDoseSheet && (
        <LogDose
          onClose={closeDoseSheet}
          onSwitchToSubjective={() => {
            setShowDoseSheet(false);
            setShowSubjectiveSheet(true);
          }}
        />
      )}
      {showSubjectiveSheet && (
        <LogSubjective
          onClose={closeSubjectiveSheet}
          onSwitchToDose={() => {
            setShowSubjectiveSheet(false);
            setShowDoseSheet(true);
          }}
        />
      )}
      {showSleepSheet && <LogSleep onClose={closeSleepSheet} />}

      {/* Navigation */}
      <BottomNav activeTab={activeTab} onSelect={handleTabSelect} />

      {/* Floating "How I Feel" button — visible on Home when no sheet is open */}
      {activeTab === 'home' && !showDoseSheet && !showSubjectiveSheet && !showSleepSheet && (
        <button
          onClick={() => setShowSubjectiveSheet(true)}
          className="fixed z-20 right-4 flex items-center gap-2 px-4 py-2.5 rounded-full text-white text-sm font-semibold animate-fade-in"
          style={{
            bottom: 'calc(var(--nav-height) + 12px)',
            background: 'linear-gradient(135deg, #10B981, #059669)',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
          }}
        >
          &#x1F9E0; Check in
        </button>
      )}
    </div>
  );
}
