import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { ZodError } from 'zod';
import {
  FlowDefinition,
  FlowDefinitionSchema,
} from '../contracts/flow.js';

export interface FlowLoadResult {
  flow?: FlowDefinition;
  filePath: string;
  success: boolean;
  errors?: string[];
}

export class FlowLoader {
  /**
   * Load and validate a single flow definition file (YAML or JSON).
   */
  public static async loadFile(filePath: string): Promise<FlowDefinition> {
    const raw = await fs.readFile(filePath, 'utf-8');
    return this.parseString(raw, filePath);
  }

  /**
   * Parse and validate raw YAML or JSON string content.
   */
  public static parseString(content: string, sourcePath = 'inline'): FlowDefinition {
    let parsed: unknown;
    try {
      if (sourcePath.endsWith('.json') || (content.trim().startsWith('{') && !sourcePath.endsWith('.yaml') && !sourcePath.endsWith('.yml'))) {
        parsed = JSON.parse(content);
      } else {
        parsed = YAML.parse(content);
      }
    } catch (err: any) {
      throw new Error(`Failed to parse flow definition from ${sourcePath}: ${err.message}`);
    }

    try {
      const validated = FlowDefinitionSchema.parse(parsed);
      return this.normalizeFlow(validated, sourcePath);
    } catch (err) {
      if (err instanceof ZodError) {
        const issues = err.issues
          .map((i) => `  - [${i.path.join('.')}]: ${i.message}`)
          .join('\n');
        throw new Error(`Flow schema validation failed for ${sourcePath}:\n${issues}`);
      }
      throw err;
    }
  }

  /**
   * Load all flow definitions from a directory recursively.
   */
  public static async loadDirectory(dirPath: string): Promise<FlowLoadResult[]> {
    const results: FlowLoadResult[] = [];

    async function walk(currentDir: string) {
      let entries: string[];
      try {
        entries = await fs.readdir(currentDir);
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry);
        const stat = await fs.stat(fullPath);

        if (stat.isDirectory()) {
          await walk(fullPath);
        } else if (
          entry.endsWith('.yaml') ||
          entry.endsWith('.yml') ||
          entry.endsWith('.json')
        ) {
          try {
            const flow = await FlowLoader.loadFile(fullPath);
            results.push({
              flow,
              filePath: fullPath,
              success: true,
            });
          } catch (err: any) {
            results.push({
              filePath: fullPath,
              success: false,
              errors: [err.message],
            });
          }
        }
      }
    }

    await walk(dirPath);
    return results;
  }

  /**
   * Normalize flow with default IDs and step/assertion indices.
   */
  private static normalizeFlow(flow: FlowDefinition, sourcePath: string): FlowDefinition {
    const steps = flow.steps.map((step, index) => ({
      ...step,
      id: step.id || `step-${index + 1}`,
    }));

    const assertions = flow.assertions.map((assertion, index) => ({
      ...assertion,
      id: assertion.id || `assert-${index + 1}`,
    }));

    const checkpoints = flow.evidence.checkpoints.map((cp, index) => ({
      ...cp,
      id: cp.id || `checkpoint-${index + 1}`,
    }));

    return {
      ...flow,
      steps,
      assertions,
      evidence: {
        ...flow.evidence,
        checkpoints,
      },
      source: flow.source && flow.source.length > 0 ? flow.source : [sourcePath],
    };
  }
}
