import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  PUBLICO_SERVICIO,
  PUBLICO_USUARIO,
  PUBLICO_VALORACION,
} from './instantanea';

/**
 * Lo que tiene quien prueba la demostración para ver sus cambios. Se calcula
 * en la base, con su reloj: las fechas son timestamp sin zona escritas por
 * ella, y un límite mandado desde un proceso en otra zona se corría horas.
 */
const LIMITE = `now() - interval '1 hour'`;

/**
 * Las filas de un UPDATE o un DELETE con RETURNING. TypeORM no las devuelve
 * solas, sino junto al recuento, [filas, recuento]: sin esto, cada recuento
 * salía 2 y la lista de servicios que había que recalcular, vacía.
 */
function filasDe<T>(resultado: unknown): T[] {
  return (
    Array.isArray(resultado) && Array.isArray(resultado[0])
      ? resultado[0]
      : resultado
  ) as T[];
}

export interface ResumenRestauracion {
  servicios: number;
  perfiles: number;
  valoraciones: number;
  retirados: number;
}

/**
 * Devuelve la demostración a como la dejó la semilla.
 *
 * Las contraseñas de las cuentas de demostración están en la pantalla de
 * acceso: cualquiera podía reescribir el catálogo que ven todos, crear
 * servicios o dejar reseñas. Se les deja hacerlo todo, que es lo que enseña
 * la aplicación, y a la hora se deshace: lo cambiado vuelve a la copia de
 * «demostracion_original», lo que crearon desaparece o se retira, y las
 * valoraciones que escribieron se borran, recalculando la media.
 *
 * Solo lo que lleva más de una hora sin tocarse: quien lo está probando
 * sigue viendo sus cambios mientras tanto. Todo en una transacción.
 */
@Injectable()
export class DemostracionService {
  constructor(private readonly dataSource: DataSource) {}

  async restaurar(): Promise<ResumenRestauracion> {
    return this.dataSource.transaction(async (gestor) => {
      const servicios = await this.servicios(gestor);
      const retirados = await this.creadosPorLaDemostracion(gestor);
      const perfiles = await this.perfiles(gestor);
      const valoraciones = await this.valoraciones(gestor);
      return { servicios, perfiles, valoraciones, retirados };
    });
  }

  /** Los servicios sembrados, como eran. También los que se retiraron. */
  private async servicios(gestor: EntityManager): Promise<number> {
    const filas: unknown[] = filasDe(
      await gestor.query(
        `UPDATE services s SET
         title = d.datos->>'title',
         description = d.datos->>'description',
         "categoryId" = (d.datos->>'categoryId')::uuid,
         "priceMin" = (d.datos->>'priceMin')::numeric,
         "priceMax" = (d.datos->>'priceMax')::numeric,
         "priceUnit" = d.datos->>'priceUnit',
         "durationMinutes" = (d.datos->>'durationMinutes')::int,
         address = d.datos->>'address',
         city = d.datos->>'city',
         location = ST_SetSRID(ST_GeomFromGeoJSON(d.datos->>'location'), 4326),
         "coverageRadiusKm" = (d.datos->>'coverageRadiusKm')::int,
         images = d.datos->>'images',
         "isActive" = (d.datos->>'isActive')::boolean,
         "withdrawnAt" = (d.datos->>'withdrawnAt')::timestamp,
         "updatedAt" = now()
       FROM "demostracion_original" d
       WHERE d.entidad = 'servicio' AND d.id = s.id
         AND s."updatedAt" < ${LIMITE}
         AND ${PUBLICO_SERVICIO} IS DISTINCT FROM d.datos
       RETURNING s.id`,
      ),
    );
    return filas.length;
  }

  /**
   * Lo que publicaron las cuentas de demostración: se borra, o se retira si
   * ya tiene reservas, que son historial de otras cuentas de la demostración.
   */
  private async creadosPorLaDemostracion(
    gestor: EntityManager,
  ): Promise<number> {
    const nuevos = `FROM users p
       WHERE p.id = s."providerId" AND p."esDemostracion"
         AND s."createdAt" < ${LIMITE}
         AND NOT EXISTS (
           SELECT 1 FROM "demostracion_original" d
           WHERE d.entidad = 'servicio' AND d.id = s.id)`;
    const retirados: unknown[] = filasDe(
      await gestor.query(
        `UPDATE services s SET "isActive" = false, "withdrawnAt" = now(),
         "updatedAt" = now()
       ${nuevos}
         AND s."withdrawnAt" IS NULL
         AND EXISTS (SELECT 1 FROM bookings b WHERE b."serviceId" = s.id)
       RETURNING s.id`,
      ),
    );
    const borrados: unknown[] = filasDe(
      await gestor.query(
        `DELETE FROM services s USING ${nuevos.slice('FROM '.length)}
         AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b."serviceId" = s.id)
       RETURNING s.id`,
      ),
    );
    return retirados.length + borrados.length;
  }

  /** El nombre, la biografía y lo demás de cada cuenta, como eran. */
  private async perfiles(gestor: EntityManager): Promise<number> {
    const filas: unknown[] = filasDe(
      await gestor.query(
        `UPDATE users u SET
         "firstName" = d.datos->>'firstName',
         "lastName" = d.datos->>'lastName',
         bio = d.datos->>'bio',
         "avatarUrl" = d.datos->>'avatarUrl',
         phone = d.datos->>'phone',
         city = d.datos->>'city',
         address = d.datos->>'address',
         "postalCode" = d.datos->>'postalCode',
         "updatedAt" = now()
       FROM "demostracion_original" d
       WHERE d.entidad = 'usuario' AND d.id = u.id
         AND u."updatedAt" < ${LIMITE}
         AND ${PUBLICO_USUARIO} IS DISTINCT FROM d.datos
       RETURNING u.id`,
      ),
    );
    return filas.length;
  }

  /**
   * Las valoraciones que escribieron se borran, y a las sembradas se les
   * devuelve la respuesta y la denuncia que tenían. La media de cada
   * servicio tocado se vuelve a calcular.
   */
  private async valoraciones(gestor: EntityManager): Promise<number> {
    const borradas: Array<{ serviceId: string }> = filasDe(
      await gestor.query(
        `DELETE FROM reviews r USING users c
       WHERE c.id = r."clientId" AND c."esDemostracion"
         AND r."createdAt" < ${LIMITE}
         AND NOT EXISTS (
           SELECT 1 FROM "demostracion_original" d
           WHERE d.entidad = 'valoracion' AND d.id = r.id)
       RETURNING r."serviceId"`,
      ),
    );
    const restauradas: unknown[] = filasDe(
      await gestor.query(
        `UPDATE reviews r SET
         "providerResponse" = d.datos->>'providerResponse',
         "isReported" = (d.datos->>'isReported')::boolean,
         "reportReason" = d.datos->>'reportReason',
         "updatedAt" = now()
       FROM "demostracion_original" d
       WHERE d.entidad = 'valoracion' AND d.id = r.id
         AND r."updatedAt" < ${LIMITE}
         AND ${PUBLICO_VALORACION} IS DISTINCT FROM d.datos
       RETURNING r.id`,
      ),
    );

    const tocados = [...new Set(borradas.map((fila) => fila.serviceId))];
    if (tocados.length > 0) {
      await gestor.query(
        `UPDATE services s SET
           "averageRating" = COALESCE(
             (SELECT avg(rating) FROM reviews r WHERE r."serviceId" = s.id), 0),
           "totalReviews" =
             (SELECT count(*) FROM reviews r WHERE r."serviceId" = s.id)
         WHERE s.id = ANY($1)`,
        [tocados],
      );
    }
    return borradas.length + restauradas.length;
  }
}
