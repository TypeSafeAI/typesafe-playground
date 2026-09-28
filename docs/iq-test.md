# Jev IQ-style test

Open `/simulations/iq-test` to give Jev twelve original multiple-choice reasoning questions: four numerical, four logical, and four text-based patterns. Each question states its assumptions and has a checked answer with an explanation. A complete run produces a numerical **Estimated IQ**, labeled **Uncalibrated heuristic**, alongside its raw score and category breakdowns. This is an educational practice set, not a standardized or normed IQ test; the estimate does not establish human IQ, a population percentile or general model capability.

## Run and inspect

The default **Local demo** always picks A. It makes no model requests and shows how the answer sheet works. Its 3/12 score and estimated value of 78 are scripted illustrations, not Jev's performance or an empirical random baseline.

Select **Live Jev**, then **Run test**, to use `jev-latest` with the configured key. The run sends at most twelve sequential requests. Each answered question stays visible for two seconds before the next question; the last answer has the same reading pause before the final report. Each request contains only that question's prompt, assumption, and four choices. Reference answers, explanations, other questions and previous results are not sent. Symbol patterns are text; Jev receives no images.

The question view follows the run automatically. A sticky player shows the current question, selected answer and correctness, with a **Stop** button. Selecting an earlier question suspends following while Jev continues; check **Follow current question** to rejoin the current question. Live answers show the reported confidence, choice probabilities and request time. Confidence does not determine correctness: code compares the selected option to the reference key. Reveal **Checked answer and explanation** to inspect that key.

After all twelve answers, the final report shows the numerical IQ estimate, raw score and percentage, total correct/incorrect/unscored counts, and numerical, logical and pattern breakdowns. Following moves the view and keyboard focus to that report. If you are inspecting an earlier answer, the report appears without moving your view. Open **How this estimate is calculated** to inspect the assumptions.

## Numerical estimate

The pure conversion in `lib/iq-estimate.ts`, version `assumed-reference-v1`, uses:

```text
estimated IQ = round(100 + 15 × (correct − 6) / 2)
```

The assumed raw-score mean of **6 correct out of 12** and standard deviation of **2 answers** are provisional design choices. They have not been measured in a human sample or validated for Jev. Six is the midpoint of this small set; the assumed two-answer spread maps its endpoints three scale deviations from 100. Changing these assumptions changes the estimate. The displayed whole number is rounded, not a claim of measurement precision.

| Correct | Estimated value |
| --- | --- |
| 0/12 | 55 |
| 3/12 | 78 |
| 6/12 | 100 |
| 9/12 | 123 |
| 12/12 | 145 |

The 100/15 scale follows a common standard-score convention described in [Pearson's assessment primer, pages 3–4](https://www.pearsonclinical.com.au/content/dam/school/global/clinical/ca/assets/featured-topics/assessment-primer-whitepaper-can.pdf). That source also explains that standardized reference values come from normative data. It does **not** validate this playground's assumed 6/2 reference values, its questions, or comparisons between Jev and people. No percentile, confidence interval, intelligence classification or clinical interpretation is inferred.

The estimate uses only checked correctness across a fully answered test. Confidence, response speed and provider errors do not add points. Scores outside 0–12 and other question-set sizes are rejected. Question content and answer keys remain unchanged; a different question set needs its own scoring-method review.

Every response must be a `choice`, select an offered option, report confidence in [0, 1], and include exactly the four offered probabilities, each in [0, 1], summing to 1 within 0.02. Malformed replies remain invalid and stop the run. Provider failures remain failed. Neither becomes a substituted answer or an incorrect guess.

## Incomplete runs and exports

**Stop**, a hidden tab, a key change or leaving the page aborts pending work. Reset discards the run, and late responses cannot repopulate it. There are no automatic retries or resumes; **Run test** starts a new full run. Questions after the stopping point remain **Not run**. Only twelve valid answers yield a final percentage; otherwise the page shows the answered count and correct subtotal.

The mode preference persists in browser storage. Results do not survive refresh. **Export** saves the question set, checked explanations, results, summary including category breakdowns, run status, requested model and execution mode under `reasoning-v1`. The `iqEstimate` object includes its numeric value, method version, `calibration: "uncalibrated"`, assumed raw mean/deviation and output scale parameters. An incomplete test has `iqEstimate: null` and no overall percentage; an incomplete category has no percentage. Exports exclude credentials and raw provider errors. An exported report is an inspectable record, not proof of provider authenticity or an independently certified benchmark. Usage remains in the playground's shared Usage panel; missing or cancelled usage is not treated as free.

Uniform random choices have an expected score of 3/12 because each question has four options and one checked answer. This expectation describes repeated complete tests, not a measured result or a pass threshold.

## Verification

`tests/iq-test.test.ts` independently works the reference solutions and checks request isolation, response validation, complete/partial scoring, the request cap, failures and cancellation. `tests/e2e/iq-test.spec.ts` covers local and mocked live runs, errors, reset, key changes, mode persistence, keyboard inspection, light/dark themes and narrow/short layouts. Automated tests make no live provider calls.
