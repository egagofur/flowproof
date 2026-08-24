import { VerificationResult } from '../core/contracts/result.js';

export class JsonReporter {
  public static format(result: VerificationResult | VerificationResult[]): string {
    return JSON.stringify(result, null, 2);
  }
}
