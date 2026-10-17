import { hash, verify, type Options } from "@node-rs/argon2";

/**
 * Argon2id with the OWASP Password Storage Cheat Sheet baseline (m=19 MiB, t=2, p=1). The algorithm is set
 * explicitly (2 = Argon2id; the enum is a const enum, so the literal is used for isolatedModules builds).
 */
export const ARGON2_OPTIONS: Options = { algorithm: 2 as Options["algorithm"], memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | null = null;

/**
 * Verifies against `hashed`, or against a throw-away hash when the account does not exist, so that response
 * times do not reveal whether an email address is registered.
 */
export async function verifyPasswordOrDummy(hashed: string | null | undefined, password: string): Promise<boolean> {
  if (hashed) return verifyPassword(hashed, password);
  dummy ??= hashPassword("kydi-timing-equaliser-not-a-real-password");
  await verifyPassword(await dummy, password);
  return false;
}
