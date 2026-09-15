import { ar, ca, de, enUS, es, eu, fr, gl, it, pt } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import type { Idioma } from '@/i18n/routing';

/**
 * date-fns trae sus propios catálogos para las fechas relativas («hace dos
 * horas»), independientes de los de la interfaz. Esta tabla los empareja.
 */
const LOCALES: Record<Idioma, Locale> = {
  es,
  en: enUS,
  ca,
  gl,
  eu,
  fr,
  de,
  it,
  pt,
  ar,
};

export const localeDeFecha = (idioma: string): Locale =>
  LOCALES[idioma as Idioma] ?? es;
