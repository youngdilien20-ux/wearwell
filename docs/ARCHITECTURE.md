# Wearwell architecture

## 1. System shape

```text
Expo Router web client
        |
        v
Supabase Auth + Postgres + Storage
        |
        v
Supabase Edge Functions
  |         |          |
  v         v          v
Weather   AI gateway  Recommendation engine
adapter   (Gemini/    (constraints + scoring)
          Groq)
        |
        v
  Structured recommendation JSON
        |
        v
  Safe-language and constraint validation
        |
        v
  Client explanation and feedback controls
```

## 2. Client

Use Expo Router with React Native components that render well on web:

- `/` — today conversation and recommendation result.
- `/onboarding` — profile basics and wardrobe setup.
- `/wardrobe` — wardrobe list, item details, add/edit form.
- `/history` — accepted outfits and feedback.
- `/settings` — option count, language, units, permissions, privacy, deletion.

The client owns presentation and optimistic interaction state. The brief, wardrobe, option count, plan, chosen look, settings, wear history, and feedback remain available through a versioned browser-storage fallback; authenticated state is persisted in Supabase when cloud configuration and a session are available. The client does not hold provider API keys and does not call Gemini, Open-Meteo, or geocoding providers directly.

## 3. Edge functions

Suggested functions:

- `extract-day-brief`
  - Input: user message/transcript plus known user preferences.
  - Output: validated `DayBrief` and missing questions.
- `get-weather-context`
  - Input: city/coordinates, planned start/end, permission state.
  - Output: normalized `WeatherSnapshot`.
- `generate-recommendations`
  - Input: `DayBrief`, `WeatherSnapshot`, wardrobe items, settings.
  - Output: candidate outfits plus explanation fields.
- `generate-follow-up`
  - Input: conversation and recommendation context.
  - Output: one concise clarification or adjustment.
- `synthesize-speech` / `transcribe-speech`
  - Provider adapter boundary; exact implementation may vary by browser/device support.

All functions validate user ownership and return only the user's data.

## 4. AI boundary

AI is used for:

- extracting structured intent from natural language;
- asking the next useful question;
- explaining why a deterministic outfit is suitable;
- conversationally handling swaps and regeneration.

AI is not the authority for:

- hard constraints;
- weather facts;
- whether an item is clean or available;
- culture/religion/ability inference;
- safety or medical advice;
- deciding what a body “should” hide or emphasize.

Use JSON schema validation on every model response. If parsing fails, fall back to a safe clarification rather than retrying indefinitely.

## 5. Weather adapter

Define a provider-neutral interface:

```ts
type WeatherQuery = {
  latitude?: number;
  longitude?: number;
  city?: string;
  start: string;
  end: string;
  timezone: string;
};

type WeatherSnapshot = {
  observedAt: string;
  timezone: string;
  tempC?: number;
  feelsLikeC?: number;
  rainProbability?: number;
  windKph?: number;
  uvIndex?: number;
  humidity?: number;
  precipitationMm?: number;
  source: string;
  uncertainty?: string;
};
```

The `get-weather-context` function accepts coordinates and requests Open-Meteo hourly forecast fields server-side. Wearwell requests browser geolocation when weather has not been turned off; the browser permission prompt controls access, and users can retry or turn weather off in account settings. Coordinates are rounded before use and, when signed in, saved separately from wardrobe data. The client invokes the weather function only for an authenticated cloud session; otherwise it keeps the labelled deterministic fallback. It selects the planned start/end window in the requested timezone and returns normalized weather facts with a source and uncertainty note. The system should ask for a time window when the user says “this afternoon,” “after work,” or similar. If the planned time cannot be resolved, show a clearly labelled estimate or ask one follow-up.

## 6. Recommendation request flow

1. Client sends transcript or text to `extract-day-brief`.
2. Function returns a brief plus missing fields.
3. Client asks only for the highest-value missing field.
4. Once enough context exists, `get-weather-context` runs if the user permits it.
5. `generate-recommendations` loads owned wardrobe items and filters them.
6. The engine creates candidates and scores them.
7. AI produces explanations from candidate facts only.
8. Safe-language and constraint validators run.
9. The client renders two or three cards with choice, swap, regenerate, and feedback actions.
10. The accepted choice is written to `outfit_wears`; feedback updates explicit preferences.

## 7. Failure behaviour

- **No wardrobe items:** offer a formula and ask the user to add one item, without pretending to personalize.
- **Too few compatible items:** explain the gap and return the best available option plus a substitution path.
- **Weather unavailable:** ask for the user's conditions or clearly label a weather-free recommendation.
- **AI unavailable:** use deterministic candidate labels and a plain template explanation.
- **Voice unavailable:** keep the full text experience functional.
- **Uncertain cultural context:** do not generate a confident cultural claim; ask what the host or community expects.

## 8. Privacy and security

- Row Level Security on every user-owned table.
- Private wardrobe image bucket with signed URLs.
- No provider keys in the client.
- Store transcripts only if the user opts in; otherwise process and discard after extraction.
- User-visible deletion for items, images, feedback, history, and account.
- Keep sensitive requirements as user-stated constraints, not inferred identity labels.

## 9. Current local-first web slice

The runnable React/Vite artifact in `artifacts/wearwell-app` wraps the experience in `src/main.jsx`. Versioned browser storage keeps the brief, wardrobe, option count, selected look, settings, and up to 200 saved looks with explicit feedback. Wear history and settings remain on the device; they are not sent to Supabase.

Browser speech recognition and read-aloud are disabled until the user opts in through Settings. Support depends on the browser or operating system. Audio is not stored by Wearwell, and the transcript is shown in the editable brief.

Optional AI brief suggestions are off by default. After enabling them, the user must press “Plan my next wear” to invoke the Supabase `interpret-assistant` Edge Function with the brief, selected occasion, weather summary, and first deterministic look summary/item names. Audio, account details, and wear history are excluded. The function validates bounded input/output and uses the Gemini key only as a Supabase function secret. Suggestions may fill blank brief fields after user review; they cannot select, generate, or modify outfit combinations. If the function or model is unavailable, local extraction and deterministic recommendations continue.

Feedback ranking is local and matches the exact sorted item-ID set only. “Wore it” is recorded but does not change ranking by itself. Explicit comfort, colour, and “wear again” responses can affect that exact combination within a bounded score; they never alter the hard-constraint gate.

Authenticated persistence now includes settings, planning state, selected looks, wear history, and feedback through the `user_settings` and `wear_history` tables. Keep the existing local fallback intact for offline use and migration recovery.