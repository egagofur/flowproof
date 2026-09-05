import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { discoverStrapiSchemas, generateStrapi } from '../../src/adapter/strapi/index.js';
import { generateCommand } from '../../src/cli/commands/generate.js';
import { FlowLoader } from '../../src/core/parser/flow-loader.js';

const fixtureDir = path.resolve('tests/fixtures/strapi');

describe('Strapi 5 schema generator', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  async function project(): Promise<string> {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'intentproof-strapi-'));
    tempDirs.push(directory);
    await fs.cp(fixtureDir, directory, { recursive: true });
    return directory;
  }

  async function outputFiles(directory: string): Promise<Record<string, string>> {
    const output = path.join(directory, 'flows/strapi');
    const names = (await fs.readdir(output)).sort();
    return Object.fromEntries(await Promise.all(names.map(async (name) => [
      name,
      await fs.readFile(path.join(output, name), 'utf8'),
    ])));
  }

  it('discovers a deterministic normalized manifest with recursive fields and cycles', async () => {
    const directory = await project();
    const first = await discoverStrapiSchemas(directory);
    const second = await discoverStrapiSchemas(directory);

    expect(first).toEqual(second);
    expect(first.contentTypes.map((content) => [content.uid, content.kind])).toEqual([
      ['api::article.article', 'collectionType'],
      ['api::homepage.homepage', 'singleType'],
    ]);

    const article = first.contentTypes[0];
    expect(article).toMatchObject({ i18n: true, draftPublish: true });
    expect(article.attributes.find((attribute) => attribute.name === 'sections')).toMatchObject({
      component: 'shared.section',
      repeatable: true,
      fields: expect.arrayContaining([expect.objectContaining({ name: 'seo', component: 'shared.seo' })]),
    });
    expect(article.attributes.find((attribute) => attribute.name === 'rating')).toMatchObject({
      required: false,
      customField: 'plugin::rating.stars',
    });
    expect(article.attributes.filter((attribute) => attribute.type === 'relation').map((attribute) => attribute.relation).sort()).toEqual([
      'manyToMany', 'manyToOne', 'morphMany', 'morphOne', 'morphToMany', 'morphToOne', 'oneToMany', 'oneToOne',
    ].sort());
    expect(first.cycles.length).toBeGreaterThan(0);
    expect(JSON.stringify(first.components)).toContain('"cycle":true');
  });

  it('generates capability-tagged collection and single drafts accepted by FlowLoader', async () => {
    const directory = await project();
    const report = await generateStrapi({ projectDir: directory });

    expect(report.totals).toMatchObject({ contentTypes: 2, components: 4, flows: 2 });
    expect(report.capabilities).toEqual(expect.arrayContaining([
      'collection', 'single', 'i18n', 'draft-publish', 'component', 'repeatable-component', 'custom-field', 'media', 'relation',
    ]));
    expect(report.unsupported).toContain('api::article.article.rating: custom field plugin::rating.stars');
    expect(report.types.relation).toBe(8);

    const loaded = await FlowLoader.loadDirectory(path.join(directory, 'flows/strapi'));
    const flowResults = loaded.filter((result) => result.filePath.endsWith('.yaml'));
    expect(flowResults).toHaveLength(2);
    expect(flowResults.every((result) => result.success)).toBe(true);

    const collection = flowResults.find((result) => result.flow?.id.endsWith('.lifecycle'))?.flow;
    expect(collection?.tags).toContain('strapi:relation');
    expect(collection?.steps.filter((step) => step.customHandler === 'strapi.todo.check-relation')).toHaveLength(8);
    expect(collection?.steps.some((step) => step.customHandler === 'strapi.todo.unsupported-field')).toBe(true);

    const single = flowResults.find((result) => result.flow?.id.endsWith('.edit-reload-restore'))?.flow;
    expect(single?.steps.map((step) => step.customHandler).filter(Boolean)).toEqual(expect.arrayContaining([
      'strapi.todo.capture-single-state',
      'strapi.todo.edit-single',
      'strapi.todo.verify-single-persisted',
      'strapi.todo.restore-single-state',
    ]));
  });

  it('is byte-stable when regenerated and exposes the generate command action', async () => {
    const directory = await project();
    const firstReport = await generateStrapi({ projectDir: directory });
    const firstFiles = await outputFiles(directory);
    const secondReport = await generateStrapi({ projectDir: directory });
    const secondFiles = await outputFiles(directory);

    expect(secondFiles).toEqual(firstFiles);
    expect(secondReport).toEqual(firstReport);
    expect(JSON.stringify(firstReport)).not.toMatch(/generatedAt|timestamp/i);

    const dryRun = await generateCommand({ adapter: 'strapi', dir: directory, write: false });
    expect(dryRun.totals.flows).toBe(2);
    await expect(generateCommand({ adapter: 'unknown', dir: directory, write: false })).rejects.toThrow(
      "Unsupported generate adapter 'unknown'"
    );
  });
});
