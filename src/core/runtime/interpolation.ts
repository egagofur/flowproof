import { randomUUID } from 'node:crypto';
import type { FlowDefinition } from '../contracts/flow.js';

const VARIABLE_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_.-]*)\}/g;
const SECRET_KEY_PATTERN = /(secret|password|token|key|auth|credential)/i;

export interface RuntimeVariableOptions {
  runId?: string;
  now?: Date;
  env?: Record<string, string | undefined>;
  fixtureValues?: Record<string, unknown>;
}

export interface ResolvedRuntime {
  flow: FlowDefinition;
  variables: Record<string, unknown>;
  secretVariableNames: string[];
}

export function createRuntimeBuiltins(options: RuntimeVariableOptions = {}): Record<string, unknown> {
  const now = options.now ?? new Date();
  return {
    runId: options.runId ?? randomUUID(),
    currentDate: now.toISOString().slice(0, 10),
    currentDateTime: now.toISOString().replace(/[:.]/g, '-'),
    ...options.fixtureValues,
  };
}

export function resolveFlowRuntime(
  flow: FlowDefinition,
  options: RuntimeVariableOptions = {}
): ResolvedRuntime {
  const env = options.env ?? process.env;
  const variables = createRuntimeBuiltins(options);
  const definitions = flow.variables ?? {};
  const unresolved = new Map(Object.entries(definitions));

  for (let pass = 0; pass <= unresolved.size && unresolved.size > 0; pass += 1) {
    let progressed = false;
    for (const [name, value] of unresolved) {
      try {
        variables[name] = interpolateValue(value, variables, env);
        unresolved.delete(name);
        progressed = true;
      } catch (error) {
        if (!(error instanceof MissingVariableError)) throw error;
      }
    }
    if (!progressed) break;
  }

  if (unresolved.size > 0) {
    const names = [...unresolved.keys()].sort().join(', ');
    throw new Error(`Unable to resolve flow variable(s): ${names}. Check for missing variables or cycles.`);
  }

  const interpolated = interpolateValue(flow, variables, env) as FlowDefinition;
  return {
    flow: interpolated,
    variables,
    secretVariableNames: Object.keys(variables).filter((name) => SECRET_KEY_PATTERN.test(name)),
  };
}

class MissingVariableError extends Error {}

export function interpolateValue(
  value: unknown,
  variables: Record<string, unknown>,
  env: Record<string, string | undefined> = process.env
): unknown {
  if (typeof value === 'string') return interpolateString(value, variables, env);
  if (Array.isArray(value)) return value.map((item) => interpolateValue(item, variables, env));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, interpolateValue(item, variables, env)])
    );
  }
  return value;
}

function interpolateString(
  input: string,
  variables: Record<string, unknown>,
  env: Record<string, string | undefined>
): unknown {
  const exact = input.match(/^\$\{([A-Za-z_][A-Za-z0-9_.-]*)\}$/);
  if (exact) return lookup(exact[1], variables, env);

  return input.replace(VARIABLE_PATTERN, (_match, name: string) => {
    const resolved = lookup(name, variables, env);
    if (resolved === null || typeof resolved === 'object') {
      throw new Error(`Variable '${name}' cannot be embedded into a string`);
    }
    return String(resolved);
  });
}

function lookup(
  name: string,
  variables: Record<string, unknown>,
  env: Record<string, string | undefined>
): unknown {
  if (name.startsWith('env.')) {
    const envName = name.slice(4);
    const value = env[envName];
    if (value === undefined) throw new MissingVariableError(`Environment variable '${envName}' is not defined`);
    return value;
  }
  if (!(name in variables)) throw new MissingVariableError(`Variable '${name}' is not defined`);
  const value = variables[name];
  if (value === undefined) throw new MissingVariableError(`Variable '${name}' is undefined`);
  return value;
}
