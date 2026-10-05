# Recommendation engine

## 1. Principle

Use a deterministic constraint-and-scoring pipeline to choose outfits. Use the language model to understand the user and explain the result, not to bypass the constraints.

## 2. Inputs

Required before recommending:

- occasion or activity and approximate duration;
- dress code, uniform, or whether it is unknown;
- weather and location/time context, if permission and data are available;
- hard constraints: safety/PPE, coverage, mobility, sensory, footwear;
- available wardrobe or a stated budget/formula path.

Useful optional inputs:

- comfort and fit preferences;
- desired attention level and risk appetite;
- liked/avoided colours and patterns;
- laundry state and time available;
- transport and amount of walking.

Never infer culture, religion, gender expression, ability, body type, skin tone rules, or budget.

## 3. Context layers

Interpret each brief through three layers:

1. **Function:** temperature, movement, protection, duration, and indoor/outdoor conditions.
2. **Social expectations:** stated dress code, host or venue guidance, uniform, community convention, and uncertainty.
3. **Personal goals:** comfort, confidence, identity, attention level, familiarity, and experimentation.

Resolve hard functional constraints first, then known social expectations, then personal preference. Keep a confidence or uncertainty value for each layer; an unknown dress code is not permission to invent one.

## 4. Constraint gate

Reject a candidate if it:

- violates a hard user-stated constraint;
- uses an item not owned by the user in an item-first request;
- uses an item marked dirty, unavailable, or needing repair;
- is incompatible with a mandatory uniform/PPE rule;
- is clearly unsafe for the stated activity;
- conflicts with a user-stated coverage or sensory need.

Soft preferences are not rejection rules. They reduce score and can be overridden by the user.

## 5. Candidate generation

Generate small combinations from wardrobe roles:

- top or dress;
- bottom where needed;
- layer where weather or formality needs it;
- shoes;
- optional accessory.

Use category compatibility and avoid combinatorial explosion by filtering early:

1. availability and condition;
2. activity and weather;
3. formality range;
4. hard constraints;
5. fit and comfort compatibility;
6. palette and pattern compatibility.

The engine should return at least one option when possible and explain what is missing when it cannot.

## 6. Starting score

```text
score =
  w1 * formality_coherence
+ w2 * weather_fit
+ w3 * color_coordination
+ w4 * fit_compatibility
+ w5 * comfort
+ w6 * user_confidence
+ w7 * preference_match
+ w8 * novelty
- w9 * cost_or_laundry_friction
```

Hard constraints are evaluated before scoring and cannot be traded away.

### Recommendation levels

| Level | Purpose | Behaviour |
| --- | --- | --- |
| L1 | Safe and practical | Familiar pieces, comfort and constraints weighted highest |
| L2 | Polished and versatile | Add structure or a better pairing without high novelty |
| L3 | Stylish, low-risk | One statement colour, pattern, or silhouette |
| L4 | Creative | More unusual combination, always with an L1 fallback |

Default output: L1, L2, and L3 when enough wardrobe data exists. If the user asks for something simple, return L1 and L2 only.

## 7. Styling rules as defaults

The engine may use these as explainable starting points:

- context before taste;
- comfort and fit before price;
- keep items within roughly one formality step unless intentional;
- use neutrals plus an accent as an option, not a universal law;
- vary value and texture in low-contrast outfits;
- vary pattern scale and share a colour/value when mixing patterns;
- footwear must fit the activity first;
- layer thin to thick;
- in heat, prioritise airflow, looseness, and shade;
- for long sun exposure, consider dry tightly woven clothing and a wide-brim hat;
- check colours in the light where the outfit will be worn;
- offer alterations, second-hand, repair, and fewer-item alternatives.

Additional scoped defaults from the supplementary research:

- similar hues are a lower-risk colour starting point; contrast is an opt-in emphasis, not a rule;
- one focal point or one statement pattern is a useful low-risk default, except when the user wants maximalism or the textile is intended to carry the look;
- check near-matching colours in the light where the outfit will be worn;
- avoid cotton as a base layer during cold, wet activity when a safer alternative is available;
- consider portable layers for indoor air-conditioning gaps and removable layers for transitional weather.

All rules are defaults with a claim label and evidence status. None should be phrased as a prohibition based on body, age, skin tone, culture, or gender.

## 8. Explanation contract

The model receives only the selected candidate facts and must fill:

- why the combination works;
- formality level;
- weather fit;
- footwear and accessories;
- substitutions;
- what to change if uncomfortable;
- a cheaper or fewer-item alternative;
- uncertainty or what to ask the host;
- evidence or claim labels for any rule-like statement.

The model must not invent item properties, source claims, or cultural meaning. Missing facts should be stated as unknown.

## 9. Regeneration

Regeneration is not a generic retry. It accepts a reason:

- `more_casual`
- `more_formal`
- `more_color`
- `less_attention`
- `different_shoes`
- `more_comfort`
- `different_items`

Exclude the prior outfit signature and adjust the score weights or soft penalties. Keep hard constraints unchanged.

## 10. Feedback learning

Only explicit feedback updates preferences:

- choosing an outfit raises confidence in that combination;
- rejecting an item can lower its preference score for similar contexts;
- “too formal” adjusts context-specific formality preference;
- “too hot” adjusts the user's comfort signal for that material/context;
- “I like this colour” updates a colour preference only when explicitly stated.

Do not infer from a single rejection that the user dislikes a culture, colour family, body silhouette, or category.

### Current local implementation

The browser prototype matches feedback against the exact sorted set of item IDs. It does not generalize from a single item or a partially overlapping outfit. For that exact combination, explicit “would wear again” feedback contributes +4/-4, comfort contributes +2/-2, and liked-colour feedback contributes +2/-2; the combined feedback adjustment is capped at +8/-8. “Did you wear it?” is saved in history but has no ranking effect by itself. Unanswered fields contribute nothing.

Feedback can change ranking, never the hard-constraint gate. The explanation provenance identifies when exact-combination feedback affected ranking. History and feedback are browser-local, capped at 200 entries, and can be cleared from Wear history.

## 11. Test scenarios

The golden set should include:

- hot and humid walk;
- rainy commute;
- work with unknown dress code;
- religious event with user-stated coverage;
- sensory-sensitive user;
- wheelchair user or seated activity;
- limited wardrobe and shared laundry;
- second-hand and low-budget wardrobe;
- user asks for skin-tone “rules”;
- visitor asks for a culturally specific ceremony;
- user asks to look “slimmer” or “hide” a body part;
- user gives a name or location that must not change the recommendation;
- matched prompts that vary only a name, location, age, or assumed identity;
- cultural event with missing host guidance;
- cold/wet activity with a cotton base-layer trap;
- high-sun and indoor-air-conditioning transitions;
- evidence-label completeness and invented-rule red-team cases.