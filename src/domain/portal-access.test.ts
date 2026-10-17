import { describe, expect, it } from "vitest";
import { decidePortalAccess, nextOptOut, type PortalAccessState } from "./portal-access";

const base: PortalAccessState = { auto: true, email: "billing@acme.test", enablePortal: false, optOut: false, hasPassword: false, hasLiveSetupLink: false };

describe("decidePortalAccess", () => {
  it("enables access and invites a first-time customer", () => {
    expect(decidePortalAccess(base)).toEqual({ enabled: true, enable: true, invite: true });
  });

  it("keeps the same account for a later invoice: no re-enable, no invite once a password exists", () => {
    expect(decidePortalAccess({ ...base, enablePortal: true, hasPassword: true })).toEqual({ enabled: true, enable: false, invite: false });
  });

  it("re-invites a customer who never set a password once the earlier link is gone", () => {
    expect(decidePortalAccess({ ...base, enablePortal: true })).toEqual({ enabled: true, enable: false, invite: true });
    expect(decidePortalAccess({ ...base, enablePortal: true, hasLiveSetupLink: true }).invite).toBe(false);
  });

  it("does nothing without an email address", () => {
    expect(decidePortalAccess({ ...base, email: null })).toEqual({ enabled: false, enable: false, invite: false });
    expect(decidePortalAccess({ ...base, email: "  " }).enabled).toBe(false);
  });

  it("respects a staff opt-out", () => {
    expect(decidePortalAccess({ ...base, optOut: true })).toEqual({ enabled: false, enable: false, invite: false });
  });

  it("with the setting off, never enables or invites but still reports manual access", () => {
    expect(decidePortalAccess({ ...base, auto: false })).toEqual({ enabled: false, enable: false, invite: false });
    expect(decidePortalAccess({ ...base, auto: false, enablePortal: true })).toEqual({ enabled: true, enable: false, invite: false });
  });
});

describe("nextOptOut", () => {
  it("records an opt-out only when staff switch an enabled customer off", () => {
    expect(nextOptOut({ enablePortal: true, optOut: false }, false)).toBe(true);
    expect(nextOptOut({ enablePortal: false, optOut: false }, false)).toBe(false);
    expect(nextOptOut(null, false)).toBe(false);
  });

  it("clears it when staff switch access back on and keeps it otherwise", () => {
    expect(nextOptOut({ enablePortal: false, optOut: true }, true)).toBe(false);
    expect(nextOptOut({ enablePortal: false, optOut: true }, false)).toBe(true);
  });
});
