import fs from 'node:fs/promises';
import { AuthStrategy } from './base.js';
import { ExecutionContext, AuthResult } from '../../core/contracts/context.js';

export interface ExistingBrowserSessionOptions {
  storageStatePath?: string;
  getStorageStatePath?: (role: string) => string;
}

export class ExistingBrowserSessionAuthStrategy implements AuthStrategy {
  public readonly name = 'ExistingBrowserSession';

  constructor(private options: ExistingBrowserSessionOptions) {}

  public async authenticate(_context: ExecutionContext, role: string): Promise<AuthResult> {
    try {
      const filePath =
        this.options.getStorageStatePath?.(role) ||
        this.options.storageStatePath ||
        `.auth/${role}-state.json`;

      const content = await fs.readFile(filePath, 'utf-8');
      const storageState = JSON.parse(content);

      return {
        success: true,
        credentials: {
          role,
          storageState,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Could not load existing browser session for role '${role}': ${err.message}`,
      };
    }
  }
}
