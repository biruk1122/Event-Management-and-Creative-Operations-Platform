export interface AuthenticatedPrincipal {
  userId: string;
  sessionId: string;
  permissions: ReadonlySet<string>;
}
