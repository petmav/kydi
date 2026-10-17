import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPortalCompany, getPortalCustomer } from "@/lib/auth/portal";
import { getCompanySettings } from "@/lib/settings";
import { portalCodeLoginAction, portalLoginAction, portalRequestCodeAction } from "../../actions";
import { readLoginHint } from "@/lib/auth/login-code";
import { emailForLoginHint } from "@/server/portal-login";
import { PortalLoginForm } from "../../forms";
import { PortalCard } from "../portal-card";

export const metadata: Metadata = { title: "Customer portal" };
export const dynamic = "force-dynamic";

export default async function PortalLoginPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ u?: string }> }) {
  const { slug } = await params;
  const { u } = await searchParams;
  const company = await getPortalCompany(slug);
  if (await getPortalCustomer(slug)) redirect(`/portal/${slug}`);
  const title = (await getCompanySettings(company.id)).customer_portal_page_title || company.name;
  // Links in invoices, PDFs and portal emails carry a signed hint (?u=) instead of the address itself.
  const email = await emailForLoginHint(company.id, readLoginHint(u));
  return (
    <PortalCard title={title} subtitle="Sign in to view your invoices, estimates and payments.">
      <PortalLoginForm
        action={portalLoginAction.bind(null, slug)}
        requestCodeAction={portalRequestCodeAction.bind(null, slug)}
        codeLoginAction={portalCodeLoginAction.bind(null, slug)}
        slug={slug}
        defaultEmail={email ?? ""}
      />
    </PortalCard>
  );
}
