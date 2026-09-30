'use client';
import { useCallback, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';

type Campo = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Mensajes propios de un formulario, por campo y por regla incumplida. */
export type MensajesPropios = Record<
  string,
  Partial<Record<Exclude<keyof ValidityState, 'valid'>, string>>
>;

const esCampo = (elemento: Element): elemento is Campo =>
  elemento instanceof HTMLInputElement ||
  elemento instanceof HTMLSelectElement ||
  elemento instanceof HTMLTextAreaElement;

/**
 * Los errores de un formulario, en el idioma de la página.
 *
 * La validación era la del navegador: en la página catalana, el aviso de un
 * campo vacío salía en el idioma del navegador, en un globo que desaparece
 * y que no todos los lectores de pantalla anuncian. Ahora el formulario va
 * con noValidate y, al enviarlo, se leen las mismas reglas que ya declaraban
 * los campos (required, min, type="email"...): cada error sale junto a su
 * campo, traducido, y el foco va al primero.
 *
 * Los campos se reconocen por su atributo name.
 */
export function useValidacion() {
  const t = useTranslations('validacion');
  const formato = useFormatter();
  const idioma = useLocale();
  const [errores, setErrores] = useState<Record<string, string>>({});

  const mensajeDe = useCallback(
    (campo: Campo): string => {
      const validez = campo.validity;
      // Con el formateador del navegador y no con el de next-intl, que pide
      // una zona horaria que el cliente no tiene configurada: es una fecha
      // del calendario, sin hora.
      const fecha = (valor: string) =>
        new Date(`${valor}T00:00:00`).toLocaleDateString(idioma, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
      const numero = (valor: string) =>
        campo.type === 'number' ? formato.number(Number(valor)) : valor;

      if (validez.valueMissing) return t('obligatorio');
      if (validez.typeMismatch) {
        return campo.type === 'email' ? t('correo') : t('formato');
      }
      if (validez.tooShort && 'minLength' in campo) {
        return t('corto', { minimo: campo.minLength });
      }
      if (validez.tooLong && 'maxLength' in campo) {
        return t('largo', { maximo: campo.maxLength });
      }
      if (validez.rangeUnderflow && 'min' in campo) {
        return campo.type === 'date'
          ? t('fechaMinima', { fecha: fecha(campo.min) })
          : t('minimo', { minimo: numero(campo.min) });
      }
      if (validez.rangeOverflow && 'max' in campo) {
        return campo.type === 'date'
          ? t('fechaMaxima', { fecha: fecha(campo.max) })
          : t('maximo', { maximo: numero(campo.max) });
      }
      return t('formato');
    },
    [t, formato, idioma],
  );

  /**
   * Comprueba el formulario; si hay errores, los pinta y enfoca el primero.
   * Un formulario puede explicar mejor una regla suya: por qué un precio no
   * puede bajar de 0,50, por ejemplo.
   */
  const comprobar = useCallback(
    (formulario: HTMLFormElement, propios: MensajesPropios = {}): boolean => {
      const nuevos: Record<string, string> = {};
      let primero: Campo | null = null;
      for (const elemento of Array.from(formulario.elements)) {
        if (!esCampo(elemento) || !elemento.name) continue;
        if (elemento.validity.valid) continue;
        const suyos = propios[elemento.name] ?? {};
        const regla = (Object.keys(suyos) as Array<keyof typeof suyos>).find(
          (clave) => elemento.validity[clave],
        );
        nuevos[elemento.name] = regla
          ? (suyos[regla] as string)
          : mensajeDe(elemento);
        primero ??= elemento;
      }
      setErrores(nuevos);
      primero?.focus();
      return primero === null;
    },
    [mensajeDe],
  );

  /** Al corregir un campo, su error se va. */
  const limpiar = useCallback((nombre: string) => {
    setErrores((actuales) => {
      if (!(nombre in actuales)) return actuales;
      const resto = { ...actuales };
      delete resto[nombre];
      return resto;
    });
  }, []);

  /** En el onChange del formulario: el campo que cambia pierde su error. */
  const alCambiar = (evento: { target: unknown }) => {
    const nombre = (evento.target as { name?: unknown }).name;
    if (typeof nombre === 'string') limpiar(nombre);
  };

  /** Para un campo que no es Input: lo que lo une a su mensaje. */
  const describir = (nombre: string, id: string) => ({
    'aria-invalid': errores[nombre] ? true : undefined,
    'aria-describedby': errores[nombre] ? `${id}-error` : undefined,
  });

  return { errores, comprobar, limpiar, alCambiar, describir };
}
