# Research comparison and curated additions

## Sources compared

Wearwell now has two research reports plus the original product brief:

1. `source/AI_Wardrobe_Assistant_Fashion_Research.pdf` — the original 50-page synthesis, dated 28 September 2026.
2. `source/AI_Wardrobe_Assistant_Global_Clothing_Styling_Research_Report.pdf` — the additional 62-page synthesis, prepared 28 September 2026 and covering clothing, styling, textiles, culture, fit, accessibility, budgets, and recommendation data architecture.
3. `source/Pasted-RESEARCH-DATA.txt` — the original user brief and product requirements.

The second report is a useful supplementary source, not proof that every claim is universal. Its own scope statement says that much perception research is Western and that some regional claims are unverified or based on secondary and commercial sources.

## What the existing collection already covered

The original collection already established the product's most important protections and decisions:

- ask rather than infer culture, religion, gender, ability, body type, skin tone, or budget;
- separate physical needs, context conventions, personal preferences, and trends;
- use owned clothing first;
- treat fit, comfort, mobility, sensory needs, modesty, and safety as first-class;
- apply deterministic constraints before any model explanation;
- show two or three options with reasons, substitutions, weather notes, and comfort fallbacks;
- retain only explicit feedback and never turn appearance into identity labels.

These remain the product foundation. The additional report does not justify relaxing any of them.

## Additions adopted into the product design

### 1. Three-layer context model

Every day brief should be understood in this order:

1. **Function:** temperature, movement, protection, duration, and indoor/outdoor conditions.
2. **Social expectations:** stated dress code, host or venue guidance, uniform, community convention, and uncertainty.
3. **Personal goals:** comfort, confidence, identity, attention level, familiarity, or experimentation.

Function and hard constraints are resolved before social convention; personal taste chooses among viable candidates. Each layer should carry a confidence or uncertainty signal.

### 2. Evidence labels and scope

Research-backed rules should be tagged rather than presented as universal fashion law:

- `WS` — widely supported physical or textile principle;
- `CD` — context-dependent or cultural convention;
- `PP` — personal preference;
- `TR` — temporary trend;
- `CA` — commercial or industry advice;
- `OP` — stylist or expert opinion;
- `WE` — weak, contested, or single-source evidence.

The existing E1–E4 source-quality scheme remains useful. These new labels describe the claim itself, while E1–E4 describes the quality and review state of the source.

### 3. Richer wardrobe attributes

When users want to provide more detail, the model can support:

- pattern type, scale, density, and contrast;
- material percentages and care requirements;
- silhouette and fit vocabulary without body-shape labels;
- coverage such as sleeve, neckline, hem, and opacity;
- estimated warmth, climate, and indoor air-conditioning suitability;
- sensory comfort, mobility features, condition, wear count, and laundry status;
- user confidence in the item and compatible item IDs.

These should remain progressive and optional. The first-use flow must not become a long form.

### 4. More explicit recommendation sequencing

The deterministic flow should be:

1. Filter hard safety, uniform, coverage, mobility, sensory, and user-stated requirements.
2. Confirm occasion, venue, duration, and activity.
3. Resolve known host or community guidance; otherwise state uncertainty and ask.
4. Fit the planned weather and indoor/outdoor temperature change.
5. Remove unavailable, dirty, damaged, or still-wet items.
6. Consider time available and saved safe outfits.
7. Score formality, comfort, colour/pattern coherence, preference match, and useful novelty.
8. Present a primary option plus alternatives with evidence and uncertainty labels.
9. Learn only from explicit feedback.

### 5. Inclusion details worth supporting

The report adds implementation-level examples that fit Wearwell's existing approach:

- seated-fit trousers with a higher back rise;
- easier closures and larger pulls;
- flat seams, tag-free labels, and predictable textures;
- adjustable waists, stretch, and nursing access when the user states a pregnancy or postpartum need;
- PPE, safety footwear, and loose-item restrictions for relevant work or activities.

These are options triggered by a stated need, not labels inferred from a photo or voice.

### 6. Sustainability and budget guardrails

The strongest actionable principle is to extend the life and use of clothing already owned. Wearwell can later support repair, alteration, borrowing, second-hand, and cost-per-wear views.

The report's claims about market size, utilisation decline, rental, and environmental impact are not recommendation rules. They vary by region, logistics, and source quality. Rental should not be treated as automatically sustainable; it may be useful for occasional formal, maternity, or one-off needs.

### 7. Evaluation additions

The pilot test set should add:

- matched prompts where only the user's name, location, age, or assumed identity changes;
- culturally specific events where the correct action is to ask the host rather than invent a rule;
- no-body-judgement language checks;
- weather injection tests for cold/wet activity, high sun, heat, and indoor air-conditioning;
- sensory, seated-fit, pregnancy/postpartum, and budget scenarios;
- evidence-label completeness and hallucinated-rule tests;
- an explanation checklist for every recommendation.

## Information deliberately not promoted to product rules

The following remain research notes or future review items:

- regional wedding, funeral, religious, or workplace conventions without local/community review;
- market-size forecasts and commercial trend claims;
- exact drying-time, warmth, or environmental numbers with weak or changing sources;
- skin-tone or seasonal-colour systems;
- body-shape systems and “never wear” rules;
- claims that clothes reveal character, class, intelligence, worth, or guaranteed performance;
- legal or medical advice outside the relevant jurisdiction or professional authority.

## Research gaps preserved

The additional report confirms that Wearwell still needs better local and community-reviewed evidence for East African dress, adaptive apparel across cultures, funeral and wedding etiquette, garment-level colour studies under varied lighting, non-Western warmth data, privacy expectations for measurements, and the effect of evidence labels on trust and cognitive load.

Until those gaps are addressed, the app should ask, show uncertainty, and prefer user-provided or host-provided guidance.