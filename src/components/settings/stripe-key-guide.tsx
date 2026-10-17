"use client";

import Image from "next/image";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Picture-by-picture walkthrough of creating the restricted key in the Stripe Dashboard. Screenshots live in
 * public/help/stripe (cropped, account details removed, the key value replaced with a placeholder). Retake them
 * when Stripe changes this flow. Served as-is (`unoptimized`): they are small WebP files and the standalone build
 * ships without sharp, which Next's image optimizer needs.
 */
const STEPS = [
  { src: "1-create-secret-key.webp", h: 86, text: "In the Stripe Dashboard, open Developers → API keys and click Create secret key." },
  { src: "2-own-integration.webp", h: 359, text: "Keep “Building your own integration” selected and click Continue." },
  { src: "3-custom-permissions.webp", h: 359, text: "Choose Custom permissions and click Continue." },
  { src: "4-checkout-sessions-write.webp", h: 257, text: "Type “Checkout Sessions” in the search box and set it to Write." },
  { src: "5-balance-read.webp", h: 257, text: "Search “Balance” and set the first row, Balance, to Read." },
  { src: "6-webhook-endpoints-write.webp", h: 257, text: "Search “Webhook Endpoints” and set it to Write. Then click Continue." },
  { src: "7-name-and-create.webp", h: 359, text: "Name the key (for example “Kydi”). The summary should say 3 permissions: 1 read, 2 write. Click Create key." },
  { src: "8-copy-key.webp", h: 359, text: "Copy the key (it starts with rk_live_ or rk_test_) and paste it into the box below. Stripe shows it only once." },
];

export function StripeKeyGuide() {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  return (
    <details className="rounded-md border border-line text-sm">
      <summary className="cursor-pointer px-3 py-2 font-medium text-brand-700">Show me how, step by step (8 pictures)</summary>
      <div className="space-y-3 border-t border-line p-3">
        <p className="font-medium" aria-live="polite">
          Step {i + 1} of {STEPS.length}: <span className="font-normal">{step.text}</span>
        </p>
        <div className="overflow-hidden rounded-md border border-line bg-subtle">
          <Image src={`/help/stripe/${step.src}`} alt={step.text} width={960} height={step.h} className="h-auto w-full" unoptimized />
        </div>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setI((n) => Math.max(0, n - 1))}
            disabled={i === 0}
            className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 hover:bg-subtle disabled:opacity-40 focus-ring"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back
          </button>
          <div className="flex gap-1.5" aria-hidden="true">
            {STEPS.map((s, n) => (
              <span key={s.src} className={`h-1.5 w-4 rounded-full ${n === i ? "bg-brand-600" : "bg-line"}`} />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setI((n) => Math.min(STEPS.length - 1, n + 1))}
            disabled={i === STEPS.length - 1}
            className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 hover:bg-subtle disabled:opacity-40 focus-ring"
          >
            Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </details>
  );
}
