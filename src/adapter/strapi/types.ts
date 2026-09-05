export type StrapiContentKind = 'collectionType' | 'singleType';

export interface StrapiNames {
  displayName: string;
  singularName: string;
  pluralName: string;
}

export interface StrapiAttribute {
  name: string;
  type: string;
  required: boolean;
  localized: boolean;
  customField?: string;
  component?: string;
  repeatable?: boolean;
  relation?: string;
  target?: string;
  multiple?: boolean;
  components?: string[];
  fields?: StrapiAttribute[];
  cycle?: boolean;
}

export interface StrapiContentType {
  uid: string;
  kind: StrapiContentKind;
  names: StrapiNames;
  i18n: boolean;
  draftPublish: boolean;
  attributes: StrapiAttribute[];
  source: string;
}

export interface StrapiComponent {
  uid: string;
  displayName: string;
  attributes: StrapiAttribute[];
  source: string;
}

export interface StrapiCycle {
  path: string[];
}

export interface StrapiManifest {
  adapter: 'strapi';
  version: 1;
  contentTypes: StrapiContentType[];
  components: StrapiComponent[];
  cycles: StrapiCycle[];
  warnings: string[];
}

export interface StrapiGeneratedFile {
  type: 'manifest' | 'collection-lifecycle' | 'single-edit-reload-restore';
  uid?: string;
  path: string;
}

export interface StrapiGenerationTotals {
  contentTypes: number;
  components: number;
  flows: number;
  files: number;
  unsupported: number;
  warnings: number;
  cycles: number;
}

export interface StrapiGenerationReport {
  adapter: 'strapi';
  generated: StrapiGeneratedFile[];
  types: Record<string, number>;
  capabilities: string[];
  unsupported: string[];
  warnings: string[];
  totals: StrapiGenerationTotals;
  manifest: StrapiManifest;
}

export interface StrapiGenerateOptions {
  projectDir: string;
  outputDir?: string;
  manifestPath?: string;
  write?: boolean;
}
