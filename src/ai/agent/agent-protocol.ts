import { FlowLoader } from '../../core/parser/flow-loader.js';
import { FlowMapper } from '../mapper/flow-mapper.js';
import { ChangeImpactAnalyzer } from '../impact/impact-analyzer.js';
import { FlowOrchestrator } from '../../core/orchestrator/flow-orchestrator.js';
import { AdapterRegistry } from '../../adapter/registry.js';
import { VerificationResult } from '../../core/contracts/result.js';
import { ResultAnalyzer } from '../analyzer/result-analyzer.js';
import { ArtifactStore } from '../../core/evidence/artifact-store.js';
import path from 'node:path';
import fs from 'node:fs/promises';

export type AgentAction =
  | { action: 'discover_flows'; projectDir?: string }
  | { action: 'map_flows'; scope?: 'all' | 'changed_features'; files?: string[] }
  | { action: 'verify_flow'; flowId: string; evidence?: boolean; executor?: string }
  | { action: 'verify_affected_flows'; evidence?: boolean; baseRef?: string }
  | { action: 'analyze_execution'; executionId: string; artifactsDir?: string };

export class AgentProtocol {
  /**
   * Dispatch a high-level JSON action from an AI agent.
   */
  public static async handleAction(action: AgentAction, projectDir = process.cwd()): Promise<unknown> {
    const config = await AdapterRegistry.loadConfig(projectDir);

    switch (action.action) {
      case 'discover_flows': {
        const candidates = await FlowMapper.discoverFromProject(action.projectDir || projectDir);
        return {
          status: 'success',
          count: candidates.length,
          flows: candidates.map((c) => ({
            id: c.flow.id,
            name: c.flow.name,
            priority: c.flow.priority,
            confidence: c.confidence,
            sources: c.sources,
            rationale: c.rationale,
            flowDefinition: c.flow,
          })),
        };
      }

      case 'map_flows': {
        const flowsDir = config.flowsDir || path.join(projectDir, 'flows');
        const loaded = await FlowLoader.loadDirectory(flowsDir);
        const allFlows = loaded.filter((l) => l.flow).map((l) => l.flow!);

        if (action.scope === 'changed_features') {
          const changedFiles = action.files || (await ChangeImpactAnalyzer.getChangedFiles(projectDir));
          const affected = ChangeImpactAnalyzer.analyzeImpact(allFlows, changedFiles);
          return {
            status: 'success',
            scope: 'changed_features',
            changedFiles,
            affectedCount: affected.length,
            affectedFlows: affected.map((a) => ({
              flowId: a.flow.id,
              name: a.flow.name,
              score: a.impactScore,
              confidence: a.confidence,
              reason: a.reason,
            })),
          };
        }

        return {
          status: 'success',
          scope: 'all',
          count: allFlows.length,
          flows: allFlows.map((f) => ({
            id: f.id,
            name: f.name,
            priority: f.priority,
            tags: f.tags,
            stepCount: f.steps.length,
            assertionCount: f.assertions.length,
          })),
        };
      }

      case 'verify_flow': {
        const flowsDir = config.flowsDir || path.join(projectDir, 'flows');
        const loaded = await FlowLoader.loadDirectory(flowsDir);
        const target = loaded.find((l) => l.flow?.id === action.flowId)?.flow;

        if (!target) {
          throw new Error(`Flow with ID '${action.flowId}' not found in ${flowsDir}`);
        }

        const orchestrator = new FlowOrchestrator({ config });
        const result = await orchestrator.verifyFlow(target, {
          executor: action.executor,
          recordTrace: true,
        });

        return {
          status: 'success',
          verification: result,
        };
      }

      case 'verify_affected_flows': {
        const flowsDir = config.flowsDir || path.join(projectDir, 'flows');
        const loaded = await FlowLoader.loadDirectory(flowsDir);
        const allFlows = loaded.filter((l) => l.flow).map((l) => l.flow!);

        const changedFiles = await ChangeImpactAnalyzer.getChangedFiles(projectDir, action.baseRef);
        const affected = ChangeImpactAnalyzer.analyzeImpact(allFlows, changedFiles);

        const orchestrator = new FlowOrchestrator({ config });
        const results: VerificationResult[] = [];

        for (const aff of affected) {
          const res = await orchestrator.verifyFlow(aff.flow);
          results.push(res);
        }

        const provenCount = results.filter((r) => r.status === 'PROVEN').length;

        return {
          status: 'success',
          totalAffected: affected.length,
          verifiedCount: results.length,
          provenCount,
          results,
        };
      }

      case 'analyze_execution': {
        const artifactsBase = action.artifactsDir || config.artifactsDir || path.join(projectDir, 'artifacts');
        const execDir = path.join(artifactsBase, action.executionId);
        const resultJsonPath = path.join(execDir, 'result.json');

        const content = await fs.readFile(resultJsonPath, 'utf-8');
        const result: VerificationResult = JSON.parse(content);

        return {
          status: 'success',
          executionId: result.executionId,
          flowId: result.flowId,
          verificationStatus: result.status,
          diagnostic: result.diagnostic,
          artifacts: result.artifacts,
        };
      }

      default:
        throw new Error(`Unknown action: ${(action as any).action}`);
    }
  }
}
