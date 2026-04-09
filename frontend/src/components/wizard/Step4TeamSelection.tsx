import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";
import clsx from "clsx";
import * as m from "@/paraglide/messages.js";

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
        <h5 className="mb-3">{m.wizard_team_heading()}</h5>
        <p className="text-muted">{m.wizard_team_subtitle()}</p>
      </div>

      <div className="mb-4">
        <h6 className="mb-3">{m.wizard_team_option1_heading()}</h6>
        <p className="small text-muted mb-3">{m.wizard_team_option1_desc()}</p>
        <Row className="g-2" aria-label={m.wizard_team_select_aria()} role="group">
          {teams.map((team, index) => (
            <Col key={team} xs={6} sm={4} md={4}>
              <Button
                variant="outline-primary"
                className="w-100 team-btn"
                onClick={() => onTeamSelect(team)}
                aria-label={m.wizard_team_btn_aria({ team: String(team) })}
                ref={index === 0 ? firstButtonRef : undefined}
              >
                {m.wizard_team_btn_label({ team: String(team) })}
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
            <h6 className="mb-2">{m.wizard_team_option2_heading()}</h6>
            <p className="small text-muted mb-3">{m.wizard_team_option2_desc()}</p>
            <Button variant="outline-secondary" onClick={onSkip}>
              <i className="bi bi-eye me-1"></i>
              {m.wizard_team_browse_btn()}
            </Button>
          </div>
        </>
      )}

      <div className="d-flex justify-content-start mt-3">
        <Button variant="outline-secondary" size="sm" onClick={onPrev}>
          <i className={clsx("bi", isChangeFlow ? "bi-x-lg" : "bi-arrow-left", "me-1")}></i>
          {isChangeFlow ? m.cancel() : m.back()}
        </Button>
      </div>
    </>
  );
}
