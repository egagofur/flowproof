import { BrowserExecutor, ExecutorRegistry } from './base.js';
import { FlowDefinition } from '../core/contracts/flow.js';
import { ExecutionContext } from '../core/contracts/context.js';
import { ExecutionResult } from '../core/contracts/result.js';

export class HybridExecutor implements BrowserExecutor {
  public readonly name = 'hybrid';

  public async initialize(_context: ExecutionContext): Promise<void> {
    // Initialized per sub-executor
  }

  public async execute(flow: FlowDefinition, context: ExecutionContext): Promise<ExecutionResult> {
    const preferredName =
      context.options.executor === 'hybrid'
        ? flow.execution?.preferred || 'playwright'
        : context.options.executor ||
          flow.execution?.preferred ||
          process.env.FLOWPROOF_BROWSER_EXECUTOR ||
          'playwright';

    const fallbackName = flow.execution?.fallback || (preferredName === 'playwright' ? 'aside' : undefined);
    const preferredExecutor = ExecutorRegistry.get(preferredName);

    await preferredExecutor.initialize(context);
    try {
      const result = await preferredExecutor.execute(flow, context);

      // If passed or no fallback allowed, return immediately
      if (result.status === 'PROVEN' || !fallbackName || fallbackName === 'none') {
        return result;
      }

      // Check if failure is an eligible UI drift / stale selector failure
      const isEligibleForFallback =
        result.status === 'FAILED' &&
        (result.error?.includes('was not visible') ||
          result.error?.includes('waiting for locator') ||
          result.error?.includes('not found') ||
          result.error?.includes('timeout') ||
          (flow.execution?.fallbackOn && flow.execution.fallbackOn.length > 0));

      if (isEligibleForFallback && ExecutorRegistry.has(fallbackName)) {
        const fallbackExecutor = ExecutorRegistry.get(fallbackName);
        await fallbackExecutor.initialize(context);
        try {
          const fallbackResult = await fallbackExecutor.execute(flow, context);

          // If fallback agent succeeded where deterministic executor failed, return fallback result with diagnostic hint
          if (fallbackResult.status === 'PROVEN') {
            return {
              ...fallbackResult,
              executor: `hybrid(${preferredName} -> ${fallbackName})`,
              rawConsoleLogs: [
                ...(result.rawConsoleLogs || []),
                {
                  type: 'hybrid_fallback',
                  text: `Preferred executor '${preferredName}' failed with: ${result.error}. Fallback executor '${fallbackName}' succeeded adaptively.`,
                  time: new Date().toISOString(),
                },
                ...(fallbackResult.rawConsoleLogs || []),
              ],
            };
          }

          return {
            ...result,
            error: `${result.error} (Fallback '${fallbackName}' also failed: ${fallbackResult.error})`,
          };
        } finally {
          await fallbackExecutor.cleanup();
        }
      }

      return result;
    } finally {
      await preferredExecutor.cleanup();
    }
  }

  public async cleanup(): Promise<void> {}
}
