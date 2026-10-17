import { describe, expect, it } from "vitest";
import { decryptJson, decryptSecret, encryptJson, encryptSecret } from "@/lib/secrets";
import { canonicalRequest, signV4 } from "@/lib/aws-sigv4";
import { formatFrom, parseMailConfigForm } from "@/lib/mail-config";
import { isPublicHostname, isPublicHttpUrl } from "@/lib/net";
import { createHash } from "node:crypto";

describe("secrets at rest", () => {
  it("round-trips and never stores the plain value", () => {
    const enc = encryptSecret("smtp-p4ss", "secret-one-0123456789");
    expect(enc.startsWith("v2:")).toBe(true);
    expect(enc).not.toContain("smtp-p4ss");
    expect(decryptSecret(enc, "secret-one-0123456789")).toBe("smtp-p4ss");
  });

  it("returns null for a different key, tampering or junk", () => {
    const enc = encryptSecret("value", "secret-one-0123456789");
    expect(decryptSecret(enc, "secret-two-0123456789")).toBeNull();
    const parts = enc.split(":");
    const flipped = Buffer.from(parts[3], "base64");
    flipped[0] ^= 1;
    expect(decryptSecret([parts[0], parts[1], parts[2], flipped.toString("base64")].join(":"), "secret-one-0123456789")).toBeNull();
    expect(decryptSecret("plain-text")).toBeNull();
    expect(decryptSecret(null)).toBeNull();
  });

  it("encrypts JSON maps and drops empty values", () => {
    expect(encryptJson({ password: "" })).toBeNull();
    const enc = encryptJson({ password: "x", token: "" })!;
    expect(decryptJson(enc)).toEqual({ password: "x" });
  });
});

describe("AWS Signature V4", () => {
  // Published AWS example: IAM ListUsers, 2015-08-30 12:36:00 UTC, us-east-1, example credentials.
  const input = {
    method: "GET",
    url: "https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08",
    region: "us-east-1",
    service: "iam",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: "",
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
    amzDate: "20150830T123600Z",
  };

  it("builds the documented canonical request", () => {
    const { canonical, signedHeaders } = canonicalRequest(input, input.amzDate);
    expect(signedHeaders).toBe("content-type;host;x-amz-date");
    expect(createHash("sha256").update(canonical).digest("hex")).toBe("f536975d06c0309214f805bb90ccff089219ecd68b2577efef23edd43b7e1a59");
  });

  it("produces the documented signature", () => {
    const r = signV4(input);
    expect(r.signature).toBe("5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7");
    expect(r.headers.Authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/iam/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7",
    );
  });
});

describe("mail configuration form", () => {
  const smtp = { enabled: "on", driver: "smtp", host: "smtp.example.com", port: "587", username: "u", password: "pw", encryption: "starttls", fromAddress: "billing@example.com", fromName: "Billing" };

  it("splits options and secrets", () => {
    const r = parseMailConfigForm(smtp, {}, "company");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.options).toEqual({ host: "smtp.example.com", port: "587", username: "u", encryption: "starttls" });
      expect(r.value.secrets).toEqual({ password: "pw" });
    }
  });

  it("keeps a stored secret when the input is blank", () => {
    const r = parseMailConfigForm({ ...smtp, password: "" }, { password: "stored" }, "company");
    expect(r.ok && r.value.secrets.password).toBe("stored");
  });

  it("requires driver fields and refuses private SMTP hosts for companies", () => {
    const missing = parseMailConfigForm({ enabled: "on", driver: "postmark" }, {}, "company");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.fieldErrors.token).toBeDefined();
    const internal = parseMailConfigForm({ ...smtp, host: "10.0.0.5" }, {}, "company");
    expect(!internal.ok && internal.fieldErrors.host).toBeTruthy();
    expect(parseMailConfigForm({ ...smtp, host: "10.0.0.5" }, {}, "platform").ok).toBe(true);
    expect(parseMailConfigForm({ ...smtp, port: "70000" }, {}, "platform").ok).toBe(false);
    expect(parseMailConfigForm({ ...smtp, driver: "carrier-pigeon" }, {}, "platform").ok).toBe(false);
  });

  it("restricts the Mailgun endpoint to the two public API hosts", () => {
    const base = { enabled: "on", driver: "mailgun", domain: "mg.example.com", secret: "key-1" };
    expect(parseMailConfigForm({ ...base, endpoint: "api.eu.mailgun.net" }, {}, "company").ok).toBe(true);
    expect(parseMailConfigForm({ ...base, endpoint: "169.254.169.254" }, {}, "company").ok).toBe(false);
  });

  it("formats the sender", () => {
    expect(formatFrom("a@b.co", 'Acme "Ltd"', "x")).toBe('"Acme Ltd" <a@b.co>');
    expect(formatFrom(null, "Acme", "Kydi <no-reply@kydi.local>")).toBe("Kydi <no-reply@kydi.local>");
  });
});

describe("public host checks", () => {
  it("accepts public names and addresses", () => {
    expect(isPublicHostname("api.currencyfreaks.com")).toBe(true);
    expect(isPublicHostname("8.8.8.8")).toBe(true);
    expect(isPublicHttpUrl("https://free.currconv.com/api/v7")).toBe(true);
  });

  it("rejects loopback, private, link-local and internal names", () => {
    for (const h of ["localhost", "127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.10", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "fe80::1", "db.internal", "printer.local", "intranet", "2130706433", "0x7f.1", "0.0.0.0"]) {
      expect(isPublicHostname(h), h).toBe(false);
    }
    expect(isPublicHttpUrl("ftp://example.com/")).toBe(false);
    expect(isPublicHttpUrl("http://user:pw@example.com/")).toBe(false);
    expect(isPublicHttpUrl("http://[::1]:8080/")).toBe(false);
    expect(isPublicHttpUrl("not a url")).toBe(false);
  });
});
