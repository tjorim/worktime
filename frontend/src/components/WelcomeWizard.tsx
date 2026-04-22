import { useEffect, useRef, useState } from "react";
import Modal from "react-bootstrap/Modal";
import ProgressBar from "react-bootstrap/ProgressBar";
import Spinner from "react-bootstrap/Spinner";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSyncedState } from "@/hooks/useSyncedState";
import type { ScheduleOption } from "@/data/rosters";
import {
  getTeamCountForOption,
  hasMultipleTeams,
  isValidScheduleType,
} from "@/utils/scheduleUtils";
import { type CountryCode, isValidCountryCode } from "@/types/countries";
import {
  type WizardStep,
  type WizardContext,
  getStepConfig,
  getStepIndex,
  getTotalSteps,
  getVisibleSteps,
} from "./wizardStepConfig";
import { Step1Welcome } from "./wizard/Step1Welcome";
import { Step2Features } from "./wizard/Step2Features";
import { Step3ScheduleSelection } from "./wizard/Step3ScheduleSelection";
import { Step4TeamSelection } from "./wizard/Step4TeamSelection";
import { Step5TimeOffSetup } from "./wizard/Step5TimeOffSetup";
import { Step6TimeTrackingSetup } from "./wizard/Step6TimeTrackingSetup";
import { Step7GanttSetup } from "./wizard/Step7GanttSetup";
import { Step8WorkLocationSetup } from "./wizard/Step8WorkLocationSetup";
import { Step9AccountSetup } from "./wizard/Step9AccountSetup";
import * as m from "@/paraglide/messages.js";

export type WizardCompletionPayload = {
  enableTimeOff?: boolean;
  enableTimeTracking?: boolean;
  enableGantt?: boolean;
  enableCrossBorderTracking?: boolean;
  homeCountry?: CountryCode | null;
  officeCountry?: CountryCode | null;
  /** True when the user connected (or was already connected to) an account during the wizard. */
  accountConnected?: boolean;
};

interface WelcomeWizardProps {
  show: boolean;
  onTeamSelect: (team: number) => void;
  onScheduleSelect?: (schedule: ScheduleOption) => void;
  onSkip?: () => void;
  onHide: (payload?: WizardCompletionPayload) => void;
  onDefer?: () => void;
  isLoading?: boolean;
  mode?: "onboarding" | "change-team" | "change-schedule";
  startStep?: WizardStep;
}

/**
 * Present a multi-step onboarding modal that guides users through welcome, feature highlights, schedule selection,
 * optional team selection, and optional time off setup.
 *
 * @param show - Whether the wizard modal is visible
 * @param onTeamSelect - Called with the chosen team number when a team button is selected
 * @param onScheduleSelect - Optional callback invoked when the user selects a schedule
 * @param onSkip - Optional callback invoked when the user chooses to browse all teams instead of selecting one
 * @param onHide - Called when the wizard is completed with optional vacation allowance data (marks onboarding as done)
 * @param onDefer - Optional callback invoked when user clicks "Maybe Later" (defers wizard to next visit)
 * @param isLoading - When true, disables interactions and displays a setup spinner
 * @param mode - Determines the wizard flow ("onboarding" | "change-team" | "change-schedule")
 * @param startStep - Initial step to show when the wizard opens ("welcome" | "features" | "schedule-selection" | "team-selection" | "timeoff-setup" | "time-tracking-setup")
 * @returns The WelcomeWizard React element
 */
export function WelcomeWizard({
  show,
  onTeamSelect,
  onScheduleSelect,
  onSkip,
  onHide,
  onDefer,
  isLoading = false,
  mode = "onboarding",
  startStep = mode === "change-team"
    ? "team-selection"
    : mode === "change-schedule"
      ? "schedule-selection"
      : "welcome",
}: WelcomeWizardProps) {
  const { scheduleType, settings } = useSettings();
  const { isAuthenticated, displayName, triggerSignup } = useAuth();
  const [currentStep, setCurrentStep] = useState<WizardStep>(startStep);
  const initialStepRef = useRef(startStep);
  const firstButtonRef = useRef<HTMLButtonElement>(null);

  const [isTimeOffEnabled, setIsTimeOffEnabled] = useState<boolean>(
    settings.enableTimeOff ?? false,
  );
  const [isTimeTrackingEnabled, setIsTimeTrackingEnabled] = useState<boolean>(
    settings.enableTimeTracking ?? false,
  );
  const [isGanttEnabled, setIsGanttEnabled] = useState<boolean>(settings.enableGantt ?? false);
  const [isCrossBorderEnabled, setIsCrossBorderEnabled] = useState<boolean>(
    settings.enableCrossBorderTracking ?? false,
  );
  const [homeCountry, setHomeCountry] = useState<CountryCode | null>(
    isValidCountryCode(settings.homeCountry) ? settings.homeCountry : null,
  );
  const [officeCountry, setOfficeCountry] = useState<CountryCode | null>(
    isValidCountryCode(settings.officeCountry) ? settings.officeCountry : null,
  );

  const [selectedSchedule, setSelectedSchedule] = useSyncedState(scheduleType);

  // Sync currentStep when startStep prop changes (uses ref to avoid sync on initial render)

  useEffect(() => {
    if (startStep !== initialStepRef.current) {
      setCurrentStep(startStep);
      initialStepRef.current = startStep;
    }
  }, [startStep]);

  const SETTINGS_LOCATION_TEXT = m.wizard_settings_title_with_location({
    settings: m.settings_title(),
    icon: "⚙️",
    location: m.wizard_settings_panel_location(),
  });

  const isChangeFlow = mode === "change-schedule" || mode === "change-team";
  const resolvedSchedule = isValidScheduleType(selectedSchedule) ? selectedSchedule : null;
  const shouldShowTeamSelection = resolvedSchedule ? hasMultipleTeams(resolvedSchedule) : false;
  const teamCount = resolvedSchedule ? getTeamCountForOption(resolvedSchedule) : 0;
  const teams = Array.from({ length: teamCount }, (_, i) => i + 1);

  // Create wizard context for configuration functions
  const wizardContext: WizardContext = {
    mode,
    shouldShowTeamSelection,
    enableTimeOff: isTimeOffEnabled,
  };

  // Derive an effective step that is guaranteed to be visible in the current context.
  // During mode transitions (e.g. onboarding -> change-team), currentStep may briefly
  // reference a step from the previous mode before the useEffect sync fires.
  const visibleSteps = getVisibleSteps(wizardContext);
  const isCurrentStepVisible = visibleSteps.some((s) => s.id === currentStep);
  const effectiveStep = isCurrentStepVisible ? currentStep : (visibleSteps[0]?.id ?? startStep);
  const isLastStep = getStepConfig(effectiveStep).getNextStep(wizardContext) === null;

  // Reset to startStep when modal opens
  const handleModalEntered = () => {
    if (!isLoading) {
      setCurrentStep(initialStepRef.current);
      // Focus the first interactive element using ref
      if (firstButtonRef.current) {
        firstButtonRef.current.focus();
      }
    }
  };

  const handleTeamSelect = (team: number) => {
    onTeamSelect(team);
    nextStep();
  };

  const handleSkip = () => {
    onSkip?.();
    nextStep();
  };

  const handleTimeOffComplete = () => {
    nextStep();
  };

  const handleTimeTrackingComplete = () => {
    nextStep();
  };

  const handleWorkLocationComplete = () => {
    nextStep();
  };

  const handleAccountSetupComplete = (accountConnected?: boolean) => {
    onHide({
      enableTimeOff: isTimeOffEnabled,
      enableTimeTracking: isTimeTrackingEnabled,
      enableGantt: isGanttEnabled,
      enableCrossBorderTracking: isCrossBorderEnabled,
      homeCountry: isCrossBorderEnabled ? homeCountry : undefined,
      officeCountry: isCrossBorderEnabled ? officeCountry : undefined,
      accountConnected,
    });
  };

  const nextStep = () => {
    const currentConfig = getStepConfig(effectiveStep);
    const nextStepId = currentConfig.getNextStep(wizardContext);

    // Handle schedule selection callback before navigation
    if (effectiveStep === "schedule-selection") {
      if (selectedSchedule && selectedSchedule !== scheduleType) {
        onScheduleSelect?.(selectedSchedule);
      }
    }

    if (nextStepId === null) {
      // Configuration says to close wizard
      onHide();
    } else {
      setCurrentStep(nextStepId);
    }
  };

  const prevStep = () => {
    const currentConfig = getStepConfig(effectiveStep);
    const prevStepId = currentConfig.getPrevStep(wizardContext);

    if (prevStepId === null) {
      // Configuration says to close wizard
      onHide();
    } else {
      setCurrentStep(prevStepId);
    }
  };

  const getProgressPercentage = () => {
    const totalSteps = getTotalSteps(wizardContext);
    if (totalSteps === 0) {
      return 0;
    }
    const stepIndex = getStepIndex(effectiveStep, wizardContext);
    const pct = (stepIndex / totalSteps) * 100;
    return Math.round(pct * 10) / 10;
  };

  const getStepTitle = () => {
    const config = getStepConfig(effectiveStep);
    return config.title();
  };

  return (
    <Modal
      show={show}
      onHide={onHide}
      backdrop="static"
      centered
      size="lg"
      onEntered={handleModalEntered}
    >
      <Modal.Header>
        <Modal.Title>{getStepTitle()}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* Progress bar */}
        <div className="mb-4">
          <ProgressBar
            now={getProgressPercentage()}
            aria-label={m.wizard_onboarding_progress({
              step: String(getStepIndex(effectiveStep, wizardContext)),
              total: String(getTotalSteps(wizardContext)),
            })}
            variant="primary"
            style={{ height: "4px" }}
            className="mb-2"
          />
          <div className="d-flex justify-content-between small text-muted">
            <span>
              {m.wizard_step_of({
                step: String(getStepIndex(effectiveStep, wizardContext)),
                total: String(getTotalSteps(wizardContext)),
              })}
            </span>
            <span>{m.wizard_percent_complete({ percent: String(getProgressPercentage()) })}</span>
          </div>
        </div>
        {isLoading ? (
          <div className="text-center py-5" role="status">
            <Spinner animation="border" aria-hidden="true" />
            <div className="mt-3 text-muted">{m.wizard_setting_up()}</div>
          </div>
        ) : (
          <>
            {effectiveStep === "welcome" && (
              <Step1Welcome
                onDefer={onDefer}
                onHide={onHide}
                onNext={nextStep}
                firstButtonRef={firstButtonRef}
              />
            )}
            {effectiveStep === "features" && (
              <Step2Features
                onPrev={prevStep}
                onNext={nextStep}
                firstButtonRef={firstButtonRef}
                settingsLocationText={SETTINGS_LOCATION_TEXT}
              />
            )}
            {effectiveStep === "schedule-selection" && (
              <Step3ScheduleSelection
                selectedSchedule={selectedSchedule}
                onScheduleChange={setSelectedSchedule}
                onPrev={prevStep}
                onNext={nextStep}
                isChangeFlow={isChangeFlow}
                shouldShowTeamSelection={shouldShowTeamSelection}
                firstButtonRef={firstButtonRef}
              />
            )}
            {effectiveStep === "team-selection" && (
              <Step4TeamSelection
                teams={teams}
                onTeamSelect={handleTeamSelect}
                onSkip={handleSkip}
                onPrev={prevStep}
                isChangeFlow={isChangeFlow}
                firstButtonRef={firstButtonRef}
              />
            )}
            {effectiveStep === "timeoff-setup" && (
              <Step5TimeOffSetup
                isEnabled={isTimeOffEnabled}
                onToggle={setIsTimeOffEnabled}
                onPrev={prevStep}
                onNext={handleTimeOffComplete}
                isLastStep={isLastStep}
                firstButtonRef={firstButtonRef}
              />
            )}
            {effectiveStep === "time-tracking-setup" && (
              <Step6TimeTrackingSetup
                isEnabled={isTimeTrackingEnabled}
                onToggle={setIsTimeTrackingEnabled}
                onPrev={prevStep}
                onComplete={handleTimeTrackingComplete}
                isLastStep={isLastStep}
                firstButtonRef={firstButtonRef}
              />
            )}
            {effectiveStep === "gantt-setup" && (
              <Step7GanttSetup
                isEnabled={isGanttEnabled}
                onToggle={setIsGanttEnabled}
                onPrev={prevStep}
                onNext={nextStep}
                isLastStep={isLastStep}
                firstButtonRef={firstButtonRef}
              />
            )}
            {effectiveStep === "work-location-setup" && (
              <Step8WorkLocationSetup
                isEnabled={isCrossBorderEnabled}
                onToggle={setIsCrossBorderEnabled}
                homeCountry={homeCountry}
                officeCountry={officeCountry}
                onHomeCountryChange={setHomeCountry}
                onOfficeCountryChange={setOfficeCountry}
                onPrev={prevStep}
                onComplete={handleWorkLocationComplete}
                isLastStep={isLastStep}
                firstButtonRef={firstButtonRef}
              />
            )}
            {effectiveStep === "account-setup" && (
              <Step9AccountSetup
                isAuthenticated={isAuthenticated}
                displayName={displayName}
                onConnectAccount={() => {
                  // Complete the wizard without marking the flag — the useEffect in App.tsx
                  // sets accountSyncAnnouncementSeen: true when the user returns authenticated.
                  handleAccountSetupComplete(undefined);
                  triggerSignup();
                }}
                onSkip={() => handleAccountSetupComplete(isAuthenticated)}
                onPrev={prevStep}
                firstButtonRef={firstButtonRef}
              />
            )}
          </>
        )}
      </Modal.Body>
    </Modal>
  );
}
