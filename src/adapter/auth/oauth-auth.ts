import { AuthStrategy } from './base.js';
import { ExecutionContext, AuthResult } from '../../core/contracts/context.js';

export interface OAuthAuthOptions {
  getOAuthTokens: (role: string) => Promise<{ accessToken: string; idToken?: string; refreshToken?: string }>;
  tokenHeader?: string;
}

export class OAuthAuthStrategy implements AuthStrategy {
  public readonly name = 'OAuthAuth';

  constructor(private options: OAuthAuthOptions) {}

  public async authenticate(_context: ExecutionContext, role: string): Promise<AuthResult> {
    try {
      const tokens = await this.options.getOAuthTokens(role);
      if (!tokens.accessToken) {
        return {
          success: false,
          error: `No OAuth access token returned for role '${role}'`,
        };
      }

      const headerName = this.options.tokenHeader || 'Authorization';

      return {
        success: true,
        credentials: {
          role,
          token: tokens.accessToken,
          headers: {
            [headerName]: `Bearer ${tokens.accessToken}`,
          },
          customState: tokens,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        error: `OAuth authentication failed: ${err.message}`,
      };
    }
  }
}
