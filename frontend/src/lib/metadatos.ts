import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

/**
 * Los metadatos de una página privada: su título, en el idioma de la
 * página, y que no se indexe.
 *
 * Las páginas del panel, las de acceso y la administración son componentes
 * de cliente y no pueden exportar metadatos, así que todas heredaban el
 * título de la portada. El anunciador de rutas de Next solo habla cuando el
 * título cambia: al pasar de una sección del panel a otra, un lector de
 * pantalla no decía nada (WCAG 2.4.2), y las pestañas y el historial eran
 * indistinguibles. Cada ruta lo aporta con un layout de servidor.
 */
export function paginaPrivada(seccion: string, clave: string) {
  return async function generateMetadata({
    params,
  }: {
    params: Promise<{ locale: string }>;
  }): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: seccion as never });
    return {
      title: t(clave as never),
      robots: { index: false, follow: false },
      // Sin canónica: heredaban la de la portada, que es decir que son la
      // misma página. No se indexan, pero tampoco tienen por qué mentir.
      alternates: null,
    };
  };
}
