import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../../entities/user.entity';
import { Category } from '../../entities/category.entity';

async function runSeed() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'servilocal_user',
    password: process.env.DB_PASSWORD || 'servilocal_dev_2026',
    database: process.env.DB_DATABASE || 'servilocal',
    entities: [__dirname + '/../../entities/*.entity{.ts,.js}'],
    synchronize: true,
  });

  await dataSource.initialize();
  console.log('Conexión a base de datos establecida');

  const userRepo = dataSource.getRepository(User);
  const categoryRepo = dataSource.getRepository(Category);

  // Limpiar datos existentes
  await dataSource.query('DELETE FROM categories');
  await dataSource.query('DELETE FROM users');
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
    location: () => "ST_SetSRID(ST_MakePoint(-3.7038, 40.4168), 4326)",
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
    location: () => "ST_SetSRID(ST_MakePoint(-3.6920, 40.4200), 4326)",
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
    location: () => "ST_SetSRID(ST_MakePoint(-3.7100, 40.4250), 4326)",
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

  for (const cat of categories) {
    await categoryRepo.save(categoryRepo.create(cat));
  }
  console.log(`${categories.length} categorías creadas`);

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
