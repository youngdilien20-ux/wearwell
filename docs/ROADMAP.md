# Wearwell implementation roadmap

## Next-agent handoff — work on remaining items only

This is a continuation of the existing Wearwell app, not a request to rebuild it. Start by checking the latest `main` and this handoff. Do not reimplement or redesign work already marked complete unless a test shows a regression.

### Completed in the current local-first increment

- React/Vite web slice and deterministic wardrobe candidate generation.
- Browser speech input/read-aloud behind explicit opt-in; text remains available.
- Optional, bounded AI brief suggestions, requested only after opt-in and an explicit planning action; deterministic outfits remain in control.
- Local settings and wear history, with explicit feedback applied only to the exact item set. “Wore it” alone does not affect ranking.
- Vite development proxy for `/api` and deterministic tests for brief extraction, scoring, and local storage.

These features are implemented, but they have not had a full workspace build or end-to-end browser/API smoke test.

### Ordered remaining work

1. **Restore and verify the runnable workspace.** `.replit` currently contains merge-conflict markers. Resolve it only through Replit’s validated replacement flow; do not edit the protected file directly. Then run `pnpm run build`, `node --test src/*.test.mjs`, and smoke-test the web app, the Supabase `interpret-assistant` function, browser speech support/fallback, and local persistence. The focused Node suite last passed 15 tests; that is not a substitute for the full build.
2. **Resolve the weather status discrepancy before changing weather code.** `PROJECT_PLAN.md` says planned-time weather is incomplete, while `ARCHITECTURE.md` and this roadmap describe planned-time support. Inspect the implementation and verify behavior for a requested time window; then update the docs, or implement only the demonstrably missing piece.
3. **Finish the recommendation interaction.** Implement and test a real item swap (the current control is a placeholder), reason-aware regeneration that preserves the prior choice, and the MVP explanation fields: footwear, substitutions, discomfort fallback, and a cheaper/fewer-item path. Keep hard constraints deterministic and test that feedback never bypasses them.
4. **Close data lifecycle requirements.** Settings, wear history, and feedback are browser-local today. Keep that behavior and the local fallback. If cross-device persistence is required, propose the smallest authenticated design and deletion behavior first; do not make Supabase schema changes in this handoff.
5. **Complete safety and usability evaluation.** Add/extend the golden scenarios, matched-pair stereotype checks, weather and hard-constraint tests, accessibility/browser checks, and a small pilot review. Do not expand into out-of-scope features before core acceptance criteria pass.

### Work and reporting contract

- Work only on the ordered open items above. Do not start unrelated features or rebuild completed flows.
- Make one small, coherent change at a time; run the relevant tests; commit and push each verified increment to `main` with a scoped message. Check the remote head first, never force-push, and never overwrite newer work.
- If blocked, stop at the blocker and report the evidence and next action rather than making an unrelated change.
- At the end of each increment, report: what changed, the commit hash, tests/build actually run and their results, and the remaining open items in priority order. Do not mark an item complete without verification.

## Phase 0 — foundation

**Goal:** make the project runnable and establish contracts.

- Create Expo Router app shell.
- **Complete:** create and run the web-first React shell with the core morning flow.
- Create Supabase project configuration and environment variable documentation.
- Add shared TypeScript types for `DayBrief`, `WardrobeItem`, `WeatherSnapshot`, `Outfit`, and `Recommendation`.
- Add linting, formatting, and a small deterministic unit-test harness.
- Seed controlled vocabularies for categories, formality, climate, occasion, condition, and laundry state.
- Add the reviewed evidence-register shape and a safe-language lexicon.

**Exit:** app shell runs; schema/types are versioned; no provider keys are committed.

## Phase 1 — wardrobe and auth

- Auth screens.
- Wardrobe list and add/edit form.
- Private image upload and delete.
- Progressive setup with unknown values allowed.
- RLS policies and ownership checks.

**Exit:** a user can create, edit, view, and delete at least five items.

## Phase 2 — text-first recommendation loop

- Day brief composer.
- Structured brief extraction with a mock provider.
- Candidate generator and scorer.
- Function/social-expectation/personal-goal context layers with uncertainty.
- Recommendation cards with explanation contract.
- Choice, regenerate reason, and swap actions.

**Exit:** the full loop works without external AI or weather credentials.

## Phase 3 — real weather and AI

- [x] Weather provider adapter with planned-time support, explicit city/coordinate input, and deterministic fallback.
- [x] Weather permission and selected-location controls persisted with the private profile.
- Server-side Gemini adapter and optional Groq adapter.
- JSON schema validation.
- Deterministic fallback when providers fail.
- [x] Stable rule IDs and input-field evidence IDs attached to deterministic explanations; these IDs describe application rules and recorded input fields, not external research citations.

**Exit:** weather changes recommendations; AI cannot bypass hard constraints.


### Next increment — dynamic next-wear planning

- [x] Extract a conservative, editable day brief from the user's text and selected occasion; leave unspecified fields blank.
- [x] Generate varied wardrobe combinations from actual owned tops, bottoms, one-piece items, and available optional pieces.
- [x] Score candidates against explicit brief constraints, weather facts, comfort, movement, and formality; use only recorded item details and leave unknowns unknown.
- [x] Show honest no-result and missing-context states, with a clear replan path.
- [x] Keep planning state separate from the user's final chosen wear, then persist the choice when selected.

**Exit:** changing the brief, wardrobe, or permitted weather context changes the candidate looks and their explanations without requiring a code change.

## Phase 4 — voice and learning

- [x] Browser speech input and read-aloud behind explicit opt-in; browser support still needs end-to-end checks.
- [x] Optional bounded brief suggestions and follow-up display; deterministic planning remains primary.
- [x] Explicit feedback, exact-combination ranking, and browser-local wear history.
- [x] Local settings for speech consent/language, AI consent, and temperature display.
- [ ] Verify the full voice-first flow and complete any gaps in the shared settings/privacy journey.
- [ ] Decide whether history/settings/feedback need authenticated cross-device persistence; preserve local fallback and deletion controls.

**Exit (not yet verified):** a user can complete the morning flow mostly by voice and visibly improve recommendations through explicit feedback.

## Phase 5 — evaluation and pilot

- Golden set of 300–500 scenarios over time.
- Safe-language checks.
- Matched-pair stereotype tests.
- Evidence-label and hallucinated-rule tests.
- Weather-injection tests for cold/wet activity, high sun, and indoor air-conditioning.
- Accessibility scenarios for sensory, seated-fit, and pregnancy/postpartum needs.
- Expert review with regional dress, tailoring, textile, adaptive-fashion, and modest-fashion perspectives.
- Small pilot in two or three contexts, with local partners where cultural guidance is involved.

**Exit:** pilot safety and satisfaction thresholds are met and repeated corrections are fed into the knowledge base.

## Phase 6 — expansion

Only after the core loop is useful:

- calendar integration;
- wardrobe photo-assisted tagging;
- weekly planning and packing;
- multilingual and non-English research;
- richer local knowledge with credited community review;
- repair, alteration, rental, and second-hand workflows.

Do not expand the surface area before the recommendation loop is reliable.