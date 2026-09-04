import { Module } from "@nestjs/common";

import { AuthAuditService } from "./auth-audit.service.js";
import { AuthCookies } from "./auth-cookies.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { AccessTokenService } from "./domain/access-token.service.js";
import { PasswordHasher } from "./domain/password-hasher.js";
import { AccessTokenGuard } from "./guards/access-token.guard.js";
import { CsrfGuard } from "./guards/csrf.guard.js";
import { AuthRepository } from "./infrastructure/auth.repository.js";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    PasswordHasher,
    AccessTokenService,
    AuthCookies,
    AuthAuditService,
    AccessTokenGuard,
    CsrfGuard,
  ],
  exports: [AccessTokenGuard],
})
export class AuthModule {}
