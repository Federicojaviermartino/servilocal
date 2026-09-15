import { notFound } from 'next/navigation';

/**
 * Recoge cualquier ruta que no exista dentro de un idioma. Sin esto el 404 se
 * pintaría fuera del layout con idioma, sin cabecera ni pie y siempre en
 * español.
 */
export default function RutaInexistente() {
  notFound();
}
