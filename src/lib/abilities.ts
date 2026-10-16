/** Ability catalogue. Roles hold a subset of these strings. */
export const ABILITY_GROUPS = [
  { key: "dashboard", label: "Dashboard", abilities: ["dashboard.view"] },
  { key: "customers", label: "Customers", abilities: ["customers.view", "customers.create", "customers.edit", "customers.delete"] },
  { key: "items", label: "Items", abilities: ["items.view", "items.create", "items.edit", "items.delete"] },
  { key: "estimates", label: "Estimates", abilities: ["estimates.view", "estimates.create", "estimates.edit", "estimates.delete", "estimates.send"] },
  { key: "invoices", label: "Invoices", abilities: ["invoices.view", "invoices.create", "invoices.edit", "invoices.delete", "invoices.send"] },
  { key: "recurring", label: "Recurring invoices", abilities: ["recurring.view", "recurring.create", "recurring.edit", "recurring.delete"] },
  { key: "payments", label: "Payments", abilities: ["payments.view", "payments.create", "payments.edit", "payments.delete", "payments.send"] },
  { key: "expenses", label: "Expenses", abilities: ["expenses.view", "expenses.create", "expenses.edit", "expenses.delete"] },
  { key: "reports", label: "Reports", abilities: ["reports.view"] },
  { key: "settings", label: "Settings", abilities: ["settings.manage", "users.manage", "roles.manage", "api.manage"] },
] as const;

export type Ability = (typeof ABILITY_GROUPS)[number]["abilities"][number];

export const ALL_ABILITIES: Ability[] = ABILITY_GROUPS.flatMap((g) => [...g.abilities]);

export function isAbility(value: string): value is Ability {
  return (ALL_ABILITIES as string[]).includes(value);
}

export const ABILITY_LABELS: Record<string, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  send: "Send",
  manage: "Manage",
};

export function abilityLabel(ability: string): string {
  const [group, action] = ability.split(".");
  if (group === "users") return "Manage users";
  if (group === "roles") return "Manage roles";
  if (group === "api") return "Manage API tokens";
  if (group === "settings") return "Manage company settings";
  return ABILITY_LABELS[action] ?? action;
}

/** Default roles created for every new company. */
export const DEFAULT_ROLES: { name: string; abilities: Ability[]; isSystem: boolean }[] = [
  { name: "Admin", abilities: ALL_ABILITIES, isSystem: true },
  {
    name: "Accountant",
    isSystem: false,
    abilities: ALL_ABILITIES.filter((a) => !["users.manage", "roles.manage", "settings.manage", "api.manage"].includes(a)),
  },
  {
    name: "Viewer",
    isSystem: false,
    abilities: ALL_ABILITIES.filter((a) => a.endsWith(".view")),
  },
];
