import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ProjectConfig } from './config.js';
import { ExecutorRegistry } from '../executors/base.js';
import { PlaywrightExecutor } from '../executors/playwright/playwright-executor.js';
import { AsideExecutor } from '../executors/aside/aside-executor.js';
import { HybridExecutor } from '../executors/hybrid.js';

export class AdapterRegistry {
  private static registeredConfig: ProjectConfig | null = null;
  private static isExecutorsRegistered = false;

  public static registerDefaultExecutors(): void {
    if (this.isExecutorsRegistered) return;

    ExecutorRegistry.register('playwright', () => new PlaywrightExecutor());
    ExecutorRegistry.register('aside', () => new AsideExecutor());
    ExecutorRegistry.register('hybrid', () => new HybridExecutor());

    this.isExecutorsRegistered = true;
  }

  public static setConfig(config: ProjectConfig): void {
    this.registeredConfig = config;
    this.registerDefaultExecutors();
  }

  public static getConfig(): ProjectConfig | null {
    return this.registeredConfig;
  }

  public static async loadConfig(searchDir = process.cwd(), explicitPath?: string): Promise<ProjectConfig> {
    this.registerDefaultExecutors();

    if (explicitPath) {
      const fullPath = path.resolve(searchDir, explicitPath);
      return this.importConfig(fullPath);
    }

    const candidateFiles = [
      'flowproof.config.ts',
      'flowproof.config.js',
      'flowproof.config.mjs',
      'flowproof.config.cjs',
      'flowproof.config.json',
      path.join('flowproof', 'config.ts'),
      path.join('flowproof', 'config.js'),
      path.join('flowproof', 'flowproof.config.ts'),
      path.join('flowproof', 'flowproof.config.js'),
    ];

    for (const file of candidateFiles) {
      const fullPath = path.resolve(searchDir, file);
      try {
        await fs.access(fullPath);
        const config = await this.importConfig(fullPath);
        this.registeredConfig = config;
        return config;
      } catch {
        // Continue searching
      }
    }

    // Default fallback config if none found
    const fallbackConfig: ProjectConfig = {
      baseUrl: process.env.FLOWPROOF_BASE_URL || 'http://localhost:3000',
      flowsDir: path.resolve(searchDir, 'flows'),
      artifactsDir: path.resolve(searchDir, 'artifacts'),
      defaultExecutor: 'playwright',
    };
    this.registeredConfig = fallbackConfig;
    return fallbackConfig;
  }

  private static async importConfig(filePath: string): Promise<ProjectConfig> {
    const configDir = path.dirname(filePath);
    let loaded: ProjectConfig;

    if (filePath.endsWith('.json')) {
      const content = await fs.readFile(filePath, 'utf-8');
      loaded = JSON.parse(content);
    } else if (filePath.endsWith('.ts') || filePath.endsWith('.mts')) {
      const tempPath = path.join(configDir, `.flowproof.config.temp.${Date.now()}.mjs`);
      try {
        const { build } = await import('esbuild');
        const currentDir = path.dirname(fileURLToPath(import.meta.url));
        const candidateEntries = [
          path.resolve(currentDir, '../index.js'), // from dist/cli -> dist/index.js
          path.resolve(currentDir, 'index.js'),    // from dist -> dist/index.js
          path.resolve(currentDir, '../src/index.ts'), // from src/adapter -> src/index.ts
          path.resolve(currentDir, '../../dist/index.js'),
          path.resolve(currentDir, '../../src/index.ts'),
        ];
        let flowproofEntry: string | undefined;
        for (const candidate of candidateEntries) {
          try {
            await fs.access(candidate);
            if (candidate.endsWith(path.join('cli', 'index.js'))) continue;
            flowproofEntry = candidate;
            break;
          } catch {}
        }

        const buildOptions: any = {
          entryPoints: [filePath],
          bundle: true,
          write: false,
          format: 'esm',
          platform: 'node',
          target: 'es2022',
        };

        if (flowproofEntry) {
          const flowproofFileUrl = `file://${flowproofEntry}`;
          buildOptions.plugins = [
            {
              name: 'flowproof-resolver',
              setup(b: any) {
                b.onResolve({ filter: /^flowproof$/ }, () => ({
                  path: flowproofFileUrl,
                  external: true,
                }));
              },
            },
          ];
        }

        const res = await build(buildOptions);
        if (!res.outputFiles || res.outputFiles.length === 0) {
          throw new Error('Bundling produced no output');
        }
        const code = res.outputFiles[0].text;
        await fs.writeFile(tempPath, code, 'utf-8');
        const mod = await import(`file://${tempPath}`);
        const config = mod.default || mod.config || mod;
        loaded = typeof config === 'function' ? await config() : config;
      } catch (err: any) {
        throw new Error(`Failed to load Flowproof configuration from ${filePath}: ${err.message}`);
      } finally {
        await fs.unlink(tempPath).catch(() => {});
      }
    } else {
      try {
        const mod = await import(filePath);
        const config = mod.default || mod.config || mod;
        loaded = typeof config === 'function' ? await config() : config;
      } catch (err: any) {
        throw new Error(`Failed to load Flowproof configuration from ${filePath}: ${err.message}`);
      }
    }

    const resolved: ProjectConfig = {
      ...loaded,
      flowsDir: loaded.flowsDir ? path.resolve(configDir, loaded.flowsDir) : path.join(configDir, 'flows'),
      artifactsDir: loaded.artifactsDir ? path.resolve(configDir, loaded.artifactsDir) : path.join(configDir, 'artifacts'),
    };

    return resolved;
  }
}
