import { ExecutionContext, AuthResult } from '../../core/contracts/context.js';

export interface AuthStrategy {
  readonly name: string;
  authenticate(context: ExecutionContext, role: string): Promise<AuthResult>;
}
