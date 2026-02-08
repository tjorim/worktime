import { useEffect, useRef, useState } from "react";
import Modal from "react-bootstrap/Modal";
import ProgressBar from "react-bootstrap/ProgressBar";
import Spinner from "react-bootstrap/Spinner";
import { useSettings } from "../contexts/SettingsContext";
import { useSyncedState } from "../hooks/useSyncedState";
import type { ScheduleOption } from "../data/rosters";
import {
  getTeamCountForOption,
  hasMultipleTeams,
  isValidScheduleType,
} from "../utils/scheduleUtils";
import type { VacationAllowanceUnit } from "../utils/vacationCalculations";
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

/**
 * Validates vacation amount input.
 * Returns an object with validation state:
 * - isValid: true if amount is valid for saving (not empty, not NaN, >= 0; 0 disables vacation tracking)
 * - isInvalid: true if amount has been entered but is invalid (NaN or < 0)
 * - parsedAmount: the parsed number, or null if not a valid number
 */
function validateVacationAmount(amount: string) {
  const trimmedAmount = amount.trim();
  if (trimmedAmount === "") {
    return { isValid: false, isInvalid: false, parsedAmount: null };
  }
  const parsed = parseFloat(trimmedAmount);
  const isNotANumber = Number.isNaN(parsed);
  const isNegative = parsed < 0;

  return {
    isValid: !isNotANumber && parsed >= 0,
    isInvalid: isNotANumber || isNegative,
    parsedAmount: !isNotANumber ? parsed : null,
  };
}

export type WizardCompletionPayload = {
  vacationAllowance?: { yearlyAmounts: Record<string, number>; unit: VacationAllowanceUnit };
  enableTimeOff?: boolean;
  enableTimeTracking?: boolean;
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
  const currentYear = String(new Date().getFullYear());
  const [currentStep, setCurrentStep] = useState<WizardStep>(startStep);
  const initialStepRef = useRef(startStep);
  const firstButtonRef = useRef<HTMLButtonElement>(null);

  // Vacation allowance form state - initialize from settings for current year
  const [vacationAmount, setVacationAmount] = useState<string>(() => {
    const amount = settings.vacationAllowance?.yearlyAmounts?.[currentYear] ?? 0;
    return amount > 0 ? amount.toString() : "";
  });
  const [vacationUnit, setVacationUnit] = useState<VacationAllowanceUnit>(
    settings.vacationAllowance?.unit ?? "days",
  );
  const [isTimeOffEnabled, setIsTimeOffEnabled] = useState<boolean>(
    settings.enableTimeOff ?? false,
  );
  const [isTimeTrackingEnabled, setIsTimeTrackingEnabled] = useState<boolean>(
    settings.enableTimeTracking ?? false,
  );

  const [selectedSchedule, setSelectedSchedule] = useSyncedState(scheduleType);

  // Sync currentStep when startStep prop changes (uses ref to avoid sync on initial render)
  useEffect(() => {
    if (startStep !== initialStepRef.current) {
      setCurrentStep(startStep);
      initialStepRef.current = startStep;
    }
  }, [startStep]);

  const SETTINGS_LOCATION_TEXT = "Settings panel (⚙️ in the top right)";

  const isChangeFlow = mode === "change-schedule" || mode === "change-team";
  const resolvedSchedule = isValidScheduleType(selectedSchedule) ? selectedSchedule : null;
  const shouldShowTeamSelection = resolvedSchedule ? hasMultipleTeams(resolvedSchedule) : false;
  const teamCount = resolvedSchedule ? getTeamCountForOption(resolvedSchedule) : 0;
  const teams = Array.from({ length: teamCount }, (_, i) => i + 1);
  const vacationValidation = validateVacationAmount(vacationAmount);

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
    if (isTimeOffEnabled && vacationValidation.isInvalid) {
      return;
    }
    nextStep();
  };

  const handleTimeTrackingComplete = () => {
    const vacationPayload =
      isTimeOffEnabled && vacationValidation.isValid && vacationValidation.parsedAmount !== null
        ? { yearlyAmounts: { [currentYear]: vacationValidation.parsedAmount }, unit: vacationUnit }
        : undefined;
    onHide({
      vacationAllowance: vacationPayload,
      enableTimeOff: isTimeOffEnabled,
      enableTimeTracking: isTimeTrackingEnabled,
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
    return config.title;
  };

  return (
    <Modal
      show={show}
      onHide={onHide}
      backdrop="static"
      keyboard={false}
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
            variant="primary"
            style={{ height: "4px" }}
            className="mb-2"
          />
          <div className="d-flex justify-content-between small text-muted">
            <span>
              Step {getStepIndex(effectiveStep, wizardContext)} of {getTotalSteps(wizardContext)}
            </span>
            <span>{getProgressPercentage()}% Complete</span>
          </div>
        </div>
        {isLoading ? (
          <div className="text-center py-5">
            <Spinner animation="border" />
            <div className="mt-3 text-muted">Setting up your experience...</div>
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
                vacationAmount={vacationAmount}
                vacationUnit={vacationUnit}
                onVacationAmountChange={setVacationAmount}
                onVacationUnitChange={setVacationUnit}
                isInvalid={vacationValidation.isInvalid}
                onPrev={prevStep}
                onNext={handleTimeOffComplete}
                firstButtonRef={firstButtonRef}
              />
            )}
            {effectiveStep === "time-tracking-setup" && (
              <Step6TimeTrackingSetup
                isEnabled={isTimeTrackingEnabled}
                onToggle={setIsTimeTrackingEnabled}
                onPrev={prevStep}
                onComplete={handleTimeTrackingComplete}
                firstButtonRef={firstButtonRef}
              />
            )}
          </>
        )}
      </Modal.Body>
    </Modal>
  );
}
