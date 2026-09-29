/**
 * Lo público de la demostración, como se guarda y como se compara.
 *
 * Una copia de lo que cualquiera ve de las cuentas de demostración —sus
 * servicios, sus perfiles y lo que hay en sus valoraciones— tal como lo dejó
 * la semilla. La restauración horaria compara con ella y deshace lo que haya
 * cambiado: ver DemostracionService. La migración DemostracionOriginal tiene
 * su propia copia de estas expresiones, para no depender de que esto cambie.
 */

/** Lo público de un servicio, con alias «s». */
export const PUBLICO_SERVICIO = `jsonb_build_object(
  'title', s.title,
  'description', s.description,
  'categoryId', s."categoryId",
  'priceMin', s."priceMin",
  'priceMax', s."priceMax",
  'priceUnit', s."priceUnit",
  'durationMinutes', s."durationMinutes",
  'address', s.address,
  'city', s.city,
  'location', ST_AsGeoJSON(s.location)::jsonb,
  'coverageRadiusKm', s."coverageRadiusKm",
  'images', s.images,
  'isActive', s."isActive",
  'withdrawnAt', s."withdrawnAt"
)`;

/** Lo que se ve de una cuenta, con alias «u». */
export const PUBLICO_USUARIO = `jsonb_build_object(
  'firstName', u."firstName",
  'lastName', u."lastName",
  'bio', u.bio,
  'avatarUrl', u."avatarUrl",
  'phone', u.phone,
  'city', u.city,
  'address', u.address,
  'postalCode', u."postalCode"
)`;

/** Lo que puede cambiar de una valoración ya escrita, con alias «r». */
export const PUBLICO_VALORACION = `jsonb_build_object(
  'providerResponse', r."providerResponse",
  'isReported', r."isReported",
  'reportReason', r."reportReason"
)`;

/** Guarda la copia de lo que hay ahora: la semilla, al acabar. */
export const GUARDAR_INSTANTANEA = [
  `DELETE FROM "demostracion_original"`,
  `INSERT INTO "demostracion_original" ("entidad", "id", "datos")
   SELECT 'servicio', s.id, ${PUBLICO_SERVICIO}
   FROM services s JOIN users p ON p.id = s."providerId"
   WHERE p."esDemostracion"`,
  `INSERT INTO "demostracion_original" ("entidad", "id", "datos")
   SELECT 'usuario', u.id, ${PUBLICO_USUARIO}
   FROM users u WHERE u."esDemostracion"`,
  `INSERT INTO "demostracion_original" ("entidad", "id", "datos")
   SELECT 'valoracion', r.id, ${PUBLICO_VALORACION}
   FROM reviews r JOIN users c ON c.id = r."clientId"
   WHERE c."esDemostracion"`,
];
