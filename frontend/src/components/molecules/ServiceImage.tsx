/**
 * Nivel atómico: Molécula
 * Componente: ServiceImage (foto del servicio con marcador de posición)
 *
 * Cuando un servicio no tiene foto, en lugar de un hueco gris con el texto
 * "Sin imagen" se muestra el icono de su categoría sobre un fondo tintado.
 * Se ve intencionado en vez de roto, y funciona igual para los servicios
 * que publiquen los profesionales, que rara vez suben imágenes.
 */
import Image from 'next/image';
import {
  Droplet,
  Zap,
  Sparkles,
  Paintbrush,
  Key,
  BookOpen,
  Hammer,
  Leaf,
  Truck,
  Palette,
  Wrench,
  LucideIcon,
} from 'lucide-react';

const iconosPorCategoria: Record<string, LucideIcon> = {
  droplet: Droplet,
  zap: Zap,
  sparkles: Sparkles,
  paintbrush: Paintbrush,
  key: Key,
  book: BookOpen,
  hammer: Hammer,
  leaf: Leaf,
  truck: Truck,
  palette: Palette,
};

interface ServiceImageProps {
  src?: string;
  alt: string;
  categoryIcon?: string;
  /** Ancho que ocupará la imagen según el ancho de pantalla, para el srcset. */
  sizes: string;
  /** Solo en la imagen principal de la ficha: evita que se cargue perezosa. */
  priority?: boolean;
  iconSize?: number;
}

export default function ServiceImage({
  src,
  alt,
  categoryIcon,
  sizes,
  priority = false,
  iconSize = 48,
}: ServiceImageProps) {
  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
      />
    );
  }

  const Icono = (categoryIcon && iconosPorCategoria[categoryIcon]) || Wrench;

  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 text-primary-400 dark:from-primary-900/40 dark:to-primary-800/40 dark:text-primary-300">
      <Icono size={iconSize} strokeWidth={1.5} aria-hidden="true" />
    </div>
  );
}
