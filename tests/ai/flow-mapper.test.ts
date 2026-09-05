import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { FlowMapper } from '../../src/ai/mapper/flow-mapper.js';

describe('FlowMapper', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'intentproof-mapper-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it('should discover candidate flows from markdown specifications', async () => {
    const specContent = `
# Requirements

### Feature: Employee Expense Report
Employees can submit expense claims with receipts and verify pending status.

### Flow: Admin User Management
Admin can invite new users to workspace.
`;
    await fs.writeFile(path.join(tmpDir, 'requirements.md'), specContent, 'utf-8');

    const candidates = await FlowMapper.discoverFromProject(tmpDir);
    expect(candidates.length).toBeGreaterThanOrEqual(2);

    const expenseFlow = candidates.find((c) => c.flow.name.includes('Employee Expense Report'));
    expect(expenseFlow).toBeDefined();
    expect(expenseFlow?.flow.id).toBe('employee.expense.report');
    expect(expenseFlow?.confidence).toBeGreaterThan(0.8);
  });
});
