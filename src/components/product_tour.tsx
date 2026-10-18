"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { driver, type DriveStep, type Driver, type PopoverDOM } from "driver.js";
import "driver.js/dist/driver.css";

type TourDefinition = {
  id: string;
  path: string;
  title: string;
  intro: string;
  steps: DriveStep[];
  matches?: (pathname: string) => boolean;
  discover?: boolean;
};

const introStep = (title: string, description: string): DriveStep => ({
  popover: { title, description },
});

const pageTitle: DriveStep = {
  element: '[data-tour="page-title"]',
  popover: {
    title: "Your workspace",
    description: "The page heading tells you which part of Kydi you are working in.",
  },
};

const definitions: TourDefinition[] = [
  {
    id: "dashboard",
    path: "/dashboard",
    title: "Dashboard",
    intro: "Get a quick picture of your business finances and jump to the records that need attention.",
    steps: [
      pageTitle,
      {
        element: '[data-tour="company-switcher"]',
        popover: {
          title: "Switch companies",
          description: "If you have access to more than one company, use this menu to change the active workspace.",
        },
      },
      {
        element: '[data-tour="profile-sessions"]',
        popover: {
          title: "Active sessions",
          description: "Review active sign-ins and end a session you no longer recognize or use.",
        },
      },
      {
        element: '[data-tour="dashboard-period"]',
        popover: {
          title: "Choose a reporting period",
          description: "Compare this year, last year or the last 12 months. Use the date fields for a custom range.",
        },
      },
      {
        element: '[data-tour="dashboard-receivables"]',
        popover: {
          title: "Keep an eye on receivables",
          description: "See what customers owe, including overdue invoices and amounts due soon.",
        },
      },
      {
        element: '[data-tour="dashboard-cashflow"]',
        popover: {
          title: "Review cash flow",
          description: "Compare sales, receipts, expenses and net income across the selected period.",
        },
      },
    ],
  },
  ...[
    {
      path: "/items",
      id: "items",
      title: "Items",
      description: "Keep products and services you sell in a reusable catalogue.",
      action: "New item",
      workflow: "Save common products and services here, then choose them on estimates, invoices and recurring invoices.",
    },
    {
      path: "/customers",
      id: "customers",
      title: "Customers",
      description: "Store the people and businesses you bill.",
      action: "New customer",
      workflow: "Add a customer before preparing an estimate or invoice. Their currency and portal settings are managed on the customer record.",
    },
    {
      path: "/estimates",
      id: "estimates",
      title: "Estimates",
      description: "Prepare quotes and track decisions before work is billed.",
      action: "New estimate",
      workflow: "Create an estimate for a customer, send it for review, then convert an accepted estimate into an invoice.",
      tabs: true,
    },
    {
      path: "/invoices",
      id: "invoices",
      title: "Invoices",
      description: "Create customer invoices and follow their delivery and payment status.",
      action: "New invoice",
      workflow: "Use the status views and filters to find drafts, due invoices and sent invoices. Open a record to send it, download a PDF or record a payment.",
      tabs: true,
    },
    {
      path: "/recurring-invoices",
      id: "recurring-invoices",
      title: "Recurring invoices",
      description: "Manage invoice schedules that generate future invoices.",
      action: "New recurring invoice",
      workflow: "Review each schedule's status and next run. Configure its frequency and whether generated invoices are sent automatically when creating the schedule.",
      tabs: true,
    },
    {
      path: "/payments",
      id: "payments",
      title: "Payments",
      description: "Record money received and see how it has been applied.",
      action: "Record payment",
      workflow: "A payment can be allocated across open invoices. Any amount not allocated remains as customer credit.",
    },
    {
      path: "/expenses",
      id: "expenses",
      title: "Expenses",
      description: "Track business spending, categories, taxes and receipts.",
      action: "New expense",
      workflow: "Record the date, category and amount, then attach a receipt and optionally associate the expense with a customer.",
    },
  ].map((feature): TourDefinition => ({
    id: feature.id,
    path: feature.path,
    title: feature.title,
    intro: feature.description,
    steps: [
      pageTitle,
      {
        element: '[data-tour="page-actions"]',
        popover: {
          title: feature.action,
          description: `${feature.workflow} Use this action to start a new record.`,
          side: "bottom",
        },
      },
      ...(feature.tabs
        ? [{
            element: '[data-tour="tabs"]',
            popover: {
              title: "Switch between views",
              description: "Choose a status view to narrow the records shown below.",
            },
          } satisfies DriveStep]
        : []),
      {
        element: '[data-tour="filter-bar"]',
        popover: {
          title: "Find a record",
          description: "Filter the list by the available fields, then apply or clear your filters.",
        },
      },
      {
        element: '[data-tour="records-table"]',
        popover: {
          title: "Review your records",
          description: feature.workflow,
          side: "top",
        },
      },
    ],
  })),
  {
    id: "invoice-editor",
    path: "/invoices/new",
    title: "Create or edit an invoice",
    intro: "Build an invoice from a customer, line items and payment terms. You can save it as a draft before sending.",
    matches: (path) => path === "/invoices/new" || /^\/invoices\/\d+\/edit$/.test(path),
    steps: [
      pageTitle,
      {
        element: "#doc-customer",
        popover: {
          title: "Choose a customer",
          description: "Start with a customer. Create one first if it is not in the list; the customer's currency is used for this document.",
        },
      },
      {
        element: '[data-tour="document-lines"]',
        popover: {
          title: "Add invoice lines",
          description: "Choose a saved item or enter a custom line, then set quantity, price and any available tax or discount.",
          side: "top",
        },
      },
      {
        element: '[data-tour="document-total"]',
        popover: {
          title: "Check the total",
          description: "Review the calculated subtotal, discounts, taxes and invoice total before saving.",
          side: "top",
        },
      },
      {
        element: '[data-tour="document-save"]',
        popover: {
          title: "Save or send",
          description: "Save the invoice as a draft, or choose Save and send to email it to the customer.",
          side: "top",
        },
      },
    ],
  },
  {
    id: "estimate-editor",
    path: "/estimates/new",
    title: "Create or edit an estimate",
    intro: "Prepare a quote for a customer, check the expiry date and send it for a decision.",
    matches: (path) => path === "/estimates/new" || /^\/estimates\/\d+\/edit$/.test(path),
    steps: [
      pageTitle,
      {
        element: "#doc-customer",
        popover: {
          title: "Choose a customer",
          description: "Estimates belong to a customer. Create the customer first if they are not listed.",
        },
      },
      {
        element: '[data-tour="document-lines"]',
        popover: {
          title: "Describe the work",
          description: "Add products, services or custom lines, including quantities, prices and applicable taxes.",
          side: "top",
        },
      },
      {
        element: '[data-tour="document-total"]',
        popover: {
          title: "Review the total",
          description: "Check the calculated total and expiry date before saving the estimate.",
          side: "top",
        },
      },
      {
        element: '[data-tour="document-save"]',
        popover: {
          title: "Save the estimate",
          description: "Save the estimate, then open it to send it or convert it to an invoice once accepted.",
          side: "top",
        },
      },
    ],
  },
  {
    id: "recurring-invoice-editor",
    path: "/recurring-invoices/new",
    title: "Set up a recurring invoice",
    intro: "Create an invoice schedule for work that repeats, and decide how each run is handled.",
    matches: (path) => path === "/recurring-invoices/new" || /^\/recurring-invoices\/\d+\/edit$/.test(path),
    steps: [
      pageTitle,
      {
        element: "#doc-customer",
        popover: {
          title: "Choose the customer",
          description: "A recurring schedule creates invoices for this customer. Add the customer before starting if needed.",
        },
      },
      {
        element: "#rec-freq",
        popover: {
          title: "Set the schedule",
          description: "Choose how often invoices are generated, when the schedule begins and any optional end limit.",
        },
      },
      {
        element: '[data-tour="document-lines"]',
        popover: {
          title: "Set the recurring charges",
          description: "Add the items and amounts that should appear on each generated invoice.",
          side: "top",
        },
      },
      {
        element: '[data-tour="document-total"]',
        popover: {
          title: "Review the recurring amount",
          description: "Check the calculated total and the schedule's automatic-send setting.",
          side: "top",
        },
      },
      {
        element: '[data-tour="document-save"]',
        popover: {
          title: "Save the schedule",
          description: "Save the recurring invoice schedule. Its frequency, status and send setting control future runs.",
          side: "top",
        },
      },
    ],
  },
  {
    id: "payment-editor",
    path: "/payments/new",
    title: "Record a payment",
    intro: "Enter a customer's receipt and allocate it to one or more outstanding invoices.",
    matches: (path) => path === "/payments/new" || /^\/payments\/\d+\/edit$/.test(path),
    steps: [
      pageTitle,
      {
        element: "#p-customer",
        popover: {
          title: "Choose the customer",
          description: "Select the customer who paid. Their open invoices will be available for allocation.",
        },
      },
      {
        element: "#p-amount",
        popover: {
          title: "Enter the amount received",
          description: "Record the amount and payment mode. For a foreign-currency customer, confirm the exchange rate.",
        },
      },
      {
        element: '[data-tour="payment-allocation"]',
        popover: {
          title: "Apply the payment",
          description: "Allocate the received amount to open invoices. Any unallocated balance stays on the customer's account as credit.",
          side: "top",
        },
      },
      {
        element: '[data-tour="payment-save"]',
        popover: {
          title: "Save the payment",
          description: "Confirm the payment date, amount and mode, then save. Allocations update the balances due on those invoices.",
          side: "top",
        },
      },
    ],
  },
  {
    id: "expense-editor",
    path: "/expenses/new",
    title: "Record an expense",
    intro: "Capture a business cost with its category, amount and supporting receipt.",
    matches: (path) => path === "/expenses/new" || /^\/expenses\/\d+\/edit$/.test(path),
    steps: [
      pageTitle,
      {
        element: '[data-tour="expense-category"]',
        popover: {
          title: "Choose a category",
          description: "Every expense needs a category. If the list is empty, add one under Settings → Expense categories.",
        },
      },
      {
        element: "#e-amount",
        popover: {
          title: "Enter the amount",
          description: "Record the cost and date. You can also select a customer, payment mode and purchase-tax breakdown.",
        },
      },
      {
        element: '[data-tour="expense-receipt"]',
        popover: {
          title: "Attach a receipt",
          description: "Add a receipt file and any notes that will help explain the expense.",
          side: "top",
        },
      },
      {
        element: '[data-tour="expense-save"]',
        popover: {
          title: "Save the expense",
          description: "Save the expense to include it in your records and reports.",
          side: "top",
        },
      },
    ],
  },
  {
    id: "customer-editor",
    path: "/customers/new",
    title: "Add or edit a customer",
    intro: "Keep customer contact, billing and shipping information together for use on documents.",
    matches: (path) => path === "/customers/new" || /^\/customers\/\d+\/edit$/.test(path),
    steps: [
      pageTitle,
      {
        element: '[data-tour="customer-form"] input[name="name"]',
        popover: {
          title: "Start with the customer identity",
          description: "Enter a display name and the contact details you want available when preparing documents.",
        },
      },
      {
        element: '[data-tour="customer-portal"]',
        popover: {
          title: "Optional customer portal",
          description: "Portal access lets this customer sign in to view their invoices, estimates and payments. It is optional.",
        },
      },
      {
        element: '[data-tour="customer-save"]',
        popover: {
          title: "Complete and save",
          description: "Add billing and shipping details if needed, then save. Customer currency is locked after documents or payments exist.",
          side: "top",
        },
      },
    ],
  },
  {
    id: "item-editor",
    path: "/items/new",
    title: "Add or edit an item",
    intro: "Save a commonly used product or service so it can be added quickly to documents.",
    matches: (path) => path === "/items/new" || /^\/items\/\d+\/edit$/.test(path),
    steps: [
      pageTitle,
      {
        element: '[data-tour="item-form"] input[name="name"]',
        popover: {
          title: "Name and price",
          description: "Give the item a clear name and a standard price. You can still adjust its details on an individual document.",
        },
      },
      {
        element: '[data-tour="item-save"]',
        popover: {
          title: "Add optional details and save",
          description: "Choose a unit, default taxes and description where relevant, then save the catalogue item.",
          side: "top",
        },
      },
    ],
  },
  {
    id: "customer-detail",
    path: "/customers/:id",
    title: "Customer account",
    intro: "Review a customer's details, balance and related business records.",
    matches: (path) => /^\/customers\/\d+$/.test(path),
    discover: false,
    steps: [
      pageTitle,
      {
        element: '[data-tour="page-actions"]',
        popover: {
          title: "Customer actions",
          description: "Use the available actions to update the record or manage customer credit.",
        },
      },
      {
        element: '[data-tour="content-card"]',
        popover: {
          title: "Customer activity",
          description: "Review the customer information, balance and documents shown on this account.",
          side: "top",
        },
      },
    ],
  },
  {
    id: "customer-credit",
    path: "/customers/:id/apply-credit",
    title: "Apply customer credit",
    intro: "Use unapplied payments to reduce outstanding customer invoices.",
    matches: (path) => /^\/customers\/\d+\/apply-credit$/.test(path),
    discover: false,
    steps: [
      pageTitle,
      {
        element: '[data-tour="available-credit"]',
        popover: {
          title: "Available credit",
          description: "Review payments with an unapplied balance before using them.",
        },
      },
      {
        element: '[data-tour="credit-invoices"]',
        popover: {
          title: "Open invoices",
          description: "Check which invoices have an amount still due.",
        },
      },
      {
        element: '[data-tour="credit-allocations"]',
        popover: {
          title: "Allocate credit",
          description: "Apply available payments to open invoices. Allocate oldest first or choose amounts manually.",
          side: "top",
        },
      },
      {
        element: '[data-tour="credit-save"]',
        popover: {
          title: "Apply the credit",
          description: "Confirm the allocations and apply them to update the invoices' balances.",
          side: "top",
        },
      },
      {
        element: '[data-tour="credit-empty"]',
        popover: {
          title: "Nothing to apply yet",
          description: "Credit can only be applied when the customer has an unapplied payment and an open invoice.",
        },
      },
    ],
  },
  ...[
    { id: "invoice-detail", path: "/invoices/:id", title: "Invoice details", matches: (path: string) => /^\/invoices\/\d+$/.test(path), description: "Send an invoice, mark it sent, download its PDF, record a payment or issue a credit note when eligible." },
    { id: "estimate-detail", path: "/estimates/:id", title: "Estimate details", matches: (path: string) => /^\/estimates\/\d+$/.test(path), description: "Send the estimate, track its status and convert it to an invoice when accepted." },
    { id: "payment-detail", path: "/payments/:id", title: "Payment details", matches: (path: string) => /^\/payments\/\d+$/.test(path), description: "Review the received amount, its invoice allocations and any remaining customer credit." },
    { id: "recurring-invoice-detail", path: "/recurring-invoices/:id", title: "Recurring invoice details", matches: (path: string) => /^\/recurring-invoices\/\d+$/.test(path), description: "Review the schedule and its generated invoices. Editing or pausing a schedule affects future runs." },
  ].map((feature): TourDefinition => ({
    id: feature.id,
    path: feature.path,
    title: feature.title,
    intro: feature.description,
    matches: feature.matches,
    discover: false,
    steps: [
      pageTitle,
      {
        element: '[data-tour="page-actions"]',
        popover: {
          title: "Available actions",
          description: feature.id === "invoice-detail"
            ? "Depending on its status, you can send the invoice, record a payment, download a PDF or issue a credit note."
            : feature.description,
        },
      },
      {
        element: '[data-tour="content-card"]',
        popover: {
          title: "Record details",
          description: "Review the summary and related information here. The available actions depend on the record's status and your permissions.",
          side: "top",
        },
      },
      ...(feature.id === "payment-detail"
        ? [{
            element: '[data-tour="payment-receipt"]',
            popover: {
              title: "Payment receipt",
              description: "Preview the receipt PDF, send it to the customer or download a copy from the page actions.",
              side: "top",
            },
          } satisfies DriveStep]
        : []),
      ...(feature.id === "recurring-invoice-detail"
        ? [{
            element: '[data-tour="generated-invoices"]',
            popover: {
              title: "Generated invoices",
              description: "Open an invoice created by this schedule to review its status, send it or record payment.",
              side: "top",
            },
          } satisfies DriveStep]
        : []),
    ],
  })),
  {
    id: "reports",
    path: "/reports",
    title: "Financial reports",
    intro: "Explore sales, profit and loss, expense and tax reports for a selected date range.",
    steps: [
      pageTitle,
      {
        element: '[data-tour="tabs"]',
        popover: {
          title: "Choose a report",
          description: "Switch between sales, profit and loss, expense and tax report views.",
        },
      },
      {
        element: '[data-tour="report-filters"]',
        popover: {
          title: "Set report options",
          description: "Choose a date range and any report-specific grouping or category, then update the report or download its PDF.",
        },
      },
      {
        element: '[data-tour="report-results"]',
        popover: {
          title: "Read the results",
          description: "The report tables and summaries use your company's currency.",
          side: "top",
        },
      },
    ],
  },
  {
    id: "cash-flow",
    path: "/cash-flow",
    title: "Cash-flow forecast",
    intro: "Estimate future cash balances using your current cash, monthly expenses and expected receipts.",
    steps: [
      pageTitle,
      {
        element: '[data-tour="cash-flow-assumptions"]',
        popover: {
          title: "Enter assumptions",
          description: "Set current cash and estimated monthly expenses, then choose a 30, 60 or 90 day forecast period.",
        },
      },
      {
        element: '[data-tour="cash-flow-results"]',
        popover: {
          title: "Review the projection",
          description: "Compare expected receipts, planned expenses and projected balances. This is a forecast based on your assumptions, not a bank balance.",
          side: "top",
        },
      },
    ],
  },
  {
    id: "anomalies",
    path: "/anomalies",
    title: "Financial anomaly detection",
    intro: "Review unusual financial records that may need a closer look.",
    steps: [
      pageTitle,
      {
        element: '[data-tour="anomaly-filter"]',
        popover: {
          title: "Filter by severity",
          description: "Narrow the findings to high, medium or low priority flags.",
        },
      },
      {
        element: '[data-tour="anomaly-results"]',
        popover: {
          title: "Review flagged records",
          description: "A flag is a prompt to investigate, not proof of an error. Use the review link to open the related invoice or expense.",
          side: "top",
        },
      },
    ],
  },
  {
    id: "administration",
    path: "/admin",
    title: "Platform administration",
    intro: "Review platform-wide company, user and invoice counts. This area is only available to the platform administrator.",
    steps: [
      pageTitle,
      {
        element: '[data-tour="admin-overview"]',
        popover: {
          title: "Platform overview",
          description: "See high-level counts for companies, users and invoices.",
        },
      },
      {
        element: '[data-tour="admin-companies"]',
        popover: {
          title: "Company directory",
          description: "Review each company, its owner, member count and creation date.",
          side: "top",
        },
      },
      {
        element: '[data-tour="admin-users"]',
        popover: {
          title: "User directory",
          description: "Review platform users and the companies they belong to.",
          side: "top",
        },
      },
    ],
  },
  {
    id: "purchases",
    path: "/purchases",
    title: "Suppliers and bills",
    intro: "This page explains what purchasing workflows are available in this release.",
    steps: [
      pageTitle,
      {
        element: '[data-tour="content-card"]',
        popover: {
          title: "Purchasing is planned",
          description: "Supplier records, bills, supplier payments, purchase credits and refunds are not available in this version. Use Expenses to record business spending.",
        },
      },
    ],
  },
  {
    id: "members",
    path: "/members",
    title: "Team members",
    intro: "Company owners can invite teammates and manage their company roles.",
    steps: [
      pageTitle,
      {
        element: '[data-tour="page-actions"]',
        popover: {
          title: "Invite or add a member",
          description: "Invite someone by email or add an existing teammate. Choose the role that matches the access they need.",
        },
      },
      {
        element: '[data-tour="members-list"]',
        popover: {
          title: "Manage access",
          description: "Review current members and their roles. Removing a member removes their access to this company.",
          side: "top",
        },
      },
      {
        element: '[data-tour="pending-invitations"]',
        popover: {
          title: "Pending invitations",
          description: "Review invitations that are waiting to be accepted or cancel one that is no longer needed.",
          side: "top",
        },
      },
    ],
  },
  {
    id: "profile",
    path: "/profile",
    title: "Account settings",
    intro: "Manage your personal profile, sign-in security and company access.",
    steps: [
      pageTitle,
      {
        element: '[data-tour="profile-details"]',
        popover: {
          title: "Personal details",
          description: "Update the name and email shown to your teammates.",
        },
      },
      {
        element: '[data-tour="profile-security"]',
        popover: {
          title: "Sign-in security",
          description: "Change your password and review the devices where you are signed in.",
        },
      },
      {
        element: '[data-tour="account-menu"]',
        popover: {
          title: "Open your account menu",
          description: "Your account menu includes personal settings and sign out. If you are an administrator it also contains administration tools.",
        },
      },
      {
        element: '[data-tour="company-access"]',
        popover: {
          title: "Company access",
          description: "See the companies where your account has access. Use the company switcher in the top bar to change the active company.",
          side: "top",
        },
      },
    ],
  },
  ...[
    ["company", "Company information", "Update the business details shown on invoices, estimates, receipts and emails."],
    ["preferences", "Preferences", "Set company currency, regional formats and document behaviour."],
    ["customization", "Customization", "Configure numbering, defaults and printed address formats."],
    ["email-templates", "Email templates", "Customize the messages used when sending documents to customers."],
    ["roles", "Roles", "Define the permissions assigned to company team members."],
    ["notifications", "Notifications", "Choose which customer document activity generates email notifications."],
    ["tax-types", "Tax types", "Set up sales and purchase tax types used on documents and expenses."],
    ["payment-modes", "Payment modes", "Maintain the payment methods available when recording receipts."],
    ["custom-fields", "Custom fields", "Add extra fields to records where your business needs more information."],
    ["notes", "Saved notes", "Create reusable notes to insert into documents and payment records."],
    ["expense-categories", "Expense categories", "Organize expenses using categories that make reporting easier."],
    ["exchange-rates", "Exchange rate provider", "Review the exchange-rate provider setting. The provider integration is not available in this release."],
    ["mail", "Mail configuration", "Configure how Kydi sends email from your company."],
    ["api-tokens", "API tokens", "Create and revoke tokens for API access. Keep tokens private and revoke any that are no longer needed."],
    ["portal", "Customer portal", "Configure the customer portal. Individual customers must also have portal access enabled on their customer record."],
  ].map(([slug, label, description]): TourDefinition => ({
    id: `settings-${slug}`,
    path: `/settings/${slug}`,
    title: label,
    intro: description,
    steps: [
      pageTitle,
      {
        element: '[data-tour="settings-navigation"]',
        popover: {
          title: "Settings sections",
          description: "Use this navigation to move between the settings available to your account.",
          side: "right",
        },
      },
      {
        element: '[data-tour="settings-content"]',
        popover: {
          title: label,
          description,
          side: "top",
        },
      },
    ],
  })),
  {
    id: "company-creation",
    path: "/companies/new",
    title: "Create a company",
    intro: "Set up a separate company workspace when you need to manage another business.",
    matches: (path) => path === "/companies/new",
    steps: [
      pageTitle,
      {
        element: '[data-tour="primary-form"]',
        popover: {
          title: "Enter company information",
          description: "Complete the company setup form. Company data is kept separate from your other workspaces.",
        },
      },
    ],
  },
];

function normalizePath(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function portalDefinitions(slug: string): TourDefinition[] {
  const base = `/portal/${slug}`;
  return [
    {
      id: "portal-dashboard",
      path: base,
      title: "Customer portal dashboard",
      intro: "Review the balances and documents shared with you by this business.",
      steps: [
        pageTitle,
        {
          element: '[data-tour="portal-navigation"]',
          popover: {
            title: "Browse your portal",
            description: "Use these links to see shared invoices, estimates, payment receipts and your portal settings.",
          },
        },
        {
          element: '[data-tour="portal-summary"]',
          popover: {
            title: "Account summary",
            description: "See the amount currently due and how many invoices, estimates and payments are available.",
          },
        },
        {
          element: '[data-tour="portal-invoices"]',
          popover: {
            title: "Recent invoices",
            description: "Open an invoice to review its status and download a PDF copy.",
          },
        },
        {
          element: '[data-tour="portal-estimates"]',
          popover: {
            title: "Recent estimates",
            description: "Open an estimate to review its details and accept or reject it when a decision is available.",
          },
        },
      ],
    },
    ...[
      ["invoices", "Invoices", "Review invoice totals, due balances and payment status. Draft invoices are not shown."],
      ["estimates", "Estimates", "Review estimates shared with you and check their current status."],
      ["payments", "Payments", "Review payments recorded for your account and the invoices they were applied to."],
    ].map(([kind, title, description]): TourDefinition => ({
      id: `portal-${kind}`,
      path: `${base}/${kind}`,
      title: `Portal ${title.toLowerCase()}`,
      intro: description,
      steps: [
        pageTitle,
        {
          element: '[data-tour="portal-navigation"]',
          popover: {
            title: "Portal navigation",
            description: "Move between your dashboard, invoices, estimates, payment receipts and settings.",
          },
        },
        {
          element: '[data-tour="portal-records"]',
          popover: {
            title: `${title} shared with you`,
            description,
            side: "top",
          },
        },
      ],
    })),
    ...[
      ["invoices", "Invoice", "Review the invoice status and balance, then download a PDF copy if you need one."],
      ["estimates", "Estimate", "Review the estimate and use Accept or Reject when the business is asking for a decision."],
      ["payments", "Payment receipt", "Review the payment receipt and download its PDF. Contact the business if you have a question about a payment."],
    ].map(([kind, label, description]): TourDefinition => ({
      id: `portal-${kind}-detail`,
      path: `${base}/${kind}`,
      title: `Portal ${label.toLowerCase()}`,
      intro: description,
      matches: (pathname) => new RegExp(`^${base}/${kind}/\\d+$`).test(pathname),
      discover: false,
      steps: [
        pageTitle,
        {
          element: '[data-tour="page-actions"]',
          popover: {
            title: kind === "estimates" ? "Estimate actions" : "Download a copy",
            description: kind === "estimates"
              ? "Accept or reject the estimate if a decision is available, or download its PDF."
              : "Download the PDF for your records. The portal shows the document without exposing other customer records.",
          },
        },
        {
          element: '[data-tour="portal-document"]',
          popover: {
            title: "Document preview",
            description,
            side: "top",
          },
        },
      ],
    })),
    {
      id: "portal-settings",
      path: `${base}/settings`,
      title: "Portal account settings",
      intro: "Update the personal contact details and password used to sign in to this customer portal.",
      steps: [
        pageTitle,
        {
          element: '[data-tour="portal-navigation"]',
          popover: {
            title: "Portal navigation",
            description: "Return to your dashboard or shared records using these links.",
          },
        },
        {
          element: '[data-tour="portal-settings"]',
          popover: {
            title: "Your portal account",
            description: "Update your contact details or password. These changes affect your customer portal sign-in.",
            side: "top",
          },
        },
      ],
    },
  ];
}

function tourForPath(pathname: string, tours: TourDefinition[]) {
  const path = normalizePath(pathname);
  return tours.find((tour) => (tour.matches ? tour.matches(path) : path === tour.path));
}

function storageKey(scope: "app" | "portal", userId: number, type: "welcome" | "completed", tourId?: string) {
  return type === "welcome"
    ? `kydi-tour:${scope}:${userId}:welcome-seen`
    : `kydi-tour:${scope}:${userId}:completed:${tourId}`;
}

function appendSkipButton(popover: PopoverDOM, tourDriver: Driver) {
  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "driver-popover-btn";
  skip.textContent = "Skip tour";
  skip.setAttribute("aria-label", "Skip this tour");
  skip.addEventListener("click", () => tourDriver.destroy());
  popover.footerButtons.append(skip);
  popover.closeButton.setAttribute("aria-label", "Skip tour");
}

export default function ProductTour({
  userId,
  availableTourPaths,
  scope = "app",
  portalSlug,
}: {
  userId: number;
  availableTourPaths: string[];
  scope?: "app" | "portal";
  portalSlug?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const activeTour = useRef<Driver | null>(null);
  const tours = useMemo(
    () => (scope === "portal" && portalSlug ? portalDefinitions(portalSlug) : definitions),
    [portalSlug, scope],
  );
  const pendingKey = `kydi-tour:${scope}:pending`;
  const currentTour = useMemo(() => tourForPath(pathname, tours), [pathname, tours]);
  const discoverableTours = useMemo(
    () => tours.filter((tour) => tour.discover !== false && availableTourPaths.includes(tour.path)),
    [availableTourPaths, tours],
  );

  const startTour = useCallback((tour: TourDefinition | undefined) => {
    if (!tour) return;
    activeTour.current?.destroy();

    const steps = [
      introStep(tour.title, tour.intro),
      ...tour.steps.filter((step) => {
        if (!step.element || typeof step.element !== "string") return true;
        const element = document.querySelector(step.element);
        if (!element) return false;
        const bounds = element.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0;
      }),
    ];
    const key = storageKey(scope, userId, "completed", tour.id);
    const complete = (instance: Driver) => {
      localStorage.setItem(key, "true");
      instance.destroy();
    };

    const instance = driver({
      steps,
      showProgress: true,
      progressText: "Step {{current}} of {{total}}",
      animate: true,
      smoothScroll: true,
      allowClose: true,
      allowKeyboardControl: true,
      disableActiveInteraction: true,
      skipMissingElement: true,
      waitForElement: 300,
      overlayClickBehavior: "close",
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Finish",
      closeBtnLabel: "Skip tour",
      onPopoverRender: (popover, { driver: tourDriver }) => appendSkipButton(popover, tourDriver),
      onNextClick: (_element, _step, { driver: tourDriver }) => {
        if (tourDriver.isLastStep()) {
          complete(tourDriver);
        } else {
          tourDriver.moveNext();
        }
      },
      onPrevClick: (_element, _step, { driver: tourDriver }) => tourDriver.movePrevious(),
      onDoneClick: (_element, _step, { driver: tourDriver }) => complete(tourDriver),
      onDestroyStarted: (_element, _step, { reason }) => {
        if (reason === "done") localStorage.setItem(key, "true");
      },
      onCloseClick: (_element, _step, { driver: tourDriver }) => tourDriver.destroy(),
      onDestroyed: () => {
        if (activeTour.current === instance) activeTour.current = null;
      },
    });
    activeTour.current = instance;
    instance.drive();
  }, [scope, userId]);

  useEffect(() => {
    if (!localStorage.getItem(storageKey(scope, userId, "welcome"))) setWelcomeOpen(true);
  }, [scope, userId]);

  useEffect(() => {
    const pendingId = sessionStorage.getItem(pendingKey);
    if (pendingId) {
      sessionStorage.removeItem(pendingKey);
      const pendingTour = tours.find((tour) => tour.id === pendingId);
      if (pendingTour && (pendingTour.matches ? pendingTour.matches(normalizePath(pathname)) : normalizePath(pathname) === pendingTour.path)) {
        const timer = window.setTimeout(() => startTour(pendingTour), 250);
        return () => window.clearTimeout(timer);
      }
    }
    return undefined;
  }, [pathname, pendingKey, startTour, tours]);

  useEffect(() => () => {
    activeTour.current?.destroy();
    activeTour.current = null;
  }, []);

  const dismissWelcome = () => {
    localStorage.setItem(storageKey(scope, userId, "welcome"), "true");
    setWelcomeOpen(false);
  };

  const startWelcomeTour = () => {
    dismissWelcome();
    startTour(currentTour);
  };

  const chooseTour = (tour: TourDefinition) => {
    setHelpOpen(false);
    const path = normalizePath(pathname);
    if (tour.matches ? tour.matches(path) : path === tour.path) {
      startTour(tour);
      return;
    }
    sessionStorage.setItem(pendingKey, tour.id);
    router.push(tour.path);
  };

  return (
    <>
      <div className="fixed bottom-5 right-5 z-40">
        {helpOpen ? (
          <section
            id="kydi-tour-menu"
            aria-label="Help and tours"
            className="mb-3 max-h-[70vh] w-80 overflow-y-auto rounded-lg border border-line bg-white p-4 shadow-xl"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">Help and tours</h2>
                <p className="mt-1 text-xs text-muted">Choose a guide for a feature you can access.</p>
              </div>
              <button type="button" onClick={() => setHelpOpen(false)} aria-label="Close help menu" className="rounded px-2 py-1 text-sm text-muted hover:bg-subtle">
                Close
              </button>
            </div>
            {currentTour ? (
              <button
                type="button"
                onClick={() => {
                  setHelpOpen(false);
                  startTour(currentTour);
                }}
                className="mb-3 w-full rounded-md bg-brand-700 px-3 py-2 text-left text-sm font-medium text-white hover:bg-brand-800"
              >
                Take a tour of this page
              </button>
            ) : null}
            <ul className="space-y-1">
              {discoverableTours.map((tour) => (
                <li key={tour.id}>
                  <button
                    type="button"
                    onClick={() => chooseTour(tour)}
                    className="w-full rounded-md px-3 py-2 text-left text-sm text-ink-2 hover:bg-subtle focus-ring"
                  >
                    {tour.title}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <button
          type="button"
          aria-expanded={helpOpen}
          aria-controls="kydi-tour-menu"
          onClick={() => setHelpOpen((open) => !open)}
          className="ml-auto flex items-center gap-2 rounded-full bg-brand-700 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-brand-800 focus-ring"
        >
          <span aria-hidden="true">?</span>
          Help / Take a tour
        </button>
      </div>

      {welcomeOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="kydi-tour-welcome-title"
            className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-2xl"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
              {scope === "portal" ? "Welcome to your customer portal" : "Welcome to Kydi"}
            </p>
            <h2 id="kydi-tour-welcome-title" className="mt-2 text-xl font-semibold text-ink">Take a guided tour</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Explore the main controls on this page, or skip for now and start any feature tour later from Help.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={dismissWelcome} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-ink-2 hover:bg-subtle focus-ring">
                Skip for now
              </button>
              <button type="button" onClick={startWelcomeTour} className="rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-800 focus-ring">
                Start tour
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
