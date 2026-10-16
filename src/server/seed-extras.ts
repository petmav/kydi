import type { CompanyContext } from "@/lib/auth/context";
import type { SeedRefs } from "./seed";

/** Additional demo data (payments, expenses, recurring) added by later modules. */
export async function seedExtras(_ctx: CompanyContext, _refs: SeedRefs): Promise<void> {
  void _ctx;
  void _refs;
}
