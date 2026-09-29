import { ValidateIf } from 'class-validator';

/**
 * Opcional, pero no nulo: el campo puede no venir, y si viene se valida.
 *
 * @IsOptional deja pasar también null, y en una columna que no lo admite ese
 * null llegaba a la base, que lo rechazaba con un 500, o a un trim que no lo
 * esperaba. Para los campos de edición cuya columna es obligatoria; los que
 * sí admiten null siguen con @IsOptional.
 */
export const SiSeEnvia = () =>
  ValidateIf((_objeto: object, valor: unknown) => valor !== undefined);
