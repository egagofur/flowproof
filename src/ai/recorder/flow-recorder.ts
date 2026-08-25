import { chromium, Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import YAML from 'yaml';
import pc from 'picocolors';
import { FlowDefinition, FlowStep } from '../../core/contracts/flow.js';
import { IntentproofConfig } from '../../adapter/config.js';

export interface RecordedAction {
  type: 'navigate' | 'click' | 'fill' | 'select' | 'press_key' | 'submit';
  target?: string;
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
    let storageState: any = undefined;
    if (this.config.auth && this.config.auth[role]) {
      const authStrategy = this.config.auth[role];
      if ((authStrategy as any).options?.storageStatePath) {
        const p = (authStrategy as any).options.storageStatePath;
        try {
          const content = await fs.readFile(p, 'utf-8');
          storageState = JSON.parse(content);
        } catch { }
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
    await page.exposeFunction('__flowproof_record', (action: RecordedAction) => {
      recordedActions.push(action);
      console.log(pc.green(`   ⚡ [Recorded] ${action.type}: ${action.target || action.value || ''}`));
    });

    // Expose finish trigger
    await page.exposeFunction('__flowproof_finish', async () => {
      isRecordingComplete = true;
    });

    // Inject client-side event listeners
    await page.addInitScript(() => {
      function getSmartSelector(el: HTMLElement): string {
        if (!el) return 'body';

        // 1. Data test id
        if (el.getAttribute('data-testid')) {
          return `[data-testid="${el.getAttribute('data-testid')}"]`;
        }

        // 2. Ant Design Select Option item
        const optionItem = el.closest('.ant-select-item-option') || el.closest('.ant-select-dropdown [role="option"]');
        if (optionItem || el.classList?.contains('ant-select-item-option-content')) {
          const text = (optionItem || el).textContent?.trim();
          if (text) return `.ant-select-item-option:has-text("${text}")`;
        }

        // 3. Ant Design DatePicker cell
        const pickerCell = el.closest('.ant-picker-cell');
        if (pickerCell || el.classList?.contains('ant-picker-cell-inner')) {
          const text = (pickerCell || el).textContent?.trim();
          if (text) return `.ant-picker-cell:not(.ant-picker-cell-disabled):has-text("${text}")`;
        }

        // 4. Form item label association (Ant Design / standard forms)
        const formItem = el.closest('.ant-form-item');
        if (formItem) {
          const label = formItem.querySelector('label')?.textContent?.trim();
          if (label) {
            if (el.closest('.ant-select')) return `.ant-form-item:has-text("${label}") .ant-select`;
            if (el.tagName === 'INPUT') return `.ant-form-item:has-text("${label}") input`;
            return `.ant-form-item:has-text("${label}")`;
          }
        }

        // 5. Button or element inside button with text
        const btn = el.tagName === 'BUTTON' ? el : el.closest('button');
        if (btn) {
          const text = btn.textContent?.trim();
          if (text && text.length < 35 && !text.includes('\n')) {
            return `button:has-text("${text}")`;
          }
          if (btn.getAttribute('aria-label')) {
            return `button[aria-label="${btn.getAttribute('aria-label')}"]`;
          }
        }

        // 6. Link with text
        const link = el.tagName === 'A' ? el : el.closest('a');
        if (link) {
          const text = link.textContent?.trim();
          if (text && text.length < 35 && !text.includes('\n')) {
            return `a:has-text("${text}")`;
          }
        }

        // 7. Aria label
        if (el.getAttribute('aria-label')) {
          return `[aria-label="${el.getAttribute('aria-label')}"]`;
        }

        // 8. Placeholder
        if (el.getAttribute('placeholder')) {
          return `input[placeholder="${el.getAttribute('placeholder')}"]`;
        }

        // 9. Input name or id
        if (el.getAttribute('name')) {
          return `input[name="${el.getAttribute('name')}"]`;
        }
        if (el.id) {
          return `#${el.id}`;
        }

        // 10. Text content fallback for clickable items
        const text = el.textContent?.trim();
        if (text && text.length > 1 && text.length < 30 && !text.includes('\n')) {
          return `${el.tagName.toLowerCase()}:has-text("${text}")`;
        }

        // 11. Class fallback
        const className = typeof el.className === 'string' ? el.className.split(' ')[0] : '';
        if (className) {
          return `${el.tagName.toLowerCase()}.${className}`;
        }

        return el.tagName.toLowerCase();
      }

      // Record clicks
      document.addEventListener(
        'click',
        (e) => {
          const target = e.target as HTMLElement;
          if (!target || target.closest('#flowproof-recorder-hud')) return;

          const selector = getSmartSelector(target);
          const text = target.textContent?.trim();
          (window as any).__flowproof_record({
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
          if (!target || target.closest('#flowproof-recorder-hud')) return;

          const selector = getSmartSelector(target);
          (window as any).__flowproof_record({
            type: 'fill',
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
            if (!target || target.closest('#flowproof-recorder-hud')) return;

            const selector = getSmartSelector(target);
            (window as any).__flowproof_record({
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
        if (document.getElementById('flowproof-recorder-hud')) return;
        const hud = document.createElement('div');
        hud.id = 'flowproof-recorder-hud';
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
          <button id="flowproof-btn-finish" style="background:#3b82f6;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;">
            Finish & Save YAML
          </button>
        `;

        document.body.appendChild(hud);

        document.getElementById('flowproof-btn-finish')?.addEventListener('click', () => {
          (window as any).__flowproof_finish();
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
        action: a.type as any,
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
      assertions: [
        {
          id: 'assert-flow-completed',
          type: 'element_visible',
          target: 'body',
          description: 'Flow executed and final view rendered',
        },
      ],
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
