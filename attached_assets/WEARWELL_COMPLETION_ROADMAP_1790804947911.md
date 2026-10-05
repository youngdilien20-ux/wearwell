# WEARWELL — COMPLETION ROADMAP & AGENT PROMPTS

**Snapshot:** 30 September 2026

This document is the product roadmap and reusable prompt set for finishing the existing Wearwell app. `WEARWELL_AGENT_HANDOFF.md` remains the technical source of truth between sessions.

## 1. What is already implemented

### Working and verified
- Active Wearwell web app runs.
- Deterministic candidate generation and outfit scoring.
- Hard wardrobe/comfort/movement/availability constraints.
- One-item “change my mind” / swap flow.
- Regeneration.
- Local wardrobe CRUD, persistence, wear history and feedback.
- Multi-event day planning in the active UI.
- Event switching, event-specific recommendations, regeneration isolation and swap isolation.
- Event persistence after reload.
- Browser smoke test of multi-event flow.
- Typecheck and production build.
- Latest Node suite: **40 passed, 0 failed**.

### Partial
- AI: existing Gemini/Supabase assistant path exists, but the desired automatic conversational planning experience is not complete.
- Speech input: browser SpeechRecognition exists; robust Groq Whisper flow is not complete.
- Speech output: browser `speechSynthesis` exists; Groq TTS is not complete.
- Weather/context: integrated, but temperature is used more strongly than rain/wind/UV/humidity in scoring.
- Auth: Supabase session, magic-link sign-in and sign-out exist, but enrollment/settings/account experience needs completion.
- Cloud persistence: app-state/day-plan support exists, but Supabase schema is not fully self-contained.
- Cloud wear history: local event metadata exists; cloud event metadata still needs a complete contract.
- Personalization: current feedback is narrow.
- Wardrobe entry: basic metadata exists, but rich wardrobe metadata/image capture is not complete.

### Missing / not yet documented as implemented
- Groq STT, conversational text/reasoning, vision, and TTS Edge Functions.
- Optional wardrobe camera/photo analysis and review-before-save workflow.
- Visual profile selectors for country/region/city, skin tone, body shape/fit preference, height, hair profile, and cultural/community context.
- Complete enrollment/onboarding and editable Settings flow for those fields.
- Non-blocking reminders for missing important profile fields.
- Generalized preference learning.
- Full account/data deletion and individual history deletion.
- Strong browser/E2E coverage for live auth/Supabase/weather/AI/image/speech integrations.

## 2. Corrected product vision

Wearwell should remain a **simple intelligent wardrobe companion**:

**Tell it about your day → it understands the events → considers your profile, wardrobe, weather and relevant current context → generates valid outfits from what you actually own → explains the choices → lets you change your mind.**

AI is the companion/reasoning/explanation layer. The deterministic Wearwell engine remains the authority for actual outfit combinations.

### Terminology/product corrections

- Use **skin tone**, not “skin type”, when the purpose is clothing color harmony.
- Use **body shape / fit preference**, not a rigid “body type” judgment.
- Use **hair profile** (length/style/coverage), not “how much hair”.
- Use **cultural/community context** for clothing norms; never infer community from appearance, country, name, language, etc.
- Use country + region/city for normal location context. Exact GPS should not be required for the core product.
- Prefer visual swatches, cards and illustrations over long forms.
- Profile information is optional, editable later, and should never block core app use.
- Missing useful profile information can trigger a dismissible “Improve your recommendations” banner.
- Skin tone, body shape, hair and community are contextual inputs, not automatic hard constraints unless the user explicitly expresses a fit/style preference.

## 3. Implementation sequence

### PROMPT 1 — Intelligent planning experience

```text
The handoff has already been read. The current project state is understood.

Do NOT perform another full audit or re-import.

The next priority is the actual intelligent Wearwell planning experience.

When I type or speak:
“I have university in the morning, lunch with friends in the afternoon, and a birthday dinner at night.”

Wearwell should immediately behave like an intelligent personal wardrobe companion.

Trace the current active flow and determine exactly where the intelligence stops:
USER INPUT → events/context → weather/context → real wardrobe → deterministic recommendations → AI explanation/context → user-facing result.

Typed input and voice input must enter the same planning pipeline. There should not be an unnecessary second “Ask AI” step for the core planning experience.

Check only relevant active paths:
- src/main.jsx
- src/dayPlan.mjs
- src/dayBrief.mjs
- existing AI/Supabase assistant integration
- supabase/functions/interpret-assistant
- weather/context flow

Determine whether AI is not triggered, triggered manually, returned but not rendered, only extracting the brief, missing context, or blocked by configuration.

Fix the smallest coherent part of the active flow.

Actual outfits MUST still come from the existing deterministic engine. AI must not invent wardrobe items or combinations.

Preserve multi-event state, swapping, regeneration and single-event behavior.

If AI fails, deterministic recommendations must still work.

Test typed input, voice input, multi-event input and AI-unavailable fallback. Run the existing tests, typecheck, production build and browser smoke test.

Update WEARWELL_AGENT_HANDOFF.md with the discovery, changes and new resume point.

Do not push GitHub. STOP.
```

### PROMPT 2 — Groq service layer

```text
Continue from the handoff. Do not re-audit the repository.

Implement the secure Groq AI service layer for Wearwell using Supabase Edge Functions.

Provide separate server-side capabilities for:
1. conversational text/reasoning
2. speech-to-text
3. image/vision analysis
4. text-to-speech

Use currently supported Groq model IDs; do not use deprecated Compound IDs.

Preferred capabilities at this roadmap date:
- Whisper Large V3 Turbo for STT
- a current Groq text/reasoning model for assistant planning
- Qwen 3.8 27B (or current supported vision equivalent) for image analysis
- Orpheus English for TTS

Keep GROQ_API_KEY server-side. Preserve authenticated user boundaries and RLS.

The AI may interpret, reason, explain, contextualize and research where supported. It must NOT invent wardrobe inventory or replace deterministic outfit generation/scoring.

Validate requests and responses, add timeouts/errors, and document required secrets.

Update the handoff. Test, typecheck and build. Do not push GitHub. STOP.
```

### PROMPT 3 — Speak to Wearwell companion

```text
Continue from the handoff. Do not audit unrelated parts.

Turn the existing planning input into a simple conversational “Speak to Wearwell” companion.

The user can tap a microphone and say:
“I’ve got class at eight, I’m meeting friends after lunch, and dinner with my family tonight.”

Speech must become text and enter the exact same planning pipeline as typed input.

Support simple follow-ups such as:
- “Make the dinner look a little smarter.”
- “I don’t want jeans.”
- “Change my mind.”
- “What if it rains?”
- “Which one is better for the evening?”

Keep actual wardrobe selection deterministic. Use the active event and preserve event state.

Add Groq Whisper STT and optional Groq TTS. Preserve browser fallback where useful.

Keep the UI simple: idle → listening → processing → response.
Do not build a giant chat product.

Test typed planning, spoken planning, follow-up, multi-event switching, change-my-mind voice command, AI unavailable and microphone denial.

Update the handoff. Do not push GitHub. STOP.
```

### PROMPT 4 — Enrollment, profile and Settings

```text
Continue from the handoff. Do not perform a broad audit.

Complete the user enrollment/profile/settings experience.

Prefer visual selection with swatches/cards/illustrations for:
- country
- region/city
- skin tone
- body shape / fit preference
- height
- hair profile
- cultural/community context

Users may skip fields. Do not block the app.

If important profile information is missing, show a small dismissible “Improve your recommendations” banner linking to Profile/Settings.

Every profile field must be editable later in Settings.

Use the existing Supabase profile architecture. Do not create a second account system. Preserve RLS and per-user ownership.

Use profile data as explicit context for AI and future personalization. Do not infer missing attributes and do not turn appearance/community into rigid hidden rules.

Test new user, skipped fields, save/edit/reload, sign-in, sign-out, settings persistence and data ownership.

Update the handoff. Do not push GitHub. STOP.
```

### PROMPT 5 — Optional wardrobe photo capture + Groq vision

```text
Continue from the handoff. Do not audit unrelated code.

Add optional AI-assisted wardrobe capture.

User flow:
TAKE PHOTO / UPLOAD → ANALYZE → REVIEW → EDIT → CONFIRM → SAVE

Manual wardrobe entry must remain available.

Vision may identify only observable attributes such as category, dominant colors, pattern, approximate visible characteristics, layer/shoe/accessory category, and defensible weather/formality hints.

Do not claim exact fabric, brand, precise fit, or anything not visible.

Never silently overwrite user values. AI results must be reviewable before saving.

If image storage is added, use Supabase Storage with appropriate RLS and no privileged browser secrets.

The recommendation engine uses structured confirmed wardrobe records, never raw AI text.

Test image success/failure, invalid image, user edits, confirmation, manual entry without image, and storage security.

Update the handoff. Do not push GitHub. STOP.
```

### PROMPT 6 — Lightweight personalization

```text
Continue from the handoff.

Improve personalization without making Wearwell complicated.

Use explicit profile choices and feedback to learn things such as:
- comfort
- preferred fit
- disliked items
- preferred colors
- preferred formality
- repeat-item tolerance
- activity/movement preferences

Useful feedback can be simple:
Love this / Not for me / Too formal / Too casual / Too hot / Too cold / Don’t use this item today.

When multiple deterministic candidates are valid, explicit preferences may help rank them.

Do not infer identity or personality. Do not make hidden assumptions from appearance, community or missing fields.

Preserve change-my-mind and deterministic candidate/scoring authority.

Add tests and update the handoff. Do not push GitHub. STOP.
```

### PROMPT 7 — Weather, research and context quality

```text
Continue from the handoff.

Improve contextual planning quality without turning Wearwell into a general web-search app.

Use the active event’s time, location, activity, occasion and weather.

Where current information genuinely matters, use the approved Groq research capability already implemented. Do not fake research and do not search unnecessarily on every request.

Consider relevant:
- temperature
- rain
- wind
- UV
- humidity
- event timing
- occasion/dress code
- activity

Review the deterministic weather-scoring gap. If appropriate, make rain/wind/UV/humidity affect ranking through explicit, testable deterministic rules.

Ensure explanations correspond to the actual selected candidate.

Add focused tests. Update the handoff. Do not push GitHub. STOP.
```

### PROMPT 8 — Final product hardening

```text
Continue from the handoff. Do not rediscover the architecture.

Perform focused final QA across these journeys:

1. New user → sign in → profile → wardrobe → plan day
2. Type day → intelligent planning → multi-event recommendations
3. Speak day → STT → same planning flow → spoken/text response
4. Change my mind → deterministic valid alternative
5. Wardrobe photo → AI analysis → user confirmation → saved item
6. Profile + explicit feedback → improved valid candidate ranking
7. Settings → edit → save → reload
8. Sign in → session restoration → sign out
9. AI unavailable → deterministic recommendations still work
10. Authenticated user → only their own cloud data

Run full tests, typecheck, production build and browser smoke tests.
Check console, Edge Function errors, Supabase schema/migrations, RLS, secrets and browser exposure of API keys.

Update WEARWELL_AGENT_HANDOFF.md with final state and next maintenance task.
Do not push GitHub. STOP.
```

## 4. Architecture rules for every future agent

1. The user's wardrobe is the source of truth for clothing inventory.
2. The deterministic recommendation system remains authoritative for actual combinations.
3. AI may interpret, reason, explain and research; it may not invent outfits.
4. AI failure must not break deterministic recommendations.
5. Profile attributes are explicit user selections, not inferred identity.
6. Visual selectors are preferred over long descriptive forms.
7. Profile information is optional and editable later.
8. Missing profile information gets a non-blocking reminder, not a hard gate.
9. Do not replace `src/` with `src_new/`.
10. Protect `src/outfitCandidates.mjs` and `src/outfitScoring.mjs`.
11. Update `WEARWELL_AGENT_HANDOFF.md` after each meaningful milestone.
12. One coherent feature per agent session; do not give agents the entire roadmap unless needed.

## 5. Definition of done

Wearwell is feature-complete for this vision when the user can:

- sign in and sign out cleanly
- complete or skip a visual-first profile
- change profile/settings later
- receive reminders for missing useful information
- type or speak naturally about a day
- plan multiple events
- receive relevant weather/context and current research when genuinely needed
- have the assistant understand their real wardrobe
- receive outfits containing only wardrobe items
- rely on deterministic constraints and scoring for actual outfit validity
- say/select “change my mind”
- optionally photograph a wardrobe item and confirm AI-detected details before saving
- have Groq provide STT, text/reasoning, vision and TTS through secure Edge Functions
- continue using the core app when AI/services fail
- improve recommendations through explicit preferences and feedback

## 6. Technical note on Groq/Supabase

As of this roadmap date, Groq documents Whisper V3 Turbo for STT, current Qwen 3.6/3.8 27B vision models, Orpheus TTS, and GPT-OSS models with built-in browser search. Groq’s `groq/compound` and `groq/compound-mini` were decommissioned on 21 September 2026, so future agents must not resurrect those model IDs.

For research, use current supported browser-search tooling. Keep research and structured extraction separate when required by API compatibility.

Keep Groq credentials in Supabase Edge Function secrets. Never expose `GROQ_API_KEY` or privileged Supabase keys in browser code.

## 7. Current resume point

**Completed:** multi-event UI integration, 40/40 Node tests, typecheck, production build, browser multi-event verification.

**Next:** finish/verify the intelligent AI planning experience, then establish the Groq service layer, then the speak-to-Wearwell companion, then enrollment/profile/settings, wardrobe vision, lightweight personalization/context, and final hardening.

`WEARWELL_AGENT_HANDOFF.md` remains the authoritative technical memory between Replit sessions.
