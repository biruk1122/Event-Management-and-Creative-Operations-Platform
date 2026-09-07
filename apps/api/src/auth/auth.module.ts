import { Module } from "@nestjs/common";

import { PermissionsModule } from "../common/security/permissions.module.js";
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
  imports: [PermissionsModule],
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
  // NestJS resolves a guard used via `@UseGuards(ClassRef)` in the DI scope
  // of the module that declares the *consuming* controller, not the module
  // that declares the guard. RbacModule and UsersModule use AccessTokenGuard
  // and CsrfGuard, so every one of their constructor dependencies must be
  // exported too, not just the guard classes themselves. `PasswordHasher` is
  // exported for UsersModule, which sets an operator-chosen initial password.
  exports: [
    AccessTokenGuard,
    AccessTokenService,
    AuthCookies,
    AuthRepository,
    CsrfGuard,
    PasswordHasher,
  ],
})
export class AuthModule {}
