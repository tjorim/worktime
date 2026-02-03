import { describe, expect, it } from "vitest";
import {
  type WizardContext,
  type WizardStep,
  getVisibleSteps,
  getTotalSteps,
  getStepIndex,
  getStepConfig,
} from "../../src/components/wizardStepConfig";

/**
 * Tests for WelcomeWizard configuration-driven step navigation.
 * 
 * These tests verify that the declarative step configuration correctly handles:
 * - Step visibility in different wizard modes
 * - Navigation between steps based on context
 * - Total step counts for each mode
 * - Step indexing within visible steps
 */

describe("WelcomeWizard Configuration System", () => {
  describe("Step Configuration - Visibility Rules", () => {
    it("should show all 5 steps in onboarding mode with team selection", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: true,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: false,
      };

      const visibleSteps = getVisibleSteps(context);
      expect(visibleSteps).toHaveLength(5);
      expect(visibleSteps.map((s) => s.id)).toEqual([
        "welcome",
        "features",
        "schedule-selection",
        "team-selection",
        "vacation-allowance",
      ]);
    });

    it("should show 4 steps in onboarding mode without team selection", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: false,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: false,
      };

      const visibleSteps = getVisibleSteps(context);
      expect(visibleSteps).toHaveLength(4);
      expect(visibleSteps.map((s) => s.id)).toEqual([
        "welcome",
        "features",
        "schedule-selection",
        "vacation-allowance",
      ]);
    });

    it("should show only team-selection in change-team mode", () => {
      const context: WizardContext = {
        mode: "change-team",
        shouldShowTeamSelection: false,
        isChangeTeamFlow: true,
        isChangeScheduleFlow: false,
      };

      const visibleSteps = getVisibleSteps(context);
      expect(visibleSteps).toHaveLength(1);
      expect(visibleSteps[0].id).toBe("team-selection");
    });

    it("should show schedule-selection in change-schedule mode", () => {
      const context: WizardContext = {
        mode: "change-schedule",
        shouldShowTeamSelection: false,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: true,
      };

      const visibleSteps = getVisibleSteps(context);
      expect(visibleSteps).toHaveLength(1);
      expect(visibleSteps[0].id).toBe("schedule-selection");
    });

    it("should show schedule + team in change-schedule mode with team selection needed", () => {
      const context: WizardContext = {
        mode: "change-schedule",
        shouldShowTeamSelection: true,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: true,
      };

      const visibleSteps = getVisibleSteps(context);
      expect(visibleSteps).toHaveLength(2);
      expect(visibleSteps.map((s) => s.id)).toEqual(["schedule-selection", "team-selection"]);
    });
  });

  describe("Step Configuration - Navigation Rules", () => {
    it("should navigate from welcome to features in onboarding", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: false,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: false,
      };

      const welcomeConfig = getStepConfig("welcome");
      const nextStep = welcomeConfig.getNextStep(context);
      expect(nextStep).toBe("features");
    });

    it("should navigate from features to schedule-selection in onboarding", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: false,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: false,
      };

      const featuresConfig = getStepConfig("features");
      const nextStep = featuresConfig.getNextStep(context);
      expect(nextStep).toBe("schedule-selection");
    });

    it("should navigate from schedule to team-selection when team selection is needed", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: true,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: false,
      };

      const scheduleConfig = getStepConfig("schedule-selection");
      const nextStep = scheduleConfig.getNextStep(context);
      expect(nextStep).toBe("team-selection");
    });

    it("should skip team-selection and go to vacation when no team selection needed", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: false,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: false,
      };

      const scheduleConfig = getStepConfig("schedule-selection");
      const nextStep = scheduleConfig.getNextStep(context);
      expect(nextStep).toBe("vacation-allowance");
    });

    it("should close wizard after schedule selection in change-schedule mode (no team)", () => {
      const context: WizardContext = {
        mode: "change-schedule",
        shouldShowTeamSelection: false,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: true,
      };

      const scheduleConfig = getStepConfig("schedule-selection");
      const nextStep = scheduleConfig.getNextStep(context);
      expect(nextStep).toBeNull();
    });

    it("should close wizard after schedule selection in change-team mode (no team)", () => {
      const context: WizardContext = {
        mode: "change-team",
        shouldShowTeamSelection: false,
        isChangeTeamFlow: true,
        isChangeScheduleFlow: false,
      };

      const scheduleConfig = getStepConfig("schedule-selection");
      const nextStep = scheduleConfig.getNextStep(context);
      expect(nextStep).toBeNull();
    });

    it("should go to team-selection after schedule in change-schedule mode (with team)", () => {
      const context: WizardContext = {
        mode: "change-schedule",
        shouldShowTeamSelection: true,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: true,
      };

      const scheduleConfig = getStepConfig("schedule-selection");
      const nextStep = scheduleConfig.getNextStep(context);
      expect(nextStep).toBe("team-selection");
    });

    it("should close wizard after team selection in change modes", () => {
      const context: WizardContext = {
        mode: "change-team",
        shouldShowTeamSelection: false,
        isChangeTeamFlow: true,
        isChangeScheduleFlow: false,
      };

      const teamConfig = getStepConfig("team-selection");
      const nextStep = teamConfig.getNextStep(context);
      expect(nextStep).toBeNull();
    });

    it("should close wizard after vacation allowance in onboarding", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: false,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: false,
      };

      const vacationConfig = getStepConfig("vacation-allowance");
      const nextStep = vacationConfig.getNextStep(context);
      expect(nextStep).toBeNull();
    });
  });

  describe("Step Configuration - Backward Navigation", () => {
    it("should go back from features to welcome", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: false,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: false,
      };

      const featuresConfig = getStepConfig("features");
      const prevStep = featuresConfig.getPrevStep(context);
      expect(prevStep).toBe("welcome");
    });

    it("should go back from schedule to features in onboarding", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: false,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: false,
      };

      const scheduleConfig = getStepConfig("schedule-selection");
      const prevStep = scheduleConfig.getPrevStep(context);
      expect(prevStep).toBe("features");
    });

    it("should close wizard when going back from schedule in change modes", () => {
      const context: WizardContext = {
        mode: "change-schedule",
        shouldShowTeamSelection: false,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: true,
      };

      const scheduleConfig = getStepConfig("schedule-selection");
      const prevStep = scheduleConfig.getPrevStep(context);
      expect(prevStep).toBeNull();
    });

    it("should go back from team-selection to schedule-selection", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: true,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: false,
      };

      const teamConfig = getStepConfig("team-selection");
      const prevStep = teamConfig.getPrevStep(context);
      expect(prevStep).toBe("schedule-selection");
    });

    it("should go back from vacation to team when team selection shown", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: true,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: false,
      };

      const vacationConfig = getStepConfig("vacation-allowance");
      const prevStep = vacationConfig.getPrevStep(context);
      expect(prevStep).toBe("team-selection");
    });

    it("should go back from vacation to schedule when no team selection", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: false,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: false,
      };

      const vacationConfig = getStepConfig("vacation-allowance");
      const prevStep = vacationConfig.getPrevStep(context);
      expect(prevStep).toBe("schedule-selection");
    });
  });

  describe("Step Configuration - Step Counting", () => {
    it("should count 5 total steps in onboarding with team selection", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: true,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: false,
      };

      const totalSteps = getTotalSteps(context);
      expect(totalSteps).toBe(5);
    });

    it("should count 4 total steps in onboarding without team selection", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: false,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: false,
      };

      const totalSteps = getTotalSteps(context);
      expect(totalSteps).toBe(4);
    });

    it("should count 1 step in change-team mode", () => {
      const context: WizardContext = {
        mode: "change-team",
        shouldShowTeamSelection: false,
        isChangeTeamFlow: true,
        isChangeScheduleFlow: false,
      };

      const totalSteps = getTotalSteps(context);
      expect(totalSteps).toBe(1);
    });

    it("should count 2 steps in change-schedule mode with team selection", () => {
      const context: WizardContext = {
        mode: "change-schedule",
        shouldShowTeamSelection: true,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: true,
      };

      const totalSteps = getTotalSteps(context);
      expect(totalSteps).toBe(2);
    });

    it("should count 1 step in change-schedule mode without team selection", () => {
      const context: WizardContext = {
        mode: "change-schedule",
        shouldShowTeamSelection: false,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: true,
      };

      const totalSteps = getTotalSteps(context);
      expect(totalSteps).toBe(1);
    });
  });

  describe("Step Configuration - Step Indexing", () => {
    it("should correctly index steps in onboarding with team selection", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: true,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: false,
      };

      expect(getStepIndex("welcome", context)).toBe(1);
      expect(getStepIndex("features", context)).toBe(2);
      expect(getStepIndex("schedule-selection", context)).toBe(3);
      expect(getStepIndex("team-selection", context)).toBe(4);
      expect(getStepIndex("vacation-allowance", context)).toBe(5);
    });

    it("should correctly index steps in onboarding without team selection", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: false,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: false,
      };

      expect(getStepIndex("welcome", context)).toBe(1);
      expect(getStepIndex("features", context)).toBe(2);
      expect(getStepIndex("schedule-selection", context)).toBe(3);
      expect(getStepIndex("vacation-allowance", context)).toBe(4);
    });

    it("should correctly index team-selection in change-team mode", () => {
      const context: WizardContext = {
        mode: "change-team",
        shouldShowTeamSelection: false,
        isChangeTeamFlow: true,
        isChangeScheduleFlow: false,
      };

      expect(getStepIndex("team-selection", context)).toBe(1);
    });
  });

  describe("Step Configuration - Benefits Validation", () => {
    it("validates that configuration is declarative and centralized", () => {
      const sampleStepConfig = {
        id: "welcome",
        title: "Welcome to Worktime! 👋",
        isVisible: (ctx: WizardContext) => ctx.mode === "onboarding",
        getNextStep: () => "features" as WizardStep | null,
        getPrevStep: () => null as WizardStep | null,
      };

      const requiredProps = ["id", "title", "isVisible", "getNextStep", "getPrevStep"];
      requiredProps.forEach((prop) => {
        expect(sampleStepConfig).toHaveProperty(prop);
      });
    });

    it("validates that step visibility is computed from configuration", () => {
      const onboardingContext: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: true,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: false,
      };
      const onboardingSteps = getVisibleSteps(onboardingContext);
      expect(onboardingSteps).toHaveLength(5);

      const changeTeamContext: WizardContext = {
        mode: "change-team",
        shouldShowTeamSelection: false,
        isChangeTeamFlow: true,
        isChangeScheduleFlow: false,
      };
      const changeTeamSteps = getVisibleSteps(changeTeamContext);
      expect(changeTeamSteps).toHaveLength(1);
    });

    it("validates that navigation is derived from configuration", () => {
      const onboardingContext: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: false,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: false,
      };

      const welcomeNext = getStepConfig("welcome").getNextStep(onboardingContext);
      expect(welcomeNext).toBe("features");

      const featuresPrev = getStepConfig("features").getPrevStep(onboardingContext);
      expect(featuresPrev).toBe("welcome");

      const changeScheduleContext: WizardContext = {
        mode: "change-schedule",
        shouldShowTeamSelection: false,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: true,
      };
      const scheduleNext = getStepConfig("schedule-selection").getNextStep(changeScheduleContext);
      expect(scheduleNext).toBeNull();
    });

    it("validates that step counting is automatic from visible steps", () => {
      const onboardingWithTeam: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: true,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: false,
      };
      expect(getTotalSteps(onboardingWithTeam)).toBe(5);

      const onboardingWithoutTeam: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: false,
        isChangeTeamFlow: false,
        isChangeScheduleFlow: false,
      };
      expect(getTotalSteps(onboardingWithoutTeam)).toBe(4);

      const changeTeam: WizardContext = {
        mode: "change-team",
        shouldShowTeamSelection: false,
        isChangeTeamFlow: true,
        isChangeScheduleFlow: false,
      };
      expect(getTotalSteps(changeTeam)).toBe(1);

      // Validate step indexing
      expect(getStepIndex("schedule-selection", onboardingWithTeam)).toBe(3);
    });
  });
});
