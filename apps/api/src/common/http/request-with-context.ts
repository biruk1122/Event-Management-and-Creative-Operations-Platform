import type { Request } from "express";

import type { AuthenticatedPrincipal } from "../security/authenticated-principal.js";

export interface RequestWithContext extends Request {
  id: string;
  user?: AuthenticatedPrincipal;
}
