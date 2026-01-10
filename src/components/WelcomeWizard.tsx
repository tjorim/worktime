import { useEffect, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import ProgressBar from "react-bootstrap/ProgressBar";
import Row from "react-bootstrap/Row";
import Spinner from "react-bootstrap/Spinner";
import { useSettings } from "../contexts/SettingsContext";
import { SCHEDULE_OPTIONS, type ScheduleOption } from "../data/rosters";
import { getTeamCountForOption } from "../utils/scheduleUtils";
import type { VacationAllowanceUnit } from "../utils/vacationCalculations";

type WizardStep =
  | "welcome"
  | "features"
  | "schedule-selection"
  | "team-selection"
  | "vacation-allowance";

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
  const { scheduleOption, settings } = useSettings();
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

  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleOption | null>(
    scheduleOption ?? null,
  );

  // Sync currentStep when startStep prop changes
  useEffect(() => {
    if (startStep !== initialStepRef.current) {
      setCurrentStep(startStep);
      initialStepRef.current = startStep;
    }
  }, [startStep]);

  useEffect(() => {
    setSelectedSchedule(scheduleOption ?? null);
  }, [scheduleOption]);

  const SETTINGS_LOCATION_TEXT = "Settings panel (⚙️ in the top right)";

  const isChangeTeamFlow = mode === "change-team";
  const isChangeScheduleFlow = mode === "change-schedule";
  const selectedScheduleConfig = SCHEDULE_OPTIONS.find(
    (option) => option.value === selectedSchedule,
  );
  const shouldShowTeamSelection = selectedScheduleConfig?.showsTeamSelection ?? false;
  const hasTeamSelectionStep = shouldShowTeamSelection || isChangeTeamFlow;
  const teamCount = getTeamCountForOption(selectedSchedule);
  const teams = Array.from({ length: teamCount }, (_, i) => i + 1);

  /**
   * Calculate total number of steps in the wizard based on mode and schedule configuration.
   *
   * Step count varies by mode:
   * - change-team: 1 step (team selection only)
   * - change-schedule: 1 step (schedule) + optional team selection = 1-2 steps
   * - onboarding: 5 steps (welcome, features, schedule, optional team, vacation)
   *
   * Team selection step is included when:
   * - In change-team mode (always shown)
   * - Schedule has showsTeamSelection=true (multi-team schedules)
   */
  const getTotalSteps = () => {
    if (isChangeTeamFlow) return 1;
    if (isChangeScheduleFlow) return shouldShowTeamSelection ? 2 : 1;
    return shouldShowTeamSelection ? 5 : 4;
  };

  /**
   * Get current step index (1-based) for progress tracking.
   *
   * Maps step names to step numbers accounting for conditional team selection:
   * - Onboarding: welcome(1), features(2), schedule(3), [team(4)], vacation(4 or 5)
   * - Change-schedule: schedule(1), [team(2)]
   * - Change-team: team(1)
   */
  const getStepIndex = () => {
    if (isChangeTeamFlow) return 1;
    if (isChangeScheduleFlow) {
      return currentStep === "team-selection" ? 2 : 1;
    }
    switch (currentStep) {
      case "welcome":
        return 1;
      case "features":
        return 2;
      case "schedule-selection":
        return 3;
      case "team-selection":
        return 4;
      case "vacation-allowance":
        return shouldShowTeamSelection ? 5 : 4;
      default:
        return 1;
    }
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
    if (currentStep === "welcome") {
      setCurrentStep("features");
    } else if (currentStep === "features") {
      setCurrentStep("schedule-selection");
    } else if (currentStep === "schedule-selection") {
      if (selectedSchedule && selectedSchedule !== scheduleOption) {
        onScheduleSelect?.(selectedSchedule);
      }
      if (isChangeScheduleFlow) {
        if (shouldShowTeamSelection) {
          setCurrentStep("team-selection");
        } else {
          onHide();
        }
        return;
      }
      setCurrentStep(shouldShowTeamSelection ? "team-selection" : "vacation-allowance");
    } else if (currentStep === "team-selection") {
      if (isChangeScheduleFlow) {
        onHide();
      } else {
        setCurrentStep("vacation-allowance");
      }
    }
  };

  const prevStep = () => {
    if (currentStep === "vacation-allowance") {
      setCurrentStep(shouldShowTeamSelection ? "team-selection" : "schedule-selection");
    } else if (currentStep === "team-selection") {
      setCurrentStep("schedule-selection");
    } else if (currentStep === "schedule-selection") {
      if (isChangeScheduleFlow) {
        onHide();
        return;
      }
      setCurrentStep("features");
    } else if (currentStep === "features") {
      setCurrentStep("welcome");
    }
  };

  const getProgressPercentage = () => {
    const totalSteps = getTotalSteps();
    const stepIndex = getStepIndex();
    return (stepIndex / totalSteps) * 100;
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case "welcome":
        return "Welcome to Worktime! 👋";
      case "features":
        return "What can Worktime do? ✨";
      case "schedule-selection":
        return "Pick Your Schedule 🗓️";
      case "team-selection":
        return "Choose Your Experience 🎯";
      case "vacation-allowance":
        return "Vacation Tracking ✈️";
      default:
        return "Welcome to Worktime";
    }
  };

  const renderWelcomeStep = () => (
    <>
      <div className="text-center mb-4">
        <div className="mb-3">
          <i className="bi bi-clock-history text-primary" style={{ fontSize: "3rem" }}></i>
        </div>
        <h4 className="text-primary mb-3">Welcome to Worktime!</h4>
        <p className="lead mb-3">
          Your personal shift tracker and time-off planner, built for flexible schedules
        </p>
        <p className="text-muted">
          Worktime helps you stay on top of your schedule with real-time tracking, countdown timers,
          and integrated time-off management - stored locally in your browser.
        </p>
      </div>
      <div className="d-flex justify-content-between">
        <Button
          variant="outline-secondary"
          onClick={() => {
            if (onDefer) {
              onDefer();
            } else {
              onHide(); // Fallback: close modal and complete onboarding via onHide handler
            }
          }}
          disabled={isLoading}
          ref={currentStep === "welcome" ? firstButtonRef : undefined}
        >
          Maybe Later
        </Button>
        <Button variant="primary" onClick={nextStep} disabled={isLoading}>
          Let's Get Started! <i className="bi bi-arrow-right ms-1"></i>
        </Button>
      </div>
    </>
  );

  const renderFeaturesStep = () => (
    <>
      <div className="mb-4">
        <h5 className="text-center mb-4">Here's what Worktime can do for you:</h5>
        <Row className="g-3">
          <Col xs={12} md={6}>
            <div className="d-flex align-items-start">
              <i
                className="bi bi-stopwatch text-success me-3 mt-1"
                style={{ fontSize: "1.5rem" }}
              ></i>
              <div>
                <h6 className="mb-1">Live Countdown Timers</h6>
                <small className="text-muted">Know exactly when your next shift starts</small>
              </div>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="d-flex align-items-start">
              <i className="bi bi-wifi-off text-info me-3 mt-1" style={{ fontSize: "1.5rem" }}></i>
              <div>
                <h6 className="mb-1">Local-First Data</h6>
                <small className="text-muted">
                  Your settings and events are saved in your browser for quick access
                </small>
              </div>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="d-flex align-items-start">
              <i className="bi bi-people text-warning me-3 mt-1" style={{ fontSize: "1.5rem" }}></i>
              <div>
                <h6 className="mb-1">Team Overview</h6>
                <small className="text-muted">See who is working across your schedule</small>
              </div>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="d-flex align-items-start">
              <i
                className="bi bi-calendar-check text-primary me-3 mt-1"
                style={{ fontSize: "1.5rem" }}
              ></i>
              <div>
                <h6 className="mb-1">Time-Off Planning</h6>
                <small className="text-muted">Track vacation and time-off with .hday files</small>
              </div>
            </div>
          </Col>
        </Row>
        <Alert variant="info" className="mt-4">
          <i className="bi bi-gear me-2"></i>
          <strong>Tip:</strong> You can customize your experience anytime in the{" "}
          <b>{SETTINGS_LOCATION_TEXT}</b>.
        </Alert>
      </div>
      <div className="d-flex justify-content-between">
        <Button
          variant="outline-secondary"
          onClick={prevStep}
          disabled={isLoading}
          ref={currentStep === "features" ? firstButtonRef : undefined}
        >
          <i className="bi bi-arrow-left me-1"></i> Back
        </Button>
        <Button variant="primary" onClick={nextStep} disabled={isLoading}>
          Choose a Schedule <i className="bi bi-arrow-right ms-1"></i>
        </Button>
      </div>
    </>
  );

  const renderScheduleSelectionStep = () => {
    const handleScheduleChange = (schedule: ScheduleOption) => {
      setSelectedSchedule(schedule);
    };
    const handleBackClick = () => {
      if (isChangeScheduleFlow) {
        onHide();
        return;
      }
      prevStep();
    };
    const continueLabel = isChangeScheduleFlow
      ? shouldShowTeamSelection
        ? "Continue"
        : "Save Schedule"
      : "Continue";

    return (
      <>
        <div className="text-center mb-4">
          <h5 className="mb-2">Which roster matches your team?</h5>
          <p className="text-muted">This helps us tailor your setup. You can change it later.</p>
        </div>

        <div className="mb-4">
          {SCHEDULE_OPTIONS.map((schedule) => (
            <Button
              key={schedule.value}
              variant={selectedSchedule === schedule.value ? "primary" : "outline-primary"}
              className="w-100 text-start mb-2"
              onClick={() => handleScheduleChange(schedule.value)}
              disabled={isLoading || !schedule.isAvailable}
              title={!schedule.isAvailable ? "This schedule option is coming soon" : undefined}
              ref={
                currentStep === "schedule-selection" && schedule.value === "9-5"
                  ? firstButtonRef
                  : undefined
              }
            >
              <div className="fw-semibold d-flex align-items-center gap-2">
                <span>{schedule.title}</span>
                {!schedule.isAvailable && <span className="badge bg-secondary">Coming Soon</span>}
              </div>
              <small className="d-block text-muted">{schedule.description}</small>
            </Button>
          ))}
        </div>

        <div className="d-flex justify-content-between">
          <Button variant="outline-secondary" onClick={handleBackClick} disabled={isLoading}>
            <i className={`bi ${isChangeScheduleFlow ? "bi-x-lg" : "bi-arrow-left"} me-1`}></i>{" "}
            {isChangeScheduleFlow ? "Cancel" : "Back"}
          </Button>
          <Button variant="primary" onClick={nextStep} disabled={isLoading || !selectedSchedule}>
            {continueLabel} <i className="bi bi-arrow-right ms-1"></i>
          </Button>
        </div>
      </>
    );
  };

  const renderTeamSelectionStep = () => (
    <>
      <div className="text-center mb-4">
        <h5 className="mb-3">Choose your team</h5>
        <p className="text-muted">You can always change this later in the app.</p>
      </div>

      <div className="mb-4">
        <h6 className="mb-3">Option 1: Select Your Team (Recommended)</h6>
        <p className="small text-muted mb-3">
          Get personalized features like countdown timers and shift progress tracking.
        </p>
        <Row className="g-2" aria-label="Select your team">
          {teams.map((team) => (
            <Col key={team} xs={6} sm={4} md={4}>
              <Button
                variant="outline-primary"
                className="w-100 team-btn"
                onClick={() => handleTeamSelect(team)}
                disabled={isLoading}
                aria-label={`Select Team ${team}`}
                ref={currentStep === "team-selection" && team === 1 ? firstButtonRef : undefined}
              >
                Team {team}
              </Button>
            </Col>
          ))}
        </Row>
      </div>

      {/* Only show Browse All Teams option if there are multiple teams */}
      {teamCount > 1 && (
        <>
          <hr />

          <div className="text-center">
            <h6 className="mb-2">Option 2: Browse All Teams</h6>
            <p className="small text-muted mb-3">
              View shift information for all teams without personalization.
            </p>
            <Button variant="outline-secondary" onClick={handleSkip} disabled={isLoading}>
              <i className="bi bi-eye me-1"></i>
              Browse All Teams
            </Button>
          </div>
        </>
      )}

      <div className="d-flex justify-content-start mt-3">
        <Button variant="outline-secondary" size="sm" onClick={prevStep} disabled={isLoading}>
          <i className="bi bi-arrow-left me-1"></i> Back
        </Button>
      </div>
    </>
  );

  const renderVacationAllowanceStep = () => {
    const validation = validateVacationAmount(vacationAmount);

    return (
      <>
        <div className="text-center mb-4">
          <i className="bi bi-calendar-check display-4 text-primary"></i>
          <h4 className="mt-3">Set Up Vacation Tracking (Optional)</h4>
          <p className="text-muted">
            Track your vacation allowance and see how much time off you have remaining. You can skip
            this and set it up later in Settings.
          </p>
        </div>

        <Form>
          <Form.Group className="mb-3" controlId="vacationAmount">
            <Form.Label>Annual vacation allowance</Form.Label>
            <Form.Control
              type="number"
              min={0}
              step={0.5}
              placeholder="e.g., 25"
              value={vacationAmount}
              onChange={(e) => setVacationAmount(e.target.value)}
              disabled={isLoading}
              isInvalid={validation.isInvalid}
            />
            <Form.Control.Feedback type="invalid">
              Please enter a valid number (0 or greater)
            </Form.Control.Feedback>
            <Form.Text className="text-muted">Leave empty to skip vacation tracking</Form.Text>
          </Form.Group>

          <Form.Group controlId="vacationUnit">
            <Form.Label>Unit</Form.Label>
            <div className="d-flex gap-3">
              <Form.Check
                type="radio"
                id="unit-days"
                label="Days"
                checked={vacationUnit === "days"}
                onChange={() => setVacationUnit("days")}
                disabled={isLoading}
              />
              <Form.Check
                type="radio"
                id="unit-hours"
                label="Hours"
                checked={vacationUnit === "hours"}
                onChange={() => setVacationUnit("hours")}
                disabled={isLoading}
              />
            </div>
          </Form.Group>
        </Form>

        <div className="d-flex justify-content-between mt-4">
          <Button
            variant="outline-secondary"
            onClick={prevStep}
            disabled={isLoading}
            ref={currentStep === "vacation-allowance" ? firstButtonRef : undefined}
          >
            <i className="bi bi-arrow-left me-2"></i>
            Back
          </Button>
          <div>
            <Button
              variant="outline-secondary"
              onClick={handleVacationSkip}
              disabled={isLoading}
              className="me-2"
            >
              Skip
            </Button>
            <Button
              variant="primary"
              onClick={handleVacationComplete}
              disabled={isLoading || validation.isInvalid}
            >
              {validation.isValid ? "Save & Complete" : "Complete"}
              <i className="bi bi-check-lg ms-2"></i>
            </Button>
          </div>
        </div>
      </>
    );
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
              Step {getStepIndex()} of {getTotalSteps()}
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
            {currentStep === "welcome" && renderWelcomeStep()}
            {currentStep === "features" && renderFeaturesStep()}
            {currentStep === "schedule-selection" && renderScheduleSelectionStep()}
            {currentStep === "team-selection" && hasTeamSelectionStep && renderTeamSelectionStep()}
            {currentStep === "vacation-allowance" && renderVacationAllowanceStep()}
          </>
        )}
      </Modal.Body>
    </Modal>
  );
}
