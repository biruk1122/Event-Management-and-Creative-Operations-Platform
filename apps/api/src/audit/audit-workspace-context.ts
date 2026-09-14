export const AUDIT_WORKSPACE_CONTEXT_RESOLVER = Symbol(
  "AUDIT_WORKSPACE_CONTEXT_RESOLVER",
);

/** Internal lookup implemented by the module that owns the audited resource. */
export interface AuditWorkspaceContextResolver {
  resolveTaskWorkspaceContext(taskId: string): Promise<string | null>;
}
