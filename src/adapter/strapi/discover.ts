import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  StrapiAttribute,
  StrapiComponent,
  StrapiContentKind,
  StrapiContentType,
  StrapiCycle,
  StrapiManifest,
} from './types.js';

type JsonObject = Record<string, unknown>;

interface RawSchema {
  filePath: string;
  relativePath: string;
  value: JsonObject;
}

const posix = (value: string): string => value.split(path.sep).join('/');
const object = (value: unknown): JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;
const flag = (value: unknown): boolean => value === true;

async function walkJson(directory: string): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walkJson(entryPath)));
    else if (entry.isFile() && entry.name.endsWith('.json')) files.push(entryPath);
  }
  return files;
}

async function readSchemas(projectDir: string, files: string[], warnings: string[]): Promise<RawSchema[]> {
  const schemas: RawSchema[] = [];
  for (const filePath of files.sort()) {
    const relativePath = posix(path.relative(projectDir, filePath));
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(filePath, 'utf8'));
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        warnings.push(`${relativePath}: schema root must be an object`);
        continue;
      }
      schemas.push({ filePath, relativePath, value: parsed as JsonObject });
    } catch (error) {
      warnings.push(`${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return schemas;
}

function componentUid(projectDir: string, schema: RawSchema): string {
  const relative = posix(path.relative(path.join(projectDir, 'src/components'), schema.filePath));
  return relative.replace(/\.json$/, '').split('/').join('.');
}

function contentUid(projectDir: string, schema: RawSchema): string {
  const explicit = text(schema.value.uid);
  if (explicit) return explicit;
  const relative = posix(path.relative(path.join(projectDir, 'src/api'), schema.filePath));
  const parts = relative.split('/');
  const apiName = parts[0] ?? 'unknown';
  const contentName = parts[2] ?? apiName;
  return `api::${apiName}.${contentName}`;
}

function localized(pluginOptions: unknown): boolean {
  return flag(object(object(pluginOptions).i18n).localized);
}

function normalizeAttributes(
  attributesValue: unknown,
  resolveComponent: (uid: string, stack: string[]) => StrapiAttribute[] | undefined,
  stack: string[],
  recordCycle: (path: string[]) => void
): StrapiAttribute[] {
  return Object.entries(object(attributesValue))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, rawValue]) => {
      const raw = object(rawValue);
      const type = text(raw.type, raw.customField ? 'customField' : 'unknown');
      const attribute: StrapiAttribute = {
        name,
        type,
        required: flag(raw.required),
        localized: localized(raw.pluginOptions),
      };

      const customField = text(raw.customField);
      const component = text(raw.component);
      const relation = text(raw.relation);
      const target = text(raw.target);
      if (customField) attribute.customField = customField;
      if (component) attribute.component = component;
      if (raw.repeatable !== undefined) attribute.repeatable = flag(raw.repeatable);
      if (relation) attribute.relation = relation;
      if (target) attribute.target = target;
      if (raw.multiple !== undefined) attribute.multiple = flag(raw.multiple);
      if (Array.isArray(raw.components)) {
        attribute.components = raw.components.filter((item): item is string => typeof item === 'string').sort();
      }
      if (component) {
        if (stack.includes(component)) {
          attribute.cycle = true;
          recordCycle([...stack.slice(stack.indexOf(component)), component]);
        } else attribute.fields = resolveComponent(component, [...stack, component]);
      }
      return attribute;
    });
}

/** Discover and normalize Strapi 5 content-type and component schemas. */
export async function discoverStrapiSchemas(projectDir: string): Promise<StrapiManifest> {
  const root = path.resolve(projectDir);
  const warnings: string[] = [];
  const contentFiles = (await walkJson(path.join(root, 'src/api'))).filter((file) =>
    /[\\/]content-types[\\/][^\\/]+[\\/]schema\.json$/.test(file)
  );
  const componentFiles = await walkJson(path.join(root, 'src/components'));
  const [rawContent, rawComponents] = await Promise.all([
    readSchemas(root, contentFiles, warnings),
    readSchemas(root, componentFiles, warnings),
  ]);

  const componentRaw = new Map<string, RawSchema>();
  for (const schema of rawComponents) componentRaw.set(componentUid(root, schema), schema);

  const cycles = new Map<string, StrapiCycle>();
  const recordCycle = (cyclePath: string[]): void => {
    const key = cyclePath.join(' -> ');
    cycles.set(key, { path: cyclePath });
  };
  const resolveComponent = (uid: string, stack: string[]): StrapiAttribute[] | undefined => {
    const schema = componentRaw.get(uid);
    if (!schema) {
      warnings.push(`Missing component schema: ${uid}`);
      return undefined;
    }
    return normalizeAttributes(
      schema.value.attributes,
      resolveComponent,
      stack,
      recordCycle
    );
  };

  const components: StrapiComponent[] = [...componentRaw.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([uid, schema]) => ({
      uid,
      displayName: text(object(schema.value.info).displayName, uid),
      attributes: resolveComponent(uid, [uid]) ?? [],
      source: schema.relativePath,
    }));

  const contentTypes: StrapiContentType[] = rawContent
    .map((schema) => {
      const uid = contentUid(root, schema);
      const info = object(schema.value.info);
      const kindValue = text(schema.value.kind, 'collectionType');
      const kind: StrapiContentKind = kindValue === 'singleType' ? 'singleType' : 'collectionType';
      if (kindValue !== 'singleType' && kindValue !== 'collectionType') {
        warnings.push(`${schema.relativePath}: unknown kind '${kindValue}', using collectionType`);
      }
      return {
        uid,
        kind,
        names: {
          displayName: text(info.displayName, uid),
          singularName: text(info.singularName, uid.split('.').at(-1) ?? uid),
          pluralName: text(info.pluralName, `${uid.split('.').at(-1) ?? uid}s`),
        },
        i18n: localized(schema.value.pluginOptions),
        draftPublish: flag(object(schema.value.options).draftAndPublish),
        attributes: normalizeAttributes(schema.value.attributes, resolveComponent, [], recordCycle),
        source: schema.relativePath,
      };
    })
    .sort((left, right) => left.uid.localeCompare(right.uid));

  return {
    adapter: 'strapi',
    version: 1,
    contentTypes,
    components,
    cycles: [...cycles.values()].sort((left, right) => left.path.join('.').localeCompare(right.path.join('.'))),
    warnings: [...new Set(warnings)].sort(),
  };
}

export const discoverStrapi = discoverStrapiSchemas;
