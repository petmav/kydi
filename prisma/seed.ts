import { db } from "../src/lib/db";
import { demoSeedAllowed, seedDemo, DEMO_EMAIL, DEMO_PASSWORD } from "../src/server/seed";
import { seedExtras } from "../src/server/seed-extras";

async function main() {
  if (!demoSeedAllowed()) {
    console.error("Refusing to seed demo data with NODE_ENV=production. Set KYDI_DEMO_SEED=true explicitly to override (never on an instance with real data).");
    process.exit(1);
  }
  const r = await seedDemo(seedExtras);
  if (r.created) console.log(`Seeded demo data. Sign in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  else console.log("Database already has users; skipping demo seed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
