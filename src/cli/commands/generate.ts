import path from 'node:path';
import pc from 'picocolors';
import { generateStrapi } from '../../adapter/strapi/index.js';
import type { StrapiGenerationReport } from '../../adapter/strapi/index.js';

export const GENERATE_ADAPTERS = ['strapi'] as const;
export type GenerateAdapter = (typeof GENERATE_ADAPTERS)[number];

export interface GenerateCommandOptions {
  adapter: GenerateAdapter | string;
  dir?: string;
  outputDir?: string;
  manifestPath?: string;
  json?: boolean;
  write?: boolean;
}

/** Command action for `intentproof generate --adapter strapi`; registration is intentionally separate. */
export async function generateCommand(options: GenerateCommandOptions): Promise<StrapiGenerationReport> {
  if (options.adapter !== 'strapi') {
    throw new Error(`Unsupported generate adapter '${options.adapter}'. Supported adapters: ${GENERATE_ADAPTERS.join(', ')}`);
  }

  const cwd = process.cwd();
  const projectDir = options.dir ? path.resolve(cwd, options.dir) : cwd;
  const report = await generateStrapi({
    projectDir,
    outputDir: options.outputDir,
    manifestPath: options.manifestPath,
    write: options.write,
  });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  console.log(pc.bold(pc.green(`Generated ${report.totals.flows} Strapi flow draft(s).`)));
  for (const file of report.generated) console.log(`  ${pc.green('✓')} ${file.path}`);
  console.log(`Capabilities: ${report.capabilities.join(', ') || 'none'}`);
  console.log(`Unsupported:  ${report.totals.unsupported}`);
  console.log(`Warnings:     ${report.totals.warnings}`);
  if (report.unsupported.length > 0) {
    for (const item of report.unsupported) console.log(pc.yellow(`  TODO ${item}`));
  }
  if (report.warnings.length > 0) {
    for (const warning of report.warnings) console.log(pc.yellow(`  Warning: ${warning}`));
  }
  return report;
}

export const runGenerateCommand = generateCommand;
