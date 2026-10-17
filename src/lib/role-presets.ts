import { db } from "@/lib/db";
import { ALL_ABILITIES, ROLE_PRESETS, withDependencies, type Ability } from "@/lib/abilities";

/**
 * Role presets (spec §3.4, §5.13 "Role presets"): built-in presets plus platform-admin overrides and additions,
 * stored as JSON in the `role_presets` app setting. The owner preset always holds every ability.
 */
export type RolePreset = { name: string; title: string; abilities: Ability[]; isOwner: boolean };

const KEY = "role_presets";

type Stored = Record<string, { title: string; abilities: string[] }>;

async function readStored(): Promise<Stored> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  if (!row) return {};
  try {
    const parsed = JSON.parse(row.value) as Stored;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function getRolePresets(): Promise<RolePreset[]> {
  const stored = await readStored();
  const out: RolePreset[] = ROLE_PRESETS.map((p) => {
    if (p.isOwner) return { ...p, abilities: ALL_ABILITIES };
    const o = stored[p.name];
    return o ? { ...p, abilities: withDependencies(o.abilities) } : p;
  });
  for (const [name, o] of Object.entries(stored)) {
    if (!out.some((p) => p.name === name)) out.push({ name, title: o.title, abilities: withDependencies(o.abilities), isOwner: false });
  }
  return out;
}

export function presetName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Saves a preset and syncs it into every company: existing roles with that name get the new ability set,
 * companies without it get the role created.
 */
export async function saveRolePreset(input: { name?: string; title: string; abilities: string[] }): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const name = input.name || presetName(input.title);
  if (!name) return { ok: false, error: "Enter a preset name." };
  if (name === "owner") return { ok: false, error: "The owner preset always holds every ability and cannot be edited." };
  const abilities = withDependencies(input.abilities);
  if (!abilities.length) return { ok: false, error: "Select at least one ability." };
  const stored = await readStored();
  stored[name] = { title: input.title, abilities };
  await db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: JSON.stringify(stored) }, update: { value: JSON.stringify(stored) } });
  const companies = await db.company.findMany({ select: { id: true } });
  await db.$transaction(async (tx) => {
    await tx.role.updateMany({ where: { name, isOwner: false }, data: { abilities, title: input.title } });
    const have = new Set((await tx.role.findMany({ where: { name }, select: { companyId: true } })).map((r) => r.companyId));
    const missing = companies.filter((c) => !have.has(c.id));
    if (missing.length) await tx.role.createMany({ data: missing.map((c) => ({ companyId: c.id, name, title: input.title, abilities })) });
  });
  return { ok: true, name };
}
