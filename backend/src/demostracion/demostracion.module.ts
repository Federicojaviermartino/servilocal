import { Module } from '@nestjs/common';
import { DemostracionService } from './demostracion.service';
import { ProgramadorDemostracion } from './programador-demostracion';

/** La demostración que se restaura sola: ver DemostracionService. */
@Module({
  providers: [DemostracionService, ProgramadorDemostracion],
})
export class DemostracionModule {}
