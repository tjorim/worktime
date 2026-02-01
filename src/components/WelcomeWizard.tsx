import { useEffect, useRef, useState } from "react";
import Modal from "react-bootstrap/Modal";
import ProgressBar from "react-bootstrap/ProgressBar";
import Spinner from "react-bootstrap/Spinner";
import { useSettings } from "../contexts/SettingsContext";
import { useSyncedState } from "../hooks/useSyncedState";
import type { ScheduleOption } from "../data/rosters";
import { getTeamCountForOption, hasMultipleTeams } from "../utils/scheduleUtils";
import type { VacationAllowanceUnit } from "../utils/vacationCalculations";
import {
  type WizardStep,
  type WizardContext,
  getStepConfig,
  getStepIndex,
  getTotalSteps,
} from "./wizardStepConfig";
import { Step1Welcome } from "./wizard/Step1Welcome";
import { Step2Features } from "./wizard/Step2Features";
import { Step3ScheduleSelection } from "./wizard/Step3ScheduleSelection";
import { Step4TeamSelection } from "./wizard/Step4TeamSelection";
import { Step5VacationAllowance } from "./wizard/Step5VacationAllowance";

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

interface WelcomeWizardProps {
  show: boolean;
  onTeamSelect: (team: number) => void;
  onScheduleSelect?: (schedule: ScheduleOption) => void;
  onSkip?: () => void;
  onHide: (vacationAllowance?: { amount: number; unit: VacationAllowanceUnit }) => void;
  onDefer?: () => void;
  isLoading?: boolean;
  mode?: "onboarding" | "change-team" | "change-schedule";
  startStep?: WizardStep;
}

/**
 * Present a multi-step onboarding modal that guides users through welcome, feature highlights, schedule selection,
 * optional team selection, and optional vacation allowance setup.
 *
 * @param show - Whether the wizard modal is visible
 * @param onTeamSelect - Called with the chosen team number when a team button is selected
 * @param onScheduleSelect - Optional callback invoked when the user selects a schedule
 * @param onSkip - Optional callback invoked when the user chooses to browse all teams instead of selecting one
 * @param onHide - Called when the wizard is completed with optional vacation allowance data (marks onboarding as done)
 * @param onDefer - Optional callback invoked when user clicks "Maybe Later" (defers wizard to next visit)
 * @param isLoading - When true, disables interactions and displays a setup spinner
 * @param mode - Determines the wizard flow ("onboarding" | "change-team" | "change-schedule")
 * @param startStep - Initial step to show when the wizard opens ("welcome" | "features" | "schedule-selection" | "team-selection" | "vacation-allowance")
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
  const [currentStep, setCurrentStep] = useState<WizardStep>(startStep);
  const initialStepRef = useRef(startStep);
  const firstButtonRef = useRef<HTMLButtonElement>(null);

  // Vacation allowance form state - initialize from settings
  const [vacationAmount, setVacationAmount] = useState<string>(() => {
    const amount = settings.vacationAllowance?.amount ?? 0;
    return amount > 0 ? amount.toString() : "";
  });
  const [vacationUnit, setVacationUnit] = useState<VacationAllowanceUnit>(
    settings.vacationAllowance?.unit ?? "days",
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

  const isChangeTeamFlow = mode === "change-team";
  const isChangeScheduleFlow = mode === "change-schedule";
  const shouldShowTeamSelection = selectedSchedule ? hasMultipleTeams(selectedSchedule) : false;
  const hasTeamSelectionStep = shouldShowTeamSelection || isChangeTeamFlow;
  const teamCount = getTeamCountForOption(selectedSchedule);
  const teams = Array.from({ length: teamCount }, (_, i) => i + 1);

  // Create wizard context for configuration functions
  const wizardContext: WizardContext = {
    mode,
    shouldShowTeamSelection,
    isChangeTeamFlow,
    isChangeScheduleFlow,
  };

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
    if (isChangeScheduleFlow || isChangeTeamFlow) {
      onHide();
      return;
    }
    nextStep(); // Go to vacation allowance step
  };

  const handleSkip = () => {
    onSkip?.();
    if (isChangeScheduleFlow || isChangeTeamFlow) {
      onHide();
      return;
    }
    nextStep(); // Go to vacation allowance step
  };

  const handleVacationComplete = () => {
    // Pass vacation allowance data to onHide for atomic update
    const validation = validateVacationAmount(vacationAmount);

    if (!validation.isValid || validation.parsedAmount === null) {
      // No valid vacation data to save
      onHide();
      return;
    }

    // All valid amounts (including 0 which disables vacation tracking) are saved
    onHide({
      amount: validation.parsedAmount,
      unit: vacationUnit,
    });
  };

  const handleVacationSkip = () => {
    // User chose to skip - no vacation data to save
    onHide();
  };

  const nextStep = () => {
    const currentConfig = getStepConfig(currentStep);
    const nextStepId = currentConfig.getNextStep(wizardContext);

    // Handle schedule selection callback before navigation
    if (currentStep === "schedule-selection") {
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
    const currentConfig = getStepConfig(currentStep);
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
    const stepIndex = getStepIndex(currentStep, wizardContext);
    return (stepIndex / totalSteps) * 100;
  };

  const getStepTitle = () => {
    const config = getStepConfig(currentStep);
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
              Step {getStepIndex(currentStep, wizardContext)} of {getTotalSteps(wizardContext)}
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
            {currentStep === "welcome" && (
              <Step1Welcome
                onDefer={onDefer}
                onHide={onHide}
                onNext={nextStep}
                isLoading={isLoading}
                firstButtonRef={firstButtonRef}
              />
            )}
            {currentStep === "features" && (
              <Step2Features
                onPrev={prevStep}
                onNext={nextStep}
                isLoading={isLoading}
                firstButtonRef={firstButtonRef}
                settingsLocationText={SETTINGS_LOCATION_TEXT}
              />
            )}
            {currentStep === "schedule-selection" && (
              <Step3ScheduleSelection
                selectedSchedule={selectedSchedule}
                onScheduleChange={setSelectedSchedule}
                onPrev={() => {
                  if (isChangeScheduleFlow) {
                    onHide();
                  } else {
                    prevStep();
                  }
                }}
                onNext={nextStep}
                isLoading={isLoading}
                isChangeScheduleFlow={isChangeScheduleFlow}
                shouldShowTeamSelection={shouldShowTeamSelection}
                firstButtonRef={firstButtonRef}
              />
            )}
            {currentStep === "team-selection" && hasTeamSelectionStep && (
              <Step4TeamSelection
                teams={teams}
                teamCount={teamCount}
                onTeamSelect={handleTeamSelect}
                onSkip={handleSkip}
                onPrev={prevStep}
                isLoading={isLoading}
                firstButtonRef={firstButtonRef}
              />
            )}
            {currentStep === "team-selection" && !hasTeamSelectionStep && (
              <Step3ScheduleSelection
                selectedSchedule={selectedSchedule}
                onScheduleChange={setSelectedSchedule}
                onPrev={() => {
                  if (isChangeScheduleFlow) {
                    onHide();
                  } else {
                    prevStep();
                  }
                }}
                onNext={nextStep}
                isLoading={isLoading}
                isChangeScheduleFlow={isChangeScheduleFlow}
                shouldShowTeamSelection={shouldShowTeamSelection}
                firstButtonRef={firstButtonRef}
              />
            )}
            {currentStep === "vacation-allowance" && (
              <Step5VacationAllowance
                vacationAmount={vacationAmount}
                vacationUnit={vacationUnit}
                onVacationAmountChange={setVacationAmount}
                onVacationUnitChange={setVacationUnit}
                onPrev={prevStep}
                onSkip={handleVacationSkip}
                onComplete={handleVacationComplete}
                isLoading={isLoading}
                isInvalid={validateVacationAmount(vacationAmount).isInvalid}
                isValid={validateVacationAmount(vacationAmount).isValid}
                firstButtonRef={firstButtonRef}
              />
            )}
          </>
        )}
      </Modal.Body>
    </Modal>
  );
}
