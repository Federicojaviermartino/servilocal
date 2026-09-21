import { resolve } from 'path';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../../entities/user.entity';
import { Category } from '../../entities/category.entity';
import { Service } from '../../entities/service.entity';
import { Booking, BookingStatus } from '../../entities/booking.entity';
import { Review } from '../../entities/review.entity';

/**
 * Datos de demostración.
 *
 * Todas las personas son ficticias. Los servicios se reparten entre las diez
 * categorías y las diez ciudades que ofrece el filtro de búsqueda, para que
 * ninguna combinación de filtros devuelva una lista vacía por falta de datos.
 *
 * Parte de los servicios se deja a propósito sin fotografía: así se ve cómo
 * queda el marcador de posición con el icono de la categoría, que es lo que
 * mostrará la mayoría de servicios publicados por profesionales reales.
 */

// Coordenadas del centro de cada ciudad. Los nombres coinciden exactamente con
// los valores del selector de ciudad del panel de filtros.
const CIUDADES: Record<string, { lat: number; lng: number }> = {
  Madrid: { lat: 40.4168, lng: -3.7038 },
  Barcelona: { lat: 41.3874, lng: 2.1686 },
  Valencia: { lat: 39.4699, lng: -0.3763 },
  Sevilla: { lat: 37.3891, lng: -5.9845 },
  Zaragoza: { lat: 41.6488, lng: -0.8891 },
  Málaga: { lat: 36.7213, lng: -4.4214 },
  Bilbao: { lat: 43.263, lng: -2.935 },
  Murcia: { lat: 37.9922, lng: -1.1307 },
  Palma: { lat: 39.5696, lng: 2.6502 },
  'Las Palmas de Gran Canaria': { lat: 28.1235, lng: -15.4363 },
};

// Fotografías de Unsplash. Cada una se ha comprobado individualmente para que
// muestre el oficio que le corresponde. El recorte 16:9 se pide al propio
// servidor de imágenes, de modo que las originales verticales también encajan.
const foto = (id: string) =>
  'https://images.unsplash.com/photo-' +
  id +
  '?auto=format&fit=crop&w=1200&h=675&q=80';

const FOTOS = {
  fontaneriaSifon: foto('1676210134188-4c05dd172f89'),
  fontaneriaSanitario: foto('1676210134050-6f12c6898395'),
  electricidadCableado: foto('1621905251189-08b45d6a269e'),
  electricidadCuadro: foto('1660330589693-99889d60181e'),
  limpiezaTapiceria: foto('1686178827149-6d55c72d81df'),
  pinturaFachada: foto('1745665777586-09381ba528d6'),
  pinturaInterior: foto('1511822148790-e7b58ba14c72'),
  cerrajeriaLlave: foto('1677951570313-b0750351c461'),
  clasesApoyo: foto('1589206946274-929e4da3996b'),
  reformasCocina: foto('1618832515490-e181c4794a45'),
  jardineriaPoda: foto('1617576683096-00fc8eecb3af'),
  mudanzasCajas: foto('1714647211902-bb711d643a17'),
  disenoTableta: foto('1611241893603-3c359704e0ee'),
};

interface DefinicionServicio {
  proveedor: string;
  categoria: string;
  title: string;
  description: string;
  priceMin: number;
  priceMax?: number;
  priceUnit: string;
  address: string;
  city: string;
  coverageRadiusKm: number;
  images?: string[];
  /** Una reserva completada y una valoración por cada puntuación indicada. */
  valoraciones: number[];
}

const COMENTARIOS_BUENOS = [
  'Puntual y muy limpio. Dejó todo recogido al terminar.',
  'Explicó bien el problema antes de empezar y el precio fue el acordado.',
  'Trabajo impecable. Volvería a contratarle sin dudarlo.',
  'Resolvió en una mañana lo que otros no supieron ver.',
  'Correcto y profesional, aunque tardó algo más de lo previsto.',
  'Muy atento: avisó por el camino de que llegaba con retraso.',
  'Buen acabado y materiales de calidad. Recomendable.',
  'Cumplió con lo presupuestado y no hubo sorpresas.',
];

/**
 * El texto tiene que acompañar a la nota.
 *
 * Con un solo grupo de comentarios, todos elogiosos, un dos estrellas salía
 * con un «trabajo impecable» debajo. Eso no es un detalle estético: la
 * pantalla de moderación y el reparto de valoraciones se leen mirando nota y
 * texto a la vez, y con esa incoherencia no hay nada que moderar ni que
 * entender.
 */
const COMENTARIOS_TIBIOS = [
  'Llegó dos horas tarde y sin avisar. El trabajo, correcto.',
  'El presupuesto final subió algo sobre lo hablado por teléfono.',
  'Cumplió, pero hubo que insistir para que volviera a rematar.',
];

/**
 * Los casos que llegan a moderación, con su queja y su alegación pareadas.
 *
 * Van juntos a propósito. Emparejar un motivo cualquiera con una reseña
 * cualquiera produce contradicciones que saltan a la vista: alegar «esta
 * persona nunca contrató el servicio» debajo de una reseña que describe el
 * trabajo al detalle deja la cola sin nada que decidir, que es justo lo que
 * hay que poder enseñar.
 */
const DENUNCIAS = [
  {
    comentario:
      'No vino ni avisó. Perdí la mañana esperando y encima me cobraron el desplazamiento.',
    motivo:
      'Esta persona canceló la reserva ella misma el día anterior y no hubo desplazamiento que cobrar. Adjunto la conversación.',
  },
  {
    comentario:
      'Mandaron a un tal Rubén, que apareció sin herramientas. Su teléfono es el 600 123 456 por si alguien lo necesita.',
    motivo:
      'La reseña publica el nombre y el teléfono de un empleado. Pido que se retiren esos datos.',
  },
  {
    comentario:
      'Rompieron dos azulejos y se marcharon sin decir nada. La empresa del bajo es un desastre.',
    motivo:
      'Describe un trabajo que no es el mío: confunde mi empresa con otra del mismo edificio. Yo no hago alicatados.',
  },
];

/**
 * Reservas que no acabaron en trabajo hecho.
 *
 * La semilla solo creaba completadas, así que la gráfica de estados del
 * panel enseñaba una barra de cinco y la máquina de estados parecía tener
 * un solo camino. Estas cuatro plantillas cubren los otros cuatro estados
 * con motivos que se pueden leer, no con texto de relleno.
 */
const CANCELACIONES = [
  'Me lo ha resuelto el seguro de la comunidad, así que ya no hace falta.',
  'Me ha surgido un viaje esa semana. Volveré a pedir cita al regresar.',
];

const RECHAZOS = [
  'Esa semana la tengo cerrada por otro trabajo. Lo siento.',
  'La dirección queda fuera de mi zona de cobertura y el desplazamiento no sale a cuenta.',
];

/** Respuestas de profesionales, para que la tasa de respuesta no sea cero. */
const RESPUESTAS = [
  'Gracias por el comentario. Tomo nota de lo del retraso, tiene razón.',
  'Lamento la diferencia de precio; al abrir apareció una avería que no estaba a la vista. Le he enviado el desglose.',
  'Siento el desenlace. Le he escrito para volver y terminar sin coste.',
];

// El data source de las migraciones ya carga el .env; la semilla leía
// process.env a secas, así que seguir el README al pie de la letra
// terminaba en un fallo de autenticación.
dotenv.config({ path: resolve(__dirname, '../../../.env') });

async function runSeed() {
  const databaseUrl = process.env.DATABASE_URL;

  const opcionesComunes = {
    entities: [__dirname + '/../../entities/*.entity{.ts,.js}'],
    // El esquema lo crean las migraciones. El seed solo inserta datos.
    synchronize: false,
    logging: false,
  };

  const dataSource = new DataSource(
    databaseUrl
      ? {
          type: 'postgres',
          url: databaseUrl,
          // Igual que la aplicación: el certificado se valida por defecto y
          // DB_SSL_PERMISIVO=true lo desactiva para un proveedor con
          // certificado autofirmado.
          //
          // Aquí estaba fijado en «no validar», que es lo contrario de lo
          // que hace el resto del código y de lo que dice la documentación.
          // Y esta es la única vía de sembrar producción sin shell en el
          // contenedor: se ejecuta desde una máquina cualquiera, por
          // internet, con la contraseña de administración en el entorno.
          // Es justo la conexión que no conviene dejar sin comprobar.
          ssl: {
            rejectUnauthorized: process.env.DB_SSL_PERMISIVO !== 'true',
          },
          ...opcionesComunes,
        }
      : {
          type: 'postgres',
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432', 10),
          username: process.env.DB_USERNAME || 'servilocal_user',
          password: process.env.DB_PASSWORD || 'servilocal_dev_2026',
          database: process.env.DB_DATABASE || 'servilocal',
          ...opcionesComunes,
        },
  );

  await dataSource.initialize();
  console.log('Conexión a base de datos establecida');

  const userRepo = dataSource.getRepository(User);
  const categoryRepo = dataSource.getRepository(Category);
  const serviceRepo = dataSource.getRepository(Service);
  const bookingRepo = dataSource.getRepository(Booking);
  const reviewRepo = dataSource.getRepository(Review);

  // Limpiar datos existentes respetando el orden de dependencias
  const tablasAVaciar = [
    'payments',
    'reviews',
    'notifications',
    'messages',
    'conversations',
    'bookings',
    'services',
    'categories',
    'users',
  ];
  // audit_logs no está en la lista, y es a propósito: un historial que se
  // vacía con un script de conveniencia no prueba nada. Las entradas
  // sobreviven a la resiembra porque guardan copiado el correo de quien
  // actuó, no una clave ajena a una fila que acaba de desaparecer.
  for (const tabla of tablasAVaciar) {
    try {
      await dataSource.query('DELETE FROM ' + tabla);
    } catch {
      // La tabla puede no existir todavía; se ignora.
    }
  }
  console.log('Datos anteriores eliminados');

  const salt = await bcrypt.genSalt(10);
  const passwordCifrada = await bcrypt.hash('Password123!', salt);
  const base = { password: passwordCifrada, isEmailVerified: true };

  /**
   * El administrador con permisos reales, solo si hay una contraseña propia.
   *
   * Antes se creaba siempre con la misma contraseña que las cuentas de
   * demostración, que se publica en la pantalla de acceso. El correo está en
   * este archivo, que es público, así que cualquiera entraba con permisos
   * completos: desactivar cuentas, borrar servicios —y en cascada sus
   * reservas, pagos y reseñas— y lanzar capturas y reembolsos contra Stripe.
   * La cuenta de solo lectura no protegía nada mientras esta existiera.
   *
   * Ahora hace falta ADMIN_PASSWORD. Sin ella la siembra deja únicamente el
   * administrador de demostración, que es el que tiene que quedar en un
   * despliegue público.
   */
  const passwordAdmin = process.env.ADMIN_PASSWORD?.trim();

  if (passwordAdmin && passwordAdmin === 'Password123!') {
    throw new Error(
      'ADMIN_PASSWORD no puede ser la contraseña de demostración: es pública.',
    );
  }

  const admin = passwordAdmin
    ? userRepo.create({
        password: await bcrypt.hash(passwordAdmin, salt),
        isEmailVerified: true,
        firstName: 'Admin',
        lastName: 'ServiLocal',
        email: process.env.ADMIN_EMAIL?.trim() || 'admin@servilocal.com',
        role: UserRole.ADMIN,
      })
    : null;

  // El administrador que se publica en la pantalla de acceso. Va aparte del
  // anterior a propósito: el completo sigue existiendo para operar de verdad,
  // y el visitante recorre el panel sin poder dejarlo inservible al siguiente.
  const adminDemo = userRepo.create({
    ...base,
    firstName: 'Demo',
    lastName: 'Administración',
    email: 'demo@servilocal.com',
    role: UserRole.ADMIN,
    soloLectura: true,
  });

  const definicionClientes = [
    {
      firstName: 'Laura',
      lastName: 'Gómez',
      email: 'laura@ejemplo.com',
      city: 'Madrid',
    },
    {
      firstName: 'Pablo',
      lastName: 'Herrera',
      email: 'pablo@ejemplo.com',
      city: 'Barcelona',
    },
    {
      firstName: 'Nuria',
      lastName: 'Vidal',
      email: 'nuria@ejemplo.com',
      city: 'Valencia',
    },
  ];

  const definicionProveedores = [
    {
      clave: 'carlos',
      firstName: 'Carlos',
      lastName: 'López',
      email: 'carlos@ejemplo.com',
      city: 'Madrid',
      phone: '600 111 222',
      bio: 'Fontanero con 15 años de oficio. Urgencias de lunes a sábado en toda la zona centro.',
    },
    {
      clave: 'maria',
      firstName: 'María',
      lastName: 'Ruiz',
      email: 'maria@ejemplo.com',
      city: 'Madrid',
      phone: '600 222 333',
      bio: 'Electricista con boletín. Instalaciones, averías y certificados para vivienda y local.',
    },
    {
      clave: 'javier',
      firstName: 'Javier',
      lastName: 'Moreno',
      email: 'javier@ejemplo.com',
      city: 'Barcelona',
      phone: '600 333 444',
      bio: 'Reformas integrales de cocinas y baños. Gestiono gremios y plazos de principio a fin.',
    },
    {
      clave: 'lucia',
      firstName: 'Lucía',
      lastName: 'Serrano',
      email: 'lucia@ejemplo.com',
      city: 'Barcelona',
      phone: '600 444 555',
      bio: 'Equipo de limpieza para viviendas, oficinas y fin de obra. Productos sin lejía bajo petición.',
    },
    {
      clave: 'antonio',
      firstName: 'Antonio',
      lastName: 'Gil',
      email: 'antonio@ejemplo.com',
      city: 'Valencia',
      phone: '600 555 666',
      bio: 'Jardinería y mantenimiento de zonas verdes. Poda, riego automático y diseño de huerto urbano.',
    },
    {
      clave: 'elena',
      firstName: 'Elena',
      lastName: 'Navarro',
      email: 'elena@ejemplo.com',
      city: 'Sevilla',
      phone: '600 666 777',
      bio: 'Licenciada en Matemáticas. Refuerzo de ESO y Bachillerato y preparación de la EBAU.',
    },
    {
      clave: 'sergio',
      firstName: 'Sergio',
      lastName: 'Ibáñez',
      email: 'sergio@ejemplo.com',
      city: 'Zaragoza',
      phone: '600 777 888',
      bio: 'Cerrajero de urgencias 24 horas. Aperturas sin daños y cambio de bombines de seguridad.',
    },
    {
      clave: 'marta',
      firstName: 'Marta',
      lastName: 'Peña',
      email: 'marta@ejemplo.com',
      city: 'Málaga',
      phone: '600 888 999',
      bio: 'Diseñadora gráfica. Identidad de marca, papelería y diseño web para pequeño comercio.',
    },
    {
      clave: 'ivan',
      firstName: 'Iván',
      lastName: 'Castro',
      email: 'ivan@ejemplo.com',
      city: 'Bilbao',
      phone: '600 999 000',
      bio: 'Mudanzas locales y nacionales. Embalaje, montaje de muebles y guardamuebles.',
    },
    {
      clave: 'rocio',
      firstName: 'Rocío',
      lastName: 'Delgado',
      email: 'rocio@ejemplo.com',
      city: 'Murcia',
      phone: '601 111 222',
      bio: 'Pintura decorativa y lisa. Trabajo sin polvo y protección completa del mobiliario.',
    },
    {
      clave: 'diego',
      firstName: 'Diego',
      lastName: 'Fuentes',
      email: 'diego@ejemplo.com',
      city: 'Palma',
      phone: '601 222 333',
      bio: 'Multiservicio para alquiler vacacional: pequeñas reparaciones y puesta a punto entre reservas.',
    },
    {
      clave: 'ana',
      firstName: 'Ana',
      lastName: 'Quintero',
      email: 'ana@ejemplo.com',
      city: 'Las Palmas de Gran Canaria',
      phone: '601 333 444',
      bio: 'Limpieza y mantenimiento de viviendas y apartamentos turísticos en toda la isla.',
    },
  ];

  const clientes = definicionClientes.map((c) =>
    userRepo.create({ ...base, ...c, role: UserRole.CLIENT }),
  );
  const proveedores = definicionProveedores.map((p) =>
    userRepo.create({
      ...base,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      city: p.city,
      phone: p.phone,
      bio: p.bio,
      role: UserRole.PROVIDER,
    }),
  );

  await userRepo.save([
    ...(admin ? [admin] : []),
    adminDemo,
    ...clientes,
    ...proveedores,
  ]);

  const proveedorPorClave: Record<string, User> = {};
  definicionProveedores.forEach((p, i) => {
    proveedorPorClave[p.clave] = proveedores[i];
  });
  console.log(
    'Usuarios creados: ' +
      (admin ? '1 admin y 1 de demostración, ' : '1 admin de demostración, ') +
      clientes.length +
      ' clientes, ' +
      proveedores.length +
      ' proveedores',
  );

  const categorias = [
    {
      name: 'Fontanería',
      slug: 'fontaneria',
      description: 'Reparación e instalación de tuberías y grifería',
      icon: 'droplet',
      sortOrder: 1,
    },
    {
      name: 'Electricidad',
      slug: 'electricidad',
      description: 'Instalaciones y reparaciones eléctricas',
      icon: 'zap',
      sortOrder: 2,
    },
    {
      name: 'Limpieza',
      slug: 'limpieza',
      description: 'Servicios de limpieza doméstica y profesional',
      icon: 'sparkles',
      sortOrder: 3,
    },
    {
      name: 'Pintura',
      slug: 'pintura',
      description: 'Pintura interior y exterior',
      icon: 'paintbrush',
      sortOrder: 4,
    },
    {
      name: 'Cerrajería',
      slug: 'cerrajeria',
      description: 'Apertura de puertas y cambio de cerraduras',
      icon: 'key',
      sortOrder: 5,
    },
    {
      name: 'Clases particulares',
      slug: 'clases-particulares',
      description: 'Profesores para refuerzo y formación',
      icon: 'book',
      sortOrder: 6,
    },
    {
      name: 'Reformas',
      slug: 'reformas',
      description: 'Reformas integrales y parciales',
      icon: 'hammer',
      sortOrder: 7,
    },
    {
      name: 'Jardinería',
      slug: 'jardineria',
      description: 'Mantenimiento de jardines y espacios verdes',
      icon: 'leaf',
      sortOrder: 8,
    },
    {
      name: 'Mudanzas',
      slug: 'mudanzas',
      description: 'Servicios de mudanza y transporte',
      icon: 'truck',
      sortOrder: 9,
    },
    {
      name: 'Diseño gráfico',
      slug: 'diseno-grafico',
      description: 'Diseño de logotipos, web y material gráfico',
      icon: 'palette',
      sortOrder: 10,
    },
  ];

  const categoriaPorSlug: Record<string, Category> = {};
  for (const cat of categorias) {
    categoriaPorSlug[cat.slug] = await categoryRepo.save(
      categoryRepo.create(cat),
    );
  }
  console.log(categorias.length + ' categorías creadas');

  const definicionServicios: DefinicionServicio[] = [
    {
      proveedor: 'carlos',
      categoria: 'fontaneria',
      title: 'Reparación de fugas y grifos',
      description:
        'Detección y reparación de fugas de agua, cambio de grifos, sifones y llaves de paso. Presupuesto sin compromiso y garantía por escrito de seis meses.',
      priceMin: 40,
      priceUnit: 'por hora',
      address: 'Calle Gran Vía 32',
      city: 'Madrid',
      coverageRadiusKm: 15,
      images: [FOTOS.fontaneriaSifon],
      valoraciones: [5, 5, 4, 5, 2],
    },
    {
      proveedor: 'carlos',
      categoria: 'fontaneria',
      title: 'Instalación de sanitarios y grifería',
      description:
        'Instalación de lavabos, inodoros, bidés, platos de ducha y grifería. Incluye retirada del material antiguo y puesta en marcha.',
      priceMin: 60,
      priceMax: 150,
      priceUnit: 'por servicio',
      address: 'Calle Velázquez 85',
      city: 'Madrid',
      coverageRadiusKm: 20,
      images: [FOTOS.fontaneriaSanitario],
      valoraciones: [5, 4, 5],
    },
    {
      proveedor: 'carlos',
      categoria: 'fontaneria',
      title: 'Desatasco de tuberías y arquetas',
      description:
        'Desatascos con máquina de presión en cocinas, baños y bajantes. Inspección con cámara si el atasco se repite.',
      priceMin: 80,
      priceMax: 200,
      priceUnit: 'por servicio',
      address: 'Calle Alcalá 200',
      city: 'Madrid',
      coverageRadiusKm: 25,
      valoraciones: [4, 5],
    },
    {
      proveedor: 'diego',
      categoria: 'fontaneria',
      title: 'Urgencias de fontanería en apartamentos',
      description:
        'Servicio rápido para alquiler vacacional: fugas, cisternas y termos. Disponible también fines de semana.',
      priceMin: 55,
      priceUnit: 'por hora',
      address: 'Carrer de la Mar 18',
      city: 'Palma',
      coverageRadiusKm: 20,
      valoraciones: [5, 4, 1],
    },
    {
      proveedor: 'maria',
      categoria: 'electricidad',
      title: 'Revisión y reparación de instalación eléctrica',
      description:
        'Diagnóstico de averías, revisión del cuadro, sustitución de automáticos y comprobación de la toma de tierra. Emisión de boletín si procede.',
      priceMin: 50,
      priceUnit: 'por hora',
      address: 'Calle Fuencarral 120',
      city: 'Madrid',
      coverageRadiusKm: 15,
      images: [FOTOS.electricidadCuadro],
      valoraciones: [5, 5, 5, 4],
    },
    {
      proveedor: 'maria',
      categoria: 'electricidad',
      title: 'Instalación de puntos de luz y enchufes',
      description:
        'Colocación de puntos de luz, enchufes e interruptores, con regata y remate de yeso. Material incluido en el presupuesto.',
      priceMin: 35,
      priceMax: 90,
      priceUnit: 'por servicio',
      address: 'Calle Bravo Murillo 210',
      city: 'Madrid',
      coverageRadiusKm: 12,
      images: [FOTOS.electricidadCableado],
      valoraciones: [4, 5, 4],
    },
    {
      proveedor: 'sergio',
      categoria: 'electricidad',
      title: 'Instalación de cargador para coche eléctrico',
      description:
        'Montaje de punto de recarga en garaje comunitario o unifamiliar, con protecciones y tramitación del boletín.',
      priceMin: 450,
      priceMax: 900,
      priceUnit: 'por servicio',
      address: 'Paseo Independencia 24',
      city: 'Zaragoza',
      coverageRadiusKm: 30,
      valoraciones: [5, 5],
    },
    {
      proveedor: 'lucia',
      categoria: 'limpieza',
      title: 'Limpieza a fondo de vivienda',
      description:
        'Limpieza completa de cocina, baños, cristales interiores y suelos. Ideal antes de una entrada o después de una mudanza.',
      priceMin: 18,
      priceUnit: 'por hora',
      address: 'Carrer de Provença 240',
      city: 'Barcelona',
      coverageRadiusKm: 20,
      images: [FOTOS.limpiezaTapiceria],
      valoraciones: [5, 4, 3, 5],
    },
    {
      proveedor: 'lucia',
      categoria: 'limpieza',
      title: 'Limpieza de fin de obra',
      description:
        'Retirada de polvo de yeso, restos de pintura y adhesivos. Incluye cristales, marcos y rodapiés.',
      priceMin: 250,
      priceMax: 600,
      priceUnit: 'por servicio',
      address: 'Carrer de Sants 90',
      city: 'Barcelona',
      coverageRadiusKm: 25,
      valoraciones: [4, 5],
    },
    {
      proveedor: 'ana',
      categoria: 'limpieza',
      title: 'Mantenimiento de apartamento turístico',
      description:
        'Puesta a punto entre reservas: cambio de ropa de cama, reposición de amenidades y aviso de incidencias.',
      priceMin: 45,
      priceMax: 80,
      priceUnit: 'por servicio',
      address: 'Calle Triana 45',
      city: 'Las Palmas de Gran Canaria',
      coverageRadiusKm: 30,
      valoraciones: [5, 5, 4, 5],
    },
    {
      proveedor: 'rocio',
      categoria: 'pintura',
      title: 'Pintura de interiores',
      description:
        'Pintura lisa en paredes y techos con plástico mate. Protección de muebles y suelos, y pequeños repasos de gotelé incluidos.',
      priceMin: 8,
      priceMax: 14,
      priceUnit: 'por hora',
      address: 'Gran Vía Escultor Salzillo 12',
      city: 'Murcia',
      coverageRadiusKm: 20,
      images: [FOTOS.pinturaInterior],
      valoraciones: [5, 4, 5],
    },
    {
      proveedor: 'javier',
      categoria: 'pintura',
      title: 'Pintura de fachadas y exteriores',
      description:
        'Tratamiento de humedades, sellado de fisuras y pintura con revestimiento elástico. Trabajos en altura con medios homologados.',
      priceMin: 900,
      priceMax: 3500,
      priceUnit: 'por servicio',
      address: 'Carrer de Muntaner 150',
      city: 'Barcelona',
      coverageRadiusKm: 35,
      images: [FOTOS.pinturaFachada],
      valoraciones: [5, 5, 4],
    },
    {
      proveedor: 'sergio',
      categoria: 'cerrajeria',
      title: 'Apertura de puerta sin daños',
      description:
        'Apertura de puertas bloqueadas o con la llave dentro, sin romper la cerradura siempre que el bombín lo permita.',
      priceMin: 70,
      priceMax: 120,
      priceUnit: 'por servicio',
      address: 'Calle Alfonso I 15',
      city: 'Zaragoza',
      coverageRadiusKm: 25,
      images: [FOTOS.cerrajeriaLlave],
      valoraciones: [5, 2, 4, 5],
    },
    {
      proveedor: 'sergio',
      categoria: 'cerrajeria',
      title: 'Cambio de bombín de seguridad',
      description:
        'Sustitución por bombín antibumping y antitaladro, con juego de cinco llaves y tarjeta de propiedad.',
      priceMin: 90,
      priceMax: 180,
      priceUnit: 'por servicio',
      address: 'Calle Coso 60',
      city: 'Zaragoza',
      coverageRadiusKm: 25,
      valoraciones: [4, 5],
    },
    {
      proveedor: 'elena',
      categoria: 'clases-particulares',
      title: 'Clases de matemáticas de ESO y Bachillerato',
      description:
        'Refuerzo y preparación de exámenes con seguimiento semanal. Material propio y resumen de progreso para las familias.',
      priceMin: 20,
      priceMax: 28,
      priceUnit: 'por hora',
      address: 'Avenida de la Constitución 20',
      city: 'Sevilla',
      coverageRadiusKm: 15,
      images: [FOTOS.clasesApoyo],
      valoraciones: [5, 5, 5, 5, 4],
    },
    {
      proveedor: 'elena',
      categoria: 'clases-particulares',
      title: 'Preparación de la EBAU',
      description:
        'Plan intensivo por asignaturas con simulacros corregidos y técnicas de gestión del tiempo en el examen.',
      priceMin: 25,
      priceMax: 35,
      priceUnit: 'por hora',
      address: 'Calle Betis 8',
      city: 'Sevilla',
      coverageRadiusKm: 15,
      valoraciones: [5, 4, 5],
    },
    {
      proveedor: 'javier',
      categoria: 'reformas',
      title: 'Reforma integral de cocina',
      description:
        'Proyecto completo: demolición, fontanería, electricidad, alicatado, muebles y electrodomésticos. Plazo cerrado por contrato.',
      priceMin: 6000,
      priceMax: 18000,
      priceUnit: 'por servicio',
      address: 'Carrer de Balmes 200',
      city: 'Barcelona',
      coverageRadiusKm: 30,
      images: [FOTOS.reformasCocina],
      valoraciones: [5, 4, 5],
    },
    {
      proveedor: 'javier',
      categoria: 'reformas',
      title: 'Reforma de baño completo',
      description:
        'Cambio de bañera por plato de ducha, alicatado, sanitarios y mampara. Obra limpia y retirada de escombros incluida.',
      priceMin: 3500,
      priceMax: 9000,
      priceUnit: 'por servicio',
      address: 'Carrer de Aragó 310',
      city: 'Barcelona',
      coverageRadiusKm: 30,
      valoraciones: [5, 5, 4, 4],
    },
    {
      proveedor: 'diego',
      categoria: 'reformas',
      title: 'Pequeñas reparaciones del hogar',
      description:
        'Persianas, silicona, montaje de muebles, cuadros y estanterías. Una sola visita para varias tareas pendientes.',
      priceMin: 35,
      priceUnit: 'por hora',
      address: 'Passeig Marítim 4',
      city: 'Palma',
      coverageRadiusKm: 20,
      valoraciones: [4, 5, 3],
    },
    {
      proveedor: 'antonio',
      categoria: 'jardineria',
      title: 'Mantenimiento de jardín',
      description:
        'Siega, perfilado de bordes, poda ligera y abonado. Visitas quincenales o mensuales según temporada.',
      priceMin: 30,
      priceMax: 60,
      priceUnit: 'por visita',
      address: 'Avenida del Puerto 110',
      city: 'Valencia',
      coverageRadiusKm: 25,
      images: [FOTOS.jardineriaPoda],
      valoraciones: [5, 4, 5, 5],
    },
    {
      proveedor: 'antonio',
      categoria: 'jardineria',
      title: 'Instalación de riego automático',
      description:
        'Diseño y montaje de riego por goteo o aspersión con programador. Incluye plano de la instalación.',
      priceMin: 400,
      priceMax: 1200,
      priceUnit: 'por servicio',
      address: 'Carrer de Russafa 30',
      city: 'Valencia',
      coverageRadiusKm: 25,
      valoraciones: [5, 4],
    },
    {
      proveedor: 'ivan',
      categoria: 'mudanzas',
      title: 'Mudanza local con embalaje',
      description:
        'Camión y dos operarios, cajas y material de embalaje incluidos. Desmontaje y montaje de muebles en destino.',
      priceMin: 350,
      priceMax: 900,
      priceUnit: 'por servicio',
      address: 'Gran Vía de Don Diego López de Haro 40',
      city: 'Bilbao',
      coverageRadiusKm: 40,
      images: [FOTOS.mudanzasCajas],
      valoraciones: [5, 5, 4],
    },
    {
      proveedor: 'ivan',
      categoria: 'mudanzas',
      title: 'Portes y transporte de muebles',
      description:
        'Recogida y entrega de muebles sueltos o electrodomésticos, con subida a piso sin ascensor bajo presupuesto.',
      priceMin: 60,
      priceMax: 200,
      priceUnit: 'por servicio',
      address: 'Calle Autonomía 22',
      city: 'Bilbao',
      coverageRadiusKm: 35,
      valoraciones: [4, 3, 5],
    },
    {
      proveedor: 'marta',
      categoria: 'diseno-grafico',
      title: 'Diseño de identidad de marca',
      description:
        'Logotipo, paleta de color, tipografías y manual de uso en PDF. Incluye dos rondas de revisión.',
      priceMin: 600,
      priceMax: 1800,
      priceUnit: 'por servicio',
      address: 'Calle Larios 5',
      city: 'Málaga',
      coverageRadiusKm: 50,
      images: [FOTOS.disenoTableta],
      valoraciones: [5, 5, 5],
    },
    {
      proveedor: 'marta',
      categoria: 'diseno-grafico',
      title: 'Diseño de cartelería y papelería',
      description:
        'Carteles, folletos, tarjetas y menús listos para imprenta, con los perfiles de color y sangrados correctos.',
      priceMin: 120,
      priceMax: 450,
      priceUnit: 'por servicio',
      address: 'Avenida de Andalucía 18',
      city: 'Málaga',
      coverageRadiusKm: 50,
      valoraciones: [4, 5],
    },
  ];

  const serviciosGuardados: Service[] = [];
  for (const def of definicionServicios) {
    const { lat, lng } = CIUDADES[def.city];
    // Se dispersan ligeramente las coordenadas para que los marcadores del
    // mapa no queden apilados en el centro exacto de cada ciudad.
    const dispersion = (serviciosGuardados.length % 7) * 0.004 - 0.012;
    const punto =
      'ST_SetSRID(ST_MakePoint(' +
      (lng + dispersion) +
      ', ' +
      (lat + dispersion) +
      '), 4326)';

    const servicio = serviceRepo.create({
      providerId: proveedorPorClave[def.proveedor].id,
      categoryId: categoriaPorSlug[def.categoria].id,
      title: def.title,
      description: def.description,
      priceMin: def.priceMin,
      priceMax: def.priceMax,
      priceUnit: def.priceUnit,
      address: def.address,
      city: def.city,
      coverageRadiusKm: def.coverageRadiusKm,
      images: def.images,
      location: (() => punto) as any,
    });
    serviciosGuardados.push(await serviceRepo.save(servicio));
  }
  console.log(definicionServicios.length + ' servicios creados');

  // Reservas completadas con su valoración, para que las medias y los
  // contadores muestren datos y el filtro por valoración mínima sirva.
  let totalReservas = 0;
  let denuncias = 0;

  for (let i = 0; i < serviciosGuardados.length; i++) {
    const servicio = serviciosGuardados[i];
    const puntuaciones = definicionServicios[i].valoraciones;

    for (let j = 0; j < puntuaciones.length; j++) {
      const cliente = clientes[(i + j) % clientes.length];
      const fecha = new Date();
      fecha.setDate(fecha.getDate() - (7 * (j + 1) + i));

      const precio =
        servicio.priceMax &&
        Number(servicio.priceMax) > Number(servicio.priceMin)
          ? Math.round(
              (Number(servicio.priceMin) + Number(servicio.priceMax)) / 2,
            )
          : Number(servicio.priceMin);

      const reserva = await bookingRepo.save(
        bookingRepo.create({
          clientId: cliente.id,
          serviceId: servicio.id,
          providerId: servicio.providerId,
          status: BookingStatus.COMPLETED,
          scheduledDate: fecha,
          description: 'Trabajo solicitado a través de ServiLocal.',
          totalPrice: precio,
          confirmedAt: fecha,
          completedAt: fecha,
        }),
      );
      totalReservas++;

      const nota = puntuaciones[j];

      // Las peores se denuncian, que es el caso real: un profesional que
      // considera injusta una reseña pide que la revisen. Sin ninguna, la
      // pantalla de moderación está siempre vacía y no hay nada que enseñar.
      const denuncia =
        nota <= 2 && denuncias < DENUNCIAS.length
          ? DENUNCIAS[denuncias++]
          : null;

      const comentario =
        denuncia?.comentario ??
        (nota >= 4
          ? COMENTARIOS_BUENOS[(i + j) % COMENTARIOS_BUENOS.length]
          : COMENTARIOS_TIBIOS[(i + j) % COMENTARIOS_TIBIOS.length]);

      // Solo se responden algunas: una plataforma donde todo el mundo
      // contesta siempre daría una tasa de respuesta del cien por cien, que
      // no distingue a nadie y hace inútil la columna.
      const responde = nota < 4 || (i + j) % 3 === 0;

      await reviewRepo.save(
        reviewRepo.create({
          bookingId: reserva.id,
          clientId: cliente.id,
          serviceId: servicio.id,
          rating: nota,
          comment: comentario,
          providerResponse: responde
            ? RESPUESTAS[(i + j) % RESPUESTAS.length]
            : undefined,
          isReported: denuncia !== null,
          reportReason: denuncia?.motivo,
        }),
      );
    }

    const media =
      puntuaciones.reduce((suma, n) => suma + n, 0) / puntuaciones.length;
    await serviceRepo.update(servicio.id, {
      averageRating: Math.round(media * 100) / 100,
      totalReviews: puntuaciones.length,
    });
  }
  console.log(
    totalReservas +
      ' reservas completadas y ' +
      totalReservas +
      ' valoraciones creadas',
  );

  // El resto de estados. Sin ellos, la gráfica del panel tiene una sola
  // barra y las pantallas de «reservas recibidas» del profesional no
  // enseñan nada que resolver: ni una solicitud pendiente de contestar.
  //
  // Las que están por ocurrir llevan fecha futura y las que no llegaron a
  // ocurrir, pasada. Una solicitud pendiente con fecha del mes pasado se
  // lee como una avería, no como una demostración.
  const OTROS_ESTADOS = [
    { estado: BookingStatus.PENDING, cuantas: 5, dias: 6 },
    { estado: BookingStatus.CONFIRMED, cuantas: 4, dias: 12 },
    { estado: BookingStatus.CANCELLED, cuantas: 3, dias: -9 },
    { estado: BookingStatus.REJECTED, cuantas: 2, dias: -16 },
  ];

  let otras = 0;

  for (const { estado, cuantas, dias } of OTROS_ESTADOS) {
    for (let k = 0; k < cuantas; k++) {
      // Se reparten entre servicios distintos para que ningún profesional
      // acumule toda la actividad y las listas de los demás queden vacías.
      const servicio =
        serviciosGuardados[(otras * 3 + k) % serviciosGuardados.length];
      const cliente = clientes[(otras + k) % clientes.length];

      const fecha = new Date();
      fecha.setDate(fecha.getDate() + dias + k);
      fecha.setHours(9 + ((otras + k) % 8), 0, 0, 0);

      const precio =
        servicio.priceMax &&
        Number(servicio.priceMax) > Number(servicio.priceMin)
          ? Math.round(
              (Number(servicio.priceMin) + Number(servicio.priceMax)) / 2,
            )
          : Number(servicio.priceMin);

      const cancelada = estado === BookingStatus.CANCELLED;
      const rechazada = estado === BookingStatus.REJECTED;

      await bookingRepo.save(
        bookingRepo.create({
          clientId: cliente.id,
          serviceId: servicio.id,
          providerId: servicio.providerId,
          status: estado,
          scheduledDate: fecha,
          description: 'Trabajo solicitado a través de ServiLocal.',
          totalPrice: precio,
          // Una cancelada pasó antes por confirmada; una rechazada no llegó
          // a confirmarse nunca, así que no puede tener esa fecha.
          confirmedAt:
            estado === BookingStatus.CONFIRMED || cancelada ? fecha : undefined,
          cancelledAt: cancelada || rechazada ? fecha : undefined,
          cancellationReason: cancelada
            ? CANCELACIONES[k % CANCELACIONES.length]
            : rechazada
              ? RECHAZOS[k % RECHAZOS.length]
              : undefined,
        }),
      );
      otras++;
    }
  }

  console.log(otras + ' reservas más, repartidas por los otros cuatro estados');

  console.log('\n=== CREDENCIALES DE PRUEBA ===');
  console.log('Admin demo: demo@servilocal.com (solo lectura)');
  console.log(
    admin
      ? 'Admin real: ' + admin.email + ' (usa ADMIN_PASSWORD)'
      : 'Sin administrador con permisos reales: define ADMIN_PASSWORD si lo necesitas.',
  );
  console.log('Cliente:    laura@ejemplo.com');
  console.log('Proveedor:  carlos@ejemplo.com');
  console.log('Proveedora: elena@ejemplo.com');
  console.log(
    admin
      ? 'Las cuentas de demostración usan la contraseña Password123!'
      : 'Todas las cuentas usan la contraseña Password123!',
  );

  await dataSource.destroy();
  console.log('\nSeed completado.');
}

runSeed().catch((error) => {
  console.error('Error en seed:', error);
  process.exit(1);
});
