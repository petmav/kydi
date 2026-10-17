import { verifyStripeSignature } from "@/lib/stripe";
import { activeGateway, confirmStripeSession, expireCheckout } from "@/server/online-payments";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook for one company (URL shown in Settings > Online payments). Verifies the signature with that
 * company's signing secret, then re-reads the session from Stripe before recording anything.
 */
export async function POST(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const companyId = Number((await params).companyId);
  if (!Number.isInteger(companyId) || companyId < 1) return Response.json({ error: "not found" }, { status: 404 });
  const g = await activeGateway(companyId);
  if (!g || g.driver !== "stripe" || !g.secrets.webhookSecret) return Response.json({ error: "not configured" }, { status: 404 });
  const body = await req.text();
  if (!verifyStripeSignature(body, req.headers.get("stripe-signature"), g.secrets.webhookSecret)) return Response.json({ error: "invalid signature" }, { status: 400 });
  let event: { type?: string; data?: { object?: { id?: string; object?: string } } };
  try {
    event = JSON.parse(body);
  } catch {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  }
  const session = event.data?.object;
  if (session?.object !== "checkout.session" || !session.id) return Response.json({ received: true });
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    // Stripe retries non-2xx deliveries, so a failed lookup is answered with 500. A "pending" result is normal
    // for checkout.session.completed with delayed payment methods: async_payment_succeeded follows later.
    if ((await confirmStripeSession(companyId, session.id)) === "error") return Response.json({ error: "retry" }, { status: 500 });
  } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    await expireCheckout(companyId, session.id);
  }
  return Response.json({ received: true });
}
