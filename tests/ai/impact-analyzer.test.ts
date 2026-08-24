import { describe, it, expect } from 'vitest';
import { ChangeImpactAnalyzer } from '../../src/ai/impact/impact-analyzer.js';
import { FlowDefinition } from '../../src/core/contracts/flow.js';

describe('ChangeImpactAnalyzer', () => {
  const flows: FlowDefinition[] = [
    {
      id: 'employee.remote-request.create',
      name: 'Create Remote Request',
      priority: 'critical',
      roles: ['employee'],
      tags: ['remote-request', 'portal'],
      preconditions: [{ route: '/remote-requests' }],
      steps: [{ action: 'click', target: 'button' }],
      assertions: [{ type: 'element_visible', target: 'table' }],
      evidence: { checkpoints: [] },
      source: ['src/features/remote-request/spec.md'],
    },
    {
      id: 'admin.user-management.invite',
      name: 'Invite User',
      priority: 'high',
      roles: ['admin'],
      tags: ['admin', 'users'],
      preconditions: [{ route: '/admin/users' }],
      steps: [{ action: 'click', target: 'button' }],
      assertions: [{ type: 'element_visible', target: 'div' }],
      evidence: { checkpoints: [] },
      source: ['src/features/admin/spec.md'],
    },
  ];

  it('should identify affected flows when feature files are modified', () => {
    const changedFiles = [
      'src/features/remote-request/form.tsx',
      'src/components/date-picker.tsx',
    ];

    const affected = ChangeImpactAnalyzer.analyzeImpact(flows, changedFiles);
    expect(affected).toHaveLength(1);
    expect(affected[0].flow.id).toBe('employee.remote-request.create');
    expect(affected[0].impactScore).toBeGreaterThan(0.3);
    expect(affected[0].matchedSignals.some((s) => s.includes('remote-request'))).toBe(true);
  });

  it('should return empty list when unrelated files are modified', () => {
    const changedFiles = ['docs/architecture.png', 'README.md'];
    const affected = ChangeImpactAnalyzer.analyzeImpact(flows, changedFiles);
    expect(affected).toHaveLength(0);
  });
});
