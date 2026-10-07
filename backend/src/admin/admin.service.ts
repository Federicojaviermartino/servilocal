import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type SelectQueryBuilder } from 'typeorm';
import {
  Booking,
  BookingStatus,
  Category,
  Payment,
  PaymentStatus,
  Review,
  Service,
  User,
  UserRole,
} from '../entities';

/** Una fila de «cuántos hay de cada cosa». */
interface Recuento {
  clave: string;
  total: number;
}

export interface PuntoSemana {
  /** Lunes de la semana, en ISO. */
  semana: string;
  reservas: number;
  facturado: number;
}

export interface Metricas {
  usuarios: { total: number; porRol: Recuento[]; inactivos: number };
  servicios: {
    total: number;
    activos: number;
    sinFoto: number;
    porCategoria: Recuento[];
    porCiudad: Recuento[];
  };
  reservas: {
    total: number;
    porEstado: Recuento[];
    facturado: number;
    /** Doce semanas, incluidas las vacías. */
    porSemana: PuntoSemana[];
  };
  valoraciones: {
    total: number;
    media: number | null;
    porNota: Recuento[];
    reportadas: number;
    sinResponder: number;
  };
  categorias: { total: number; sinServicios: number };
}

export interface ReputacionProveedor {
  proveedorId: string;
  nombre: string;
  ciudad: string | null;
  activo: boolean;
  servicios: number;
  serviciosActivos: number;
  valoraciones: number;
  media: number | null;
  reservasCompletadas: number;
  tasaRespuesta: number | null;
}

/** Cuántas semanas enseña la serie. */
const SEMANAS = 12;

/** Fecha en ISO corto, que es como la devuelve la consulta. */
function enIso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/**
 * Lunes de hace n semanas, en UTC.
 *
 * Lunes porque es donde corta date_trunc('week') de PostgreSQL: calcularlo de
 * otra forma desplazaría las etiquetas un día respecto a los datos y los
 * huecos se rellenarían en la semana equivocada.
 */
function lunesHace(semanas: number): Date {
  const hoy = new Date();
  const fecha = new Date(
    Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()),
  );
  // getUTCDay(): 0 es domingo, así que el domingo retrocede seis días.
  const desdeLunes = (fecha.getUTCDay() + 6) % 7;
  fecha.setUTCDate(fecha.getUTCDate() - desdeLunes - semanas * 7);
  return fecha;
}

/**
 * Agregados del panel de administración.
 *
 * Existe porque el panel se descargaba la lista entera de usuarios, la de
 * categorías y la de valoraciones reportadas solo para contar longitudes en el
 * navegador. Eso ya era lento con la semilla y es inviable con datos reales,
 * además de mandar al cliente información que no necesita para pintar un número.
 *
 * Todo se resuelve con agregaciones en la base de datos. Ninguna consulta
 * devuelve filas de detalle.
 */
@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly usuarios: Repository<User>,
    @InjectRepository(Service)
    private readonly servicios: Repository<Service>,
    @InjectRepository(Booking)
    private readonly reservas: Repository<Booking>,
    @InjectRepository(Review)
    private readonly valoraciones: Repository<Review>,
    @InjectRepository(Category)
    private readonly categorias: Repository<Category>,
  ) {}

  /** Convierte el resultado crudo de un GROUP BY en filas tipadas. */
  private aRecuentos(filas: { clave: unknown; total: string }[]): Recuento[] {
    return filas
      .filter((f) => f.clave !== null)
      .map((f) => ({ clave: String(f.clave), total: Number(f.total) }));
  }

  /**
   * Rellena las semanas sin reservas.
   *
   * Un GROUP BY solo devuelve las semanas que tienen filas. Pintarlas tal cual
   * uniría el 3 de agosto con el 24 como si fueran contiguos, y una gráfica
   * que se salta los huecos miente sobre la tendencia.
   */
  private completarSemanas(
    filas: { semana: string; reservas: string; facturado: string }[],
  ): PuntoSemana[] {
    const porClave = new Map(filas.map((f) => [f.semana, f]));

    return Array.from({ length: SEMANAS }, (_, i) => {
      const semana = enIso(lunesHace(SEMANAS - 1 - i));
      const fila = porClave.get(semana);
      return {
        semana,
        reservas: Number(fila?.reservas ?? 0),
        facturado: Number(fila?.facturado ?? 0),
      };
    });
  }

  /**
   * Los agregados del panel.
   *
   * Con `soloDemostracion`, solo los de su mundo: ver soloVeLaDemostracion.
   * Daba los de toda la plataforma, también lo cobrado de verdad y cuántas
   * cuentas reales hay, a quien entra con una contraseña que está publicada.
   * Como las cuentas de demostración no reservan ni valoran fuera de su
   * mundo, basta con mirar de quién es cada cosa: el servicio, de su
   * profesional; la reserva y la valoración, de su cliente. Las categorías
   * son las mismas para todos.
   */
  async metricas({
    soloDemostracion = false,
  }: { soloDemostracion?: boolean } = {}): Promise<Metricas> {
    const suyo = soloDemostracion ? { esDemostracion: true } : {};
    const deSuProfesional = soloDemostracion ? { provider: suyo } : {};
    const deSuCliente = soloDemostracion ? { client: suyo } : {};
    /** Lo mismo, para las consultas que se construyen a mano. */
    const acotar = <T extends object>(
      consulta: SelectQueryBuilder<T>,
      relacion: string,
    ) =>
      soloDemostracion
        ? consulta.innerJoin(relacion, 'mundo', 'mundo.esDemostracion = true')
        : consulta;

    const [
      totalUsuarios,
      usuariosInactivos,
      porRol,
      totalServicios,
      serviciosActivos,
      serviciosSinFoto,
      porCategoria,
      porCiudad,
      totalReservas,
      porEstado,
      facturado,
      porSemana,
      totalValoraciones,
      mediaGlobal,
      porNota,
      reportadas,
      sinResponder,
      totalCategorias,
      categoriasSinServicios,
    ] = await Promise.all([
      this.usuarios.count({ where: suyo }),
      this.usuarios.count({ where: { isActive: false, ...suyo } }),
      this.usuarios
        .createQueryBuilder('u')
        .select('u.role', 'clave')
        .addSelect('COUNT(*)', 'total')
        .where(soloDemostracion ? 'u.esDemostracion = true' : '1 = 1')
        .groupBy('u.role')
        .getRawMany(),

      this.servicios.count({ where: deSuProfesional }),
      this.servicios.count({ where: { isActive: true, ...deSuProfesional } }),
      acotar(this.servicios.createQueryBuilder('s'), 's.provider')
        // images es simple-array: TypeORM lo guarda como texto separado por
        // comas, no como array de Postgres, así que «sin foto» es nulo o vacío.
        .where("(s.images IS NULL OR s.images = '')")
        .getCount(),
      acotar(this.servicios.createQueryBuilder('s'), 's.provider')
        .leftJoin('s.category', 'c')
        .select('c.name', 'clave')
        .addSelect('COUNT(*)', 'total')
        .where('s.isActive = true')
        .groupBy('c.name')
        .orderBy('COUNT(*)', 'DESC')
        .getRawMany(),
      acotar(this.servicios.createQueryBuilder('s'), 's.provider')
        .select('s.city', 'clave')
        .addSelect('COUNT(*)', 'total')
        .where('s.isActive = true')
        .groupBy('s.city')
        .orderBy('COUNT(*)', 'DESC')
        .getRawMany(),

      this.reservas.count({ where: deSuCliente }),
      acotar(this.reservas.createQueryBuilder('b'), 'b.client')
        .select('b.status', 'clave')
        .addSelect('COUNT(*)', 'total')
        .groupBy('b.status')
        .getRawMany(),
      // Lo cobrado de verdad: pagos capturados y no devueltos. Sumaba el
      // precio de cada reserva completada, también de las completadas sin
      // cobro y de las que luego se reembolsaron.
      acotar(this.reservas.createQueryBuilder('b'), 'b.client')
        .leftJoin(Payment, 'p', 'p.bookingId = b.id')
        .select('COALESCE(SUM(p.amount), 0)', 'suma')
        .where('p.status = :cobrado', { cobrado: PaymentStatus.COMPLETED })
        .getRawOne(),

      // Se agrupa por scheduledDate y no por createdAt: createdAt es cuándo
      // se registró la reserva y en la semilla es el mismo instante para
      // todas, así que daría una sola columna. Lo que interesa además es
      // cuándo se presta el servicio.
      acotar(this.reservas.createQueryBuilder('b'), 'b.client')
        .select(
          "to_char(date_trunc('week', b.scheduledDate), 'YYYY-MM-DD')",
          'semana',
        )
        .leftJoin(Payment, 'p', 'p.bookingId = b.id AND p.status = :cobrado', {
          cobrado: PaymentStatus.COMPLETED,
        })
        .addSelect('COUNT(*)', 'reservas')
        .addSelect('COALESCE(SUM(p.amount), 0)', 'facturado')
        .where('b.scheduledDate >= :desde', { desde: lunesHace(SEMANAS - 1) })
        .groupBy("date_trunc('week', b.scheduledDate)")
        .getRawMany(),

      this.valoraciones.count({ where: deSuCliente }),
      acotar(this.valoraciones.createQueryBuilder('r'), 'r.client')
        .select('AVG(r.rating)', 'media')
        .getRawOne(),
      acotar(this.valoraciones.createQueryBuilder('r'), 'r.client')
        .select('r.rating', 'clave')
        .addSelect('COUNT(*)', 'total')
        .groupBy('r.rating')
        .orderBy('r.rating', 'DESC')
        .getRawMany(),
      this.valoraciones.count({
        where: { isReported: true, ...deSuCliente },
      }),
      acotar(this.valoraciones.createQueryBuilder('r'), 'r.client')
        .where('r.providerResponse IS NULL')
        .getCount(),

      this.categorias.count(),
      this.categorias
        .createQueryBuilder('c')
        .leftJoin('services', 's', 's."categoryId" = c.id')
        .where('s.id IS NULL')
        .getCount(),
    ]);

    const media = mediaGlobal?.media ? Number(mediaGlobal.media) : null;

    return {
      usuarios: {
        total: totalUsuarios,
        porRol: this.aRecuentos(porRol),
        inactivos: usuariosInactivos,
      },
      servicios: {
        total: totalServicios,
        activos: serviciosActivos,
        sinFoto: serviciosSinFoto,
        porCategoria: this.aRecuentos(porCategoria),
        porCiudad: this.aRecuentos(porCiudad),
      },
      reservas: {
        total: totalReservas,
        porEstado: this.aRecuentos(porEstado),
        facturado: Number(facturado?.suma ?? 0),
        porSemana: this.completarSemanas(porSemana),
      },
      valoraciones: {
        total: totalValoraciones,
        media: media === null ? null : Math.round(media * 100) / 100,
        porNota: this.aRecuentos(porNota),
        reportadas,
        sinResponder,
      },
      categorias: {
        total: totalCategorias,
        sinServicios: categoriasSinServicios,
      },
    };
  }

  /**
   * Reputación por profesional.
   *
   * Hasta ahora `averageRating` y `totalReviews` vivían dentro de cada
   * servicio, así que quien publicaba tres tenía tres reputaciones y ninguna
   * suya. Para decidir a quién promocionar o a quién desactivar hace falta el
   * agregado de la persona, y eso no existía en ninguna pantalla.
   *
   * Con `soloDemostracion`, solo los de la demostración y con el apellido
   * acortado, como en el resto del panel: ver soloVeLaDemostracion. El
   * nombre llegaba ya unido, y la máscara de datos personales, que busca
   * `lastName`, no lo reconocía.
   */
  async reputacion({
    soloDemostracion = false,
  }: { soloDemostracion?: boolean } = {}): Promise<ReputacionProveedor[]> {
    const consulta = this.usuarios
      .createQueryBuilder('u')
      .select('u.id', 'proveedorId')
      .addSelect('u.firstName', 'nombre')
      .addSelect('u.lastName', 'apellidos')
      .addSelect('u.city', 'ciudad')
      .addSelect('u.isActive', 'activo')
      .addSelect(
        '(SELECT COUNT(*) FROM services s WHERE s."providerId" = u.id)',
        'servicios',
      )
      .addSelect(
        '(SELECT COUNT(*) FROM services s WHERE s."providerId" = u.id AND s."isActive" = true)',
        'serviciosActivos',
      )
      .addSelect(
        '(SELECT COUNT(*) FROM reviews r JOIN services s ON s.id = r."serviceId" WHERE s."providerId" = u.id)',
        'valoraciones',
      )
      // Media sobre todas las valoraciones de la persona, no la media de las
      // medias: un servicio con una sola valoración de cinco no puede pesar
      // igual que otro con veinte.
      .addSelect(
        '(SELECT AVG(r.rating) FROM reviews r JOIN services s ON s.id = r."serviceId" WHERE s."providerId" = u.id)',
        'media',
      )
      .addSelect(
        `(SELECT COUNT(*) FROM bookings b WHERE b."providerId" = u.id AND b.status = '${BookingStatus.COMPLETED}')`,
        'reservasCompletadas',
      )
      .addSelect(
        '(SELECT COUNT(*) FROM reviews r JOIN services s ON s.id = r."serviceId" WHERE s."providerId" = u.id AND r."providerResponse" IS NOT NULL)',
        'respondidas',
      )
      .where('u.role = :rol', { rol: UserRole.PROVIDER });
    if (soloDemostracion) consulta.andWhere('u.esDemostracion = true');
    const filas = await consulta.getRawMany();

    return filas
      .map((f) => {
        const valoraciones = Number(f.valoraciones);
        const respondidas = Number(f.respondidas);
        const apellidos = String(f.apellidos ?? '');
        const inicial = apellidos.charAt(0);
        return {
          proveedorId: f.proveedorId,
          nombre: [
            f.nombre,
            soloDemostracion ? inicial && `${inicial}.` : apellidos,
          ]
            .filter(Boolean)
            .join(' '),
          ciudad: f.ciudad,
          activo: Boolean(f.activo),
          servicios: Number(f.servicios),
          serviciosActivos: Number(f.serviciosActivos),
          valoraciones,
          media:
            f.media === null ? null : Math.round(Number(f.media) * 100) / 100,
          reservasCompletadas: Number(f.reservasCompletadas),
          tasaRespuesta:
            valoraciones === 0
              ? null
              : Math.round((respondidas / valoraciones) * 100),
        };
      })
      .sort((a, b) => {
        // Sin valoraciones no hay reputación que ordenar: van al final.
        if (a.media === null && b.media === null) return 0;
        if (a.media === null) return 1;
        if (b.media === null) return -1;
        return b.media - a.media || b.valoraciones - a.valoraciones;
      });
  }
}
