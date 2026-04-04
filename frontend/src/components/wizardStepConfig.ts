/**
 * Configuration for WelcomeWizard step navigation.
 *
 * This module provides a declarative configuration system for the wizard's
 * step visibility and navigation logic across different modes.
 */

import * as m from "../paraglide/messages.js";

export type WizardStep =
  | "welcome"
  | "features"
  | "schedule-selection"
  | "team-selection"
  | "timeoff-setup"
  | "time-tracking-setup"
  | "gantt-setup"
  | "work-location-setup"
  | "account-setup";

export type WizardMode = "onboarding" | "change-team" | "change-schedule";

/**
 * Configuration for a single wizard step.
 * Defines visibility conditions and navigation behavior.
 */
export interface StepConfig {
  /** Step identifier */
  id: WizardStep;
  /** Title displayed in the modal header */
  title: () => string;
  /** Determines if this step should be included in the flow */
  isVisible: (context: WizardContext) => boolean;
  /** Determines the next step, or null to close the wizard */
  getNextStep: (context: WizardContext) => WizardStep | null;
  /** Determines the previous step, or null to close the wizard */
  getPrevStep: (context: WizardContext) => WizardStep | null;
}

/**
 * Runtime context passed to step configuration functions.
 * Contains mode and schedule selection state.
 */
export interface WizardContext {
  mode: WizardMode;
  shouldShowTeamSelection: boolean;
  enableTimeOff: boolean; // Currently always true in onboarding; reserved for future use or per-step control
}

/**
 * Declarative wizard flow configuration.
 * Defines all possible steps and their visibility/navigation rules.
 *
 * Benefits:
 * - Single source of truth for wizard flows
 * - Easy to add/modify steps
 * - Self-documenting step relationships
 * - Type-safe step transitions
 */
export const WIZARD_STEP_CONFIG: StepConfig[] = [
  {
    id: "welcome",
    title: m.wizard_welcome_title,
    isVisible: (ctx) => ctx.mode === "onboarding",
    getNextStep: () => "features",
    getPrevStep: () => null,
  },
  {
    id: "features",
    title: m.wizard_features_title,
    isVisible: (ctx) => ctx.mode === "onboarding",
    getNextStep: () => "schedule-selection",
    getPrevStep: () => "welcome",
  },
  {
    id: "schedule-selection",
    title: m.wizard_schedule_title,
    isVisible: (ctx) => ctx.mode === "onboarding" || ctx.mode === "change-schedule",
    getNextStep: (ctx) => {
      if (ctx.shouldShowTeamSelection) {
        return "team-selection";
      }
      // In change-schedule mode, close wizard after schedule selection if no team is needed
      if (ctx.mode === "change-schedule") {
        return null;
      }
      // In onboarding, always show time off setup so users can opt in/out there
      return "timeoff-setup";
    },
    getPrevStep: (ctx) => {
      // In change-schedule mode, close wizard when going back
      if (ctx.mode === "change-schedule") {
        return null;
      }
      return "features";
    },
  },
  {
    id: "team-selection",
    title: m.wizard_team_title,
    isVisible: (ctx) => ctx.shouldShowTeamSelection || ctx.mode === "change-team",
    getNextStep: (ctx) => {
      // In change modes, close wizard after team selection
      if (ctx.mode === "change-schedule" || ctx.mode === "change-team") {
        return null;
      }
      // In onboarding, always show time off setup so users can opt in/out there
      return "timeoff-setup";
    },
    getPrevStep: (ctx) => {
      if (ctx.mode === "change-team") {
        return null;
      }
      return "schedule-selection";
    },
  },
  {
    id: "timeoff-setup",
    title: m.wizard_timeoff_title,
    isVisible: (ctx) => ctx.mode === "onboarding",
    getNextStep: () => "time-tracking-setup",
    getPrevStep: (ctx) => (ctx.shouldShowTeamSelection ? "team-selection" : "schedule-selection"),
  },
  {
    id: "time-tracking-setup",
    title: m.wizard_tracking_title,
    isVisible: (ctx) => ctx.mode === "onboarding",
    getNextStep: () => "gantt-setup",
    getPrevStep: () => "timeoff-setup",
  },
  {
    id: "gantt-setup",
    title: m.wizard_gantt_heading,
    isVisible: (ctx) => ctx.mode === "onboarding",
    getNextStep: () => "work-location-setup",
    getPrevStep: () => "time-tracking-setup",
  },
  {
    id: "work-location-setup",
    title: m.wizard_location_title,
    isVisible: (ctx) => ctx.mode === "onboarding",
    getNextStep: () => "account-setup",
    getPrevStep: () => "gantt-setup",
  },
  {
    id: "account-setup",
    title: m.wizard_account_heading,
    isVisible: (ctx) => ctx.mode === "onboarding",
    getNextStep: () => null,
    getPrevStep: () => "work-location-setup",
  },
];

/**
 * Get visible steps for current wizard context.
 */
export function getVisibleSteps(context: WizardContext): StepConfig[] {
  return WIZARD_STEP_CONFIG.filter((step) => step.isVisible(context));
}

/**
 * Get configuration for a specific step.
 */
export function getStepConfig(stepId: WizardStep): StepConfig {
  const config = WIZARD_STEP_CONFIG.find((s) => s.id === stepId);
  if (!config) {
    throw new Error(`No configuration found for step: ${stepId}`);
  }
  return config;
}

/**
 * Get 1-based index of a step within visible steps.
 */
export function getStepIndex(stepId: WizardStep, context: WizardContext): number {
  const visibleSteps = getVisibleSteps(context);
  const index = visibleSteps.findIndex((s) => s.id === stepId);
  if (index === -1) {
    throw new Error(
      `Unknown WizardStep: "${stepId}" is not visible in the current wizard context (mode: ${context.mode})`,
    );
  }
  return index + 1; // 1-based index
}

/**
 * Get total number of visible steps for current context.
 */
export function getTotalSteps(context: WizardContext): number {
  return getVisibleSteps(context).length;
}
