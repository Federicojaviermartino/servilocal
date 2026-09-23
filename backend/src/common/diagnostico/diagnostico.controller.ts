import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  Req,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { visitanteReenviado } from '../proxy-frontend';

/**
 * Qué llega de verdad al contenedor detrás del proxy.
 *
 * Existe porque el limitador de peticiones usa `req.ip` como clave y hay
 * medidas de que esa clave no es el visitante: un mismo cliente cae en dos
 * contadores que se alternan, lo que apunta a que `trust proxy` está mal
 * ajustado y `req.ip` acaba siendo un balanceador. Render no documenta
 * cuántos saltos mete ni si sanea X-Forwarded-For, así que el único camino
 * honesto es medirlo en el propio despliegue.
 *
 * Apagado de fábrica. Sin DIAGNOSTICO_TOKEN responde 404, igual que una ruta
 * que no existe: no anuncia que existe algo apagado. Se enciende poniendo la
 * variable, se mide y se quita.
 *
 * Va con testigo y no detrás del rol de administrador a propósito: la cuenta
 * de administración es pública en la pantalla de acceso, así que protegerlo
 * con ella sería no protegerlo. Y esto enseña la topología de la red.
 */
@ApiExcludeController()
@Controller('diagnostico')
export class DiagnosticoController {
  @Get('ip')
  ip(
    @Req() req: Request,
    @Headers('x-diagnostico') testigo?: string,
  ): Record<string, unknown> {
    const esperado = process.env.DIAGNOSTICO_TOKEN;
    if (!esperado || testigo !== esperado) {
      throw new NotFoundException();
    }

    return {
      // El número de entradas menos uno es el valor correcto de trust proxy.
      xForwardedFor: req.headers['x-forwarded-for'] ?? null,
      // Si alguna de estas tres llega con la IP real, hay atajo. Hay que
      // comprobar además que el cliente no pueda sobrescribirla.
      cfConnectingIp: req.headers['cf-connecting-ip'] ?? null,
      trueClientIp: req.headers['true-client-ip'] ?? null,
      xRealIp: req.headers['x-real-ip'] ?? null,
      cfRay: req.headers['cf-ray'] ?? null,
      socketRemoteAddress: req.socket.remoteAddress ?? null,
      reqIp: req.ip ?? null,
      reqIps: req.ips ?? [],
      trustProxy: req.app.get('trust proxy'),
      // Si la petición pasó por el frontend y este se identificó con el
      // secreto, la dirección que manda; si no, null. Llamado a través del
      // frontend tiene que salir la IP de quien llama, no la del servidor.
      visitanteDelProxy: visitanteReenviado(req.headers),
    };
  }
}
