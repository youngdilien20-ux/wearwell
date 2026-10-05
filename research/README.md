# Research inputs

The product plan was derived from three supplied inputs:

- `source/AI_Wardrobe_Assistant_Fashion_Research.pdf`
- `source/AI_Wardrobe_Assistant_Global_Clothing_Styling_Research_Report.pdf`
- `source/Pasted-RESEARCH-DATA.txt`

The first PDF is a 50-page research synthesis dated 28 September 2026. The second is a 62-page global clothing and styling synthesis prepared on 28 September 2026. Both explicitly distinguish evidence from design synthesis and list regional and cultural coverage gaps. They should be treated as product research, not professional, medical, legal, or workplace-safety advice.

`COMPARISON_AND_ADDITIONS.md` records what the second report adds, what was already covered, and which claims were deliberately not promoted to product rules.

Important implementation consequences:

- Separate physical clothing facts, local conventions, personal preferences, and trends.
- Ask rather than infer culture, religion, ability, gender, body type, or budget.
- Use measurements and fit notes rather than relying on size labels.
- Make comfort, mobility, sensory needs, modesty, and safety first-class inputs.
- Treat second-hand, repair, alteration, rental, and using existing clothes as normal.
- Make colour guidance preference-led; never prohibit colours based on skin tone.
- Explain uncertainty and never invent cultural facts or sources.
- Tag claims by scope (`WS`, `CD`, `PP`, `TR`, `CA`, `OP`, or `WE`) when they appear in recommendation explanations.
- Resolve function, then social expectations, then personal goals; keep confidence and uncertainty visible.
- Treat market-size, rental, sustainability, and regional convention claims as scoped research rather than universal rules.

The original attachments remain the source record. The application should eventually maintain a reviewed, machine-readable evidence table rather than passing the PDF directly to a model.