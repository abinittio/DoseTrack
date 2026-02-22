# DoseTrack

A pharmacokinetic/pharmacodynamic simulation engine that models drug absorption, distribution, and elimination using numerical ODE methods, then maps plasma concentration to predicted subjective effects via pharmacodynamic models.

Built for Vyvanse (lisdexamfetamine), a prodrug that requires enzymatic conversion before becoming active — a non-trivial PK problem that most simple calculators get wrong.

## What it does

Given a dose, body weight, and timing, DoseTrack solves a system of coupled ODEs to produce a full plasma concentration curve, then translates that into predicted effect intensity and therapeutic zone classification.

```
Dose → Gut absorption (first-order) → Michaelis-Menten prodrug conversion →
d-amphetamine disposition → Effect compartment → Sigmoid Emax response
```

The simulation handles:
- **Multiple overlapping doses** with independent gut compartments
- **Food effects** (altered absorption rate, delayed peak, reduced Cmax)
- **Dose-dependent peak timing** from saturable enzymatic conversion (20mg peaks at ~3.5h, 70mg at ~4.5h)
- **Adaptive personalisation** from user check-ins via Bayesian-style weight updates with IQR outlier rejection

## Mathematical models

| Model | Application |
|-------|------------|
| **RK4 integrator** | 1-minute timestep ODE solver for the PK state vector |
| **Michaelis-Menten kinetics** | Saturable LDX → d-amphetamine conversion (Vmax = 10 mg/h, Km = 8 mg) |
| **Sigmoid Emax** | Concentration-effect relationship (EC50 = 30 ng/mL, Hill coefficient = 1.5) |
| **Hill function** | State probability blending with threshold and saturation (EC50 = 0.4, n = 1.8) |
| **Tukey fences** | IQR-based outlier detection on prediction errors for robust learning |
| **Gaussian kernel** | Nicotine effect modelling (sigma = 7 min) |

PK parameters are calibrated against published clinical data (FDA Vyvanse label, Krishnan & Stark 2008, Ermer et al. 2010).

Full mathematical documentation: **[MATHS.md](MATHS.md)** — 317-line walkthrough of every equation in the system.

## Architecture

```
src/
  lib/
    pkpd-engine.ts    # ODE system, RK4 integrator, Sigmoid Emax, simulation loop
    store.ts          # Zustand state management with localStorage persistence
    insights.ts       # Pattern detection: peak timing, crash analysis, dose-response
    types.ts          # Type definitions for the PK/PD domain
    hooks.ts          # React hooks for real-time effect tracking
  components/
    Dashboard.tsx     # Real-time effect gauge and zone display
    PKCurve.tsx       # 24h plasma/effect concentration chart (Recharts)
    LogDose.tsx       # Dose entry with food context
    LogSubjective.tsx # Check-in for adaptive personalisation
    History.tsx       # Historical logs with mode tracking
    InsightsView.tsx  # Pattern analysis and trend detection
    Onboarding.tsx    # Weight/drug configuration
    EffectGauge.tsx   # Visual effect intensity indicator
```

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16, React 19 |
| Language | TypeScript (strict mode) |
| Simulation | Custom RK4 ODE solver |
| Charts | Recharts |
| State | Zustand with persistence |
| Styling | Tailwind CSS 4 |

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Disclaimer

DoseTrack is not medical advice. Predictions are estimates based on published pharmacokinetic data and user self-reports. Always consult a healthcare professional.
