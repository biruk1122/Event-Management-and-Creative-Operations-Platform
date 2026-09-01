import { SetMetadata } from "@nestjs/common";

export const REQUIRED_PERMISSIONS_KEY = "required-permissions";

export const RequirePermissions = (
  ...permissions: string[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
