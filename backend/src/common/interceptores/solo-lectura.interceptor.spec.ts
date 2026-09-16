import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { of } from 'rxjs';
import { SoloLecturaInterceptor } from './solo-lectura.interceptor';

function contexto(method: string, user?: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, user }) }),
  } as unknown as ExecutionContext;
}

const siguiente: CallHandler = { handle: () => of('ok') };

describe('SoloLecturaInterceptor', () => {
  const interceptor = new SoloLecturaInterceptor();
  const demo = { id: 'u1', soloLectura: true };
  const normal = { id: 'u2', soloLectura: false };

  describe('cuenta de demostración', () => {
    it.each(['GET', 'HEAD', 'OPTIONS'])('deja pasar %s', (metodo) => {
      expect(() =>
        interceptor.intercept(contexto(metodo, demo), siguiente),
      ).not.toThrow();
    });

    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('bloquea %s', (metodo) => {
      expect(() =>
        interceptor.intercept(contexto(metodo, demo), siguiente),
      ).toThrow(ForbiddenException);
    });

    it('bloquea también un método que no existe hoy', () => {
      // Se deniega por método y no por lista de rutas: cualquier verbo que no
      // sea de lectura queda fuera sin tener que enumerarlo.
      expect(() =>
        interceptor.intercept(contexto('PROPFIND', demo), siguiente),
      ).toThrow(ForbiddenException);
    });
  });

  it('no estorba a una cuenta normal', () => {
    expect(() =>
      interceptor.intercept(contexto('DELETE', normal), siguiente),
    ).not.toThrow();
  });

  it('no estorba a una ruta pública, que no tiene usuario', () => {
    // Iniciar sesión es un POST sin usuario todavía resuelto: si esto fallara,
    // nadie podría entrar en la aplicación.
    expect(() =>
      interceptor.intercept(contexto('POST', undefined), siguiente),
    ).not.toThrow();
  });
});
