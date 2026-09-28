import { Global, Module } from '@nestjs/common';
import { CorreoService } from './correo.service';

/**
 * Global por lo mismo que el historial: lo usa quien lo necesite sin que
 * cada módulo tenga que importarlo.
 */
@Global()
@Module({
  providers: [CorreoService],
  exports: [CorreoService],
})
export class CorreoModule {}
