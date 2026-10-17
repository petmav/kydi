import { PrismaClient, type Prisma } from "@prisma/client";

/**
 * Credential hashes are omitted from every query result by default so they can never leak into API responses
 * or client component props. Code that verifies a password selects the hash explicitly
 * (`select: { passwordHash: true }` / `omit: { portalPasswordHash: false }`).
 */
type ClientOptions = {
  log: Prisma.LogLevel[];
  omit: { user: { passwordHash: true }; customer: { portalPasswordHash: true } };
};

function createClient() {
  const options: ClientOptions = {
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    omit: { user: { passwordHash: true }, customer: { portalPasswordHash: true } },
  };
  return new PrismaClient<ClientOptions>(options);
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/** Interactive-transaction client matching `db` (use instead of Prisma.TransactionClient, which lacks the omit config). */
export type Tx = Omit<typeof db, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;
