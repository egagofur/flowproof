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
    const normalized = relativePath.replace(/\\/g, '/');

    // Filter out non-route directories
    if (
      normalized.includes('/components/') ||
      normalized.includes('/_components/') ||
      normalized.includes('/providers/') ||
      normalized.includes('/hooks/') ||
      normalized.includes('/lib/') ||
      normalized.includes('/utils/') ||
      normalized.includes('/types/') ||
      normalized.includes('/api/') ||
      normalized.includes('layout.') ||
      normalized.includes('error.') ||
      normalized.includes('global-error.') ||
      normalized.includes('not-found.') ||
      normalized.includes('metadata.') ||
      normalized.includes('robots.') ||
      normalized.includes('sitemap.')
    ) {
      return candidates;
    }

    let routePath = '';
    let flowName = '';

    // 1. Next.js App Router: .../app/(group)/path/page.tsx
    if (normalized.includes('/app/') && path.basename(filePath).startsWith('page.')) {
      const afterApp = normalized.split('/app/')[1] || '';
      const dirOfPage = path.dirname(afterApp);
      if (dirOfPage === '.' || dirOfPage === '') {
        routePath = '/';
        flowName = 'Homepage';
      } else {
        // Strip route groups like (public), (protected), (auth)
        const cleanedSegments = dirOfPage
          .split('/')
          .filter((seg) => !seg.startsWith('(') || !seg.endsWith(')'));
        routePath = '/' + cleanedSegments.join('/');
        flowName = cleanedSegments
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' '))
          .join(' ');
      }
    }
    // 2. Next.js Pages Router: .../pages/path.tsx
    else if (normalized.includes('/pages/') && !path.basename(filePath).startsWith('_')) {
      const afterPages = normalized.split('/pages/')[1] || '';
      const withoutExt = afterPages.replace(/\.[^/.]+$/, '');
      if (withoutExt === 'index') {
        routePath = '/';
        flowName = 'Homepage';
      } else {
        routePath = '/' + withoutExt.replace(/\/index$/, '');
        flowName = withoutExt
          .split('/')
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' '))
          .join(' ');
      }
    }

    if (!routePath) {
      return candidates;
    }

    const cleanId = routePath === '/' ? 'app.homepage' : `route.${routePath.slice(1).replace(/[\/\\]/g, '.')}`;
    const isPublic = routePath === '/' || routePath.includes('login') || routePath.includes('sample') || routePath.includes('auth');

    const flowDef: FlowDefinition = {
      id: cleanId,
      name: `Access ${flowName} Page`,
      description: `Discovered from route ${routePath} in ${relativePath}`,
      priority: routePath === '/' || routePath.includes('dashboard') || routePath.includes('login') ? 'critical' : 'high',
      roles: isPublic ? ['guest', 'user'] : ['user'],
      tags: ['route', ...routePath.split('/').filter(Boolean)],
      preconditions: [
        ...(isPublic ? [] : [{ authenticated_as: 'user' }]),
        { route: routePath },
      ],
      steps: [
        {
          id: 'step-navigate',
          action: 'navigate',
          target: routePath,
          description: `Navigate to ${flowName} (${routePath})`,
        },
      ],
      assertions: [
        {
          id: 'assert-rendered',
          type: 'element_visible',
          target: 'main, #root, #app, body',
          description: `Verify ${flowName} renders main view`,
        },
      ],
      evidence: {
        checkpoints: [
          {
            id: `${cleanId.replace(/\./g, '-')}-view`,
            trigger: 'after_step',
            stepId: 'step-navigate',
            screenshot: true,
            description: `${flowName} view loaded`,
          },
        ],
      },
      source: [relativePath],
      confidence: 0.9,
    };

    candidates.push({
      flow: flowDef,
      confidence: 0.9,
      sources: [relativePath],
      rationale: `Discovered page route ${routePath} from ${relativePath}`,
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
