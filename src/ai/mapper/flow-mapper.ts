import fs from 'node:fs/promises';
import path from 'node:path';
import { FlowDefinition } from '../../core/contracts/flow.js';

export interface DiscoveredFlowCandidate {
  flow: FlowDefinition;
  confidence: number;
  sources: string[];
  rationale: string;
}

export class FlowMapper {
  /**
   * Scan project directory to discover candidate user flows from specs, routes, and components.
   */
  public static async discoverFromProject(projectDir: string): Promise<DiscoveredFlowCandidate[]> {
    const candidates: DiscoveredFlowCandidate[] = [];
    const files = await this.gatherProjectFiles(projectDir);

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      const relativePath = path.relative(projectDir, file);

      if (ext === '.md') {
        const flowsFromDoc = await this.extractFlowsFromMarkdown(file, relativePath);
        candidates.push(...flowsFromDoc);
      } else if (file.includes('routes') || file.includes('pages') || file.includes('app')) {
        const flowsFromRoute = await this.extractFlowsFromRouteFile(file, relativePath);
        candidates.push(...flowsFromRoute);
      }
    }

    return candidates;
  }

  private static async extractFlowsFromMarkdown(
    filePath: string,
    relativePath: string
  ): Promise<DiscoveredFlowCandidate[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const candidates: DiscoveredFlowCandidate[] = [];

    // Look for flow patterns in Markdown, e.g. "Flow: ... Expected: ... Result:" or user stories
    const flowSectionRegex = /(?:###?\s*(?:Flow|Feature|User Story):\s*([^\n]+)|(?:Flow:\s*([^\n]+)))/gi;
    let match: RegExpExecArray | null;

    while ((match = flowSectionRegex.exec(content)) !== null) {
      const rawTitle = (match[1] || match[2] || '').trim();
      if (!rawTitle) continue;

      const slug = rawTitle.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
      const flowId = slug.includes('.') ? slug : `flow.${slug}`;

      const flowDef: FlowDefinition = {
        id: flowId,
        name: rawTitle,
        description: `Discovered from documentation in ${relativePath}`,
        priority: rawTitle.toLowerCase().includes('create') || rawTitle.toLowerCase().includes('login') ? 'critical' : 'high',
        roles: ['user'],
        tags: [slug.split('.')[0] || 'general'],
        preconditions: [
          { route: `/${slug.split('.')[0] || ''}` },
        ],
        steps: [
          {
            id: 'step-navigate',
            action: 'navigate',
            target: `/${slug.split('.')[0] || ''}`,
            description: `Navigate to ${rawTitle}`,
          },
          {
            id: 'step-action',
            action: 'click',
            target: `button:has-text('${rawTitle}')`,
            description: `Initiate ${rawTitle}`,
          },
        ],
        assertions: [
          {
            id: 'assert-visible',
            type: 'element_visible',
            target: 'body',
            description: 'Page responds and content is visible',
          },
        ],
        evidence: {
          checkpoints: [
            {
              id: `${slug.replace(/\./g, '-')}-initial`,
              trigger: 'after_step',
              stepId: 'step-navigate',
              screenshot: true,
              description: `Initial view for ${rawTitle}`,
            },
          ],
        },
        source: [relativePath],
        confidence: 0.88,
      };

      candidates.push({
        flow: flowDef,
        confidence: 0.88,
        sources: [relativePath],
        rationale: `Identified user flow pattern '${rawTitle}' in specification file ${relativePath}`,
      });
    }

    return candidates;
  }

  private static async extractFlowsFromRouteFile(
    filePath: string,
    relativePath: string
  ): Promise<DiscoveredFlowCandidate[]> {
    const candidates: DiscoveredFlowCandidate[] = [];
    const basename = path.basename(filePath, path.extname(filePath));

    // Exclude layout or internal files
    if (basename.startsWith('_') || basename === 'layout' || basename === 'index') {
      return candidates;
    }

    const flowId = `route.${basename.toLowerCase()}`;
    const flowDef: FlowDefinition = {
      id: flowId,
      name: `Access ${basename} Page`,
      description: `Discovered from route file ${relativePath}`,
      priority: 'medium',
      roles: ['user'],
      tags: ['route', basename.toLowerCase()],
      preconditions: [{ route: `/${basename.toLowerCase()}` }],
      steps: [
        {
          id: 'step-1',
          action: 'navigate',
          target: `/${basename.toLowerCase()}`,
          description: `Navigate to /${basename.toLowerCase()}`,
        },
      ],
      assertions: [
        {
          id: 'assert-1',
          type: 'element_visible',
          target: 'main, #root, #app, body',
          description: `Verify /${basename.toLowerCase()} renders main container`,
        },
      ],
      evidence: {
        checkpoints: [
          {
            id: `route-${basename.toLowerCase()}-loaded`,
            trigger: 'after_step',
            stepId: 'step-1',
            screenshot: true,
            description: `Page loaded for ${basename}`,
          },
        ],
      },
      source: [relativePath],
      confidence: 0.82,
    };

    candidates.push({
      flow: flowDef,
      confidence: 0.82,
      sources: [relativePath],
      rationale: `Derived route flow from page component ${relativePath}`,
    });

    return candidates;
  }

  private static async gatherProjectFiles(dir: string): Promise<string[]> {
    const matched: string[] = [];

    async function scan(current: string) {
      let entries: string[];
      try {
        entries = await fs.readdir(current);
      } catch {
        return;
      }

      for (const entry of entries) {
        if (
          entry.startsWith('.') ||
          entry === 'node_modules' ||
          entry === 'dist' ||
          entry === 'artifacts' ||
          entry === 'coverage'
        ) {
          continue;
        }

        const full = path.join(current, entry);
        const stat = await fs.stat(full);
        if (stat.isDirectory()) {
          await scan(full);
        } else if (
          entry.endsWith('.md') ||
          entry.endsWith('.tsx') ||
          entry.endsWith('.vue') ||
          entry.endsWith('.ts') ||
          entry.endsWith('.js')
        ) {
          matched.push(full);
        }
      }
    }

    await scan(dir);
    return matched;
  }
}
