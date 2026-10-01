# Wearwell data model

The schema stores what a user explicitly tells the product and what the product can trace to a source. It does not create identity labels from images, names, geography, or clothing.

## 1. Core entities

### `profiles`

- `id` — UUID matching `auth.users.id`
- `display_name` — optional
- `locale` — language, country, timezone, units
- `option_count` — 2 or 3, default 3
- `voice_enabled` — boolean
- `weather_permission` — `granted`, `denied`, or `not_asked`
- `created_at`, `updated_at`

### `wardrobe_items`

- `id`, `user_id`
- `category`, `subcategory`
- `name`
- `image_path` — optional private-storage path
- `colors` — JSON array of `{ name, hex?, hue_family?, value?, saturation? }`
- `visual_attributes` — structured, user-confirmed visible pattern/details and formality confirmation; never a source photo or raw model response
- `pattern_type`, `pattern_scale`
- `pattern_contrast`
- `materials` — JSON array of `{ fiber, percentage? }`
- `fit_label` — `fitted`, `tailored`, `relaxed`, `oversized`, or `unknown`
- `silhouette` — optional plain-language shape such as `straight`, `A-line`, `wide`, `cropped`, `layered`, or `draped`
- `fit_measurements` — optional JSON, user-entered
- `fit_note`
- `formality` — integer 1–5
- `climate_tags`, `season_tags`, `occasion_tags`
- `warmth_clo_estimate` — optional, never presented as exact when unknown
- `coverage` — optional JSON for sleeve, neckline, hem, and opacity
- `comfort_rating` — integer 1–5
- `sensory_notes`
- `condition` — `good`, `worn`, `needs_repair`
- `laundry_state` — `clean`, `worn_again`, `needs_wash`, `needs_repair`, `unknown`
- `user_confidence` — integer 1–5
- `care_notes`
- `cost` — optional, user-entered
- `wear_count`
- `last_worn_at`
- `created_at`, `updated_at`

Sizes are not a primary fit field. Measurements and fit notes are more portable than brand labels.

### `user_constraints`

- `id`, `user_id`
- `type` — `coverage`, `mobility`, `sensory`, `uniform`, `safety`, `footwear`, `religious_or_cultural`, or `other`
- `detail` — plain-language user-stated requirement
- `hard` — whether the engine must reject violations
- `source` — always `user_stated` for personal requirements
- `active`
- timestamps

Do not store `religion`, `disability`, `gender`, `body_type`, or similar inferred labels.

### `style_preferences`

- `id`, `user_id`
- `liked_colors`, `avoided_colors`
- `liked_patterns`, `avoided_patterns`
- `liked_silhouettes`, `avoided_silhouettes`
- `style_words`
- `risk_appetite` — `safe`, `familiar`, `experimental`
- `attention_level` — `blend_in`, `balanced`, `stand_out`
- `comfort_preferences`
- timestamps

These are editable preferences, not rules about what the user can wear.

### `day_briefs`

- `id`, `user_id`
- `raw_text` — optional, based on transcript-retention setting
- `input_mode` — `text`, `voice`, `mixed`
- `occasion`
- `activities`
- `location_label` — avoid storing coordinates unless required
- `timezone`
- `planned_start`, `planned_end`
- `duration_minutes`
- `dress_code`
- `venue_type`
- `indoor_outdoor`
- `mood`
- `desired_attention`
- `risk_appetite`
- `time_available_minutes`
- `host_guidance`
- `status` — `draft`, `ready`, `completed`
- `extracted_fields` — JSON with confidence and source
- timestamps

### `weather_snapshots`

- `id`, `user_id`, `day_brief_id`
- normalized weather fields
- `source`
- `fetched_at`
- `uncertainty`

### `outfits`

- `id`, `user_id`
- `item_ids` — JSON array or normalized join table
- `roles` — JSON such as top/bottom/layer/shoes/accessory
- `formality`
- `palette`
- `weather_range`
- `activities`
- `created_by` — `engine`, `user`, or `import`
- timestamps

### `recommendations`

- `id`, `user_id`, `day_brief_id`, `outfit_id`
- `level` — `L1`, `L2`, `L3`, or `L4`
- `rank`
- `explanation` — structured required fields
- `confidence`
- `uncertainties`
- `constraints_applied`
- `rule_ids`
- `evidence_ids`
- `safe_language_result`
- `model_provider`, `model_name`
- timestamps

### `outfit_feedback`

- `id`, `user_id`, `recommendation_id`, `outfit_id`
- `decision` — `chosen`, `rejected`, `regenerated`, `swapped`
- `comfort_rating`
- `formality_feedback`
- `color_feedback`
- `free_text`
- `explicit_preference_updates`
- timestamps

### `outfit_wears`

- `id`, `user_id`, `outfit_id`
- `worn_at`
- `occasion`
- `comfort_rating`
- `would_wear_again`
- `notes`

## 2. Recommendation explanation shape

```ts
type RecommendationExplanation = {
  whyItWorks: string;
  formality: string;
  weatherFit: string;
  footwear: string;
  accessories: string[];
  substitutions: Array<{
    replaceItemId: string;
    withItemId?: string;
    reason: string;
  }>;
  ifUncomfortable: string[];
  cheaperOrFewerItems: string;
};
```

Every field is required, even when the answer is “none needed.”

## 3. Evidence records

The full evidence system can follow after the MVP, but rules that appear in user-facing explanations should eventually map to:

- claim;
- claim type: physical principle, context convention, preference, trend, commercial advice, stylist opinion, or weak evidence;
- claim label: `WS`, `CD`, `PP`, `TR`, `CA`, `OP`, or `WE`;
- scope and region;
- exceptions;
- source title, author, URL, publication date;
- evidence strength;
- limitations;
- universality;
- review status;

This prevents the product from turning one local convention or weak source into a universal rule.

## 4. Row-level security

Every user-owned table uses `user_id = auth.uid()` policies for select, insert, update, and delete. Storage objects use a path prefix based on the authenticated user ID.