# Jev Chat

Open `/language/jev-chat` for a chat workspace using Jev and scripted language composition. **Compose** is the default engine for new conversations. **Baseline** retains the original whole-reply selector for comparison. This is experimental software: neither scripted demo results nor hash verification establish live model quality or parity with leading LLMs.

## Conversation experience

Choose Meet Jev, Support desk, Your notes, or Story studio. Starter cards fill the composer without sending. Enter sends; Shift + Enter adds a line. Choose Local demo or Live Jev before the first message. Engine and mode remain fixed within a thread; response detail and personality can change between turns in Compose. Existing saved threads retain their baseline engine.

The **Personality** selector offers **Default**, **Friendly**, **Playful**, and **Professional**. It changes authored greetings, acknowledgements, help introductions, and source framing in both demo and live mode. The choice is saved per conversation, included in exports and response traces, and inherited by new conversations. Changing it affects future replies; older replies retain their original text and trace. Existing chats without a personality use Default. Baseline keeps its original replies.

Personality uses fixed language choices, not a free-form system prompt. Quoted evidence, clarification wording, story tone and constraints, calculations, and confidence gates stay intact. Live response evaluation sees the actual personalized candidates within the same two-request budget. A friendly or playful introduction does not establish that the following content is correct.

Jev Chat has one shared hometown preference: **Houston > Dallas. Always.** Direct rivalry questions such as “Houston or Dallas?”, “Is Houston better than Dallas?” and “Is Dallas greater than Houston?” receive the same authored answer across personalities, engines, and modes. The reply is labeled **Hometown preference**, uses no model requests, and persists with its trace. Factual comparisons, quoted questions, and requests with additional tasks still use the normal evidence and interpretation rules.

Both engines also include all 50 U.S. state capitals, checked against the [50states reference list](https://www.50states.com/tools/thelist.htm). Ask “What is the capital of Texas?”, “Capital of NY”, “Which state is Austin the capital of?”, or “List all 50 state capitals”. Names and postal abbreviations resolve to the same entry; multiple-state requests require every state to be recognized. These replies display **Built-in knowledge**, link the reference in their composition details, and use no API requests in either mode. This is an application reference table, not model training. Historical capitals, populations, territories, other countries, and additional tasks use the normal interpretation path. The hometown preference never changes the state-capital facts.

Local demo uses deterministic intent and lexical evidence rules. Factual note answers require literal question-term coverage, with limited checks for requested counts and times. Identical statement patterns with different numeric values trigger clarification while preserving entities and conditions. These rules cannot establish general semantic support or detect arbitrary contradictions; unfamiliar paraphrases may need clarification. Local demo does not call Jev. Live mode uses the existing TypeSafe key setup and `/api/run`; no other model provider, embedding model, or text-generation API is involved. Live conversations have at most two Jev requests per turn. Calls still use the shared usage recording, personal-key precedence, rate limits, cancellation, redaction, and quota behavior.

Every response labels its execution mode. Source passages, authored guide content, and fictional compositions retain separate provenance. Expand **How this response was composed** for candidate responses, the selected plan, usage, timing, intent probability, distribution confidence, and the ordered content graph. **Verify content** checks graph integrity again; **Export trace** includes the text and evidence, not API key settings.

Complete built-in requests such as **Explain how Jev works**, **How does Jev work?**, **What happens to my data?**, and **What does confidence mean?** render documented application help directly in either mode. They display **Scripted help** alongside the conversation mode, report zero Jev requests and tokens, and have no model probability or confidence. Extra instructions, negations, and quoted commands follow the normal interpretation path. Explicit repetition feedback receives recovery guidance; after an old generic clarification of a recognized help request, it also recovers the missed explanation. Repeated uncertain selections offer concrete help topics instead of immediately repeating the initial clarification. These routes do not demonstrate live semantic quality.

## Engine architecture

`lib/jev-chat/` is independent of React, Next.js, localStorage, environment credentials, and direct networking. `respond(input, dependencies)` receives an optional injected Jev transport, AbortSignal, progress callback, and clock. It can run in a browser or CLI.

1. `knowledge.ts` checks bounds, collects authored propositions and exact note paragraphs, and resolves explicit ordinal references against the prior assistant's offered options. Complete references can include a leading or trailing “please”; extra requirements are retained for interpretation. The full supplied conversation remains available to Jev. Missing references stay unresolved.
2. `engine.ts` checks complete documented help, repetition-feedback commands, hometown rivalry questions, and state-capital lookups before requesting inference. Other live requests batch intent, evidence relevance, source-conflict checks, applicable fiction-field modes and value acceptance judgments, and source calculation choices into one request. Question instructions treat messages and sources as untrusted data. It preserves probability and confidence separately; they are correlated signals, not independent proof.
3. `grammar.ts` constructs compatible complete plans. Operations currently cover capabilities, greetings, acknowledgement, explanation, source answers, source comparisons, extractive summaries, synthetic support, clarification, and short fiction. Source plans preserve relevance order when choosing a focused extract; equal judgments retain the original order. Comparisons can present evidence side by side without inventing a winner. Source answers preserve exact wording. Fiction combines a bounded character/setting/obstacle/resolution vocabulary with scripted sentence structures and an optional user theme.
4. Outside the built-in help, hometown preference, and state-capital routes, live mode uses a second request to assess whole responses whenever multiple plans exist or a single plan gives a factual or creative answer. Factual plans retain their Choice and support gates. Fictional candidates each need an acceptance noul of at least 0.8; when several are offered, typed scores rank accepted candidates by narrative progression, then texture, with original order resolving exact ties. A revision with only one candidate needs acceptance only. The judge is asked to check every requested part and preserve relevant conditions. Greetings, capabilities, acknowledgements and fallbacks do not require this second assessment. No acceptable candidate yields clarification. Invalid or incomplete responses fail; no provider failure becomes a demo success. Outgoing requests also pass the playground's actual typed request validator; absent numeric operands never produce invalid one-option choices.
5. `graph.ts` hashes and verifies the ordered fragments before display. `persistence.ts` validates restored shapes, checks that quoted passages still correspond to saved notes, and replays any calculation proof against the full ordered source collection.

## Calculations from notes

The composition engine can calculate a sum, absolute difference, minimum, maximum, or ordered ratio of two compatible source figures. Jev selects the operation and operand IDs using typed choices; `quantities.ts` computes with exact rational arithmetic. No model-generated expression is executed. Each operand must identify the same kind of attribute, such as price or duration, and compatible units. Supported unit conversions use declared factors; currency conversion is unavailable. A ratio with a zero denominator cannot produce a result.

For example, add two paragraphs in **Your notes**:

```text
Alpha costs 12 credits.

Beta costs 18 credits.
```

Ask **What is the price difference between Alpha and Beta?** The calculated response contains `|12 credits − 18 credits| = 6 credits` and the original passages. **Check the calculation** shows the selected source figures and a separate fingerprint. **Verify calculation** re-extracts the source spans, recomputes the arithmetic, and checks its binding to the displayed response. A valid calculation does not establish that the figures are true or that Jev selected the right figures for the question.

Extraction deliberately supports a narrow numeric grammar. Qualified quantities, ambiguous formats, unknown attributes, incompatible currencies, unsupported operations and uncertain selections need clarification. Extraction is capped at 32 figures; overflow produces no partial calculation. The chat currently selects exactly two operands, even though the arithmetic module can aggregate a larger explicitly supplied set.

Local demo recognizes explicit arithmetic phrases and requires exactly two extracted figures from separate source paragraphs. It declines ordered ratios and partial or unfamiliar references; live Jev can select the operand order. These local rules are illustrative and do not measure semantic understanding. A normal **Compare Alpha and Beta** request still produces a source comparison without assuming a numerical operation.

The 0.8 confidence gate remains conservative pending reviewed calibration. A supplied selected-option probability below 0.8 also prevents automatic selection. Missing usage remains unknown. Demo reports zero model calls and no model confidence. A model assessment of semantic support is not a factual proof.

Focused source plans include up to two, three or five selected passages according to response detail. Any omitted selected passages are disclosed. For six to forty relevant passages, the engine also offers an extract containing all selected passages in original source order. This is an evidence inclusion option, not a claim of semantic completeness or a rewritten summary. Jev chooses among the actual candidates; relevance judgments and more included text do not prove answer quality. If alternatives exceed the existing request budget, the engine removes alternative renderings while retaining the full extract when available. It does not shorten source text or conversation history to fit them.

The current implementation is a foundation for semantic composition, not a general reasoning engine. It does not independently derive arbitrary claims, perform unrestricted language generation, execute model-written code, browse, or transact. Fictional diversity is bounded by the language rules and vocabulary. The active implementation ledger tracks remaining work toward the broader quality target.

### Precise source excerpts

Live factual answers can select exact sentences from longer note paragraphs. A deterministic scanner proposes up to 32 spans in source order, preserving their original wording and UTF-16 offsets. It uses conservative English punctuation rules and avoids known abbreviation, initial, acronym and ellipsis boundaries. Ambiguous or unsupported boundaries remain joined; this is not a general language parser. A paragraph with only one span keeps its existing whole-paragraph candidate.

Excerpt judgments share the first Jev request and require both parent relevance and excerpt acceptance of at least 0.8. The engine offers a focused excerpt response alongside its paragraph candidates; the complete response must still pass the factual selection and support gates. The second request includes full parent paragraphs and asks Jev to check omitted conditions and references. Exact quotation and probabilistic acceptance do not establish entailment or truth.

Response detail limits an excerpt candidate to two, three or five selected spans. Selected spans appear in source order, and omissions from the accepted set are disclosed. **View supporting passages** retains the full parent paragraphs. Span offsets participate in the response fingerprint; saved replies must match those exact slices of their original parents before restoration.

These optional proposals are unavailable in local demo and when story questions are present. If they exceed the first request's size budget, the engine removes proposals from the end and records omission while any remain. Original notes and conversation are retained. No extra provider request is added; live excerpt quality, latency and cost remain unmeasured.

### Story continuity

New scenes use six scripted obstacle recipes with explicit causal steps. Jev assesses permitted values from the declared character, setting, obstacle, resolution, tone, ending and detail vocabulary; application code selects compatible values and renders the prose. Reflective, suspenseful and hopeful tones change pacing and observations. An open ending leaves the outcome unresolved; a resolved ending supplies a concrete outcome. A quoted theme is an inspiration label, not evidence that arbitrary requested themes or events have been realized.

Follow-up suggestions can make the current scene more suspenseful, give it an open ending, or shorten it. The local demo also accepts hopeful/reflective tone and more detailed rendering. It recognizes a small explicit editing grammar and asks for a supported direction when additional clauses are unrecognized. Live Jev evaluates each requested edit independently, preserves unrequested choices, and checks the complete revision in a second request. Low-confidence decisions and unsupported requests require clarification; these model judgments do not prove semantic fidelity.

Live Jev classifies each field as constrained, delegated or preserved. Every field-mode judgment must meet the existing 0.8 gate. It independently assesses each available value with a noul; constrained fields can use only values receiving at least 0.8. For example, “any character except the keeper” can produce several accepted characters. Seeded local rules choose among them in canonical vocabulary order. An empty accepted set requires clarification. Values below the gate cannot be substituted to make a scene possible.

For confidently delegated fields, seeded local rules choose from the available vocabulary. A delegated revision chooses a different value for that field, while preserved fields keep their current values. Response detail defaults to the interface setting; a constrained detail request keeps that setting if accepted, otherwise selects from the accepted alternatives. Every expected answer is validated, including judgments for delegated or preserved fields. Invalid or missing answers fail. The additional judgments share the first batch; live composition still uses at most two requests and retains the existing request-size and question-count limits.

For live fiction, local planning keeps the seeded assignment first and selects up to two distinct alternatives from the permitted combinations. Each additional assignment maximizes its minimum number of changed fields relative to those already selected; deterministic order resolves ties. The search examines the fixed vocabulary product and retains at most three assignments. Preserved fields and the interface's accepted detail setting remain fixed. This gives the complete-response judge alternative combinations to consider, including when a character and setting must match each other.

New scenes retain three wording variants, using distinct assignments when available. A revision preserves the prior wording variant and theme across all candidates; only requested fields vary. If only one assignment is available, the revision has one candidate. Saved alternate revisions retain their complete frames, verify against the exact rendered text and remain usable in subsequent turns. Existing primary story IDs and older saved stories remain supported.

These contracts separate permission to invent from interpretation of an explicit requirement. They do not establish that Jev interprets every requirement correctly. Independently accepted fields may conflict when combined, so the second request must still accept the complete response before display. Only the proposed candidates receive semantic assessment; local diversity search does not solve arbitrary correlated constraints or guarantee that an acceptable combination will be offered. Live adherence, clarification rates, latency and cost remain unmeasured.

Final fiction ranking uses two two-level rubrics, so each score spans 0–1. Progression evaluates whether concrete actions earn the outcome; texture evaluates whether observations are specific to the scene. A candidate must pass the acceptance gate regardless of its ranking scores. Low ranking confidence is retained as uncertainty about a preference and cannot establish acceptance or verified artistic quality. Missing, out-of-range or inconsistent score distributions fail the response. See the [TypeSafe score contract](https://docs.typesafe.ai/primitives/score) for ordinal scores and their probability distributions.

Saved story frames preserve choices, theme, tone, ending, detail and variation. The engine re-renders a frame against the exact assistant message before using it; saved responses also verify their content graph. Changes to the interface's response-detail selector apply to the next revision, and a successful language request for shorter or more detailed output updates that selector. An intervening non-story assistant reply ends implicit revision context. Older stories remain readable but lack structured revision state; start a new scene to use these controls. Integrity checks do not authenticate who wrote a saved frame.

## Playground and standalone application

Develop and evaluate the shared engine in this repository first. Keep conversation interpretation, composition, and response graph verification behind `respond(input, dependencies)`. The playground supplies the transport, credentials UI, usage reporting, persistence, and diagnostic interface. The offline evaluation CLI already exercises the same engine without React or Next.js.

A later standalone chat application should import the same engine through a versioned package and supply its own transport and storage adapters. Extract that package when there is a second consumer; avoid maintaining two implementations. Keep the playground as the comparison and failure-analysis surface. A separate app becomes useful when product needs require independent onboarding, account/sync features, deployment, or release cadence. Moving the interface alone does not improve response quality.

Before positioning the standalone experience as a capable general chat product, establish held-out live semantic results, reviewed creative and multi-turn quality, latency and cost measurements, and recovery behavior. Hash integrity and offline fixture passes do not satisfy those quality gates.

## Cryptographic boundary

The graph is a content-addressed DAG with text leaves and ordered sequence nodes. SHA-256 hashes canonical JSON encoded as UTF-8. Identical leaves share storage; repeated references still repeat text in the requested order. Changing content, provenance, source span offsets, separator, or child order changes the relevant hashes.

Verification rejects malformed fields, unknown references, cycles, unreachable nodes, altered hashes, excessive depth, and oversized documents. Limits are 128 nodes, depth eight, 24,000 rendered UTF-16 units, and 128 KiB of canonical graph data. A caller can edit content and recompute hashes; this is integrity checking, not a signature, source authentication, or proof of truth. Saved traces are labeled accordingly.

## Sources, privacy, and persistence

Separate note paragraphs with blank lines. Notes remain untrusted data; a paragraph can contain false or hostile text. The engine never treats it as authority to execute an action. Exact quotation proves only that the text appeared in the supplied source.

Limits remain 12,000 note characters, 40 paragraphs, 2,000 characters per user message, 40 messages per conversation, and 50,000 serialized conversation characters. The engine additionally bounds serialized Jev requests at 100,000 characters. Oversized inputs fail rather than silently truncating source material.

Up to 12 conversations and unsent drafts are stored locally, unencrypted, under `jev-chat-sessions-v1`, subject to a shared 1,500,000-character serialized storage budget. Response traces count toward that budget. A save that exceeds it leaves the last saved snapshot intact and displays a notice; export and remove older conversations to free space. Existing baseline threads remain readable.

Composed replies are restored only after shape, hash, rendered-text, and source checks; failed responses are excluded from context while their user messages remain available for recovery. If existing history is oversized, malformed, or only partially recoverable, automatic saving pauses and preserves the original stored bytes. **Export stored history** downloads those bytes. **Replace stored history** asks for confirmation before saving the visible conversations over them. Normal conversation export includes notes and conversation text, so keep secrets out of both.

Stop cancels a pending request. The engine enforces a shared 60-second response deadline across its transport calls, forwards cancellation, and rejects stalled transports even when they ignore the signal. API-key changes and unmounts abort work, and revision checks discard stale responses. Failed/stopped turns remain editable or retryable. No automatic live calls occur on load, topic selection, or history restore.

## Verification and evaluation

Unit tests exercise graph corruption, canonicalization, bounded expansion, intent routing, source preservation, references, composition, fiction provenance, strict provider parsing, cancellation, storage restoration, and the baseline. Browser tests cover both engines, two-stage mocked live requests, late failures, saved drafts, trace verification, source notes, keyboard navigation, themes, and narrow screens.

Provider responses are mocked in automated tests. The separate evaluation harness compares scripted behavior on reviewed synthetic fixtures and explicitly leaves semantic quality, live Jev quality, and comparison with leading models unmeasured until suitable evidence is supplied. Passing software checks cannot establish the user's broader LLM-quality objective.

The [evaluation guide](jev-chat-evaluation.md#evaluate-a-complete-conversation) also describes linked conversation runs: subsequent turns consume the actual prior replies, options and story frames under one global request budget. Offline replay checks the complete chain. These artifacts enable conversation review without treating a scripted or mocked trajectory as live quality evidence.
