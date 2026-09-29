// Lo que devuelve importar una imagen, como los iconos del mapa. Next lo
// declara en next-env.d.ts, pero ese fichero lo genera al compilar y no está
// en el repositorio: la CI comprueba los tipos antes de compilar, y sin esto
// no encontraba ningún .png.
/// <reference types="next/image-types/global" />
