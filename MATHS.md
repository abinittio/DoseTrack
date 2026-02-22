# DoseTrack — How The Maths Works

A plain-English (with equations) walkthrough of every calculation the app performs, in the order they happen.

---

## 1. Pharmacokinetic Model (Drug Concentration Over Time)

The app uses a **one-compartment oral absorption model**. This is the standard textbook model for drugs taken by mouth.

### The equation

```
C(t) = (D × F × ka) / (Vd × (ka − ke)) × (e^(−ke × t) − e^(−ka × t))
```

| Symbol | Meaning | Value used |
|--------|---------|------------|
| `C(t)` | Plasma concentration at time t | output (arbitrary units) |
| `D`    | Dose in mg | what you logged |
| `F`    | Bioavailability (fraction absorbed) | per-drug constant, e.g. 0.95 for dexamphetamine |
| `Vd`   | Volume of distribution | drug-specific `vdLPerKg × bodyweight_kg` (L) |
| `ka`   | Absorption rate constant | drug-specific `absorptionRateKa`, or `2.5 / tmax` fallback (h⁻¹) |
| `ke`   | Elimination rate constant | `ln(2) / half-life` (h⁻¹) |
| `t`    | Hours since dose | calculated from logged time |

**What it captures:** the drug rises as absorption from the gut delivers it into the blood (`e^(−ka×t)` term falls fast), then falls as the body clears it (`e^(−ke×t)` term falls slowly). The peak happens at roughly `tmax` hours after the dose.

**Prodrug adjustment (e.g. Vyvanse):** lisdexamfetamine must be enzymatically cleaved into active dexamphetamine by red blood cells before it works. A fixed 45-minute delay is subtracted from `t` to approximate this conversion step:
```
effectiveT = max(0, t − 0.75)
```

---

## 2. Normalising Concentration (0–1 scale)

Raw concentration is in arbitrary pharmacokinetic units that depend on dose and weight. To compare "how much of this drug's effect is present right now" regardless of dose, it gets normalised:

```
normConc = C(t) / C_peak
```

`C_peak` is computed using the same equation above, but evaluated at `tmax` (the expected peak time) for the logged dose. This means:

- `normConc = 1.0` → you are at peak effect for this dose
- `normConc = 0.5` → you're at half the peak effect
- `normConc > 1.0` → you've stacked multiple doses (allowed, the model handles it)

Multiple doses of the same drug are **summed in raw concentration space** before normalising. This correctly models stacking — two doses push the normalised value above 1.0, and the effects amplify with diminishing returns (see §3).

---

## 3. Mapping Concentration → State Probabilities

Given `normConc`, the model predicts probabilities across five mental states: **focused, tired, wired, calm, baseline**.

### Step 1 — Sharpen the drug's weight profile

Each drug has a `defaultStateWeights` vector (e.g. for Vyvanse: high focused, moderate wired, low tired). These weights are sharpened so the drug's dominant state stands out more clearly:

```
sharpened[s] = (weights[s] / max_weight) ^ 1.5
```

Then normalised to sum to 1. The exponent `1.5` is a sharpening parameter — values above 1 increase contrast between states.

### Step 2 — Hill function blend

A Hill-equation sigmoid determines how much the drug's profile dominates versus the no-drug baseline:

```
blend = normConc^n / (normConc^n + EC50^n)
```

with `EC50 = 0.4` and `n = 1.8`.

This means:
| normConc | blend (drug influence) |
|----------|----------------------|
| 0.0      | 0%  — pure baseline |
| 0.4      | 50% — half effect |
| 1.0      | 84% — near-peak single dose |
| 2.0      | 95% — stacked doses |

The Hill function was chosen over a simple linear scale because real drug effects have a threshold (you don't feel much below ~0.3) and a saturation (doubling a dose doesn't double the effect).

### Step 3 — Blend baseline and drug profile

```
P(state) = (1 − blend) × baseline[state] + blend × sharpened[state]
```

The no-drug baseline is fixed at: focused 5%, tired 10%, wired 2%, calm 13%, baseline 70%.

### Multiple drugs

When two different drugs are active simultaneously, each produces its own probability vector. These are blended **weighted by their normalised concentration**:

```
P_combined(state) = Σ (normConc_drug_i / total_normConc) × P_drug_i(state)
```

This weights the dominant (higher-concentration) drug more.

---

## 4. Recreational Substance Modifier

Recreational logs don't have a PK model — instead they apply an **exponential additive shift** to the already-computed state probabilities.

```
fade = e^(−1.5 × hoursAfterUse / duration)
strength = 0.45 × fade
```

`strength` starts at 0.45 (45% maximum shift) and decays exponentially to ~0 by the end of the specified duration. The shifts applied are:

| Profile     | focused      | tired       | wired       | calm        | baseline    |
|-------------|-------------|-------------|-------------|-------------|-------------|
| depressant  | −0.40 × s   | +0.35 × s   | −0.30 × s   | +0.50 × s   | −0.15 × s   |
| stimulant   | +0.25 × s   | −0.45 × s   | +0.45 × s   | −0.25 × s   | —           |
| mixed       | −0.35 × s   | +0.25 × s   | +0.15 × s   | +0.35 × s   | —           |
| psychedelic | −0.40 × s   | —           | +0.25 × s   | +0.15 × s   | −0.20 × s   |

After applying, probabilities are clamped to ≥0 and re-normalised to sum to 1.

---

## 5. Nicotine Bump

Nicotine produces a short, sharp alertness spike modelled as a **Gaussian (bell curve)** in time:

```
bump = min(0.3, 0.08 × quantity) × exp(−0.5 × (hoursAfterUse / σ)²)
```

with `σ = 7/60` hours (7-minute standard deviation). This gives a ~15-minute effective window. The bump is added:

```
focused += 0.40 × bump
wired   += 0.50 × bump
tired   -= 0.30 × bump
```

Then re-normalised. The Gaussian was chosen because nicotine's CNS effect peaks within minutes and dissipates quickly, unlike oral drugs.

---

## 6. Expanded State Effects

Beyond the five core states, each drug has an `expandedStateEffects` map: scores between −1 (suppresses) and +1 (promotes) for five additional states — anxious, irritable, euphoric, brainfog, overstimulated.

These are scaled by normalised concentration at the current moment:

```
effect[state] = magnitude × clamp(normConc, 0, 1)
```

Contributions from all active drugs are summed. These expanded scores are used in the Subjective Experience Score (§7) but are not part of the core probability vector.

---

## 7. Subjective Experience Score (0–100)

A single number summarising predicted wellbeing. It combines core state probabilities and expanded state scores:

```
positive = P(focused) × 48
         + euphoric_score × 25        (clamped to ≥0)
         + P(calm) × 10
         + fog_clearing × 12          (−brainfog_score if negative, i.e. drug clears fog)

negative = anxiety_score × 50
         + overstim_score × 45
         + irritable_score × 25
         + max(0, P(wired) − 0.15) × 20   (excess wired beyond 15% probability)
         + P(tired) × 12

score = clamp(50 + positive − negative, 0, 100)
```

**Anchor points:**
- Baseline with no drugs → ~53 (slightly above 50, "FLAT" zone)
- Peak Vyvanse 40mg → ~90 ("ON FIRE" zone)
- High anxiety / overstimulation → can fall below 20 ("ROUGH" zone)

The zones are: ON FIRE (85–100), LOCKED IN (70–84), CRUISING (55–69), FLAT (40–54), CLOUDY (20–39), ROUGH (0–19).

---

## 8. Personalised Model Learning (Bayesian-style Update)

Each time you submit a check-in, the model updates the drug's state weight vector using a gradient-descent-style rule. It adjusts weights to make future predictions agree more with what you reported.

### Weight update

For each state `s`:

```
w[s] ← w[s] + α × (y[s] − p[s]) × concFactor
```

Where:
- `y[s]` = 1 if you reported this state, 0 otherwise (one-hot encoding of your reported dominant state)
- `p[s]` = predicted probability at the time of check-in
- `concFactor = max(0.2, normConc)` — floored at 0.2 so comedown check-ins still count
- `α` = adaptive learning rate

### Learning rate

```
baseAlpha = max(0.01, 0.1 / √(1 + feedbackCount/10))
α = baseAlpha × (0.6 + 0.16 × intensity)
```

The learning rate **decays** as you provide more check-ins (the model becomes more confident and changes less with each new data point). It **scales with intensity** (1–5) — a strong feeling provides a stronger training signal than a mild one.

After updating, weights are clamped to [0.01, 1.0] and re-normalised to sum to 1.

### IQR outlier detection (W3 lab)

Before each weight update, the prediction error for the reported state is computed:

```
error = 1 − p[reportedState]     (0 = model was perfect, 1 = model was completely wrong)
```

A rolling window of the last 20 errors is maintained. If the current error is beyond the **Tukey upper fence**:

```
Q1, Q3 = 25th and 75th percentile of recent errors
IQR    = Q3 − Q1
fence  = Q3 + 1.5 × IQR

if error > fence  →  outlierFactor = 0.3   (down-weight this check-in 70%)
else              →  outlierFactor = 1.0
```

The full learning rate becomes `α = baseAlpha × intensityScale × outlierFactor`. This prevents single atypical days (illness, unusual context) from distorting the model. IQR detection only activates once 8+ errors are stored.

### Mode tracking (W3 lab)

A count of each reported state is maintained across all check-ins: `reportedStateCounts[state]++`. The **mode** — the most frequently reported state — is derived as `argmax(reportedStateCounts)`.

A small mode bias is added alongside the gradient update:

```
w[modeState] += baseAlpha × 0.15 × 0.1
```

This is 10–20× weaker than the main update, acting as a gentle prior that tilts the weights slightly toward your most common subjective experience rather than purely the weighted mean. The mode is also displayed in the history view alongside the mean prediction bars.

### Std-based confidence (W3 lab)

Confidence is now computed from the **standard deviation of the weight vector** rather than a raw count threshold:

```
σ = std(stateWeights)                      # std of the 5-element weight vector
countFactor = min(1, log(n + 2) / log(30)) # ramps from 0 → 1 over first 30 check-ins

confidenceScore = σ × countFactor
```

| confidenceScore | Label |
|----------------|-------|
| < 0.06 | Early days (uniform weights or too few check-ins) |
| 0.06–0.12 | Getting there (some differentiation emerging) |
| > 0.12 | Great (weights clearly concentrated on dominant states) |

The `countFactor` prevents a lucky first few check-ins from falsely jumping to high confidence. σ ranges from 0 (all weights equal at 0.2) to ~0.28 (fully concentrated on one state). Displayed as a "consistency %" bar in history: `consistency = σ / 0.28 × 100`.

### Timing personalisation

The model also adjusts `tmax` and `half-life` offsets based on discrepancies between what was predicted and what you reported:

| Observation | Adjustment |
|-------------|-----------|
| High predicted conc, but you feel baseline/tired | Drug wore off faster → reduce `halfLifeOffset` by `0.5 × timingAlpha` |
| Low predicted conc, but you feel focused/wired | Drug lasts longer → increase `halfLifeOffset` by `0.5 × timingAlpha` |

`timingAlpha = 0.05 × α` — timing adjusts 20× slower than state weights because timing data is noisier.

Offsets are clamped to ±1h (tmax) and ±2h (half-life).

### Confidence levels

| Check-ins | Label |
|-----------|-------|
| < 10      | Early days |
| 10–29     | Getting there |
| ≥ 30      | Great (high confidence) |

---

## 9. Food Effect Modelling

When a dose is logged with context `with_food`, three PK modifiers are applied (per-drug values):

```
ka_effective  = ka / tmaxMultiplier        (food slows absorption → later peak)
F_effective   = F × bioavailabilityMult    (food may change total absorption)
Cmax_adjusted = C(t) × cmaxMultiplier      (food may reduce peak height)
```

For example, Vyvanse with food: tmax delayed 28% (3.5→~4.5h), Cmax reduced 5%, AUC unchanged.

---

## 10. What the model does NOT do

- It does not use recreational logs as training data — only medication doses
- It does not model tolerance or sensitisation over time
- It does not model inter-individual pharmacogenomic variation (e.g. CYP2D6 genotype)

These are all potential future improvements.
