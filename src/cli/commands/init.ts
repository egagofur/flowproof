import pc from 'picocolors';
import path from 'node:path';
import fs from 'node:fs/promises';
import YAML from 'yaml';
import { ProjectDetector } from '../../adapter/detector.js';
import { generateGenericConfig } from '../../adapter/templates/generic.js';
import { generateNextjsConfig } from '../../adapter/templates/nextjs.js';
import { generateViteConfig } from '../../adapter/templates/vite.js';
import { FlowMapper } from '../../ai/mapper/flow-mapper.js';
import { FlowDefinition } from '../../core/contracts/flow.js';

export interface InitCommandOptions {
  dir?: string;
  baseUrl?: string;
  force?: boolean;
  json?: boolean;
}

export async function initCommand(options: InitCommandOptions): Promise<void> {
  const rootDir = process.cwd();
  const projectDir = options.dir ? path.resolve(rootDir, options.dir) : rootDir;

  const analysis = await ProjectDetector.analyze(projectDir);
  const baseUrl = options.baseUrl || analysis.suggestedBaseUrl;

  const configPath = path.join(projectDir, 'intentproof.config.ts');
  const flowsDir = path.join(projectDir, 'flows');

  if (analysis.hasFlowproofConfig && !options.force) {
    if (options.json) {
      console.log(JSON.stringify({ error: 'Project already contains an Intentproof configuration. Use --force to overwrite.' }, null, 2));
    } else {
      console.log(pc.yellow(`Intentproof configuration already exists in ${projectDir}. Use --force to overwrite.`));
    }
    return;
  }

  // 1. Generate Config
  let configContent = '';
  if (analysis.framework === 'nextjs') {
    configContent = generateNextjsConfig(baseUrl);
  } else if (analysis.framework === 'vite') {
    configContent = generateViteConfig(baseUrl);
  } else {
    configContent = generateGenericConfig(baseUrl);
  }

  await fs.writeFile(configPath, configContent, 'utf-8');

  // 2. Create flows directory
  await fs.mkdir(flowsDir, { recursive: true });

  // 3. Discover or scaffold initial flows
  const discovered = await FlowMapper.discoverFromProject(projectDir);
  const createdFlowFiles: string[] = [];

  if (discovered.length > 0) {
    for (const d of discovered.slice(0, 3)) {
      const flowPath = path.join(flowsDir, `${d.flow.id}.flow.yaml`);
      await fs.writeFile(flowPath, YAML.stringify(d.flow), 'utf-8');
      createdFlowFiles.push(path.relative(projectDir, flowPath));
    }
  } else {
    // Generate default starter flow
    const starterFlow: FlowDefinition = {
      id: 'app.homepage.load',
      name: 'User Accesses Homepage',
      description: 'Verifies the application homepage loads and main container is visible.',
      priority: 'high',
      roles: ['user'],
      tags: ['homepage', 'smoke'],
      preconditions: [{ route: '/' }],
      steps: [
        {
          id: 'step-navigate',
          action: 'navigate',
          target: '/',
          description: 'Navigate to root page',
        },
      ],
      assertions: [
        {
          id: 'assert-container-visible',
          type: 'element_visible',
          target: 'main, #root, #app, body',
          description: 'Main application container is rendered',
        },
      ],
      evidence: {
        checkpoints: [
          {
            id: 'homepage-loaded',
            trigger: 'after_assertion',
            assertionId: 'assert-container-visible',
            screenshot: true,
            description: 'Homepage successfully loaded screenshot',
          },
        ],
      },
      source: ['flowproof.init'],
      confidence: 1.0,
    };

    const starterPath = path.join(flowsDir, 'app.homepage.load.flow.yaml');
    await fs.writeFile(starterPath, YAML.stringify(starterFlow), 'utf-8');
    createdFlowFiles.push(path.relative(projectDir, starterPath));
  }

  // 4. Update .gitignore
  const gitignorePath = path.join(projectDir, '.gitignore');
  try {
    let gitignore = '';
    try {
      gitignore = await fs.readFile(gitignorePath, 'utf-8');
    } catch {}

    if (!gitignore.includes('artifacts/')) {
      const addition = '\n# Flowproof artifacts\nartifacts/\n.flowproof*/\n';
      await fs.writeFile(gitignorePath, `${gitignore}${addition}`, 'utf-8');
    }
  } catch {}

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          status: 'success',
          projectDir,
          framework: analysis.framework,
          baseUrl,
          configFile: path.relative(projectDir, configPath),
          flowsDir: path.relative(projectDir, flowsDir),
          createdFlows: createdFlowFiles,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(pc.bold(pc.green('\n🎉 Flowproof successfully initialized!')));
  console.log(pc.dim('──────────────────────────────────────────────────'));
  console.log(`Framework:    ${pc.cyan(analysis.framework.toUpperCase())}`);
  console.log(`Target URL:   ${pc.cyan(baseUrl)}`);
  console.log(`Config File:  ${pc.bold(path.relative(rootDir, configPath))}`);
  console.log(`Flows Dir:    ${pc.bold(path.relative(rootDir, flowsDir))}`);
  console.log(pc.bold('\nScaffolded Flow Contracts:'));
  for (const f of createdFlowFiles) {
    console.log(`  ${pc.green('✓')} ${f}`);
  }

  console.log(pc.bold('\nNext Steps:'));
  console.log(`  1. Start your local app server at ${pc.cyan(baseUrl)}`);
  console.log(`  2. List available flows: ${pc.cyan('npx flowproof flows')}`);
  console.log(`  3. Run your first verification: ${pc.cyan('npx flowproof verify')}`);
  console.log(pc.dim('──────────────────────────────────────────────────\n'));
}
