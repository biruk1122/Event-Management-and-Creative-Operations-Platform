/**
 * Placeholder sign-out handler for the authentication UI.
 *
 * IAM-05 (EVE-43) replaces this with a real `POST /api/v1/auth/logout` call
 * (CSRF header plus cookie clearing) followed by a redirect to `/login`.
 */
export const signOut = (): Promise<void> => Promise.resolve();
