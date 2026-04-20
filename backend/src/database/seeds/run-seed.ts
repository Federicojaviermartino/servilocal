import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../../entities/user.entity';
import { Category } from '../../entities/category.entity';
import { Service } from '../../entities/service.entity';

async function runSeed() {
  const databaseUrl = process.env.DATABASE_URL;

  const dataSource = new DataSource(
    databaseUrl
      ? {
          type: 'postgres',
          url: databaseUrl,
          ssl: { rejectUnauthorized: false },
          entities: [__dirname + '/../../entities/*.entity{.ts,.js}'],
          synchronize: true,
          logging: false,
        }
      : {
          type: 'postgres',
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432', 10),
          username: process.env.DB_USERNAME || 'servilocal_user',
          password: process.env.DB_PASSWORD || 'servilocal_dev_2026',
          database: process.env.DB_DATABASE || 'servilocal',
          entities: [__dirname + '/../../entities/*.entity{.ts,.js}'],
          synchronize: true,
          logging: false,
        },
  );

  await dataSource.initialize();
  console.log('Conexión a base de datos establecida');

  const userRepo = dataSource.getRepository(User);
  const categoryRepo = dataSource.getRepository(Category);
  const serviceRepo = dataSource.getRepository(Service);

  // Limpiar datos existentes respetando el orden de dependencias
  const tablesToPurge = [
    'payments',
    'reviews',
    'notifications',
    'messages',
    'bookings',
    'services',
    'categories',
    'users',
  ];
  for (const table of tablesToPurge) {
    try {
      await dataSource.query(`DELETE FROM ${table}`);
    } catch {
      // la tabla puede no existir si el modulo aun no se ha usado; se ignora
    }
  }
  console.log('Datos anteriores eliminados');

  // Crear usuarios
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash('Password123!', salt);

  const admin = userRepo.create({
    firstName: 'Admin',
    lastName: 'ServiLocal',
    email: 'admin@servilocal.com',
    password: hashedPassword,
    role: UserRole.ADMIN,
    isEmailVerified: true,
    city: 'Madrid',
  });

  const client = userRepo.create({
    firstName: 'Laura',
    lastName: 'García',
    email: 'laura@ejemplo.com',
    password: hashedPassword,
    role: UserRole.CLIENT,
    isEmailVerified: true,
    city: 'Madrid',
    phone: '600111222',
    location: (() => "ST_SetSRID(ST_MakePoint(-3.7038, 40.4168), 4326)") as any,
  });

  const provider1 = userRepo.create({
    firstName: 'Carlos',
    lastName: 'López',
    email: 'carlos@ejemplo.com',
    password: hashedPassword,
    role: UserRole.PROVIDER,
    isEmailVerified: true,
    city: 'Madrid',
    phone: '600333444',
    bio: 'Fontanero profesional con 15 años de experiencia',
    location: (() => "ST_SetSRID(ST_MakePoint(-3.6920, 40.4200), 4326)") as any,
  });

  const provider2 = userRepo.create({
    firstName: 'María',
    lastName: 'Fernández',
    email: 'maria@ejemplo.com',
    password: hashedPassword,
    role: UserRole.PROVIDER,
    isEmailVerified: true,
    city: 'Madrid',
    phone: '600555666',
    bio: 'Electricista certificada, especialista en instalaciones domésticas',
    location: (() => "ST_SetSRID(ST_MakePoint(-3.7100, 40.4250), 4326)") as any,
  });

  await userRepo.save([admin, client, provider1, provider2]);
  console.log('Usuarios creados: admin, cliente, 2 proveedores');

  // Crear categorías
  const categories = [
    { name: 'Fontanería', slug: 'fontaneria', description: 'Reparación e instalación de tuberías y grifería', icon: 'droplet', sortOrder: 1 },
    { name: 'Electricidad', slug: 'electricidad', description: 'Instalaciones y reparaciones eléctricas', icon: 'zap', sortOrder: 2 },
    { name: 'Limpieza', slug: 'limpieza', description: 'Servicios de limpieza doméstica y profesional', icon: 'sparkles', sortOrder: 3 },
    { name: 'Pintura', slug: 'pintura', description: 'Pintura interior y exterior', icon: 'paintbrush', sortOrder: 4 },
    { name: 'Cerrajería', slug: 'cerrajeria', description: 'Apertura de puertas y cambio de cerraduras', icon: 'key', sortOrder: 5 },
    { name: 'Clases particulares', slug: 'clases-particulares', description: 'Profesores para refuerzo y formación', icon: 'book', sortOrder: 6 },
    { name: 'Reformas', slug: 'reformas', description: 'Reformas integrales y parciales', icon: 'hammer', sortOrder: 7 },
    { name: 'Jardinería', slug: 'jardineria', description: 'Mantenimiento de jardines y espacios verdes', icon: 'leaf', sortOrder: 8 },
    { name: 'Mudanzas', slug: 'mudanzas', description: 'Servicios de mudanza y transporte', icon: 'truck', sortOrder: 9 },
    { name: 'Diseño gráfico', slug: 'diseno-grafico', description: 'Diseño de logotipos, web y material gráfico', icon: 'palette', sortOrder: 10 },
  ];

  const savedCategories: Record<string, Category> = {};
  for (const cat of categories) {
    const saved = await categoryRepo.save(categoryRepo.create(cat));
    savedCategories[cat.slug] = saved;
  }
  console.log(`${categories.length} categorías creadas`);

  // Crear servicios de muestra asociados a los proveedores
  const sampleServices = [
    {
      providerId: provider1.id,
      categoryId: savedCategories['fontaneria'].id,
      title: 'Reparación de fugas y grifos',
      description:
        'Servicio rápido de detección y reparación de fugas de agua, cambio de grifos, sifones y llaves de paso. Presupuesto sin compromiso y garantía por escrito.',
      priceMin: 40,
      priceUnit: 'hour',
      address: 'Calle Gran Vía 32',
      city: 'Madrid',
      coverageRadiusKm: 15,
      lng: -3.7038,
      lat: 40.4168,
    },
    {
      providerId: provider1.id,
      categoryId: savedCategories['fontaneria'].id,
      title: 'Instalación de sanitarios y grifería',
      description:
        'Instalación profesional de lavabos, inodoros, bidés, duchas y grifería. Trabajo limpio, retirada de residuos y puesta en marcha incluidas.',
      priceMin: 60,
      priceMax: 150,
      priceUnit: 'service',
      address: 'Calle Velázquez 85',
      city: 'Madrid',
      coverageRadiusKm: 20,
      lng: -3.6870,
      lat: 40.4320,
    },
    {
      providerId: provider2.id,
      categoryId: savedCategories['electricidad'].id,
      title: 'Revisión y reparación de instalación eléctrica',
      description:
        'Diagnóstico y reparación de averías eléctricas en viviendas y locales. Revisión de cuadro, sustitución de automáticos y comprobación de toma de tierra.',
      priceMin: 50,
      priceUnit: 'hour',
      address: 'Calle Fuencarral 120',
      city: 'Madrid',
      coverageRadiusKm: 15,
      lng: -3.7025,
      lat: 40.4290,
    },
    {
      providerId: provider2.id,
      categoryId: savedCategories['electricidad'].id,
      title: 'Instalación de puntos de luz y enchufes',
      description:
        'Colocación de nuevos puntos de luz, enchufes, interruptores y aplicación de domótica básica. Material incluido en presupuesto.',
      priceMin: 35,
      priceMax: 90,
      priceUnit: 'service',
      address: 'Calle Bravo Murillo 210',
      city: 'Madrid',
      coverageRadiusKm: 12,
      lng: -3.7050,
      lat: 40.4470,
    },
  ];

  for (const s of sampleServices) {
    const { lng, lat, ...rest } = s;
    const service = serviceRepo.create({
      ...rest,
      location: (() =>
        `ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`) as any,
    });
    await serviceRepo.save(service);
  }
  console.log(`${sampleServices.length} servicios creados`);

  // Credenciales de prueba
  console.log('\n=== CREDENCIALES DE PRUEBA ===');
  console.log('Admin:     admin@servilocal.com / Password123!');
  console.log('Cliente:   laura@ejemplo.com / Password123!');
  console.log('Proveedor: carlos@ejemplo.com / Password123!');
  console.log('Proveedor: maria@ejemplo.com / Password123!');

  await dataSource.destroy();
  console.log('\nSeed completado.');
}

runSeed().catch((error) => {
  console.error('Error en seed:', error);
  process.exit(1);
});
