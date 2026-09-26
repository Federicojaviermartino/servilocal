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
  ])('el rechazo «%s»', (codigo) => {
    expect(catalogo.erroresApi).toHaveProperty([codigo]);
  });

  it('y el campo con el que se anotan los cobros', () => {
    expect(catalogo.auditoria).toHaveProperty(['campo_reserva']);
  });
});
