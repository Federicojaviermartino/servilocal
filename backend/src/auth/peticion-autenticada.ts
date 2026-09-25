import type { Request } from 'express';
import type { User } from '../entities';

/**
 * Una petición que ya ha pasado el guardia de JWT: lleva al usuario que la
 * hace, cargado de la base por la estrategia.
 *
 * Solo vale en rutas con ese guardia. En una abierta no hay usuario, y
 * tiparla así sería mentir en el sitio donde más cuesta verlo.
 */
export interface PeticionAutenticada extends Request {
  user: User;
}
