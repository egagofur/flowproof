import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import pc from 'picocolors';
import { chromium, firefox, webkit } from 'playwright';
import { AdapterRegistry } from '../../adapter/registry.js';
import { FlowDefinition } from '../../core/contracts/flow.js';
import { FlowLoader } from '../../core/parser/flow-loader.js';
import { ExecutorRegistry } from '../../executors/base.js';

export interface DoctorCommandOptions {
  config?: string;
  json?: boolean;
}

export interface DoctorCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

export interface DoctorResult {
  healthy: boolean;
  checks: DoctorCheck[];
}

export async function doctorCommand(options: DoctorCommandOptions): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const add = (name: string, status: DoctorCheck['status'], message: string) => {
    checks.push({ name, status, message });
  };

  let config;
  try {
    config = await AdapterRegistry.loadConfig(process.cwd(), options.config);
    add('config', 'pass', 'Configuration loaded successfully.');
  } catch (err: any) {
    add('config', 'fail', err.message);
    return finish(checks, options.json);
  }

  let flows: FlowDefinition[] = [];
  try {
    await fs.access(config.flowsDir!);
    const loaded = await FlowLoader.loadDirectory(config.flowsDir!);
    const invalid = loaded.filter((result) => !result.success);
    flows = loaded.flatMap((result) => (result.flow ? [result.flow] : []));
    if (invalid.length > 0) {
      add(
        'flows',
        'fail',
        invalid.map((result) => `${result.filePath}: ${result.errors?.join(', ')}`).join('; ')
      );
    } else if (flows.length === 0) {
      add('flows', 'warn', `No flow definitions found in ${config.flowsDir}.`);
    } else {
      add('flows', 'pass', `${flows.length} valid flow definition(s) found.`);
    }
  } catch (err: any) {
    add('flows', 'fail', `Cannot read ${config.flowsDir}: ${err.message}`);
  }

  const requiredRoles = new Set(
    flows.flatMap((flow) =>
      flow.preconditions.flatMap((precondition) =>
        precondition.authenticated_as ? [precondition.authenticated_as] : []
      )
    )
  );
  const missingRoles = [...requiredRoles].filter((role) => !config.auth?.[role]);
  add(
    'authentication',
    missingRoles.length > 0 ? 'fail' : 'pass',
    missingRoles.length > 0
      ? `Missing auth strategies for: ${missingRoles.join(', ')}.`
      : 'All referenced authentication roles are configured.'
  );

  const executorNames = new Set<string>([config.defaultExecutor || 'playwright']);
  for (const flow of flows) {
    if (flow.execution?.preferred) executorNames.add(flow.execution.preferred);
    if (flow.execution?.fallback && flow.execution.fallback !== 'none') {
      executorNames.add(flow.execution.fallback);
    }
  }
  const missingExecutors = [...executorNames].filter((name) => !ExecutorRegistry.has(name));
  add(
    'executors',
    missingExecutors.length > 0 ? 'fail' : 'pass',
    missingExecutors.length > 0
      ? `Unknown executors: ${missingExecutors.join(', ')}.`
      : `Executors available: ${[...executorNames].join(', ')}.`
  );

  const missingHandlers: string[] = [];
  for (const flow of flows) {
    for (const step of flow.steps) {
      if (step.action === 'custom') {
        const name = step.customHandler || (typeof step.target === 'string' ? step.target : undefined);
        if (!name || !config.customActions?.[name]) {
          missingHandlers.push(`${flow.id}: action ${name || '(unnamed)'}`);
        }
      }
    }
    for (const assertion of flow.assertions) {
      if (assertion.type === 'custom_assert') {
        const name = assertion.customHandler || (typeof assertion.target === 'string' ? assertion.target : undefined);
        if (!name || !config.customAssertions?.[name]) {
          missingHandlers.push(`${flow.id}: assertion ${name || '(unnamed)'}`);
        }
      }
    }
  }
  add(
    'custom-handlers',
    missingHandlers.length > 0 ? 'fail' : 'pass',
    missingHandlers.length > 0
      ? `Missing handlers: ${missingHandlers.join(', ')}.`
      : 'All referenced custom handlers are configured.'
  );

  try {
    await fs.mkdir(config.artifactsDir!, { recursive: true });
    await fs.access(config.artifactsDir!, constants.W_OK);
    add('artifacts', 'pass', `Artifact directory is writable: ${config.artifactsDir}.`);
  } catch (err: any) {
    add('artifacts', 'fail', `Artifact directory is not writable: ${err.message}`);
  }

  try {
    const browserName = config.options?.browser || 'chromium';
    const browser =
      browserName === 'firefox' ? firefox : browserName === 'webkit' ? webkit : chromium;
    const executable = browser.executablePath();
    await fs.access(executable);
    add('browser', 'pass', `${browserName} is installed at ${executable}.`);
  } catch {
    const browserName = config.options?.browser || 'chromium';
    add(
      'browser',
      'fail',
      `${browserName} is not installed. Run \`npx playwright install ${browserName}\`.`
    );
  }

  try {
    const response = await fetch(config.baseUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
    });
    add(
      'base-url',
      response.ok ? 'pass' : 'warn',
      `${config.baseUrl} responded with HTTP ${response.status}.`
    );
  } catch (err: any) {
    add('base-url', 'warn', `${config.baseUrl} is not reachable: ${err.message}`);
  }

  return finish(checks, options.json);
}

function finish(checks: DoctorCheck[], json = false): DoctorResult {
  const result = {
    healthy: checks.every((check) => check.status !== 'fail'),
    checks,
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(pc.bold('\nIntentproof Doctor\n'));
    for (const check of checks) {
      const marker =
        check.status === 'pass'
          ? pc.green('✓')
          : check.status === 'warn'
            ? pc.yellow('!')
            : pc.red('✗');
      console.log(`${marker} ${pc.bold(check.name)}: ${check.message}`);
    }
    console.log('');
  }

  if (!result.healthy) {
    process.exitCode = 1;
  }
  return result;
}
