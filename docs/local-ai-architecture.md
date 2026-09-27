# Plutus Local AI — Architecture, Tools, Proposals & Voice

Audience: engineers working on `src/features/local-ai` and `modules/plutus-local-ai`.
Everything below runs on the device. Nothing in this pipeline makes a network
request after the model download.

```text
USER (typed text or voice)
  │  voice: 16 kHz mono PCM WAV → Gemma audio input → transcript (text)
  ▼
resolveIntent()            intent-router.ts   language, intent, tool packs, period, mutation intent
  ▼
plan / mandatory calls     chat-controller.ts model plans JSON; broad advice skips planning
  ▼
runChatTools()             chat-tools.ts      trusted selectors only → EvidenceBundle
  ▼
synthesis                  chat-prompts.ts    model explains the evidence, never computes it
  ▼
answer + live cards        components/chat-cards.tsx

Mutation branch:
model → prepare_change args → ProposalStore.prepare() → ChangeProposal (dry run, nothing saved)
      → ChangeProposalCard (user edits / cancels / confirms)
      → ProposalStore.execute() (only from the confirm tap) → domain function → MutationResult
      → result is added to the conversation and the model explains what actually happened
```

## 1. Tool registry

| File | Role |
| :-- | :-- |
| `tools/tool-catalog.ts` | Pure data: every tool name, its pack, accepted argument keys and the one-line guide the model sees. |
| `chat-tools.ts` (`TOOL_RUNNERS`) | Maps each read tool to its trusted implementation; `runChatTools` enforces the prompt budget and builds the evidence bundle. |
| `tools/tool-context.ts` | Shared read context: profile matcher, search index, period anchors, saved-rate conversion, liquidity, monthly baselines, entity resolution. |
| `tools/*-tools.ts` | One file per pack. Every function takes `(ToolContext, args)` and returns a `ToolOutput`. |

Packs and their capabilities (66 read tools + `prepare_change`):

- **core** — `financial_snapshot`, `financial_health` (per-pillar score), `financial_priorities`, `financial_advice_context`, `data_quality_audit`, `analysis_coverage`
- **transactions** — `search_transactions` (pagination, receipt/label/place/person/budget/loan/currency filters), `transaction_details`, `merchant_analysis`, `spending_summary` (+ parent_category, currency, budget groups), `spending_trend`, `cash_flow`, `compare_periods` (+ grouping), `largest_expenses`, `recent_transactions`, `unusual_transactions`, `duplicate_transaction_candidates`, `uncategorized_transactions`, `income_analysis`
- **accounts** — `accounts`, `account_details`, `account_balance_history`, `liquidity_analysis`, `credit_position`, `card_payment_forecast`, `cash_runway`
- **budgets** — `budgets`, `budget_details`, `budget_forecast`, `budget_recommendations`
- **recurring** — `recurring`, `upcoming_obligations`, `subscription_analysis`, `fixed_cost_analysis`, `recurring_history`, `recurring_candidate_detector`
- **savings** — `savings_accounts`, `savings_product_details`, `savings_projection`, `savings_withdrawal_estimate` (uses `estimateSavingsWithdrawal`), `savings_fee_analysis`, `contribution_analysis`
- **wealth** — `net_worth`, `net_worth_history`, `goals`, `goal_details`, `goal_feasibility`, `loans`, `loan_details`, `debt_payoff_scenario`, `assets`, `wealth_allocation`, `bill_split_status`, `goals_loans_assets`
- **metadata** — `categories`, `category_details`, `labels_summary`, `places_summary`, `people_summary` (never includes phone/email), `templates`
- **currency** — `exchange_rates`, `currency_convert` (saved rates only), `fx_exposure`, `fx_transaction_analysis` (each transaction's own saved rate)
- **scenario** — `affordability_check`, `scenario_simulation`, `cash_flow_forecast` (pure; nothing is stored)
- **mutation** — `prepare_change`

To add a tool: add a catalog entry, implement it in the pack file, register it in
`TOOL_RUNNERS`. The capability test fails if a catalog name has no runner.

## 2. Model-visible vs app-internal

The model only ever sees the guide lines of the packs chosen for the current
question (at most 3 packs, usually 4–14 tools) plus the period vocabulary. It
never sees `TOOL_RUNNERS`, selectors, the document, `ProposalStore`, SQL or file
paths. App-internal helpers (for example `selectFinancialPriorities`,
`budgetPace`, `obligationsWithin`, `balancesAt`) are called by tools and cards.

Arguments are sanitized per tool (`sanitizeToolArgs(value, toolName)`): unknown
keys are dropped, enums are checked, numbers are clamped (limit ≤ 50,
days ≤ 366, months ≤ 120), currencies must be ISO codes.

## 3. Evidence contract

`runChatTools` returns `{ facts, cards, evidence }`. `EvidenceBundle` (`evidence.ts`)
holds structured `EvidenceFact`s (`factId`, tool, entity, period, currency,
`kind: stored | calculated | projection`), warnings, missing data and
assumptions. The model receives `evidence.text`: the tool lines followed by
`WARNINGS`, `MISSING DATA` and `ASSUMPTIONS`, all inside the same character
budget.

The synthesis prompt forbids numbers that are not in the results, own
arithmetic, trends without both periods, and silent conflict resolution.
Development builds run `auditAnswerNumbers` on every answer and show a small
"dev audit" note under answers that contain numbers absent from the evidence.

Period boundaries are always computed by `resolvePeriod` (financial month from
`_local.monthStartDay`, calendar month, quarter, year to date, rolling windows,
`next_N_days`, `since_payday` / `until_payday` from salary history and recurring
income). The model only names a period.

## 4. Broad-advice bundle

`resolveIntent` marks "how am I doing / how can I improve / where can I save"
style questions (EN/HE/RU) as `financial_advice` or `financial_overview`, whose
mandatory call is `financial_advice_context`. The controller then skips the
planning step entirely. The bundle contains, in priority order: ranked
priorities, history coverage, health pillars, 6-month cash flow, this vs last
month, budget pacing, 30/60-day liquidity and obligations, runway, credit,
fixed costs, net worth, goals/loans/assets and data quality.

`selectFinancialPriorities` evaluates 17 deterministic rules
(`PRIORITY_CODES`), attaches measured impact and evidence refs, and ranks by
`severity weight + impact relative to income + immediacy + confidence`. The
model must present them in that order.

## 5. Mutation proposals

Security invariant: **the model may request; Plutus code decides; the user
approves; trusted domain code executes; the model only receives the result.**

- `prepare_change` is the only mutation surface the model can name. Its
  arguments are sanitized by `sanitizeChangeArgs` (known operations and entity
  types only, primitive field values, max 30 fields).
- The operation is taken from the user's words (`resolveIntent`), so a model
  cannot escalate "change" into "delete".
- `prepareChange` (`mutations/prepare-change.ts`) resolves names to ids inside
  the active profile, then runs the app's own domain function on a private
  clone: `saveTransaction`, `deleteTransaction`, `saveTransactionTemplate`,
  `saveBudget`, `saveRecurring`, `saveCategory`, `deleteCategory`,
  `addAccountToDocument`, `updateAccountInDocument`, `deleteAccountFromDocument`.
  Goals, loans, assets, labels, places, people and shared bills use small
  validated handlers that preserve unknown fields and detach references on
  delete. Validation errors come from the domain code itself.
- Side effects are the diff between the current document and the dry run, so
  the preview is exactly the cascade a confirm performs (balance changes,
  deleted transactions, detached categories, cleaned budget references…).
- `ProposalStore` keeps proposals in memory only, single-use, 15-minute expiry.
  `execute` is called only by the review card's confirm handler. It re-reads the
  document inside the provider's serialized write, rejects the proposal as
  `stale` if the fingerprint of the records it depends on or the active profile
  changed, then applies the plan and reads back the final values. A second
  confirm returns the first result; an unknown id does nothing.
- Account deletion sets `strongConfirmation`: the card asks again in a native
  destructive alert before executing.
- Cancel writes nothing. Every outcome (`completed`, `cancelled`, `stale`,
  `expired`, `failed`) is appended to the conversation history as
  `MUTATION_RESULT` and the model is asked to explain it; the fallback copy is
  used if generation fails. The model is instructed never to claim success
  without a completed result.

In-card editing: `EditableField`s render real inputs and pickers (accounts,
leaf categories of the right type, choices, toggles, dates). Applying edits
calls `ProposalStore.revise`, which re-validates the merged request and
replaces the proposal; the old one can no longer be confirmed.

## 6. Voice architecture

Two stages, never combined:

1. **Transcription** — `voice/use-voice-input.ts` records with the native module
   (`startRecordingAsync`), shows a live level meter and timer, stops at 60 s,
   validates the WAV header returned by native code (`validateRecording`: PCM,
   16 kHz, mono, 16-bit, non-empty, 0.4–60 s, absolute path), then sends
   `[{type:"audio", path}, {type:"text", TRANSCRIBE_PROMPT}]` to Gemma.
   `parseTranscript` recovers the text from JSON, fenced JSON, truncated JSON or
   plain text. The recording is deleted in `finally` through
   `deleteRecordingAsync`, which refuses any file it did not create.
2. **Text pipeline** — the transcript becomes the user's chat message and runs
   through the exact same router, tools, evidence and proposal rules as typed
   text. A spoken delete still needs the on-screen confirmation.

State lives in `voiceReducer` (`voice/voice-state.ts`). Backgrounding the app or
leaving the screen cancels recording and inference and deletes audio.

### Root cause of the previous voice failure

`react-native-litert-lm` only creates vision/audio executors when
`config.multimodal` is true; otherwise it guesses from the file name
(`3n` / `gemma3`). Gemma 4 E2B matched neither, so the engine was created
**without an audio backend**. In addition, Android used the platform
`SpeechRecognizer` (unavailable offline on many devices) and iOS passed a
`file://` URI, which LiteRT's `validateMediaPath` rejects. Fixes:

- `use-local-ai-engine.ts` loads with `multimodal: true` (CPU then GPU), with a
  last text-only attempt. `audioCapable` is false in that case and the mic
  button is disabled with an explanation.
- `scripts/patch-litert-lm.cjs` (postinstall) makes Android use a CPU vision
  executor when the main backend is CPU, so devices without OpenCL still get a
  multimodal engine.
- Native recorders write 16 kHz mono PCM16 WAV and return plain paths.
- iOS keeps Apple's on-device recognizer as a fallback if Gemma audio fails.

## 7. Android build requirements

- `RECORD_AUDIO` comes from the `expo-audio` plugin (`recordAudioAndroid: true`);
  verify it in the merged release manifest.
- `react-native-litert-lm` 0.7.0 pins LiteRT-LM 0.15.0 (Maven
  `com.google.ai.edge.litertlm:litertlm-android:0.15.0`). Do not switch to a
  floating version.
- Run `npm install` (postinstall applies the patch) before `expo prebuild`.
- Test on a physical arm64 device with a release APK/AAB, not only Metro.
- The model is a post-install download in app-private storage, never an APK asset.

## 8. iOS build requirements

- `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription`
  are set in `app.json`.
- The recorder uses `AVAudioSession` `.playAndRecord` / `.measurement` and
  deactivates the session after recording. No background audio mode.
- LiteRT-LM iOS uses the C API through `react-native-litert-lm`
  (tag `v0.15.0`); the same `multimodal: true` flag creates the audio executor.
- Test on a physical device in a release-like build.

## 9. Model manifest and download

`model-compatibility-policy.ts` exports `LOCAL_AI_MODEL`, a versioned
`ModelManifest` (model id and revision, file name, size, SHA-256, memory and
storage minimums, 32K context, audio/vision support, runtime version).
`LocalAIModelStore` (Kotlin/Swift) downloads to app-private storage and
verifies size and SHA-256 before use; its constants must match the manifest
when the model is updated. Voice is enabled only when the
model is installed, the engine is ready and `audioCapable` is true.

## 10. Debugging voice in a release build

Check in this order: permission granted → recording returns `container: "wav"`,
`sampleRate: 16000`, `channels: 1`, `bitsPerSample: 16` (inspect with
`inspectRecordingAsync(path)`) → `engine.audioCapable` is true → logcat tag
`HybridLiteRTLM` prints `Backend config: … audio=CPU … multimodal=true` →
transcription error code in the chat (`voiceErrors.*`). A text-only fallback
inside the library's GPU chain cannot be detected from JS; it surfaces as
`AUDIO_INFERENCE_FAILED`.

## 11. Privacy guarantees

No audio, transcript, prompt, answer or tool result leaves the device. There is
no cloud speech recognition and no cloud model fallback. Recordings live in the
app cache and are deleted after transcription or cancellation. Chat history and
proposals stay in memory and are cleared when the chat closes. People tools
never include phone numbers or email addresses.

## 12. Test coverage

- `tests/local-ai-chat-tools.test.cjs` — original protocol and tool behaviour.
- `tests/local-ai-capabilities.test.cjs` — every catalog tool has a runner; no
  tool mutates the document; profile isolation; financial period resolution;
  parent-category rollups; pagination; merchant stats; anomalies/duplicates
  (card settlements excluded); FX priced at saved rates; savings estimator;
  credit/obligations/affordability; goal/loan math; PII exclusion; priority
  ranking determinism; evidence audit; argument validation; EN/HE/RU intent
  golden suite; mutation wording detection; fallback extraction; proposal
  no-write/cancel/confirm-once/stale/expired/unknown/restart; cascade preview =
  actual cascade; in-card revision; controller with a fake model (mandatory
  advice bundle, no ungrounded answers, proposal-only mutation turns, no
  escalation); WAV validation; transcript parsing; voice state machine.

Run with `npm test`.
