/** Ability catalogue (spec §3.4). Roles hold a subset of these strings. */

type Group = { key: string; label: string; abilities: { ability: string; label: string; depends?: string[] }[] };

const crud = (noun: string, label: string, extra: { create?: string[]; edit?: string[]; del?: string[] } = {}) => [
  { ability: `view-${noun}`, label: `View ${label}` },
  { ability: `create-${noun}`, label: `Create ${label}`, depends: [`view-${noun}`, ...(extra.create ?? [])] },
  { ability: `edit-${noun}`, label: `Edit ${label}`, depends: [`view-${noun}`, ...(extra.edit ?? extra.create ?? [])] },
  { ability: `delete-${noun}`, label: `Delete ${label}`, depends: [`view-${noun}`, ...(extra.del ?? [])] },
];

const DOC_DEPS = ["view-item", "view-tax-type", "view-customer", "view-custom-field", "view-all-notes"];

export const ABILITY_GROUPS: Group[] = [
  { key: "customer", label: "Customers", abilities: crud("customer", "customers", { create: ["view-custom-field"] }) },
  { key: "item", label: "Items", abilities: crud("item", "items", { create: ["view-tax-type"], edit: [] }) },
  { key: "tax-type", label: "Tax types", abilities: crud("tax-type", "tax types") },
  {
    key: "estimate",
    label: "Estimates",
    abilities: [...crud("estimate", "estimates", { create: DOC_DEPS }), { ability: "send-estimate", label: "Send estimates" }],
  },
  {
    key: "invoice",
    label: "Invoices",
    abilities: [...crud("invoice", "invoices", { create: DOC_DEPS }), { ability: "send-invoice", label: "Send invoices" }],
  },
  {
    key: "recurring-invoice",
    label: "Recurring invoices",
    abilities: crud("recurring-invoice", "recurring invoices", {
      create: ["view-item", "view-tax-type", "view-customer", "view-all-notes", "send-invoice"],
    }),
  },
  {
    key: "payment",
    label: "Payments",
    abilities: [
      ...crud("payment", "payments", { create: ["view-customer", "view-invoice", "view-custom-field", "view-all-notes"] }),
      { ability: "send-payment", label: "Send payment receipts" },
    ],
  },
  { key: "expense", label: "Expenses", abilities: crud("expense", "expenses", { create: ["view-customer", "view-custom-field"] }) },
  { key: "custom-field", label: "Custom fields", abilities: crud("custom-field", "custom fields") },
  { key: "reports", label: "Reports", abilities: [{ ability: "view-financial-reports", label: "View financial reports" }] },
  {
    key: "exchange-rate-provider",
    label: "Exchange-rate providers",
    abilities: crud("exchange-rate-provider", "exchange-rate providers"),
  },
  { key: "dashboard", label: "Dashboard", abilities: [{ ability: "dashboard", label: "View dashboard" }] },
  {
    key: "notes",
    label: "Notes",
    abilities: [
      { ability: "view-all-notes", label: "View notes" },
      { ability: "manage-all-notes", label: "Manage notes", depends: ["view-all-notes"] },
    ],
  },
  { key: "supplier", label: "Suppliers", abilities: crud("supplier", "suppliers") },
  { key: "bill", label: "Bills", abilities: crud("bill", "bills", { create: ["view-supplier"], del: [] }) },
  {
    key: "supplier-payment",
    label: "Supplier payments",
    abilities: crud("supplier-payment", "supplier payments", { create: ["view-supplier", "view-bill"], del: [] }),
  },
  {
    key: "supplier-credit",
    label: "Supplier credits",
    abilities: crud("supplier-credit", "supplier credits", { create: ["view-supplier", "view-bill"], del: [] }),
  },
  {
    key: "supplier-refund",
    label: "Supplier refunds",
    abilities: crud("supplier-refund", "supplier refunds", { create: ["view-supplier", "view-supplier-payment", "view-supplier-credit"], edit: ["view-supplier"], del: [] }),
  },
  { key: "recurring-cost", label: "Recurring costs", abilities: crud("recurring-cost", "recurring costs", { create: ["view-supplier"], del: [] }) },
];

/** Purchasing abilities (spec §3.4), listed for data migrations of existing roles. */
export const PURCHASING_ABILITIES = ["supplier", "bill", "supplier-payment", "supplier-credit", "supplier-refund", "recurring-cost"].flatMap((n) => [
  `view-${n}`,
  `create-${n}`,
  `edit-${n}`,
  `delete-${n}`,
]);

export type Ability =
  | "view-customer" | "create-customer" | "edit-customer" | "delete-customer"
  | "view-item" | "create-item" | "edit-item" | "delete-item"
  | "view-tax-type" | "create-tax-type" | "edit-tax-type" | "delete-tax-type"
  | "view-estimate" | "create-estimate" | "edit-estimate" | "delete-estimate" | "send-estimate"
  | "view-invoice" | "create-invoice" | "edit-invoice" | "delete-invoice" | "send-invoice"
  | "view-recurring-invoice" | "create-recurring-invoice" | "edit-recurring-invoice" | "delete-recurring-invoice"
  | "view-payment" | "create-payment" | "edit-payment" | "delete-payment" | "send-payment"
  | "view-expense" | "create-expense" | "edit-expense" | "delete-expense"
  | "view-custom-field" | "create-custom-field" | "edit-custom-field" | "delete-custom-field"
  | "view-financial-reports"
  | "view-exchange-rate-provider" | "create-exchange-rate-provider" | "edit-exchange-rate-provider" | "delete-exchange-rate-provider"
  | "dashboard" | "view-all-notes" | "manage-all-notes"
  | "view-supplier" | "create-supplier" | "edit-supplier" | "delete-supplier"
  | "view-bill" | "create-bill" | "edit-bill" | "delete-bill"
  | "view-supplier-payment" | "create-supplier-payment" | "edit-supplier-payment" | "delete-supplier-payment"
  | "view-supplier-credit" | "create-supplier-credit" | "edit-supplier-credit" | "delete-supplier-credit"
  | "view-supplier-refund" | "create-supplier-refund" | "edit-supplier-refund" | "delete-supplier-refund"
  | "view-recurring-cost" | "create-recurring-cost" | "edit-recurring-cost" | "delete-recurring-cost";

export const ALL_ABILITIES: Ability[] = ABILITY_GROUPS.flatMap((g) => g.abilities.map((a) => a.ability as Ability));

export const ABILITY_DEPENDENCIES: Record<string, string[]> = Object.fromEntries(
  ABILITY_GROUPS.flatMap((g) => g.abilities.map((a) => [a.ability, a.depends ?? []])),
);

export function isAbility(value: string): value is Ability {
  return (ALL_ABILITIES as string[]).includes(value);
}

/** Expands a selection with all transitive dependencies (spec: deps are auto-selected). */
export function withDependencies(selected: string[]): Ability[] {
  const out = new Set<string>();
  const visit = (a: string) => {
    if (out.has(a) || !isAbility(a)) return;
    out.add(a);
    for (const d of ABILITY_DEPENDENCIES[a] ?? []) visit(d);
  };
  selected.forEach(visit);
  return ALL_ABILITIES.filter((a) => out.has(a));
}

const MANAGER_EXCLUDED = new Set([
  "create-custom-field",
  "edit-custom-field",
  "delete-custom-field",
  "create-exchange-rate-provider",
  "edit-exchange-rate-provider",
  "delete-exchange-rate-provider",
]);

/** Role presets copied into every company (spec §3.4). */
export const ROLE_PRESETS: { name: string; title: string; abilities: Ability[]; isOwner: boolean }[] = [
  { name: "owner", title: "Owner", abilities: ALL_ABILITIES, isOwner: true },
  { name: "manager", title: "Manager", abilities: ALL_ABILITIES.filter((a) => !MANAGER_EXCLUDED.has(a)), isOwner: false },
  {
    name: "read-only",
    title: "Read only",
    isOwner: false,
    abilities: ALL_ABILITIES.filter((a) => a.startsWith("view-") || a === "dashboard"),
  },
];
