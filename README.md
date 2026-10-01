# Wearwell

Wearwell is a voice-first wardrobe assistant that helps a person decide what to wear from the clothes they already own.

The first release is intentionally focused:

1. The user describes their plan, mood, timing, and constraints by voice or text.
2. Wearwell checks the weather for the planned place and time.
3. It recommends two or three outfits from the user's wardrobe.
4. The user chooses, swaps, regenerates, or gives feedback.
5. Wearwell remembers explicit preferences without inferring identity from appearance, name, culture, or location.

The repository contains the runnable React/Vite web slice as well as the product and engineering plan. Implementation follows the staged roadmap in [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md).

## Product position

Wearwell is not a universal fashion-rule engine. Clothing guidance is separated into:

- **Physical needs**: weather, movement, rain, sun, fabric behaviour.
- **Context conventions**: workplace, worship, ceremony, school, or host expectations.
- **Personal preferences**: colours, comfort, silhouettes, attention level, and confidence.
- **Trends**: optional and clearly labelled, never treated as facts.

The assistant asks instead of assuming. Fit and comfort are first-class. Second-hand clothing, repair, alteration, and using what someone already owns are normal paths.

## Current implementation and planned stack

- **Current client:** React/Vite in `artifacts/wearwell-app`, wrapping the existing experience in `src/main.jsx`.
- **Current recommendations:** deterministic candidates from wardrobe items, with hard constraints and explicit feedback kept separate.
- **Current storage:** browser-local brief, settings, chosen looks, and feedback history; optional Supabase auth/wardrobe/profile paths remain available.
- **Current optional AI:** a Supabase Edge Function can suggest missing brief details. It does not select or modify outfits and falls back to local behaviour.
- **Current speech:** browser speech input/output only after the user enables it; typing remains available.
- **Cloud layer:** Supabase Auth, Postgres, private image storage, Edge Functions, and user-owned persistence. Replit is only used as a development workspace.
- **Weather status:** a weather context/provider path exists; planned-time behavior needs end-to-end verification because the roadmap and project checkpoint disagree.

Provider keys and secrets must stay in server-side Replit Secrets or Supabase project secrets; never commit them or expose them to the browser.

## Repository guide

- [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) — product scope, MVP acceptance criteria, phases, and decisions.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — ordered remaining-work handoff and continuation/reporting rules.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system boundaries, request flow, and provider abstractions.
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — Supabase entities and privacy rules.
- [`docs/RECOMMENDATION_ENGINE.md`](docs/RECOMMENDATION_ENGINE.md) — constraint gate, scoring, explanation, and feedback loop.
- [`docs/SAFETY_AND_INCLUSION.md`](docs/SAFETY_AND_INCLUSION.md) — non-negotiable behaviour for culture, fit, accessibility, and uncertainty.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — implementation sequence and evaluation plan.
- [`research/README.md`](research/README.md) — how the supplied research is used and where its evidence is limited.

## Run the current slice

```bash
pnpm install
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/wearwell-app run dev
pnpm run typecheck
node --test src/*.test.mjs
```

Run the API and web commands in the workspace's configured processes. The app remains usable without Supabase configuration or an AI provider key.
During web development, weather and optional AI requests go directly to Supabase Edge Functions. No Replit API server is required for the Wearwell client.

## Status

The current local-first slice includes:

- morning day brief with text and optional browser speech input/read-aloud;
- weather context card;
- two/three option setting;
- deterministic wardrobe-based recommendation cards;
- choose, regenerate, and explicit feedback; the item-swap control is still a placeholder;
- wardrobe list with add-item flow;
- local wear history with explicit feedback on the exact saved combination;
- settings for speech consent/language, AI consent, and temperature display units;
- opt-in AI brief suggestions with bounded inputs and a deterministic fallback.

The brief, wardrobe additions, option count, plan, chosen looks, settings, and wear history persist locally for offline recovery. When signed in, the same app state is synced to Supabase under the user’s account; RLS prevents cross-account access. AI requests happen only after the user enables AI and presses “Plan my next wear.” The request contains the brief, occasion, weather summary, and first deterministic look summary/item names—not audio, account details, or wear history. AI suggestions never choose outfits and must be reviewed before applying.