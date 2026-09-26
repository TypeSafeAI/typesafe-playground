# Document extraction

Open `/language/extraction` in the Next.js playground. Paste document text, select fields,
and choose **Run extraction**. The included invoice has an issue date, due date,
vendor, subtotal, tax, and final amount so the ranking is visible.

The prototype uses three functions in `src/extraction/extraction.ts`:

- `extractCandidates(text)` finds source spans with regular expressions. It returns
  candidates for `date`, `counterparty`, `amount`, and `document_type`, including
  exact values, character offsets, and short source snippets.
- `rankWithJev(field, candidates, text)` submits a choice question containing
  candidate IDs and an explicit `null` choice. It maps the selected ID back to
  the source value. An unknown ID or invalid probability is an error.
- `runExtraction(text, { fields?, signal? })` extracts once and ranks up to three
  fields in parallel. Failures remain visible per field; completed fields survive.

Jev does not generate text. Field instructions favor the issue date, issuer or
vendor, and final amount; they prohibit inference, calculation, and following
instructions embedded in the document. Evidence is copied locally, not generated.
The [TypeSafe choice API](https://docs.typesafe.ai/introduction/quickstart) returns
probabilities over named criteria. The UI displays the selected choice's
probability and, when supplied, Jev's separate confidence. Neither is a guarantee
that the field is correct.

If no candidates exist, the field returns `null` locally without a network call
or invented confidence. A model-selected `null` has its own returned probability.
Request errors are shown as **Failed**, not as a successful null extraction.

## Run locally

Requires Node.js 22 or newer:

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
# Edit .env.local and set TYPESAFE_API_KEY to your key.
pnpm dev
```

Open http://localhost:3042/extraction (or the port printed by Next.js). The server
reads `TYPESAFE_API_KEY`; it is never sent to the browser. `.env.local` is ignored
by Git. Do not use a `NEXT_PUBLIC_` variable for this key.

```sh
pnpm test
pnpm typecheck
pnpm build
```

The shared `/api/run` Next.js route validates requests, bounds request/response
sizes, attaches authorization, and calls TypeSafe. Text is sent to TypeSafe only
when you run the extraction.

## Scope

The rules handle common English dates, labeled vendors or company-name lines,
USD amounts, and explicitly printed document types. They are a prototype, not OCR
or a universal invoice parser. Values retain their source formatting. Identical
values are deduplicated and use their first source span. Documents are limited to
40,000 characters and each field to 100 distinct candidates. Oversized documents
are rejected explicitly; split them into smaller sections. No candidates are
silently dropped. Ambiguous documents may return null.
