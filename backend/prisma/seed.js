const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.dscRoute.createMany({
    data: [
      { name: 'Belagavi → Hubballi Express', region: 'Belagavi', schedule: '06:00 daily', isActive: true },
      { name: 'Belagavi → Bengaluru Night Carrier', region: 'Belagavi', schedule: '22:00 daily', isActive: true },
      { name: 'Dharwad → Davangere Route', region: 'Dharwad', schedule: '08:00 daily', isActive: true },
      { name: 'Hubballi → Pune Corridor', region: 'Hubballi', schedule: '05:00 daily', isActive: true },
      { name: 'Bagalkot → Bijapur Route', region: 'Bagalkot', schedule: '07:00 daily', isActive: true },
    ],
    skipDuplicates: true,
  });
  console.log('DSC routes seeded');
}

main().finally(() => prisma.$disconnect());