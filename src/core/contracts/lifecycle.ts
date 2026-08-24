import { z } from 'zod';

export const FlowLifecycleStatusSchema = z.enum([
  'DISCOVERED',
  'DRAFT',
  'REVIEWED',
  'ACTIVE',
  'STALE',
  'RE-MAPPED',
  'ARCHIVED',
]);
export type FlowLifecycleStatus = z.infer<typeof FlowLifecycleStatusSchema>;

export const FlowMetadataSchema = z.object({
  flowId: z.string(),
  status: FlowLifecycleStatusSchema.default('DRAFT'),
  confidence: z.number().min(0).max(1).default(1.0),
  source: z.array(z.string()).default([]),
  discoveredAt: z.string().optional(),
  lastVerifiedAt: z.string().optional(),
  lastVerificationStatus: z.enum(['PROVEN', 'FAILED', 'BLOCKED', 'INCONCLUSIVE']).optional(),
  staleReason: z.string().optional(),
  proposedPatch: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export type FlowMetadata = z.infer<typeof FlowMetadataSchema>;

export class FlowLifecycleManager {
  private static validTransitions: Record<FlowLifecycleStatus, FlowLifecycleStatus[]> = {
    DISCOVERED: ['DRAFT', 'ARCHIVED'],
    DRAFT: ['REVIEWED', 'ARCHIVED'],
    REVIEWED: ['ACTIVE', 'DRAFT', 'ARCHIVED'],
    ACTIVE: ['STALE', 'ARCHIVED'],
    STALE: ['RE-MAPPED', 'ARCHIVED', 'ACTIVE'],
    'RE-MAPPED': ['REVIEWED', 'DRAFT', 'ARCHIVED'],
    ARCHIVED: ['DRAFT'],
  };

  public static canTransition(from: FlowLifecycleStatus, to: FlowLifecycleStatus): boolean {
    return this.validTransitions[from]?.includes(to) ?? false;
  }

  public static transition(
    current: FlowMetadata,
    nextStatus: FlowLifecycleStatus,
    reason?: string
  ): FlowMetadata {
    if (current.status !== nextStatus && !this.canTransition(current.status, nextStatus)) {
      throw new Error(
        `Invalid lifecycle transition from ${current.status} to ${nextStatus} for flow ${current.flowId}`
      );
    }

    return {
      ...current,
      status: nextStatus,
      staleReason: nextStatus === 'STALE' ? reason : current.staleReason,
    };
  }
}
