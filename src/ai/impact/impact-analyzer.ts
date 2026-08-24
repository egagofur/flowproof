import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { FlowDefinition } from '../../core/contracts/flow.js';

const execAsync = promisify(exec);

export interface AffectedFlowImpact {
  flow: FlowDefinition;
  impactScore: number; // 0.0 - 1.0
  confidence: number; // 0.0 - 1.0
  matchedSignals: string[];
  reason: string;
}

export class ChangeImpactAnalyzer {
  /**
   * Get list of changed files from Git against HEAD~1 or origin/main.
   */
  public static async getChangedFiles(
    cwd = process.cwd(),
    baseRef = 'HEAD~1'
  ): Promise<string[]> {
    try {
      // Check if uncommitted staged/unstaged changes exist first
      const { stdout: statusOut } = await execAsync('git status --porcelain', { cwd });
      if (statusOut.trim().length > 0) {
        const lines = statusOut.split('\n').filter(Boolean);
        return lines.map((l) => l.slice(3).trim());
      }

      // Check git diff against baseRef
      const { stdout: diffOut } = await execAsync(`git diff --name-only ${baseRef}`, { cwd });
      return diffOut.split('\n').filter(Boolean);
    } catch {
      // Fallback if git is not initialized or ref fails
      return [];
    }
  }

  /**
   * Analyze which flows are affected by changed files.
   */
  public static analyzeImpact(
    flows: FlowDefinition[],
    changedFiles: string[]
  ): AffectedFlowImpact[] {
    if (changedFiles.length === 0) {
      return [];
    }

    const affected: AffectedFlowImpact[] = [];

    for (const flow of flows) {
      const signals: string[] = [];
      let score = 0;

      // Signal 1: Flow source files match changed files
      if (flow.source) {
        for (const src of flow.source) {
          if (changedFiles.some((f) => f.includes(src) || src.includes(f))) {
            signals.push(`Flow source specification changed (${src})`);
            score += 0.5;
            break;
          }
        }
      }

      // Signal 2: Feature tags match changed file paths or directory names
      for (const tag of flow.tags) {
        const matchedFiles = changedFiles.filter(
          (f) => f.toLowerCase().includes(tag.toLowerCase())
        );
        if (matchedFiles.length > 0) {
          signals.push(`Changed files in tag scope '${tag}': ${matchedFiles.join(', ')}`);
          score += 0.4;
          break;
        }
      }

      // Signal 3: Precondition route matches changed route / component files
      for (const pre of flow.preconditions) {
        if (pre.route) {
          const routeClean = pre.route.replace(/^\/|\/$/g, '').toLowerCase();
          if (routeClean) {
            const matchedRouteFiles = changedFiles.filter((f) =>
              f.toLowerCase().includes(routeClean)
            );
            if (matchedRouteFiles.length > 0) {
              signals.push(`Route /${routeClean} files modified: ${matchedRouteFiles.join(', ')}`);
              score += 0.35;
              break;
            }
          }
        }
      }

      // Signal 4: Flow ID matches path component
      const flowIdParts = flow.id.split('.');
      for (const part of flowIdParts) {
        if (part.length > 3 && changedFiles.some((f) => f.toLowerCase().includes(part.toLowerCase()))) {
          signals.push(`Flow keyword '${part}' matched in modified files`);
          score += 0.25;
          break;
        }
      }

      if (signals.length > 0) {
        const normalizedScore = Math.min(score, 1.0);
        const confidence = Math.min(0.7 + normalizedScore * 0.28, 0.98);

        affected.push({
          flow,
          impactScore: normalizedScore,
          confidence,
          matchedSignals: signals,
          reason: `Flow is likely impacted by: ${signals.join('; ')}`,
        });
      }
    }

    // Sort by impact score descending
    return affected.sort((a, b) => b.impactScore - a.impactScore);
  }
}
