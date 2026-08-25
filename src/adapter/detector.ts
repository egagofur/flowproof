import fs from 'node:fs/promises';
import path from 'node:path';

export type DetectedFramework = 'nextjs' | 'vite' | 'generic';

export interface ProjectAnalysis {
  framework: DetectedFramework;
  suggestedPort: number;
  suggestedBaseUrl: string;
  hasFlowproofConfig: boolean;
  packageJsonExists: boolean;
  projectName: string;
}

export class ProjectDetector {
  public static async analyze(projectDir = process.cwd()): Promise<ProjectAnalysis> {
    let framework: DetectedFramework = 'generic';
    let suggestedPort = 3000;
    let packageJsonExists = false;
    let projectName = path.basename(projectDir);

    try {
      const pkgRaw = await fs.readFile(path.join(projectDir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgRaw);
      packageJsonExists = true;
      if (pkg.name) projectName = pkg.name;

      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (deps['next']) {
        framework = 'nextjs';
        suggestedPort = 3000;
      } else if (deps['vite']) {
        framework = 'vite';
        suggestedPort = 5173;
      } else if (deps['nuxt'] || deps['@vue/cli-service']) {
        framework = 'generic';
        suggestedPort = 3000;
      }
    } catch {
      // package.json may not exist
    }

    let hasFlowproofConfig = false;
    const configCandidates = [
      'intentproof.config.ts',
      'intentproof.config.js',
      'intentproof.config.mjs',
      'intentproof.config.json',
      'flowproof.config.ts',
      'flowproof.config.js',
      'flowproof.config.json',
      path.join('intentproof', 'config.ts'),
      path.join('flowproof', 'config.ts'),
    ];

    for (const c of configCandidates) {
      try {
        await fs.access(path.join(projectDir, c));
        hasFlowproofConfig = true;
        break;
      } catch {}
    }

    return {
      framework,
      suggestedPort,
      suggestedBaseUrl: `http://localhost:${suggestedPort}`,
      hasFlowproofConfig,
      packageJsonExists,
      projectName,
    };
  }
}
