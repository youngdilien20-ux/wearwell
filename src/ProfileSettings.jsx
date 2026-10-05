import {
  FIT_PREFERENCE_OPTIONS,
  SKIN_TONE_OPTIONS,
} from "./profile.mjs";

function ChoiceButton({ active, className = "", children, onClick, label }) {
  return (
    <button
      type="button"
      className={`profile-choice ${active ? "selected" : ""} ${className}`}
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function ProfileSettings({
  profile,
  onChange,
  onSave,
  onSkip,
  busy,
  isSignedIn,
  shareProfileWithAi,
  onShareProfileWithAiChange,
}) {
  return (
    <section id="profile-settings" className="setting-card profile-card">
      <p className="eyebrow">OPTIONAL PROFILE</p>
      <h2>Your style profile</h2>
      <p className="profile-intro">
        Optional details can help tailor recommendations. Leave anything blank.
      </p>

      <div className="profile-form-grid">
        <label className="profile-label">
          City or area <span>Optional</span>
          <input
            value={profile.city}
            maxLength={80}
            onChange={(event) => onChange("city", event.target.value)}
            placeholder="e.g. Kitwe"
          />
        </label>

        <fieldset className="profile-fieldset">
          <legend>Skin tone <span>Optional</span></legend>
          <div className="profile-swatch-row">
            {SKIN_TONE_OPTIONS.map((option) => (
              <ChoiceButton
                key={option.value}
                active={profile.skinTone === option.value}
                label={`Choose ${option.label} skin tone`}
                onClick={() => onChange("skinTone", profile.skinTone === option.value ? "" : option.value)}
              >
                <span className="skin-tone-swatch" style={{ "--skin-swatch": option.color }} aria-hidden="true" />
                <span>{option.label}</span>
              </ChoiceButton>
            ))}
            <ChoiceButton
              className="skip-choice"
              active={!profile.skinTone}
              onClick={() => onChange("skinTone", "")}
            >
              Skip
            </ChoiceButton>
          </div>
        </fieldset>

        <fieldset className="profile-fieldset">
          <legend>Fit preference <span>Optional</span></legend>
          <div className="profile-fit-options">
            {FIT_PREFERENCE_OPTIONS.map((option) => (
              <ChoiceButton
                key={option.value}
                active={profile.fitPreference === option.value}
                onClick={() => onChange("fitPreference", profile.fitPreference === option.value ? "" : option.value)}
              >
                <span className="fit-choice-mark" aria-hidden="true">⌁</span>
                <strong>{option.label}</strong>
                <small>{option.detail}</small>
              </ChoiceButton>
            ))}
            <ChoiceButton
              className="skip-choice"
              active={!profile.fitPreference}
              onClick={() => onChange("fitPreference", "")}
            >
              Skip
            </ChoiceButton>
          </div>
          <p className="profile-help">Fit only, not body shape.</p>
        </fieldset>

        <div className="profile-fieldset profile-measurements">
          <label className="profile-label">
            Height <span>Optional</span>
            <div className="profile-height-input">
              <input
                type="number"
                min="100"
                max="230"
                step="1"
                value={profile.heightCm}
                onChange={(event) => onChange("heightCm", event.target.value)}
                placeholder="e.g. 165"
                aria-label="Height in centimetres"
              />
              <span>cm</span>
            </div>
          </label>
          <label className="profile-label">
            Hair profile <span>Optional</span>
            <input
              value={profile.hairProfile}
              maxLength={120}
              onChange={(event) => onChange("hairProfile", event.target.value)}
              placeholder="Anything you want considered"
            />
          </label>
        </div>

        <label className="profile-label profile-community">
          Cultural or community context <span>Optional</span>
          <textarea
            value={profile.communityContext}
            maxLength={500}
            rows={3}
            onChange={(event) => onChange("communityContext", event.target.value)}
              placeholder="Dress expectations or traditions to respect"
          />
          <small>Used as written; nothing is inferred.</small>
        </label>
      </div>

      <div className="profile-ai-consent">
        <label className="setting-toggle">
          <input
            type="checkbox"
            checked={shareProfileWithAi}
            onChange={(event) => onShareProfileWithAiChange(event.target.checked)}
          />
          <span>Allow AI to use my saved profile details</span>
        </label>
        <p>Only nonblank details are shared during AI planning. AI can’t change your chosen look.</p>
      </div>

      <div className="profile-actions">
        <button type="button" className="understand-button" onClick={onSave} disabled={busy}>
          {busy ? "Saving…" : "Save profile"} <span aria-hidden="true">→</span>
        </button>
        <button type="button" className="text-button" onClick={onSkip} disabled={busy}>
          Skip for now
        </button>
        <span className="profile-save-hint">
          {isSignedIn ? "Saved to your account." : "Saved on this device; sign in to sync."}
        </span>
      </div>
    </section>
  );
}