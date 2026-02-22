// ============================================
// Onboarding — First-run setup (name, weight, default dose)
// ============================================
'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';

const DOSE_OPTIONS = [10, 20, 30, 40, 50, 60, 70];

export default function Onboarding() {
  const setProfile = useStore((s) => s.setProfile);
  const completeOnboarding = useStore((s) => s.completeOnboarding);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [weightKg, setWeightKg] = useState(70);
  const [useLbs, setUseLbs] = useState(false);
  const [defaultDose, setDefaultDose] = useState(30);

  const handleFinish = () => {
    const finalWeight = useLbs ? Math.round(weightKg * 0.453592) : weightKg;
    setProfile({
      name: name.trim() || 'User',
      weightKg: finalWeight,
      defaultDoseMg: defaultDose,
      ke0Personal: 0.3,
      onboardingComplete: false,
      createdAt: new Date().toISOString(),
    });
    completeOnboarding();
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'linear-gradient(180deg, #EEF2FF 0%, #F7F8FC 100%)' }}
    >
      <div className="w-full max-w-sm">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-300"
              style={{
                width: step === i ? 24 : 8,
                height: 8,
                background: step >= i ? 'var(--accent-primary)' : 'var(--border-light)',
              }}
            />
          ))}
        </div>

        {/* Step 0: Name */}
        {step === 0 && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <div className="text-5xl mb-4">&#x1F48A;</div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Welcome to VyTrack
              </h1>
              <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
                Real-time Vyvanse effect predictions, personalised to you.
              </p>
            </div>

            <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
              What should we call you?
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full px-4 py-3 rounded-xl text-base font-medium focus:outline-none focus:ring-2"
              style={{
                background: 'white',
                border: '1px solid var(--border-light)',
                color: 'var(--text-primary)',
                boxShadow: 'var(--shadow-sm)',
              }}
              autoFocus
            />

            <button
              onClick={() => setStep(1)}
              className="w-full mt-6 py-3.5 rounded-xl text-white font-semibold text-base"
              style={{
                background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
              }}
            >
              Next
            </button>
          </div>
        )}

        {/* Step 1: Weight */}
        {step === 1 && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Your weight
              </h1>
              <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
                Used to calculate drug concentrations. Stored only on your device.
              </p>
            </div>

            {/* Unit toggle */}
            <div className="flex rounded-xl overflow-hidden mb-4" style={{ border: '1px solid var(--border-light)' }}>
              <button
                onClick={() => setUseLbs(false)}
                className="flex-1 py-2.5 text-sm font-semibold transition-all"
                style={{
                  background: !useLbs ? 'var(--accent-primary)' : 'white',
                  color: !useLbs ? 'white' : 'var(--text-secondary)',
                }}
              >
                kg
              </button>
              <button
                onClick={() => setUseLbs(true)}
                className="flex-1 py-2.5 text-sm font-semibold transition-all"
                style={{
                  background: useLbs ? 'var(--accent-primary)' : 'white',
                  color: useLbs ? 'white' : 'var(--text-secondary)',
                }}
              >
                lbs
              </button>
            </div>

            <input
              type="number"
              value={weightKg}
              onChange={(e) => setWeightKg(Number(e.target.value))}
              className="w-full px-4 py-3 rounded-xl text-center text-2xl font-bold focus:outline-none focus:ring-2"
              style={{
                background: 'white',
                border: '1px solid var(--border-light)',
                color: 'var(--text-primary)',
                boxShadow: 'var(--shadow-sm)',
              }}
              min={30}
              max={300}
            />
            <p className="text-center text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              {useLbs ? `${Math.round(weightKg * 0.453592)} kg` : `${Math.round(weightKg * 2.20462)} lbs`}
            </p>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setStep(0)}
                className="flex-1 py-3 rounded-xl font-semibold text-sm"
                style={{
                  background: 'white',
                  border: '1px solid var(--border-light)',
                  color: 'var(--text-secondary)',
                }}
              >
                Back
              </button>
              <button
                onClick={() => setStep(2)}
                className="flex-1 py-3 rounded-xl text-white font-semibold text-sm"
                style={{
                  background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Default dose */}
        {step === 2 && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Usual dose
              </h1>
              <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
                We&apos;ll pre-fill this when you log. You can always change it.
              </p>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {DOSE_OPTIONS.map((dose) => (
                <button
                  key={dose}
                  onClick={() => setDefaultDose(dose)}
                  className="py-3 rounded-xl font-bold text-sm transition-all"
                  style={{
                    background: defaultDose === dose
                      ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                      : 'white',
                    color: defaultDose === dose ? 'white' : 'var(--text-primary)',
                    border: defaultDose === dose ? 'none' : '1px solid var(--border-light)',
                    boxShadow: defaultDose === dose
                      ? '0 4px 12px rgba(99, 102, 241, 0.3)'
                      : 'var(--shadow-sm)',
                  }}
                >
                  {dose}mg
                </button>
              ))}
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-3 rounded-xl font-semibold text-sm"
                style={{
                  background: 'white',
                  border: '1px solid var(--border-light)',
                  color: 'var(--text-secondary)',
                }}
              >
                Back
              </button>
              <button
                onClick={handleFinish}
                className="flex-1 py-3.5 rounded-xl text-white font-semibold text-base"
                style={{
                  background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                }}
              >
                Start Tracking
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
