import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Sustitutos de Link, useRouter y usePathname que conservan el idioma activo
 * al navegar. Importar los de next/navigation haría perder el prefijo.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
