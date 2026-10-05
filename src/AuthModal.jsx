const AUTH_TITLES = {
  sign_in: "Save your wardrobe everywhere",
  sign_up: "Create your Wearwell account",
  forgot_password: "Reset your password",
  update_password: "Choose a new password",
};

export default function AuthModal({
  session,
  cloudEnabled,
  authMode,
  onAuthModeChange,
  authEmail,
  onAuthEmailChange,
  authPassword,
  onAuthPasswordChange,
  authPasswordConfirmation,
  onAuthPasswordConfirmationChange,
  profileName,
  onProfileNameChange,
  authMessage,
  authBusy,
  onAuthSubmit,
  onPasswordResetRequest,
  onPasswordUpdate,
  onSaveProfile,
  onSignOut,
  onClose,
}) {
  const submitHandler = authMode === "forgot_password"
    ? onPasswordResetRequest
    : authMode === "update_password"
      ? onPasswordUpdate
      : onAuthSubmit;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">YOUR PRIVATE WARDROBE</p>
            <h2 id="auth-modal-title">
              {session ? "Your account is connected" : AUTH_TITLES[authMode]}
            </h2>
          </div>
          <button
            type="button"
            className="close-button"
            aria-label="Close account dialog"
            data-testid="button-close-account"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {session && authMode !== "update_password" ? (
          <form onSubmit={onSaveProfile}>
            <p className="modal-note">
              Add only the name you want Wearwell to use; it is not required for recommendations.
            </p>
            <label>
              Name (optional)
              <input
                autoFocus
                value={profileName}
                onChange={(event) => onProfileNameChange(event.target.value)}
                placeholder="What should Wearwell call you?"
                data-testid="input-profile-name"
              />
            </label>

            <button
              type="submit"
              className="understand-button full-width"
              disabled={authBusy}
              data-testid="button-save-profile"
            >
              {authBusy ? "Saving…" : "Save profile"}
            </button>
            <button
              type="button"
              className="text-button full-width"
              onClick={onSignOut}
              disabled={authBusy}
              data-testid="button-sign-out"
            >
              {authBusy ? "Signing out…" : "Sign out"}
            </button>
          </form>
        ) : (
          <>
            <p className="modal-note">
              {authMode === "sign_in" &&
                "Sign in with your email and password to sync your wardrobe across sessions."}
              {authMode === "sign_up" &&
                "Create an account with your email and a password to sync your wardrobe."}
              {authMode === "forgot_password" &&
                "Enter your account email and we’ll send a password recovery link if an account matches."}
              {authMode === "update_password" &&
                "Choose a new password to finish recovering your account."}
              {!cloudEnabled && " Account services are not configured in this preview."}
            </p>

            <form onSubmit={submitHandler}>
              {(authMode === "sign_in" ||
                authMode === "sign_up" ||
                authMode === "forgot_password") && (
                <label>
                  Email
                  <input
                    autoFocus
                    type="email"
                    autoComplete="email"
                    value={authEmail}
                    onChange={(event) => onAuthEmailChange(event.target.value)}
                    placeholder="you@example.com"
                    required
                    data-testid="input-auth-email"
                  />
                </label>
              )}

              {(authMode === "sign_in" || authMode === "sign_up" || authMode === "update_password") && (
                <label>
                  {authMode === "sign_in" ? "Password" : "New password"}
                  <input
                    autoFocus={authMode === "update_password"}
                    type="password"
                    autoComplete={authMode === "sign_in" ? "current-password" : "new-password"}
                    value={authPassword}
                    onChange={(event) => onAuthPasswordChange(event.target.value)}
                    minLength={authMode === "sign_in" ? undefined : 8}
                    required
                    data-testid="input-auth-password"
                  />
                </label>
              )}

              {(authMode === "sign_up" || authMode === "update_password") && (
                <label>
                  Confirm password
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={authPasswordConfirmation}
                    onChange={(event) => onAuthPasswordConfirmationChange(event.target.value)}
                    minLength={8}
                    required
                    data-testid="input-auth-password-confirmation"
                  />
                </label>
              )}

              {authMessage && (
                <p className="auth-message" role="status" aria-live="polite" data-testid="status-auth-message">
                  {authMessage}
                </p>
              )}

              <button
                type="submit"
                className="understand-button full-width"
                disabled={authBusy || !cloudEnabled}
                data-testid={
                  authMode === "forgot_password"
                    ? "button-send-password-recovery"
                    : authMode === "update_password"
                      ? "button-update-password"
                      : authMode === "sign_up"
                        ? "button-create-account"
                        : "button-sign-in"
                }
              >
                {authBusy
                  ? "Please wait…"
                  : authMode === "forgot_password"
                    ? "Send recovery email"
                    : authMode === "update_password"
                      ? "Update password"
                      : authMode === "sign_up"
                        ? "Create account"
                        : "Sign in"}
              </button>
            </form>

            <div className="auth-links">
              {authMode === "sign_in" && (
                <>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => onAuthModeChange("forgot_password")}
                    data-testid="link-forgot-password"
                  >
                    Forgot password?
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => onAuthModeChange("sign_up")}
                    data-testid="link-create-account"
                  >
                    Create account
                  </button>
                </>
              )}
              {authMode === "sign_up" && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onAuthModeChange("sign_in")}
                  data-testid="link-existing-account"
                >
                  Already have an account? Sign in
                </button>
              )}
              {(authMode === "forgot_password" || authMode === "update_password") && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onAuthModeChange("sign_in")}
                  data-testid="link-back-to-sign-in"
                >
                  Back to sign in
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}