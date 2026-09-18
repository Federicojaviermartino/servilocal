import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegistroAuditoria } from '../entities';
import { AuditoriaController } from './auditoria.controller';
import { AuditoriaService } from './auditoria.service';

/**
 * Global porque lo anotan sitios que no se conocen entre sí —usuarios,
 * valoraciones, categorías— y hacer que cada uno importe el módulo sería
 * repetir la misma línea en todos sin ganar aislamiento.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([RegistroAuditoria])],
  controllers: [AuditoriaController],
  providers: [AuditoriaService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
