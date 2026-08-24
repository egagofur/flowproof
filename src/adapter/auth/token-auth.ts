import { AuthStrategy } from './base.js';
import { ExecutionContext, AuthResult } from '../../core/contracts/context.js';

export interface TokenAuthOptions {
  headerName?: string;
  prefix?: string;
  getToken: (role: string) => Promise<string> | string;
}

export class TokenAuthStrategy implements AuthStrategy {
  public readonly name = 'TokenAuth';

  constructor(private options: TokenAuthOptions) {}

  public async authenticate(_context: ExecutionContext, role: string): Promise<AuthResult> {
    try {
      const rawToken = await this.options.getToken(role);
      if (!rawToken) {
        return {
          success: false,
          error: `No token provided for role '${role}'`,
        };
      }

      const headerName = this.options.headerName || 'Authorization';
      const prefix = this.options.prefix !== undefined ? this.options.prefix : 'Bearer ';
      const headerValue = `${prefix}${rawToken}`.trim();

      return {
        success: true,
        credentials: {
          role,
          token: rawToken,
          headers: {
            [headerName]: headerValue,
          },
        },
      };
    } catch (err: any) {
      return {
        success: false,
        error: `TokenAuth error: ${err.message}`,
      };
    }
  }
}
