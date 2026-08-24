import { FlowAssertion, FlowDefinition, FlowStep } from '../../core/contracts/flow.js';

export class AsidePromptTranslator {
  /**
   * Translate a single flow step into a natural language semantic intent.
   */
  public static translateStep(step: FlowStep): string {
    if (step.description) {
      return step.description;
    }

    switch (step.action) {
      case 'navigate':
        return `Navigate to ${step.target || 'the homepage'}`;
      case 'click':
        return `Click the element described by '${step.target}'`;
      case 'fill':
      case 'type':
        return `Type '${step.value}' into '${step.target}'`;
      case 'select':
        return `Select option '${step.value}' in '${step.target}'`;
      case 'select_date':
        return `Select date '${step.value}' in '${step.target}'`;
      case 'hover':
        return `Hover over '${step.target}'`;
      case 'submit':
        return `Submit the form using '${step.target || 'submit button'}'`;
      case 'wait':
        return `Wait for ${step.value || 1000}ms`;
      case 'press_key':
        return `Press key '${step.value || 'Enter'}'`;
      case 'custom':
        return `Execute custom step '${step.customHandler || step.target}'`;
      default:
        return `Perform ${step.action} on ${step.target || 'page'}`;
    }
  }

  /**
   * Translate an assertion into an intent verification instruction.
   */
  public static translateAssertion(assertion: FlowAssertion): string {
    if (assertion.description) {
      return `Verify that: ${assertion.description}`;
    }

    switch (assertion.type) {
      case 'element_visible':
        return `Verify that element '${assertion.target}' is visible on screen`;
      case 'element_hidden':
        return `Verify that element '${assertion.target}' is hidden or closed`;
      case 'text_contains':
        return `Verify that element '${assertion.target}' contains text '${assertion.value}'`;
      case 'text_equals':
        return `Verify that element '${assertion.target}' has exact text '${assertion.value}'`;
      case 'url_matches':
        return `Verify that the page URL matches '${assertion.value || assertion.target}'`;
      case 'value_equals':
        return `Verify that input '${assertion.target}' has value '${assertion.value}'`;
      default:
        return `Verify assertion '${assertion.id || assertion.type}' on '${assertion.target}'`;
    }
  }

  /**
   * Build a comprehensive high-level task goal prompt for an agentic browser execution.
   */
  public static buildFlowGoal(flow: FlowDefinition): string {
    let goal = `Goal: Execute user flow '${flow.name}'\n`;
    if (flow.description) {
      goal += `Description: ${flow.description}\n\n`;
    }

    goal += `Planned Steps:\n`;
    flow.steps.forEach((s, idx) => {
      goal += `${idx + 1}. ${this.translateStep(s)}\n`;
    });

    goal += `\nExpected Verifications:\n`;
    flow.assertions.forEach((a, idx) => {
      goal += `${idx + 1}. ${this.translateAssertion(a)}\n`;
    });

    return goal;
  }
}
