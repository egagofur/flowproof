import { z } from 'zod';

export const FlowPrioritySchema = z.enum(['critical', 'high', 'medium', 'low']);
export type FlowPriority = z.infer<typeof FlowPrioritySchema>;

export const FlowPreconditionSchema = z.object({
  authenticated_as: z.string().optional(),
  route: z.string().optional(),
  state: z.record(z.unknown()).optional(),
});
export type FlowPrecondition = z.infer<typeof FlowPreconditionSchema>;

export const LocatorTargetSchema = z.union([
  z.object({
    role: z.string().min(1),
    name: z.string().min(1).optional(),
    exact: z.boolean().optional(),
  }).strict(),
  z.object({
    label: z.string().min(1),
    exact: z.boolean().optional(),
  }).strict(),
  z.object({
    testId: z.string().min(1),
  }).strict(),
  z.object({
    text: z.string().min(1),
    exact: z.boolean().optional(),
  }).strict(),
  z.object({
    placeholder: z.string().min(1),
    exact: z.boolean().optional(),
  }).strict(),
  z.object({
    selector: z.string().min(1),
  }).strict(),
]);
export type StructuredLocatorTarget = z.infer<typeof LocatorTargetSchema>;
export const FlowTargetSchema = z.union([z.string().min(1), LocatorTargetSchema]);
export type FlowTarget = z.infer<typeof FlowTargetSchema>;

export const FlowStepActionSchema = z.enum([
  'navigate',
  'click',
  'fill',
  'type',
  'select',
  'select_option',
  'select_relation',
  'remove_relation',
  'toggle',
  'upload_file',
  'fill_tiptap',
  'select_date',
  'hover',
  'wait',
  'submit',
  'press_key',
  'custom',
]);
export type FlowStepAction = z.infer<typeof FlowStepActionSchema>;

export const FlowStepSchema = z.object({
  id: z.string().optional(),
  action: FlowStepActionSchema,
  target: FlowTargetSchema.optional(), // Legacy selector/route or semantic locator
  value: z.unknown().optional(), // Text value, option value, etc.
  description: z.string().optional(),
  timeoutMs: z.number().positive().optional(),
  optional: z.boolean().optional(),
  customHandler: z.string().optional(),
});
export type FlowStep = z.infer<typeof FlowStepSchema>;

export const FlowAssertionTypeSchema = z.enum([
  'element_visible',
  'element_hidden',
  'text_contains',
  'text_equals',
  'url_matches',
  'attribute_equals',
  'value_equals',
  'element_count',
  'custom_assert',
]);
export type FlowAssertionType = z.infer<typeof FlowAssertionTypeSchema>;

export const FlowAssertionSchema = z.object({
  id: z.string().optional(),
  type: FlowAssertionTypeSchema,
  target: FlowTargetSchema.optional(), // Legacy selector/expression or semantic locator
  value: z.unknown().optional(), // Expected value
  attribute: z.string().optional(), // Attribute name when type is attribute_equals
  count: z.number().int().nonnegative().optional(), // When type is element_count
  description: z.string().optional(),
  timeoutMs: z.number().positive().optional(),
  customHandler: z.string().optional(),
});
export type FlowAssertion = z.infer<typeof FlowAssertionSchema>;

export const FlowEvidenceCheckpointSchema = z.object({
  id: z.string(),
  description: z.string().optional(),
  trigger: z.enum(['after_step', 'after_assertion', 'on_failure', 'custom']),
  stepId: z.string().optional(),
  stepIndex: z.number().int().nonnegative().optional(),
  assertionId: z.string().optional(),
  assertionIndex: z.number().int().nonnegative().optional(),
  screenshot: z.boolean().default(true),
  fullPage: z.boolean().optional(),
  clipSelector: z.string().optional(),
});
export type FlowEvidenceCheckpoint = z.infer<typeof FlowEvidenceCheckpointSchema>;

export const FlowExecutionPreferenceSchema = z.object({
  preferred: z.enum(['playwright', 'aside']).default('playwright'),
  fallback: z.enum(['playwright', 'aside', 'none']).optional(),
  fallbackOn: z.array(z.string()).optional(), // e.g. ['stale_selector', 'timeout']
});
export type FlowExecutionPreference = z.infer<typeof FlowExecutionPreferenceSchema>;

export const FlowDefinitionSchema = z.object({
  id: z.string().min(1, 'Flow ID is required'),
  name: z.string().min(1, 'Flow Name is required'),
  description: z.string().optional(),
  priority: FlowPrioritySchema.default('high'),
  roles: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  variables: z.record(z.unknown()).default({}),
  preconditions: z.array(FlowPreconditionSchema).default([]),
  steps: z.array(FlowStepSchema).min(1, 'At least one step is required'),
  assertions: z.array(FlowAssertionSchema).min(1, 'At least one assertion is required'),
  evidence: z
    .object({
      checkpoints: z.array(FlowEvidenceCheckpointSchema).default([]),
      required: z.array(z.string()).optional(), // List of required checkpoint IDs
    })
    .default({ checkpoints: [] }),
  execution: FlowExecutionPreferenceSchema.optional(),
  source: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

type ParsedFlowDefinition = z.infer<typeof FlowDefinitionSchema>;
export type FlowDefinition = Omit<ParsedFlowDefinition, 'variables'> & {
  variables?: Record<string, unknown>;
};
