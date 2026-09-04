import { Injectable } from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id password hashing. `@node-rs/argon2` defaults to Argon2id with
 * OWASP-recommended parameters (m=19456 KiB, t=2, p=1); the parameters are
 * encoded in the hash string, so tuning them later does not invalidate existing
 * credentials.
 */
@Injectable()
export class PasswordHasher {
  hash(plainText: string): Promise<string> {
    return hash(plainText);
  }

  async verify(passwordHash: string, plainText: string): Promise<boolean> {
    try {
      return await verify(passwordHash, plainText);
    } catch {
      return false;
    }
  }
}
