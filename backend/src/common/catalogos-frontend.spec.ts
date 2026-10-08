import { readFileSync } from 'fs';
import { resolve } from 'path';
import { AccionAuditada, NotificationType } from '../entities';
import {
  CODIGO_ANTES_DE_LA_FECHA,
  CODIGO_FECHA_LEJANA,
  CODIGO_FECHA_PASADA,
  CODIGO_SOLAPE,
} from './calendario';
import { CODIGO_RESERVAS_ABIERTAS } from '../services/services.service';
import {
  CODIGO_CONTRASENA_INCORRECTA,
  CODIGO_CORREO_EN_USO,
  CODIGO_CREDENCIALES,
  CODIGO_CUENTA_CON_RESERVAS,
  CODIGO_CUENTA_DEMOSTRACION,
  CODIGO_CUENTA_DESACTIVADA,
  CODIGO_ENLACE_NO_VALIDO,
} from './cuenta';
import { CODIGO_CORREO_NO_DISPONIBLE } from '../correo/correo.service';
import {
  CODIGO_PAGO_EN_OTRO_ESTADO,
  CODIGO_PAGOS_NO_DISPONIBLES,
  CODIGO_TARJETA_RECHAZADA,
} from './filters/errores-de-stripe';
import { CODIGO_CUENTA_FRENADA } from './redis/freno-de-cuentas';
import { CODIGO_CONTRASENA_COMUN } from './contrasenas-comunes';
import { CODIGO_CANCELACION_TARDIA } from '../bookings/bookings.service';
import { CODIGO_CATEGORIA_CON_SERVICIOS } from '../categories/categories.service';
import {
  CODIGO_NADA_QUE_PAGAR,
  CODIGO_PAGO_EN_CURSO,
  CODIGO_RESERVA_NO_PAGABLE,
} from '../payments/payments.service';

/**
 * Lo que la API nombra y el frontend tiene que saber decir.
 *
 * La API guarda el tipo de un aviso, el nombre de una acción del historial
 * o el código de un rechazo, nunca la frase: la compone quien lo lee, en su
 * idioma. Si aquí aparece un nombre nuevo y el catálogo no lo conoce, nada
 * falla: el aviso sale como «Tienes un aviso nuevo», la acción con su
 * nombre en crudo y el rechazo con un «no se ha podido» que no explica
 * nada. Esta prueba es la que se entera. Basta con el castellano: la de los
 * catálogos del frontend ya exige las mismas claves en todos los idiomas.
 */
const catalogo = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../frontend/messages/es.json'),
    'utf-8',
  ),
) as Record<string, Record<string, string>>;

describe('Lo que la API nombra tiene texto en el frontend', () => {
  it.each(Object.values(NotificationType))('el aviso «%s»', (tipo) => {
    expect(catalogo.avisos).toHaveProperty([tipo]);
  });

  it.each(Object.values(AccionAuditada))(
    'la acción del historial «%s»',
    (accion) => {
      expect(catalogo.auditoria).toHaveProperty([accion]);
    },
  );

  it.each([
    CODIGO_FECHA_PASADA,
    CODIGO_FECHA_LEJANA,
    CODIGO_ANTES_DE_LA_FECHA,
    CODIGO_SOLAPE,
    CODIGO_RESERVAS_ABIERTAS,
    CODIGO_CONTRASENA_INCORRECTA,
    CODIGO_CUENTA_CON_RESERVAS,
    CODIGO_CUENTA_DEMOSTRACION,
    CODIGO_ENLACE_NO_VALIDO,
    CODIGO_CORREO_NO_DISPONIBLE,
    CODIGO_CORREO_EN_USO,
    CODIGO_CREDENCIALES,
    CODIGO_CUENTA_DESACTIVADA,
    CODIGO_RESERVA_NO_PAGABLE,
    CODIGO_NADA_QUE_PAGAR,
    CODIGO_PAGO_EN_CURSO,
    CODIGO_PAGOS_NO_DISPONIBLES,
    CODIGO_TARJETA_RECHAZADA,
    CODIGO_PAGO_EN_OTRO_ESTADO,
    CODIGO_CUENTA_FRENADA,
    CODIGO_CONTRASENA_COMUN,
    CODIGO_CANCELACION_TARDIA,
    CODIGO_CATEGORIA_CON_SERVICIOS,
  ])('el rechazo «%s»', (codigo) => {
    expect(catalogo.erroresApi).toHaveProperty([codigo]);
  });

  it('y el campo con el que se anotan los cobros', () => {
    expect(catalogo.auditoria).toHaveProperty(['campo_reserva']);
  });
});
