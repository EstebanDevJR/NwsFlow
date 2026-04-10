import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('password123', 12);

  const holder = await prisma.user.upsert({
    where: { email: 'admin@paymentflow.com' },
    update: {},
    create: {
      email: 'admin@paymentflow.com',
      name: 'Admin Holder',
      password,
      role: 'HOLDER',
    },
  });

  const leader = await prisma.user.upsert({
    where: { email: 'leader@paymentflow.com' },
    update: {},
    create: {
      email: 'leader@paymentflow.com',
      name: 'Carlos Líder',
      password,
      role: 'LIDER',
    },
  });

  const cajero = await prisma.user.upsert({
    where: { email: 'cajero@paymentflow.com' },
    update: {},
    create: {
      email: 'cajero@paymentflow.com',
      name: 'María Cajero',
      password,
      role: 'CAJERO',
    },
  });

  console.log('Seed completed:', { holder: holder.id, leader: leader.id, cajero: cajero.id });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
