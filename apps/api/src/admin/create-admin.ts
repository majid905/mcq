import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PasswordService } from '../auth/password.service';
import { loadDotenv } from '../config/dotenv';
import { CoreModule } from '../core.module';
import { PrismaService } from '../prisma/prisma.service';

@Module({ imports: [CoreModule], providers: [PasswordService] })
class CreateAdminModule {}

/**
 * `ADMIN_PASSWORD=... node dist/admin/create-admin.js <email> <name> [role=super_admin]`
 * Creates the admin, or resets the password and re-activates it if the email already exists.
 * Without ADMIN_PASSWORD a random one is generated and printed once.
 */
async function main(): Promise<void> {
  loadDotenv();
  const [email, name, role = 'super_admin'] = process.argv.slice(2);
  if (!email || !name) {
    console.error('usage: create-admin <email> <name> [role]');
    process.exit(2);
  }
  const app = await NestFactory.createApplicationContext(CreateAdminModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);
  const roleRow = await prisma.roles.findUnique({ where: { name: role } });
  if (!roleRow) {
    console.error(`unknown role "${role}"`);
    process.exit(2);
  }
  const generated = !process.env['ADMIN_PASSWORD'];
  const password = process.env['ADMIN_PASSWORD'] ?? randomBytes(15).toString('base64url');
  if (password.length < 10) {
    console.error('ADMIN_PASSWORD must be at least 10 characters');
    process.exit(2);
  }
  const hash = await app.get(PasswordService).hash(password);
  const normalized = email.trim().toLowerCase();
  await prisma.admins.upsert({
    where: { email: normalized },
    create: { email: normalized, name, password_hash: hash, role_id: roleRow.id },
    update: { name, password_hash: hash, role_id: roleRow.id, is_active: true },
  });
  process.stdout.write(`admin ${normalized} (${role}) ready
`);
  if (generated)
    process.stdout.write(`password: ${password}
`);
  await app.close();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
