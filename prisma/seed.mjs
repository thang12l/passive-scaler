import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function generateWebhookSecret() {
  return randomBytes(32).toString("hex");
}

function hashSecret(secret) {
  return createHash("sha256").update(secret).digest("hex");
}

async function seedLegacyAppFromEnv() {
  const slug = process.env.TARGET_HEROKU_APP?.trim();
  const legacySecret = process.env.WEBHOOK_SECRET?.trim();

  if (!slug || !legacySecret || legacySecret.length < 16) {
    return;
  }

  const existing = await prisma.app.findUnique({ where: { slug } });
  if (existing) {
    console.log(`Legacy app "${slug}" already exists, skipping seed.`);
    return;
  }

  await prisma.app.create({
    data: {
      slug,
      displayName: slug,
      herokuAppName: slug,
      webhookSecretHash: hashSecret(legacySecret),
      scalingEnabled: true,
      dryRun: true,
      minDynos: Number(process.env.MIN_DYNOS ?? 1),
      maxDynos: Number(process.env.MAX_DYNOS ?? 10),
      responseTimeThresholdMs: Number(process.env.RESPONSE_TIME_THRESHOLD_MS ?? 2000),
      memoryThresholdPercent: Number(process.env.MEMORY_THRESHOLD_PERCENT ?? 85),
      scaleUpCooldownSeconds: Number(process.env.SCALE_UP_COOLDOWN_SECONDS ?? 300),
      scaleDownCooldownSeconds: Number(process.env.SCALE_DOWN_COOLDOWN_SECONDS ?? 600),
      herokuApiKey: process.env.HEROKU_API_KEY?.trim() || null,
      scalingState: {
        create: {
          currentDynos: Number(process.env.MIN_DYNOS ?? 1),
        },
      },
    },
  });

  console.log(`Seeded legacy app "${slug}" from environment variables.`);
}

async function seedDefaultAppIfEmpty() {
  const count = await prisma.app.count();
  if (count > 0) return;

  const webhookSecret = generateWebhookSecret();
  const slug = "example-app";

  await prisma.app.create({
    data: {
      slug,
      displayName: "Example App",
      herokuAppName: slug,
      webhookSecretHash: hashSecret(webhookSecret),
      scalingEnabled: true,
      dryRun: true,
      scalingState: {
        create: { currentDynos: 1 },
      },
    },
  });

  console.log("Created example app.");
  console.log(`  slug: ${slug}`);
  console.log(`  webhook_secret: ${webhookSecret}`);
}

async function main() {
  await seedLegacyAppFromEnv();
  await seedDefaultAppIfEmpty();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
