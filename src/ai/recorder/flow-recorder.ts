import { chromium, type BrowserContextOptions } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import YAML from 'yaml';
import pc from 'picocolors';
import { FlowDefinition, FlowStep, FlowTarget } from '../../core/contracts/flow.js';
import { IntentproofConfig } from '../../adapter/config.js';

declare global {
  interface Window {
    __intentproof_record(action: RecordedAction): void;
    __intentproof_finish(): void;
  }
}

export interface RecordedAction {
  type: 'navigate' | 'click' | 'fill' | 'select' | 'select_option' | 'press_key' | 'submit';
  target?: FlowTarget;
  value?: string | number | boolean;
  description?: string;
  url?: string;
  timestamp: number;
}

export interface RecordFlowOptions {
  flowId?: string;
  flowName?: string;
  initialUrl?: string;
  outputPath?: string;
  role?: string;
}

export class FlowRecorder {
  constructor(private config: IntentproofConfig) { }

  /**
   * Start an interactive recording session in the browser.
   */
  public async recordSession(options: RecordFlowOptions = {}): Promise<FlowDefinition> {
    const baseUrl = this.config.baseUrl || 'http://localhost:3000';
    const initialPath = options.initialUrl || '/';
    const startUrl = initialPath.startsWith('http') ? initialPath : new URL(initialPath, baseUrl).toString();
    const role = options.role || 'user';

    const recordedActions: RecordedAction[] = [];
    let isRecordingComplete = false;

    // Check for storage state
    let storageState: BrowserContextOptions['storageState'];
    if (this.config.auth && this.config.auth[role]) {
      const authStrategy = this.config.auth[role];
      const statePath = (authStrategy as unknown as { options?: { storageStatePath?: unknown } }).options?.storageStatePath;
      if (typeof statePath === 'string') {
        try {
          const content = await fs.readFile(statePath, 'utf-8');
          storageState = JSON.parse(content) as BrowserContextOptions['storageState'];
        } catch {
          // Recording can continue without cached state.
        }
      }
    }

    console.log(pc.cyan(`\n🎥 [Intentproof Recorder] Launching browser recording session...`));
    console.log(pc.dim(`   Base URL: ${baseUrl}`));
    console.log(pc.dim(`   Target URL: ${startUrl}`));
    console.log(pc.yellow(`   💡 Interact with the application. Click 'Finish & Generate YAML' in the floating banner or close the browser when done.\n`));

    const browser = await chromium.launch({
      headless: false,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
      ignoreDefaultArgs: ['--enable-automation'],
    });

    const context = await browser.newContext({
      storageState,
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage();

    // Expose action logger to browser window
    await page.exposeFunction('__intentproof_record', (action: RecordedAction) => {
      recordedActions.push(action);
      console.log(pc.green(`   ⚡ [Recorded] ${action.type}: ${action.target || action.value || ''}`));
    });

    // Expose finish trigger
    await page.exposeFunction('__intentproof_finish', async () => {
      isRecordingComplete = true;
    });

    // Inject client-side event listeners
    await page.addInitScript(() => {
      function getSmartSelector(el: HTMLElement): FlowTarget {
        if (!el) return 'body';
        const testId = el.getAttribute('data-testid');
        if (testId) return { testId };
        const label = (el as HTMLInputElement).labels?.[0]?.textContent?.trim();
        if (label) return { label, exact: true };
        const ariaLabel = el.getAttribute('aria-label');
        const role = el.getAttribute('role') || ({ BUTTON: 'button', A: 'link', SELECT: 'combobox' } as Record<string, string>)[el.tagName];
        const text = el.textContent?.trim();
        if (role && (ariaLabel || text)) return { role, name: ariaLabel || text, exact: true };
        const placeholder = el.getAttribute('placeholder');
        if (placeholder) return { placeholder, exact: true };
        if (el.id) return { selector: `#${CSS.escape(el.id)}` };
        const name = el.getAttribute('name');
        if (name) return { selector: `[name="${CSS.escape(name)}"]` };
        if (text && text.length > 1 && text.length < 60 && !text.includes('\n')) return { text, exact: true };
        return { selector: el.tagName.toLowerCase() };
      }

      // Record clicks
      document.addEventListener(
        'click',
        (e) => {
          const target = e.target as HTMLElement;
          if (!target || target.closest('#intentproof-recorder-hud')) return;

          const option = target.closest('[role="option"]') as HTMLElement | null;
          const text = (option || target).textContent?.trim();
          if (option && text) {
            const combobox = document.querySelector('[role="combobox"][aria-expanded="true"]') as HTMLElement | null;
            window.__intentproof_record({
              type: 'select_option',
              target: getSmartSelector(combobox || option),
              value: text,
              description: `Select option "${text.slice(0, 40)}"`,
              timestamp: Date.now(),
            });
            return;
          }
          const selector = getSmartSelector(target);
          window.__intentproof_record({
            type: 'click',
            target: selector,
            description: text ? `Click "${text.slice(0, 25)}"` : `Click ${selector}`,
            timestamp: Date.now(),
          });
        },
        true
      );

      // Record input / fill
      document.addEventListener(
        'change',
        (e) => {
          const target = e.target as HTMLInputElement;
          if (!target || target.closest('#intentproof-recorder-hud')) return;

          const selector = getSmartSelector(target);
          const actionType = target.tagName === 'SELECT' ? 'select' : 'fill';
          window.__intentproof_record({
            type: actionType,
            target: selector,
            value: target.value,
            description: `Fill "${target.value}" into ${selector}`,
            timestamp: Date.now(),
          });
        },
        true
      );

      // Record Enter press
      document.addEventListener(
        'keydown',
        (e) => {
          if (e.key === 'Enter') {
            const target = e.target as HTMLElement;
            if (!target || target.closest('#intentproof-recorder-hud')) return;

            const selector = getSmartSelector(target);
            window.__intentproof_record({
              type: 'press_key',
              target: selector,
              value: 'Enter',
              description: `Press Enter on ${selector}`,
              timestamp: Date.now(),
            });
          }
        },
        true
      );

      // Inject floating recorder HUD
      window.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('intentproof-recorder-hud')) return;
        const hud = document.createElement('div');
        hud.id = 'intentproof-recorder-hud';
        hud.style.position = 'fixed';
        hud.style.bottom = '20px';
        hud.style.right = '20px';
        hud.style.zIndex = '999999';
        hud.style.backgroundColor = '#1e1e2e';
        hud.style.color = '#fff';
        hud.style.padding = '12px 18px';
        hud.style.borderRadius = '12px';
        hud.style.boxShadow = '0 10px 25px rgba(0,0,0,0.4)';
        hud.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        hud.style.fontSize = '13px';
        hud.style.display = 'flex';
        hud.style.alignItems = 'center';
        hud.style.gap = '12px';
        hud.style.border = '1px solid #3b82f6';

        hud.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="width:10px;height:10px;border-radius:50%;background-color:#ef4444;display:inline-block;animation:pulse 1.5s infinite;"></span>
            <strong>Intentproof Recording</strong>
          </div>
          <button id="intentproof-btn-finish" style="background:#3b82f6;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;">
            Finish & Save YAML
          </button>
        `;

        document.body.appendChild(hud);

        document.getElementById('intentproof-btn-finish')?.addEventListener('click', () => {
          window.__intentproof_finish();
        });
      });
    });

    try {
      await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
    } catch (err: any) {
      console.log(pc.yellow(`   ⚠️ Initial navigation error: ${err.message}`));
    }

    // Wait until browser closed or Finish button clicked
    while (!isRecordingComplete && !browser.isConnected() === false) {
      await page.waitForTimeout(500).catch(() => {
        isRecordingComplete = true;
      });
      if (page.isClosed()) break;
    }

    await browser.close().catch(() => { });

    console.log(pc.cyan(`\n🎬 [Intentproof Recorder] Recording ended. Processing ${recordedActions.length} recorded actions...`));

    // Synthesize into FlowDefinition
    const flowId = options.flowId || `recorded.flow.${Date.now()}`;
    const flowName = options.flowName || `[AUTOMATION] Recorded Flow (${new Date().toLocaleTimeString()})`;

    const steps: FlowStep[] = [
      {
        id: 'step-initial-navigation',
        action: 'navigate',
        target: initialPath,
        description: `Navigate to ${initialPath}`,
      },
    ];

    // Deduplicate / optimize steps
    for (let i = 0; i < recordedActions.length; i++) {
      const a = recordedActions[i];
      steps.push({
        id: `step-${i + 1}-${a.type}`,
        action: a.type,
        target: a.target,
        value: a.value,
        description: a.description,
      });
    }

    const flowDefinition: FlowDefinition = {
      id: flowId,
      name: flowName,
      description: `[AUTOMATION-FLOW] Auto-recorded interactive browser flow session.`,
      priority: 'critical',
      roles: [role],
      tags: ['automation', 'recorded', 'e2e'],
      preconditions: [
        {
          authenticated_as: role,
          route: initialPath,
        },
      ],
      steps,
      assertions: recordedActions.length > 0 && recordedActions[recordedActions.length - 1].target
        ? [{
            id: 'assert-recorded-completion',
            type: 'element_visible',
            target: recordedActions[recordedActions.length - 1].target,
            description: 'TODO: replace this inferred final-element check with a business outcome assertion.',
          }]
        : [{
            id: 'assert-navigation-completed',
            type: 'url_matches',
            value: initialPath,
            description: 'Initial navigation reached the requested route.',
          }],
      evidence: {
        checkpoints: [
          {
            id: 'initial-view',
            trigger: 'after_step',
            stepId: 'step-initial-navigation',
            screenshot: true,
            description: '[AUTOMATION-PROOF] Initial view before user interaction',
          },
          ...(steps.length > 1
            ? [
              {
                id: 'final-action-proof',
                trigger: 'after_step' as const,
                stepId: steps[steps.length - 1].id,
                screenshot: true,
                description: '[AUTOMATION-PROOF] Final state after recorded actions',
              },
            ]
            : []),
        ],
      },
    };

    // Save YAML
    const flowsDir = this.config.flowsDir || './flows';
    const targetDir = path.isAbsolute(flowsDir) ? flowsDir : path.join(process.cwd(), flowsDir);
    const targetFile = options.outputPath || path.join(targetDir, `${flowId.replace(/\./g, '-')}.yaml`);
    await fs.mkdir(path.dirname(targetFile), { recursive: true });
    const yamlString = YAML.stringify(flowDefinition);
    await fs.writeFile(targetFile, yamlString, 'utf-8');

    console.log(pc.green(`\n✨ [Intentproof Recorder] Successfully generated YAML contract!`));
    console.log(pc.white(`   📄 Saved to: ${targetFile}`));
    console.log(pc.cyan(`\n   To verify immediately, run:`));
    console.log(pc.yellow(`   intentproof verify --flow ${flowId} --executor aside\n`));

    return flowDefinition;
  }
}
