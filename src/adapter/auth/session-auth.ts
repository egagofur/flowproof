import { AuthStrategy } from './base.js';
import { ExecutionContext, AuthResult } from '../../core/contracts/context.js';

export interface SessionAuthOptions {
  storageKey?: string;
  cookieName?: string;
  getToken: (role: string) => Promise<string> | string;
}

export class SessionAuthStrategy implements AuthStrategy {
  public readonly name = 'SessionAuth';

  constructor(private options: SessionAuthOptions) {}

  public async authenticate(context: ExecutionContext, role: string): Promise<AuthResult> {
    try {
      const token = await this.options.getToken(role);
      if (!token) {
        return {
          success: false,
          error: `No token provided for role '${role}'`,
        };
      }

      const domain = new URL(context.baseUrl).hostname;
      const cookieName = this.options.cookieName || 'session_token';

      return {
        success: true,
        credentials: {
          role,
          token,
          cookies: [
            {
              name: cookieName,
              value: token,
              domain,
              path: '/',
            },
          ],
          storageState: {
            origins: [
              {
                origin: context.baseUrl,
                localStorage: this.options.storageKey
                  ? [
                      {
                        name: this.options.storageKey,
                        value: token,
                      },
                    ]
                  : [],
              },
            ],
          },
        },
      };
    } catch (err: any) {
      return {
        success: false,
        error: `SessionAuth error: ${err.message}`,
      };
    }
  }
}
