/**
 * Password policy for staff and portal accounts (NIST SP 800-63B style: length over composition rules).
 * 10 to 200 characters, not a commonly used password, not the account email or name.
 */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

const COMMON = new Set([
  "password", "password1", "password12", "password123", "password1234", "passw0rd", "p@ssw0rd", "p@ssword",
  "123456789", "1234567890", "12345678910", "0123456789", "qwertyuiop", "qwerty123", "qwerty1234", "1q2w3e4r5t",
  "iloveyou", "letmein123", "welcome123", "welcome1", "admin123", "administrator", "changeme", "changeme123",
  "abc123456", "abcdefghij", "aaaaaaaaaa", "trustno1", "football1", "baseball1", "sunshine1", "princess1",
  "dragon1234", "monkey1234", "master1234", "superman1", "starwars1", "computer1", "whatever1", "invoice123",
  "kydi123456", "kydipassword",
]);

/** Returns an error message, or null when the password is acceptable. */
export function checkPasswordPolicy(password: string, ctx: { email?: string | null; name?: string | null } = {}): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return "Password is too long.";
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) return "This password is too common. Choose a less predictable one.";
  const email = ctx.email?.trim().toLowerCase();
  if (email && (lower === email || lower === email.split("@")[0])) return "Do not use your email address as the password.";
  const name = ctx.name?.trim().toLowerCase().replace(/\s+/g, "");
  if (name && name.length >= 4 && lower.replace(/\s+/g, "") === name) return "Do not use your name as the password.";
  return null;
}
