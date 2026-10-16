import { db } from "../src/lib/db";
import { seedDemo, DEMO_EMAIL, DEMO_PASSWORD } from "../src/server/seed";
import { seedExtras } from "../src/server/seed-extras";

async function main() {
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
