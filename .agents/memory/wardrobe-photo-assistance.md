---
name: Wardrobe photo assistance
description: Project decisions for the optional AI-assisted wardrobe entry flow.
---

Keep wardrobe photo analysis on the existing signed-in Supabase Edge Function and Gemini path; do not introduce a separate Replit AI provider. Keep manual entry available, send a photo only when the user requests analysis, and require explicit review before suggestions affect the draft. Persist only normalized, confirmed wardrobe fields, never the source photo or raw model response. Restrict suggestions to visible clothing details and cautious weather/formality hints; do not infer brand, fabric, exact fit, size, or wearer identity.

**Why:** The project already uses Supabase for AI, and the user explicitly chose that existing service rather than adding another provider or credential path.

**How to apply:** Keep client UI, Edge Function, validation, and storage changes consistent with these constraints. Preserve JWT verification and deploy through the linked Supabase project without exposing its management token.