/**
 * Nivel atómico: Átomo
 * Componente: Avatar
 */
import clsx from 'clsx';

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-16 h-16 text-lg',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * La foto o las iniciales de alguien, siempre junto a su nombre escrito.
 *
 * Por eso no dice nada a un lector de pantalla: el nombre ya está al lado.
 * Las iniciales llevaban un aria-label, que en un elemento sin función no
 * vale, y se leían sueltas —«eme, pe»— antes de cada nombre; y la foto
 * repetía el nombre en su texto alternativo.
 */
export default function Avatar({
  src,
  name,
  size = 'md',
  className,
}: AvatarProps) {
  if (src) {
    return (
      // Se mantiene <img> a propósito: la URL del avatar la elige el usuario y
      // next/image exige declarar cada host en remotePatterns, así que un
      // dominio no previsto rompería el renderizado en lugar de degradarse.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={clsx('rounded-full object-cover', sizes[size], className)}
      />
    );
  }
  return (
    <div
      className={clsx(
        'rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-semibold',
        sizes[size],
        className,
      )}
      aria-hidden="true"
    >
      {getInitials(name)}
    </div>
  );
}
