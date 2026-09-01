import { Global, Module } from "@nestjs/common";

import { ENVIRONMENT, environment } from "./environment.js";

@Global()
@Module({
  exports: [ENVIRONMENT],
  providers: [{ provide: ENVIRONMENT, useValue: environment }],
})
export class EnvironmentModule {}
