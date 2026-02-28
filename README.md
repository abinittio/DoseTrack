# DoseTrack — Personal

Personal Vyvanse tracking app. Logs doses, models plasma concentration over time, and tracks subjective effects (focus, mood, appetite, crash).

> **Two versions exist:**
> - **This repo** — personal tool, simple and working. Bateman one-compartment model.
> - **[DoseTrack Pro](https://github.com/abinittio/DoseTrack-Pro)** *(coming)* — commercial product with full population PK, multi-drug support, clinical analytics, and statistical personalisation.

---

## What it does

- Log doses with date, time, and food context
- Predicts plasma concentration curve using a one-compartment oral absorption model (Bateman function)
- Tracks tolerance: acute (within-day) and chronic (7-day rolling)
- Subjective check-ins (focus, mood, appetite, crash) overlaid on the PK curve
- History calendar with per-day dose detail, edit, and delete
- Sleep debt penalty on predicted central activation
- Risk flags: late dosing, dose stacking, escalation pattern

## PK model

One-compartment Bateman function per dose, summed for multiple doses:

```
C(t) = (F · D · mwRatio / Vd) · (ka / (ka − ke)) · (e^(−ke·t) − e^(−ka·t))
```

| Parameter | Value | Source |
|-----------|-------|--------|
| ka (fasting) | 0.85 h⁻¹ | Tmax ≈ 3.8h (FDA label) |
| ka (fed) | 0.50 h⁻¹ | Tmax ≈ 4.7h (FDA label) |
| t½ (d-AMP) | 11h | Ermer et al. 2010 |
| Vd | 3.5 L/kg | Krishnan & Stark 2008 |
| EC50 | 30 ng/mL | Sigmoid Emax |

Effect (0–100%) is mapped via sigmoid Emax with tolerance-adjusted EC50. Tolerance shifts EC50 upward up to 60% based on acute and chronic exposure.

## Stack

Next.js 16 · React 19 · TypeScript · Zustand · Recharts · Tailwind CSS 4

## Running locally

```bash
npm install
npm run dev
# → http://localhost:3000
```

## Disclaimer

Not medical advice. Predictions are estimates based on published pharmacokinetic parameters. Consult a healthcare professional.
