import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DEFAULT_ROLES } from "@/lib/abilities";
import { slugify } from "@/lib/utils";

type Tx = Prisma.TransactionClient;

export type NewCompanyInput = {
  name: string;
  currency: string;
  country?: string | null;
  timezone?: string;
  dateFormat?: string;
  locale?: string;
  fiscalYearStartMonth?: string;
};

async function uniqueSlug(tx: Tx, name: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  for (let i = 2; await tx.company.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
  return slug;
}

/** Hook for module-specific defaults (units, payment methods, templates...). */
export type CompanyDefaultsSeeder = (tx: Tx, companyId: string) => Promise<void>;
const seeders: CompanyDefaultsSeeder[] = [];
export function registerCompanyDefaults(seeder: CompanyDefaultsSeeder) {
  seeders.push(seeder);
}

/** Creates a company with default roles + settings and makes `userId` its Admin. */
export async function createCompanyForUser(userId: string, input: NewCompanyInput, extra?: CompanyDefaultsSeeder) {
  return db.$transaction(
    async (tx) => {
      const company = await tx.company.create({
        data: { name: input.name, slug: await uniqueSlug(tx, input.name), country: input.country ?? null },
      });
      let adminRoleId = "";
      for (const r of DEFAULT_ROLES) {
        const role = await tx.role.create({
          data: { companyId: company.id, name: r.name, abilities: r.abilities, isSystem: r.isSystem },
        });
        if (r.name === "Admin") adminRoleId = role.id;
      }
      await tx.companyUser.create({ data: { companyId: company.id, userId, roleId: adminRoleId } });
      const settings: Record<string, string | undefined> = {
        currency: input.currency,
        timezone: input.timezone,
        dateFormat: input.dateFormat,
        locale: input.locale,
        fiscalYearStartMonth: input.fiscalYearStartMonth,
      };
      for (const [key, value] of Object.entries(settings)) {
        if (value) await tx.companySetting.create({ data: { companyId: company.id, key, value } });
      }
      for (const seed of seeders) await seed(tx, company.id);
      if (extra) await extra(tx, company.id);
      await tx.user.update({ where: { id: userId }, data: { lastCompanyId: company.id } });
      return company;
    },
    { timeout: 20000 },
  );
}
