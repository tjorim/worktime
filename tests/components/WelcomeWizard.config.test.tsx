import { describe, expect, it } from "vite-plus/test";
import {
  type WizardContext,
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
    it("should show all steps in onboarding mode with team selection", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: true,
        enableTimeOff: true,
      };

      const visibleSteps = getVisibleSteps(context);
      expect(visibleSteps).toHaveLength(8);
      expect(visibleSteps.map((s) => s.id)).toEqual([
        "welcome",
        "features",
        "schedule-selection",
        "team-selection",
        "timeoff-setup",
        "time-tracking-setup",
        "gantt-setup",
        "work-location-setup",
      ]);
    });

    it("should show all steps in onboarding mode without team selection", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: false,
        enableTimeOff: true,
      };

      const visibleSteps = getVisibleSteps(context);
      expect(visibleSteps).toHaveLength(7);
      expect(visibleSteps.map((s) => s.id)).toEqual([
        "welcome",
        "features",
        "schedule-selection",
        "timeoff-setup",
        "time-tracking-setup",
        "gantt-setup",
        "work-location-setup",
      ]);
    });

    it("should show only team-selection in change-team mode", () => {
      const context: WizardContext = {
        mode: "change-team",
        shouldShowTeamSelection: false,
        enableTimeOff: false,
      };

      const visibleSteps = getVisibleSteps(context);
      expect(visibleSteps).toHaveLength(1);
      expect(visibleSteps[0].id).toBe("team-selection");
    });

    it("should show schedule-selection in change-schedule mode", () => {
      const context: WizardContext = {
        mode: "change-schedule",
        shouldShowTeamSelection: false,
        enableTimeOff: false,
      };

      const visibleSteps = getVisibleSteps(context);
      expect(visibleSteps).toHaveLength(1);
      expect(visibleSteps[0].id).toBe("schedule-selection");
    });

    it("should show schedule + team in change-schedule mode with team selection needed", () => {
      const context: WizardContext = {
        mode: "change-schedule",
        shouldShowTeamSelection: true,
        enableTimeOff: false,
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
        enableTimeOff: false,
      };

      const welcomeConfig = getStepConfig("welcome");
      const nextStep = welcomeConfig.getNextStep(context);
      expect(nextStep).toBe("features");
    });

    it("should navigate from features to schedule-selection in onboarding", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: false,
        enableTimeOff: false,
      };

      const featuresConfig = getStepConfig("features");
      const nextStep = featuresConfig.getNextStep(context);
      expect(nextStep).toBe("schedule-selection");
    });

    it("should navigate from schedule to team-selection when team selection is needed", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: true,
        enableTimeOff: false,
      };

      const scheduleConfig = getStepConfig("schedule-selection");
      const nextStep = scheduleConfig.getNextStep(context);
      expect(nextStep).toBe("team-selection");
    });

    it("should skip team-selection and go to time off setup when no team selection is needed", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: false,
        enableTimeOff: false,
      };

      const scheduleConfig = getStepConfig("schedule-selection");
      const nextStep = scheduleConfig.getNextStep(context);
      expect(nextStep).toBe("timeoff-setup");
    });

    it("should close wizard after schedule selection in change-schedule mode (no team)", () => {
      const context: WizardContext = {
        mode: "change-schedule",
        shouldShowTeamSelection: false,
        enableTimeOff: false,
      };

      const scheduleConfig = getStepConfig("schedule-selection");
      const nextStep = scheduleConfig.getNextStep(context);
      expect(nextStep).toBeNull();
    });

    it("should continue to time off setup when schedule-selection is evaluated in change-team mode (hidden step)", () => {
      const context: WizardContext = {
        mode: "change-team",
        shouldShowTeamSelection: false,
        enableTimeOff: false,
      };

      // This step is not visible in change-team mode, but if evaluated directly
      // it falls through to the onboarding path and returns time off setup.
      const scheduleConfig = getStepConfig("schedule-selection");
      const nextStep = scheduleConfig.getNextStep(context);
      expect(nextStep).toBe("timeoff-setup");
    });

    it("should go to team-selection after schedule in change-schedule mode (with team)", () => {
      const context: WizardContext = {
        mode: "change-schedule",
        shouldShowTeamSelection: true,
        enableTimeOff: false,
      };

      const scheduleConfig = getStepConfig("schedule-selection");
      const nextStep = scheduleConfig.getNextStep(context);
      expect(nextStep).toBe("team-selection");
    });

    it("should close wizard after team selection in change modes", () => {
      const context: WizardContext = {
        mode: "change-team",
        shouldShowTeamSelection: false,
        enableTimeOff: false,
      };

      const teamConfig = getStepConfig("team-selection");
      const nextStep = teamConfig.getNextStep(context);
      expect(nextStep).toBeNull();
    });

    it("should continue to time tracking setup after time off setup in onboarding", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: false,
        enableTimeOff: true,
      };

      const timeOffConfig = getStepConfig("timeoff-setup");
      const nextStep = timeOffConfig.getNextStep(context);
      expect(nextStep).toBe("time-tracking-setup");
    });

    it("should continue to gantt setup after time tracking setup in onboarding", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: false,
        enableTimeOff: true,
      };

      const timeTrackingConfig = getStepConfig("time-tracking-setup");
      const nextStep = timeTrackingConfig.getNextStep(context);
      expect(nextStep).toBe("gantt-setup");
    });

    it("should continue to work location setup after gantt setup in onboarding", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: false,
        enableTimeOff: true,
      };

      const ganttConfig = getStepConfig("gantt-setup");
      const nextStep = ganttConfig.getNextStep(context);
      expect(nextStep).toBe("work-location-setup");
    });

    it("should close wizard after work location setup in onboarding", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: false,
        enableTimeOff: true,
      };

      const workLocationConfig = getStepConfig("work-location-setup");
      const nextStep = workLocationConfig.getNextStep(context);
      expect(nextStep).toBeNull();
    });
  });

  describe("Step Configuration - Backward Navigation", () => {
    const onboardingPostTimeTrackingContext: WizardContext = {
      mode: "onboarding",
      shouldShowTeamSelection: false,
      enableTimeOff: true,
    };

    it("should go back from features to welcome", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: false,
        enableTimeOff: false,
      };

      const featuresConfig = getStepConfig("features");
      const prevStep = featuresConfig.getPrevStep(context);
      expect(prevStep).toBe("welcome");
    });

    it("should go back from schedule to features in onboarding", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: false,
        enableTimeOff: false,
      };

      const scheduleConfig = getStepConfig("schedule-selection");
      const prevStep = scheduleConfig.getPrevStep(context);
      expect(prevStep).toBe("features");
    });

    it("should go back to time tracking setup from gantt setup in onboarding", () => {
      const ganttConfig = getStepConfig("gantt-setup");
      const prevStep = ganttConfig.getPrevStep(onboardingPostTimeTrackingContext);
      expect(prevStep).toBe("time-tracking-setup");
    });

    it("should go back to gantt setup from work location setup in onboarding", () => {
      const workLocationConfig = getStepConfig("work-location-setup");
      const prevStep = workLocationConfig.getPrevStep(onboardingPostTimeTrackingContext);
      expect(prevStep).toBe("gantt-setup");
    });

    it("should close wizard when going back from schedule in change modes", () => {
      const context: WizardContext = {
        mode: "change-schedule",
        shouldShowTeamSelection: false,
        enableTimeOff: false,
      };

      const scheduleConfig = getStepConfig("schedule-selection");
      const prevStep = scheduleConfig.getPrevStep(context);
      expect(prevStep).toBeNull();
    });

    it("should go back from team-selection to schedule-selection in onboarding", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: true,
        enableTimeOff: false,
      };

      const teamConfig = getStepConfig("team-selection");
      const prevStep = teamConfig.getPrevStep(context);
      expect(prevStep).toBe("schedule-selection");
    });

    it("should close wizard when going back from team-selection in change-team mode", () => {
      const context: WizardContext = {
        mode: "change-team",
        shouldShowTeamSelection: false,
        enableTimeOff: false,
      };

      const teamConfig = getStepConfig("team-selection");
      const prevStep = teamConfig.getPrevStep(context);
      expect(prevStep).toBeNull();
    });

    it("should go back from team-selection to schedule-selection in change-schedule mode", () => {
      const context: WizardContext = {
        mode: "change-schedule",
        shouldShowTeamSelection: true,
        enableTimeOff: false,
      };

      const teamConfig = getStepConfig("team-selection");
      const prevStep = teamConfig.getPrevStep(context);
      expect(prevStep).toBe("schedule-selection");
    });

    it("should go back from time off setup to team when team selection shown", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: true,
        enableTimeOff: true,
      };

      const timeOffConfig = getStepConfig("timeoff-setup");
      const prevStep = timeOffConfig.getPrevStep(context);
      expect(prevStep).toBe("team-selection");
    });

    it("should go back from time off setup to schedule when no team selection", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: false,
        enableTimeOff: true,
      };

      const timeOffConfig = getStepConfig("timeoff-setup");
      const prevStep = timeOffConfig.getPrevStep(context);
      expect(prevStep).toBe("schedule-selection");
    });
  });

  describe("Step Configuration - Step Counting", () => {
    it("should count 8 total steps in onboarding with team selection", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: true,
        enableTimeOff: true,
      };

      const totalSteps = getTotalSteps(context);
      expect(totalSteps).toBe(8);
    });

    it("should count 7 total steps in onboarding without team selection", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: false,
        enableTimeOff: true,
      };

      const totalSteps = getTotalSteps(context);
      expect(totalSteps).toBe(7);
    });

    it("should count 1 step in change-team mode", () => {
      const context: WizardContext = {
        mode: "change-team",
        shouldShowTeamSelection: false,
        enableTimeOff: false,
      };

      const totalSteps = getTotalSteps(context);
      expect(totalSteps).toBe(1);
    });

    it("should count 2 steps in change-schedule mode with team selection", () => {
      const context: WizardContext = {
        mode: "change-schedule",
        shouldShowTeamSelection: true,
        enableTimeOff: false,
      };

      const totalSteps = getTotalSteps(context);
      expect(totalSteps).toBe(2);
    });

    it("should count 1 step in change-schedule mode without team selection", () => {
      const context: WizardContext = {
        mode: "change-schedule",
        shouldShowTeamSelection: false,
        enableTimeOff: false,
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
        enableTimeOff: true,
      };

      expect(getStepIndex("welcome", context)).toBe(1);
      expect(getStepIndex("features", context)).toBe(2);
      expect(getStepIndex("schedule-selection", context)).toBe(3);
      expect(getStepIndex("team-selection", context)).toBe(4);
      expect(getStepIndex("timeoff-setup", context)).toBe(5);
      expect(getStepIndex("time-tracking-setup", context)).toBe(6);
      expect(getStepIndex("gantt-setup", context)).toBe(7);
      expect(getStepIndex("work-location-setup", context)).toBe(8);
    });

    it("should correctly index steps in onboarding without team selection", () => {
      const context: WizardContext = {
        mode: "onboarding",
        shouldShowTeamSelection: false,
        enableTimeOff: true,
      };

      expect(getStepIndex("welcome", context)).toBe(1);
      expect(getStepIndex("features", context)).toBe(2);
      expect(getStepIndex("schedule-selection", context)).toBe(3);
      expect(getStepIndex("timeoff-setup", context)).toBe(4);
      expect(getStepIndex("time-tracking-setup", context)).toBe(5);
      expect(getStepIndex("gantt-setup", context)).toBe(6);
      expect(getStepIndex("work-location-setup", context)).toBe(7);
    });

    it("should correctly index team-selection in change-team mode", () => {
      const context: WizardContext = {
        mode: "change-team",
        shouldShowTeamSelection: false,
        enableTimeOff: false,
      };

      expect(getStepIndex("team-selection", context)).toBe(1);
    });
  });
});
