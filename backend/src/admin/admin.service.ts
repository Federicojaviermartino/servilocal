import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Booking,
  BookingStatus,
  Category,
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

export interface Metricas {
  usuarios: { total: number; porRol: Recuento[]; inactivos: number };
  servicios: {
    total: number;
    activos: number;
    sinFoto: number;
    porCategoria: Recuento[];
    porCiudad: Recuento[];
  };
  reservas: { total: number; porEstado: Recuento[]; facturado: number };
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

  async metricas(): Promise<Metricas> {
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
      totalValoraciones,
      mediaGlobal,
      porNota,
      reportadas,
      sinResponder,
      totalCategorias,
      categoriasSinServicios,
    ] = await Promise.all([
      this.usuarios.count(),
      this.usuarios.count({ where: { isActive: false } }),
      this.usuarios
        .createQueryBuilder('u')
        .select('u.role', 'clave')
        .addSelect('COUNT(*)', 'total')
        .groupBy('u.role')
        .getRawMany(),

      this.servicios.count(),
      this.servicios.count({ where: { isActive: true } }),
      this.servicios
        .createQueryBuilder('s')
        // images es simple-array: TypeORM lo guarda como texto separado por
        // comas, no como array de Postgres, así que «sin foto» es nulo o vacío.
        .where("s.images IS NULL OR s.images = ''")
        .getCount(),
      this.servicios
        .createQueryBuilder('s')
        .leftJoin('s.category', 'c')
        .select('c.name', 'clave')
        .addSelect('COUNT(*)', 'total')
        .where('s.isActive = true')
        .groupBy('c.name')
        .orderBy('COUNT(*)', 'DESC')
        .getRawMany(),
      this.servicios
        .createQueryBuilder('s')
        .select('s.city', 'clave')
        .addSelect('COUNT(*)', 'total')
        .where('s.isActive = true')
        .groupBy('s.city')
        .orderBy('COUNT(*)', 'DESC')
        .getRawMany(),

      this.reservas.count(),
      this.reservas
        .createQueryBuilder('b')
        .select('b.status', 'clave')
        .addSelect('COUNT(*)', 'total')
        .groupBy('b.status')
        .getRawMany(),
      this.reservas
        .createQueryBuilder('b')
        .select('COALESCE(SUM(b.totalPrice), 0)', 'suma')
        .where('b.status = :estado', { estado: BookingStatus.COMPLETED })
        .getRawOne(),

      this.valoraciones.count(),
      this.valoraciones
        .createQueryBuilder('r')
        .select('AVG(r.rating)', 'media')
        .getRawOne(),
      this.valoraciones
        .createQueryBuilder('r')
        .select('r.rating', 'clave')
        .addSelect('COUNT(*)', 'total')
        .groupBy('r.rating')
        .orderBy('r.rating', 'DESC')
        .getRawMany(),
      this.valoraciones.count({ where: { isReported: true } }),
      this.valoraciones
        .createQueryBuilder('r')
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
   */
  async reputacion(): Promise<ReputacionProveedor[]> {
    const filas = await this.usuarios
      .createQueryBuilder('u')
      .select('u.id', 'proveedorId')
      .addSelect("u.firstName || ' ' || u.lastName", 'nombre')
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
      .where('u.role = :rol', { rol: UserRole.PROVIDER })
      .getRawMany();

    return filas
      .map((f) => {
        const valoraciones = Number(f.valoraciones);
        const respondidas = Number(f.respondidas);
        return {
          proveedorId: f.proveedorId,
          nombre: f.nombre,
          ciudad: f.ciudad,
          activo: Boolean(f.activo),
          servicios: Number(f.servicios),
          serviciosActivos: Number(f.serviciosActivos),
          valoraciones,
          media: f.media === null ? null : Math.round(Number(f.media) * 100) / 100,
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
