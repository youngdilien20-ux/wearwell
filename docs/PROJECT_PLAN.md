# Wearwell project plan

## 1. Product thesis

The useful moment is not “browse fashion.” It is the five minutes before leaving home when a person knows what they are doing, how they feel, and roughly what the day will require—but does not want to assemble an outfit from scratch.

Wearwell should turn that spoken context into a small, understandable set of wearable choices from the user's own wardrobe. The assistant should feel like a calm conversation, not a quiz or a fashion judge.

## 2. MVP promise

> Tell Wearwell about today. It will understand the plan, check the conditions, and suggest a few outfits you can actually wear.

### MVP user journey

1. **Sign in**
   - Email/password sign-in with password recovery.
   - No social profile data is required for recommendations.

2. **Set up the wardrobe**
   - Add items through a guided form.
   - Category and colour are required.
   - Image, material, size/measurements, fit note, comfort, formality, condition, and laundry state are optional but improve results.
   - Users can add items one at a time; a large wardrobe import is not required for the first release.

3. **Start a day conversation**
   - The user can speak or type.
   - Wearwell extracts: activity/occasion, location, date, time window, duration, dress code, mood, comfort needs, coverage needs, mobility/sensory needs, and desired attention level.
   - Missing details are asked conversationally, one at a time.

4. **Confirm weather context**
   - Ask for permission before using location.
   - If location is unavailable, ask for a city or allow the user to skip weather.
   - Fetch conditions for the planned time, not only “right now.”
   - Show the weather facts used: temperature/feels-like, rain chance, wind, UV, humidity, and indoor AC when known.

5. **Recommend**
   - Return two or three options according to the user's setting.
   - Each option includes the item names/images, a short explanation, formality, weather fit, footwear, substitutions, comfort adjustment, and a cheaper/fewer-item path.
   - The first option is the safest practical choice. Other options vary polish or experimentation.

6. **Choose and learn**
   - The user can choose, wear, save, swap an item, regenerate, or reject.
   - After the choice, ask for lightweight feedback: comfortable, too formal/casual, liked the colours, would wear again.
   - Store explicit feedback and wear history. Do not store inferred identity or personality.

## 3. What is in the MVP

- Authenticated user profile.
- Wardrobe CRUD with optional item images.
- Text and voice input path.
- Structured conversation extraction.
- Weather lookup for a planned time.
- Rule-based outfit candidate generation from owned items.
- AI-assisted explanation and conversational follow-up.
- Two/three recommendation setting.
- Regenerate with a reason.
- Explicit feedback and wear history.
- Basic settings for language, units, number of options, and location permission.
- Mobile-responsive web experience.

## 4. What is deliberately out of scope

- Shopping marketplace, affiliate links, or pushing new purchases.
- Automatic body, skin-tone, culture, religion, gender, disability, or income inference.
- Virtual try-on or body-shape classification.
- Full closet recognition from one photo.
- Universal cultural dress-code claims.
- Medical, workplace safety, or legal advice.
- Social feed, public profiles, or influencer trend ranking.
- Full calendar integration in the first release.
- Automated laundry detection.

These can be considered after the core loop proves useful and safe.

## 5. Product decisions

### Web first, Expo-compatible

The brief calls for a web app and an Expo/React app. The implementation should use Expo Router and React Native primitives with web as the first target. This preserves one UI model for a later native mobile client while keeping the initial build easy to share and test in a browser.

### Rule engine first, LLM second

The model should not invent outfit combinations without a constrained candidate set. Deterministic logic handles hard constraints, availability, weather, formality range, laundry state, and activity compatibility. Gemini/Groq then helps interpret the conversation and write explanations in the user's tone.

### Explicit preferences, not appearance judgments

Users can say “I like olive,” “I need my shoulders covered,” “I dislike scratchy fabrics,” or “give me something familiar.” These become editable preferences or constraints. Photos are never used to label a user's body, identity, culture, or attractiveness.

### Two or three options

The setting defaults to three options because the brief asks for choice without overload. A user can select two or three in settings.

### Contextual uncertainty

When a dress code or cultural context is unknown, Wearwell says what is uncertain and gives a practical next step, such as asking the host or checking staff photos. It should not manufacture confidence.

## 6. MVP acceptance criteria

- A new user can sign in and add at least five wardrobe items without seeing a technical field name.
- A user can describe a plan by text and receive a recommendation using only clean, available wardrobe items.
- A recommendation never violates a user-stated hard constraint.
- Rain, extreme heat, cold, or high UV meaningfully changes the candidate selection or explanation.
- The response clearly separates what comes from weather, user preference, and context convention.
- Regenerate changes the combination or approach and preserves the original choice.
- Feedback is saved and affects later ranking without changing hard constraints.
- Every recommendation contains a reason, substitution, weather note, footwear note, and discomfort fallback.
- A user can delete a wardrobe item, preference, recommendation history, and account data.
- The app refuses to infer culture, religion, disability, gender expression, body type, or skin-tone rules from a name, image, or location.

## 7. Success measures for the first pilot

Measure these with a small, diverse pilot rather than treating them as guaranteed outcomes:

- Recommendation usefulness: target average of 4/5 or higher.
- “I wore the recommendation”: target 60% or higher after baseline measurement.
- Hard-constraint adherence: 100%.
- Required explanation fields present: 100%.
- Human review finds no stereotype, body-shaming, or cultural-costuming language in the golden test set.
- Repeat use within seven days.
- Increase in use of existing wardrobe items, measured by explicit wear history.

## 8. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Confident but wrong cultural advice | Ask the user/host; tag evidence; show uncertainty; expert review before regional expansion |
| “Flattering” or body-shaming language | Forbidden-language checks and prompt policy; test with matched scenarios |
| Weather data is wrong or unavailable | Show source time and uncertainty; degrade to user-provided conditions |
| AI recommends dirty, damaged, or unavailable items | Deterministic wardrobe filters and laundry state |
| Too many setup questions | Progressive setup; allow unknown; improve recommendations incrementally |
| Voice transcription misunderstands a plan | Show extracted plan for confirmation and support text correction |
| Images expose sensitive information | Private storage, signed URLs, deletion controls, no identity inference |
| Recommendations feel repetitive | Track wear history and novelty; make “try something different” explicit |

## 9. Build sequence

1. Create Supabase schema and seed controlled vocabularies.
2. Build auth and wardrobe setup.
3. Build text-first day brief and recommendation loop with deterministic mock weather.
4. Add real weather adapter and planned-time handling.
5. Add AI extraction/explanations behind a server-side function.
6. Add voice input/output.
7. Add feedback, wear history, regeneration, and settings.
8. Run safety and usability evaluation before adding more fashion knowledge.

## Current implementation handoff

The current local-first increment is committed on `main` as `cd07e87` (`feat(wearwell): add local-first feedback and settings`). It adds opt-in browser speech input/read-aloud, bounded optional AI brief suggestions, local settings and wear history, exact-item-set feedback ranking, and a Vite development proxy for `/api`. The focused Node suite passed 15 tests; a full workspace build and end-to-end browser/API smoke test have not yet been run.

### Implemented — do not rebuild

- Existing React/Vite app, deterministic candidate generation, optional Supabase auth/wardrobe paths, and weather context.
- Local storage normalization for settings/history, capped at 200 entries.
- User-controlled speech and AI settings; AI suggestions cannot choose or modify outfits.
- Explicit comfort/colour/“wear again” feedback affects only the exact combination, capped at ±8; wear confirmation alone has no ranking effect.
- Existing local fallback remains available. This increment made no Supabase schema changes.

### Remaining — follow `docs/ROADMAP.md` in order

1. Repair the `.replit` merge conflict through Replit’s validated replacement flow, then run the full build and smoke tests.
2. Verify planned-time weather in code/runtime: the plan’s checkpoint and architecture/roadmap descriptions disagree.
3. Complete the real swap and reason-aware regeneration interactions and missing MVP recommendation details.
4. Keep history/settings local unless cross-device persistence is required; if required, propose the smallest authenticated design and deletion behavior before any schema work.
5. Run the safety, accessibility, and usability evaluation before calling the MVP complete.

The next agent must work only on these remaining items, make small verified changes, commit and push each coherent increment without force-pushing, and report the commit, tests actually run, and prioritized remaining work after each increment. Do not mark the MVP complete until its acceptance criteria are tested.