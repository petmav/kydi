import type { CompanyContext } from "@/lib/auth/context";

export function settingsNavItems(ctx: CompanyContext) {
  const items: { href: string; label: string; show: boolean }[] = [
    { href: "/profile", label: "Account settings", show: true },
    { href: "/settings/company", label: "Company information", show: ctx.isOwner },
    { href: "/settings/preferences", label: "Preferences", show: ctx.isOwner },
    { href: "/settings/customization", label: "Customization", show: ctx.isOwner },
    { href: "/settings/email-templates", label: "Email templates", show: ctx.isOwner },
    { href: "/settings/roles", label: "Roles", show: ctx.isOwner },
    { href: "/settings/notifications", label: "Notifications", show: ctx.isOwner },
    { href: "/settings/tax-types", label: "Tax types", show: ctx.can("view-tax-type") },
    { href: "/settings/payment-modes", label: "Payment modes", show: ctx.can("view-payment") },
    { href: "/settings/custom-fields", label: "Custom fields", show: ctx.can("view-custom-field") },
    { href: "/settings/notes", label: "Notes", show: ctx.can("view-all-notes") },
    { href: "/settings/expense-categories", label: "Expense categories", show: ctx.can("view-expense") },
    { href: "/settings/exchange-rates", label: "Exchange rate provider", show: ctx.can("view-exchange-rate-provider") },
    { href: "/settings/mail", label: "Mail configuration", show: ctx.isOwner },
    { href: "/settings/ownership", label: "Transfer ownership", show: ctx.isOwner },
    { href: "/settings/api-tokens", label: "API tokens", show: true },
    { href: "/settings/portal", label: "Customer portal", show: ctx.isOwner },
  ];
  return items.filter((i) => i.show).map(({ href, label }) => ({ href, label }));
}
