# SMT solver lab

Open `/governance/smt-solver`, paste constraints, choose a type, and click **Run Check**. Jev makes a closed-set prediction; a real [Z3 solver](https://github.com/Z3Prover/z3/tree/master/src/api/js) then verifies the complete constraint set on the server. No key is required for Z3. Jev uses the existing server-only `TYPESAFE_API_KEY` setup.

```text
x > 5
x < 3
```

Z3 returns `unsatisfiable`. The seeded Boolean availability assignments return `satisfiable`; flags alone do not imply a scheduling policy.

## Supported language

Use one constraint per line. Identifiers contain letters, underscores and digits, starting with a letter or underscore. Values are Booleans or integers. Operators: `=`, `==`, `!=`, `<`, `<=`, `>`, `>=`, `+`, `-`, multiplication by an integer constant, `!`, `&&`, `||`, and implication `=>`. Parentheses group expressions. Lines beginning with `#` are comments.

For scheduling, declare integer start/end values and explicitly require non-overlap:

```text
a_start = 9
a_end = 11
b_start = 10
b_end = 12
(a_end <= b_start) || (b_end <= a_start)
```

The type dropdown supplies context; operands determine Boolean/integer sorts. Otherwise unconstrained equality variables default to Boolean for Boolean logic and integer for the other categories. Unsupported syntax, mixed sorts, nonlinear multiplication, decimals, functions and arbitrary SMT-LIB commands are rejected. Limits: 12,000 input characters, 60 constraints, 40 variables, 160 tokens per constraint and bounded expression depth. The parser emits only trusted SMT-LIB operators and quoted identifiers; user text is never executed as JavaScript or passed directly to Z3.

## Jev and exact verification

Each question includes the full structured group: variables, declared sorts, original constraints and `can_all_constraints_be_true`. Choices are `satisfiable`, `unsatisfiable`, `needs_decomposition`, and `unknown`. The conservative score is the lower of confidence and selected-label probability. Missing scores or scores below 0.85 become `needs_decomposition`. Jev produces no proof or open-ended solution.

Decomposition builds connected components by shared variables. Only independent components run separately, with up to three requests in parallel. A connected problem stays intact. One high-confidence contradictory component predicts unsatisfiability; satisfiability requires every component to predict it confidently. Other combinations require decomposition. The aggregate minimum score is not a calibrated joint probability.

High-confidence Jev contradictions are prioritized for exact verification. Every completed run checks the full problem with Z3, including uncertain or failed Jev calls. Definitive disagreement uses Z3's answer. `unknown` is unresolved and requires retry or human review. The full-check option reinforces exact verification; this prototype does not export proof certificates.

The server serializes Z3 operations because the WASM bindings are not thread-safe, caps the queue, and sets a three-second solver timeout plus a resource limit. `/api/solve` returns `unknown` on resource/runtime failures. The Next.js deployment externalizes `z3-solver` and traces its WASM assets. Z3 is initialized lazily; the first request includes startup time.

## Benchmarks

**Run benchmark** measures five seeded cases using live Jev and Z3. Rows start empty, never with invented results. Agreement rate uses cases with a definitive exact answer and a confident Jev prediction; abstentions and unknowns are counted separately. Z3 latency includes server queue/init/check time, while Jev latency includes the network round trip and parallel group work. Single-run panels also show the exact solver's round trip. These small cases do not establish general model accuracy or performance.

Modules: `lib/smt/parser.ts`, `classify.ts`, `exact.ts`, `runner.ts`, `examples.ts`; server route: `app/api/solve/route.ts`; UI: `components/SmtSolverLab.tsx`.
