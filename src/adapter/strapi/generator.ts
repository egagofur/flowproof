import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import type { FlowAssertion, FlowDefinition, FlowStep } from '../../core/contracts/flow.js';
import { discoverStrapiSchemas } from './discover.js';
import type {
  StrapiAttribute,
  StrapiContentType,
  StrapiGenerateOptions,
  StrapiGenerationReport,
  StrapiManifest,
} from './types.js';

const posix = (value: string): string => value.split(path.sep).join('/');
const slug = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function flattenAttributes(attributes: StrapiAttribute[], prefix = ''): StrapiAttribute[] {
  const flattened: StrapiAttribute[] = [];
  for (const attribute of attributes) {
    const name = prefix ? `${prefix}.${attribute.name}` : attribute.name;
    flattened.push({ ...attribute, name, fields: undefined });
    if (attribute.fields) flattened.push(...flattenAttributes(attribute.fields, name));
  }
  return flattened;
}

function capabilitiesFor(content: StrapiContentType): string[] {
  const attributes = flattenAttributes(content.attributes);
  const capabilities = [content.kind === 'singleType' ? 'single' : 'collection'];
  if (content.i18n || attributes.some((attribute) => attribute.localized)) capabilities.push('i18n');
  if (content.draftPublish) capabilities.push('draft-publish');
  if (attributes.some((attribute) => attribute.type === 'component')) capabilities.push('component');
  if (attributes.some((attribute) => attribute.type === 'component' && attribute.repeatable)) capabilities.push('repeatable-component');
  if (attributes.some((attribute) => attribute.type === 'media')) capabilities.push('media');
  if (attributes.some((attribute) => attribute.type === 'relation')) capabilities.push('relation');
  if (attributes.some((attribute) => attribute.customField)) capabilities.push('custom-field');
  return capabilities.sort();
}

function todoStep(id: string, handler: string, description: string, value?: unknown): FlowStep {
  return {
    id,
    action: 'custom',
    customHandler: handler,
    description: `TODO(custom): ${description}`,
    ...(value === undefined ? {} : { value }),
  };
}

function relationSteps(content: StrapiContentType): FlowStep[] {
  return flattenAttributes(content.attributes)
    .filter((attribute) => attribute.type === 'relation')
    .map((attribute, index) => todoStep(
      `step-check-relation-${index + 1}-${slug(attribute.name)}`,
      'strapi.todo.check-relation',
      `Check relation field '${attribute.name}' (${attribute.relation ?? 'unknown'} -> ${attribute.target ?? 'unknown'}).`,
      {
        field: attribute.name,
        relation: attribute.relation ?? 'unknown',
        target: attribute.target ?? null,
      }
    ));
}

function unsupportedSteps(content: StrapiContentType): FlowStep[] {
  return flattenAttributes(content.attributes)
    .filter((attribute) => attribute.customField || attribute.type === 'dynamiczone' || attribute.type === 'unknown' || attribute.cycle)
    .map((attribute, index) => todoStep(
      `step-unsupported-${index + 1}-${slug(attribute.name)}`,
      'strapi.todo.unsupported-field',
      `Provide project-specific handling for unsupported field '${attribute.name}' (${attribute.customField ?? attribute.type}${attribute.cycle ? ', recursive cycle' : ''}).`,
      { field: attribute.name, type: attribute.type, customField: attribute.customField ?? null }
    ));
}

function assertion(content: StrapiContentType): FlowAssertion {
  return {
    id: 'assert-strapi-result',
    type: 'custom_assert',
    customHandler: 'strapi.todo.verify-content-state',
    description: `TODO(custom): Verify the final Strapi state for ${content.uid}.`,
    value: {
      uid: content.uid,
      kind: content.kind,
      draftPublish: content.draftPublish,
      localized: content.i18n,
    },
  };
}

function baseFlow(content: StrapiContentType, scenario: string): Omit<FlowDefinition, 'steps' | 'assertions'> {
  const capabilities = capabilitiesFor(content);
  return {
    id: `strapi.${slug(content.uid)}.${scenario}`,
    name: `${content.names.displayName}: ${scenario === 'lifecycle' ? 'collection lifecycle' : 'edit, reload, and restore'}`,
    description: `Generated Strapi 5 draft. Custom TODO handlers must be mapped to this project's Strapi admin UI before execution.`,
    priority: 'high',
    roles: ['strapi-admin'],
    tags: ['generated', 'strapi', ...capabilities.map((capability) => `strapi:${capability}`)],
    preconditions: [{ authenticated_as: 'strapi-admin' }],
    evidence: {
      checkpoints: [{
        id: 'strapi-final-state',
        trigger: 'after_assertion',
        assertionId: 'assert-strapi-result',
        screenshot: true,
        description: `Capture the final ${content.names.displayName} state.`,
      }],
      required: ['strapi-final-state'],
    },
    source: [content.source],
    confidence: 0.7,
  };
}

export function createStrapiFlow(content: StrapiContentType): FlowDefinition {
  const route = `/admin/content-manager/${content.kind === 'singleType' ? 'single-types' : 'collection-types'}/${content.uid}`;
  const metadata = {
    uid: content.uid,
    requiredFields: flattenAttributes(content.attributes).filter((item) => item.required).map((item) => item.name),
    localized: content.i18n,
    draftPublish: content.draftPublish,
  };
  const common = baseFlow(content, content.kind === 'singleType' ? 'edit-reload-restore' : 'lifecycle');
  const steps: FlowStep[] = [{
    id: 'step-open-content-manager',
    action: 'navigate',
    target: route,
    description: `Open ${content.names.displayName} in Strapi Content Manager.`,
  }];

  if (content.kind === 'collectionType') {
    steps.push(
      todoStep('step-create-entry', 'strapi.todo.create-entry', `Create a ${content.names.singularName} entry.`, metadata),
      ...relationSteps(content),
      todoStep('step-update-entry', 'strapi.todo.update-entry', `Update the generated ${content.names.singularName} entry.`, metadata),
      todoStep('step-delete-entry', 'strapi.todo.delete-entry', `Delete the generated ${content.names.singularName} entry.`, { uid: content.uid })
    );
  } else {
    steps.push(
      todoStep('step-capture-original', 'strapi.todo.capture-single-state', `Capture the original ${content.names.displayName} values for restoration.`, metadata),
      todoStep('step-edit-single', 'strapi.todo.edit-single', `Edit and save ${content.names.displayName}.`, metadata),
      ...relationSteps(content),
      { id: 'step-reload-single', action: 'navigate', target: route, description: `Reload ${content.names.displayName} from Content Manager.` },
      todoStep('step-verify-persisted', 'strapi.todo.verify-single-persisted', `Check that edits to ${content.names.displayName} persisted after reload.`, metadata),
      todoStep('step-restore-single', 'strapi.todo.restore-single-state', `Restore the original ${content.names.displayName} values.`, metadata)
    );
  }
  steps.push(...unsupportedSteps(content));
  return { ...common, steps, assertions: [assertion(content)] };
}

function unsupportedItems(manifest: StrapiManifest): string[] {
  const items: string[] = [];
  for (const content of manifest.contentTypes) {
    for (const attribute of flattenAttributes(content.attributes)) {
      if (attribute.customField) items.push(`${content.uid}.${attribute.name}: custom field ${attribute.customField}`);
      else if (attribute.type === 'dynamiczone') items.push(`${content.uid}.${attribute.name}: dynamic zone`);
      else if (attribute.type === 'unknown') items.push(`${content.uid}.${attribute.name}: unknown type`);
      if (attribute.cycle) items.push(`${content.uid}.${attribute.name}: recursive component cycle`);
    }
  }
  return [...new Set(items)].sort();
}

function typeTotals(manifest: StrapiManifest): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const content of manifest.contentTypes) {
    totals[content.kind] = (totals[content.kind] ?? 0) + 1;
    for (const attribute of flattenAttributes(content.attributes)) {
      totals[attribute.type] = (totals[attribute.type] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(totals).sort(([left], [right]) => left.localeCompare(right)));
}

/** Generate a stable manifest and loader-compatible YAML flow drafts. */
export async function generateStrapi(options: StrapiGenerateOptions): Promise<StrapiGenerationReport> {
  const projectDir = path.resolve(options.projectDir);
  const outputDir = path.resolve(projectDir, options.outputDir ?? 'flows/strapi');
  const manifestPath = path.resolve(projectDir, options.manifestPath ?? path.join(path.relative(projectDir, outputDir), 'manifest.json'));
  const manifest = await discoverStrapiSchemas(projectDir);
  const generated: StrapiGenerationReport['generated'] = [{
    type: 'manifest',
    path: posix(path.relative(projectDir, manifestPath)),
  }];
  const writes: Array<{ filePath: string; content: string }> = [{
    filePath: manifestPath,
    content: `${JSON.stringify(manifest, null, 2)}\n`,
  }];

  for (const content of manifest.contentTypes) {
    const flow = createStrapiFlow(content);
    const filePath = path.join(outputDir, `${slug(content.uid)}.${content.kind === 'singleType' ? 'edit-reload-restore' : 'lifecycle'}.flow.yaml`);
    generated.push({
      type: content.kind === 'singleType' ? 'single-edit-reload-restore' : 'collection-lifecycle',
      uid: content.uid,
      path: posix(path.relative(projectDir, filePath)),
    });
    writes.push({ filePath, content: YAML.stringify(flow, { lineWidth: 0 }) });
  }

  if (options.write !== false) {
    for (const write of writes.sort((left, right) => left.filePath.localeCompare(right.filePath))) {
      await fs.mkdir(path.dirname(write.filePath), { recursive: true });
      await fs.writeFile(write.filePath, write.content, 'utf8');
    }
  }

  const unsupported = unsupportedItems(manifest);
  const capabilities = [...new Set(manifest.contentTypes.flatMap(capabilitiesFor))].sort();
  return {
    adapter: 'strapi',
    generated,
    types: typeTotals(manifest),
    capabilities,
    unsupported,
    warnings: manifest.warnings,
    totals: {
      contentTypes: manifest.contentTypes.length,
      components: manifest.components.length,
      flows: manifest.contentTypes.length,
      files: generated.length,
      unsupported: unsupported.length,
      warnings: manifest.warnings.length,
      cycles: manifest.cycles.length,
    },
    manifest,
  };
}

export const generateStrapiFlows = generateStrapi;
