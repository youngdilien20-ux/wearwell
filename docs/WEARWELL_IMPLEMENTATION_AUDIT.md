# Wearwell Implementation Audit

**Audit date:** 30 September 2026  
**Scope:** Existing Wearwell implementation only  
**Status:** No product features, redesigns, migrations, deletions, or GitHub pushes were performed as part of this audit.

## Scope and source of truth

The active frontend path is:

```text
artifacts/wearwell-app/src/main.tsx
  → artifacts/wearwell-app/src/App.tsx
  → src/main.jsx
```

`src/main.jsx` is the active product implementation. `src_new/`, `artifacts_new/`, and `incomple/` contain alternate or duplicated implementations and are not used by the active frontend unless explicitly wired into the artifact.

## Verification performed

- Active Git branch: `main`
- Git status: clean
- Frontend starts through `artifacts/wearwell-app: web`
- Preview returned HTTP 200 with page title `Wearwell`
- `pnpm install --frozen-lockfile`: passed
- `pnpm run typecheck`: passed
- `node --test src/*.test.mjs`: **31 passed, 2 failed**

## Feature audit

### Wardrobe management — **Partially implemented**

Working in the active UI:

- Add wardrobe item
- Edit wardrobe item
- Remove wardrobe item
- Local persistence
- Optional Supabase persistence after authentication
- Supported item types: top, bottom, layer, shoes, accessory

Limitations:

- The form only captures name, type, colour, and a fit/comfort note.
- Users cannot edit weather tags, formality, availability, laundry state, condition, coverage, material, or mobility details through the active UI.
- Those fields are used by the scoring engine, but are mostly available only on seeded data or externally populated cloud data.
- No image upload exists.

Relevant files:

- `src/main.jsx`
- `src/storage.js`
- `src/cloudWardrobe.js`

### Deterministic outfit recommendation — **Working**

The active app uses:

```js
scoreOutfitCandidates(wardrobe, {
  dayBrief,
  weather,
  wearHistory,
  regenerationReason,
  excludedItemSets,
})
```

The recommendation engine:

- Uses only wardrobe items
- Requires a top/bottom combination or a one-piece item
- Excludes explicitly unavailable, dirty, or damaged items
- Applies recorded comfort, movement, and coverage constraints
- Produces two or three visible options
- Provides grounded explanations
- Does not let AI choose or create outfits

This is one of the strongest parts of the current implementation.

### Outfit scoring — **Working**

`src/outfitScoring.mjs` implements scoring for:

- Coverage
- Comfort
- Movement
- Weather temperature bands
- Dress-code formality
- Explicit feedback
- Regeneration preferences
- Availability and laundry state

The scoring engine preserves unknowns rather than treating missing data as a match or mismatch.

All 11 scoring tests pass.

Important limitation: weather scoring currently uses temperature and stored warm/cool tags. Rain probability, wind, UV, humidity, and precipitation are returned by the weather integration but are not used meaningfully in candidate scoring.

### Candidate generation — **Working**

`src/outfitCandidates.mjs` generates:

- Top + bottom combinations
- One-piece outfits
- Optional shoes
- Optional layers
- Optional accessories
- Alternate combinations for swapping and regeneration

It caps candidate generation at 240 candidates and core combinations at 80.

All four candidate-generation tests pass.

### Weather and context handling — **Partially implemented**

Implemented:

- City input
- Latitude/longitude input
- Planned start/end time window
- Africa/Lusaka timezone handling
- Supabase Edge Function integration
- Open-Meteo geocoding and forecast lookup
- Forecast aggregation over the requested time range
- Labeled deterministic fallback weather
- Weather permission setting
- Celsius/Fahrenheit display conversion

Relevant files:

- `src/weather.js`
- `src/weatherQuery.mjs`
- `supabase/functions/get-weather-context/index.ts`

Limitations:

- Live weather requires Supabase configuration and an authenticated session.
- Without cloud configuration, the app uses fixed sample conditions.
- Only temperature affects recommendation ranking.
- Rain, wind, UV, and humidity are displayed but do not currently affect outfit selection.
- The weather function has no repository-level integration tests.
- The weather function itself was not executed against a live Supabase deployment during this audit.

The two weather query tests pass.

### Wear history — **Partially implemented**

Implemented locally:

- Saving a look when the user chooses it
- Recording item IDs and names
- Recording the reason, weather summary, formality summary, and day brief
- Explicit feedback:
  - Did you wear it?
  - Comfort
  - Colours
  - Wear again?
- Clearing all local history
- Exact-item-set feedback affecting future ranking
- Local history limit of 200 entries

Cloud persistence is also implemented through `cloudState.js` and the `wear_history` table.

Limitations:

- Selecting a look creates a history entry even before the user confirms that they wore it. This is intentional in the current model but should remain clearly distinguished from actual wear.
- There is no individual history-entry deletion.
- Cloud behavior is not verified against a live Supabase project.
- Event identity is not persisted in the current cloud history shape, which matters for multi-event planning.

### Day planning — **Partially implemented**

`src/dayPlan.mjs` contains standalone logic for:

- Parsing one or multiple clothing events
- Timed event detection
- Line- or semicolon-separated events
- Event IDs
- Preserving event state when the brief changes
- Per-event selected recommendations
- Per-event excluded combinations
- Persistence normalization

However, the active `src/main.jsx` does not import or use `dayPlan.mjs`.

The active app still uses one global:

- `plan`
- `brief`
- `dayBrief`
- `selected`
- `wearHistory`

The day-plan module is therefore present but not connected to the running product.

### Multiple events — **Missing in the active product**

The repository contains an alternate implementation in `src_new/main.jsx` that does integrate multi-event planning.

The active implementation does not:

- Show event tabs or event selectors
- Maintain an active event
- Generate event-specific recommendations
- Save event-specific selections
- Render multiple events in the UI

There are also duplicate alternate trees:

- `src_new/`
- `artifacts_new/`
- `incomple/`

This makes it unclear which implementation is intended to become authoritative.

### Item swapping / change-my-mind — **Working, with limited scope**

The active app supports:

- Swap a piece
- One-item alternatives
- Preserving recorded hard constraints
- Replacement explanations
- Regenerating with reasons such as:
  - More casual
  - More formal
  - More colour
  - More comfort
  - Different shoes
  - Different items

`selectionState.mjs` avoids adding a duplicate history entry when the same look is already saved for the day.

All five selection/swap tests pass.

Limitations:

- Swapping only exposes alternatives that differ by exactly one item.
- There is no explicit reject state separate from regeneration.
- Regeneration is deterministic ranking/exclusion logic, not a broader preference-learning flow.

The README and roadmap describe swapping as incomplete or placeholder-like, but the active source code now contains a real implementation. The documentation is stale here.

### Local and cloud persistence — **Partially implemented**

Local persistence is implemented through `src/storage.js`.

It stores:

- Wardrobe
- Brief
- Occasion
- Options count
- Selected look
- Structured day brief
- Settings
- Wear history

It includes normalization, bounds, legacy migration support, and invalid-value filtering.

Cloud persistence is implemented through:

- `src/cloudState.js`
- `src/cloudWardrobe.js`

Important active-path gap:

- `cloudState.js` supports `day_plan`.
- `user_settings` has a `day_plan` column.
- Active `src/main.jsx` does not maintain or pass `dayPlan`.
- Active cloud saves therefore persist an empty/default day plan rather than a usable multi-event plan.

One storage test also fails because the implementation uses storage version `4` while the test expects version `3`.

### Authentication — **Partially implemented**

Implemented:

- Supabase client initialization from Vite environment variables
- Session restoration
- Auth state listener
- Email magic-link login
- Sign out
- Optional profile name
- Cloud sync only when authenticated

Relevant files:

- `src/supabase.js`
- `src/main.jsx`

Limitations:

- Only magic-link authentication is implemented.
- There is no password flow, account deletion flow, or account-data deletion workflow.
- Authentication requires external Supabase configuration.
- If Supabase is not configured, the UI still exposes the account modal, but the sign-in action silently has no effect.
- Auth behavior was not tested against a live Supabase project.

### Supabase integration — **Partially implemented**

Implemented:

- Supabase client
- Auth session handling
- Wardrobe CRUD queries
- Profile queries
- App state persistence
- Wear-history persistence
- Weather Edge Function
- AI Edge Function
- Several RLS policies

Relevant directories:

```text
supabase/functions/
supabase/migrations/
src/cloudState.js
src/cloudWardrobe.js
src/supabase.js
```

High-risk limitations:

- The repository does not contain the base `profiles` or `wardrobe_items` table creation schema.
- Migrations reference `public.handle_new_user()` but do not define it.
- There is no Supabase project configuration in the repository.
- There are no storage bucket definitions or `storage.objects` policies.
- Existing migrations only add or alter parts of the cloud schema.
- A fresh Supabase project cannot clearly be recreated from this repository alone.

The optional Express API server exists, but the active Wearwell client uses Supabase directly and does not depend on the API server for its core flow.

### AI integration — **Partially implemented**

Implemented:

- Optional AI setting, off by default
- Explicit user action required before invocation
- Supabase Edge Function boundary
- Gemini API call from the server-side function
- Bounded input validation
- Structured JSON output validation
- Safe fallback when API key, model, or response is unavailable
- AI may suggest missing brief fields
- AI cannot select, create, or alter outfits

Relevant file:

```text
supabase/functions/interpret-assistant/index.ts
```

Limitations:

- Requires `GEMINI_API_KEY` in the Supabase function environment.
- No automated Edge Function tests exist.
- No live AI request was made during this audit.
- AI does not currently provide the broader conversational swap or explanation capabilities described in the architecture document.

### Speech input — **Partially implemented**

Implemented through:

```js
window.SpeechRecognition || window.webkitSpeechRecognition
```

Behavior includes:

- Explicit opt-in setting
- Language selection
- Start/stop listening
- Transcript appended to the brief
- Error handling for denied microphone, no speech, and unsupported browsers
- No audio persistence

Limitations:

- Support depends on the browser and operating system.
- No automated or browser-level speech test exists.
- Speech behavior was not manually tested with a microphone.

### Speech output — **Partially implemented**

Implemented through:

```js
window.speechSynthesis
window.SpeechSynthesisUtterance
```

It supports:

- Reading the brief aloud
- Reading recommendation explanations aloud
- Language selection
- Explicit opt-in
- Unsupported-browser fallback

Limitations:

- Browser/platform support varies.
- No speech synthesis tests exist.
- No browser-level verification was performed.

### Wardrobe image analysis — **Missing**

There is no active implementation for:

- Image upload
- Image storage
- Signed image URLs
- Image deletion
- Image analysis
- Automatic clothing tagging
- Material or colour extraction from images

The architecture and data-model documentation refer to image storage and image metadata, but the active source does not implement them.

### Personalization — **Partially implemented**

Implemented:

- Explicit comfort feedback
- Colour feedback
- “Wear again” feedback
- Exact-item-set ranking adjustment
- Saved options count
- Saved brief and settings
- Local and optional cloud persistence

The personalization is intentionally narrow:

- Feedback only affects the exact sorted item set.
- “Wore it” alone does not change ranking.
- There is no generalized preference model.
- Preferences do not yet transfer across similar garments or categories.
- There is no broader familiarity, style, colour, or silhouette profile.

## Test status

Current test result:

```text
33 total
31 passed
2 failed
```

Failures:

1. `src/dayPlan.test.mjs`
   - Expected title-cased event labels:
     - `University`
     - `Town with friends`
     - `Birthday dinner`
   - Implementation returns lowercase labels for the first and third events.

2. `src/storage.test.mjs`
   - Test expects storage version `3`.
   - Implementation writes storage version `4`.

Other results:

- All candidate-generation tests pass.
- All scoring tests pass.
- All selection/swap tests pass.
- Weather query tests pass.
- Full workspace TypeScript typecheck passes.
- No browser E2E tests exist.
- No Supabase integration tests exist.
- No AI, auth, image-storage, or speech tests exist.

There is also a non-blocking Node warning because `src/storage.js` is treated as an inferred ES module without a package-level `"type": "module"` declaration.

## Concise implementation map

### WORKING

- Frontend boots and serves successfully
- Local wardrobe add/edit/remove
- Deterministic candidate generation
- Deterministic outfit scoring
- Recorded hard-constraint filtering
- Local recommendation selection
- Item swapping with one-item alternatives
- Reason-aware regeneration
- Local wear history and feedback
- Local storage normalization
- Browser speech API fallbacks
- TypeScript workspace typecheck

### PARTIAL

- Wardrobe management, because scoring metadata and images cannot be entered in the active UI
- Weather integration, because live weather is optional and only temperature affects ranking
- Wear history, because cloud behavior is unverified and event identity is not supported
- Day planning, because a standalone module exists but is not wired into the active app
- Persistence, because cloud sync exists but active day-plan state is not connected
- Authentication, because only Supabase magic links are supported and require external configuration
- Supabase integration, because base schema/storage setup is incomplete in this repository
- AI assistance, because it is optional, externally configured, and untested live
- Speech input and output, because they depend on browser support
- Personalization, because only exact-combination feedback affects ranking

### BROKEN

- The existing Node test command currently exits with two failures
- The active implementation and test expectations disagree on day-plan label normalization
- The active implementation and test expectations disagree on local storage version

### MISSING

- Multi-event planning in the active UI
- Active integration of `dayPlan.mjs`
- Wardrobe image upload and analysis
- Object storage bucket and storage RLS implementation
- Self-contained base Supabase schema
- Browser E2E coverage
- Live Supabase/auth/weather/AI verification
- Generalized preference learning
- Account and full user-data deletion flow
- Individual history-entry deletion

## High-risk areas

1. **Two competing implementations:** `src/main.jsx` is active, while `src_new/main.jsx` contains a more advanced multi-event implementation that is not connected.
2. **Duplicate project trees:** `src_new/`, `artifacts_new/`, and `incomple/` increase the chance of editing or auditing the wrong version.
3. **Cloud schema incompleteness:** The repository references existing Supabase tables and functions that it does not fully create.
4. **Day-plan persistence mismatch:** The database and cloud module support `day_plan`, but the active UI does not maintain or save it.
5. **Weather scoring gap:** Rain, UV, wind, and humidity are fetched but not used by the recommendation engine.
6. **Documentation drift:** README and roadmap descriptions do not fully match the current source, especially swapping, cloud persistence, and test status.
7. **Test suite is red:** The project is not currently at a clean verification baseline despite passing typecheck and successfully starting.