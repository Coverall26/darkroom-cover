/**
 * FundRoom AI — Platform Admin Seed Script
 *
 * Creates the platform admin user so you can log in and set up
 * your organization from scratch through the UI.
 *
 * Usage:
 *   npx ts-node prisma/seed-platform-admin.ts
 *   npx ts-node prisma/seed-platform-admin.ts --set-password MyPassword123
 *
 * This script is idempotent: running it multiple times will not
 * create duplicate records.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ADMIN_EMAIL = "rciesco@fundroom.ai";
const ADMIN_NAME = "Ricardo Ciesco";

async function main() {
  console.log("\n  FundRoom AI — Platform Admin Setup");
  console.log("  ===================================\n");

  const args = process.argv.slice(2);
  const setPasswordIdx = args.indexOf("--set-password");
  const rawPassword = setPasswordIdx !== -1 ? args[setPasswordIdx + 1] : null;

  // 1. Create or find admin user
  let user = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
  });

  if (!user) {
    const userData: any = {
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      emailVerified: new Date(),
      role: "GP",
    };

    // Hash password if provided
    if (rawPassword) {
      const bcrypt = await import("bcryptjs");
      userData.password = await bcrypt.hash(rawPassword, 12);
      console.log(`  Password will be set for admin user`);
    }

    user = await prisma.user.create({ data: userData });
    console.log(`  Created admin user: ${user.email} (id: ${user.id})`);
  } else {
    console.log(`  Admin user already exists: ${user.email} (id: ${user.id})`);

    // Update password if provided even for existing user
    if (rawPassword) {
      const bcrypt = await import("bcryptjs");
      const hashedPassword = await bcrypt.hash(rawPassword, 12);
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      });
      console.log(`  Password updated for admin user`);
    }
  }

  console.log("\n  Setup complete!");
  console.log("  ===============\n");
  console.log(`  Admin email: ${ADMIN_EMAIL}`);
  console.log(`  Admin role:  GP`);
  if (rawPassword) {
    console.log(`  Password:    (set via --set-password)`);
  } else {
    console.log(`  Password:    Not set (use magic link or run with --set-password)`);
  }
  console.log(`\n  Next steps:`);
  console.log(`  1. Log in at /admin/login with email + password`);
  console.log(`  2. You'll be redirected to the Org Setup Wizard`);
  console.log(`  3. Set up your organization, fund, and wire instructions\n`);
}

main()
  .catch((e) => {
    console.error("  Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
