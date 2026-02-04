import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";
import clsx from "clsx";

interface Step4TeamSelectionProps {
  teams: number[];
  onTeamSelect: (team: number) => void;
  onSkip: () => void;
  onPrev: () => void;
  isChangeFlow: boolean;
  firstButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

export function Step4TeamSelection({
  teams,
  onTeamSelect,
  onSkip,
  onPrev,
  isChangeFlow,
  firstButtonRef,
}: Step4TeamSelectionProps) {
  return (
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
        <Row className="g-2" aria-label="Select your team" role="group">
          {teams.map((team, index) => (
            <Col key={team} xs={6} sm={4} md={4}>
              <Button
                variant="outline-primary"
                className="w-100 team-btn"
                onClick={() => onTeamSelect(team)}
                aria-label={`Select Team ${team}`}
                ref={index === 0 ? firstButtonRef : undefined}
              >
                Team {team}
              </Button>
            </Col>
          ))}
        </Row>
      </div>

      {/* Only show Browse All Teams option if there are multiple teams */}
      {teams.length > 1 && (
        <>
          <hr />

          <div className="text-center">
            <h6 className="mb-2">Option 2: Browse All Teams</h6>
            <p className="small text-muted mb-3">
              View shift information for all teams without personalization.
            </p>
            <Button variant="outline-secondary" onClick={onSkip}>
              <i className="bi bi-eye me-1"></i>
              Browse All Teams
            </Button>
          </div>
        </>
      )}

      <div className="d-flex justify-content-start mt-3">
        <Button variant="outline-secondary" size="sm" onClick={onPrev}>
          <i className={clsx("bi", isChangeFlow ? "bi-x-lg" : "bi-arrow-left", "me-1")}></i>
          {isChangeFlow ? "Cancel" : "Back"}
        </Button>
      </div>
    </>
  );
}
