/**
 * Automatic customer-portal access when an invoice is sent. The customer record is the account: sending an
 * invoice switches its portal access on (once, permanently) unless staff switched it off on purpose, and a
 * customer who has never chosen a password gets a one-time setup link by email. No password is generated.
 */

export type PortalAccessState = {
  /** Company setting "Automatically give customers portal access when invoices are sent". */
  auto: boolean;
  email: string | null;
  enablePortal: boolean;
  /** Staff switched portal access off on purpose. */
  optOut: boolean;
  hasPassword: boolean;
  /** An unused, unexpired setup/reset link already exists. */
  hasLiveSetupLink: boolean;
};

export type PortalAccessDecision = {
  /** Portal access is (or becomes) on, so documents can point to the portal. */
  enabled: boolean;
  /** Switch enablePortal on now. */
  enable: boolean;
  /** Email the customer a new setup link. */
  invite: boolean;
};

export function decidePortalAccess(s: PortalAccessState): PortalAccessDecision {
  const hasEmail = !!s.email?.trim();
  const enable = s.auto && hasEmail && !s.enablePortal && !s.optOut;
  const enabled = hasEmail && (s.enablePortal || enable);
  return { enabled, enable, invite: enabled && s.auto && !s.hasPassword && !s.hasLiveSetupLink };
}

/** Setup links outlive password-reset links (60 minutes): customers may open the invoice days later. */
export const SETUP_LINK_DAYS = 14;

/**
 * Tracks the staff "Enable portal" checkbox: unticking an enabled customer records an opt-out so invoices do
 * not silently switch access back on; ticking it clears the opt-out.
 */
export function nextOptOut(previous: { enablePortal: boolean; optOut: boolean } | null, enablePortal: boolean): boolean {
  if (enablePortal) return false;
  if (previous?.enablePortal) return true;
  return previous?.optOut ?? false;
}
