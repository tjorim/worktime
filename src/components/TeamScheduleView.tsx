import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Spinner from "react-bootstrap/Spinner";
import Table from "react-bootstrap/Table";
import { useDeveloperOptions } from "../contexts/DeveloperOptionsContext";
import type { HdayEvent } from "../lib/hday/types";

interface TeamMember {
  username: string;
  display_name: string;
}

interface TeamMemberHdayData extends TeamMember {
  raw: string;
  events: HdayEvent[];
  etag: string | null;
}

interface TeamHdayResponse {
  team_id: string;
  name: string;
  members: TeamMemberHdayData[];
}

/**
 * Team Schedule Viewer - displays team members and their .hday schedules.
 * Only visible when developer options are enabled and backend is connected.
 *
 * Allows user to input a team ID and view:
 * - Team name
 * - List of all team members
 * - Each member's .hday events in an agenda-style view
 *
 * Inspired by example-team-overview.html but simplified for initial implementation.
 */
export function TeamScheduleView() {
  const { options } = useDeveloperOptions();
  const apiUrl = options.apiUrl;
  const connectionStatus = options.connectionStatus;
  
  const [teamId, setTeamId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamData, setTeamData] = useState<TeamHdayResponse | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Reset state when connection is lost
  useEffect(() => {
    if (connectionStatus !== "connected") {
      setTeamData(null);
      setError(null);
    }
  }, [connectionStatus]);

  // Cleanup: abort any pending requests on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const fetchTeamData = useCallback(async () => {
    if (!teamId.trim()) {
      setError("Please enter a team ID");
      return;
    }

    // Abort any previous fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this fetch
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    setError(null);
    setTeamData(null);

    try {
      // Fetch team .hday data (includes team info)
      const response = await fetch(
        `${apiUrl}/v1/team/${encodeURIComponent(teamId)}/hday?format=parsed`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          signal: abortController.signal,
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch team data: ${errorText}`);
      }

      const data: TeamHdayResponse = await response.json();
      
      // Only update state if this request wasn't aborted
      if (!abortController.signal.aborted) {
        setTeamData(data);
      }
    } catch (err) {
      // Don't show error if the request was aborted
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      
      console.error("Error fetching team data:", err);
      setError(err instanceof Error ? err.message : "An unknown error occurred");
      setTeamData(null);
    } finally {
      // Only update loading state if this request wasn't aborted
      if (!abortController.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [teamId, apiUrl]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTeamData();
  };

  if (connectionStatus !== "connected") {
    return (
      <Alert variant="info" className="mt-3">
        <Alert.Heading>Backend Connection Required</Alert.Heading>
        <p>
          To view team schedules, please enable developer options and connect to the backend API.
        </p>
        <p className="mb-0 small">
          Open Settings → Developer Options and configure your backend API URL.
        </p>
      </Alert>
    );
  }

  return (
    <div className="team-schedule-view py-3">
      <Card className="mb-3">
        <Card.Body>
          <Card.Title>
            <i className="bi bi-people me-2" aria-hidden="true"></i>
            Team Schedule Viewer
          </Card.Title>
          <Card.Text className="text-muted small mb-3">
            Enter a team ID to view the team roster and .hday schedules for all members.
          </Card.Text>

          <Form onSubmit={handleSubmit}>
            <div className="d-flex gap-2 align-items-start">
              <Form.Group className="flex-grow-1">
                <Form.Label htmlFor="team-id-input" className="visually-hidden">
                  Team ID
                </Form.Label>
                <Form.Control
                  id="team-id-input"
                  type="text"
                  placeholder="Enter team ID (e.g., team1, dev-team)"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  disabled={isLoading}
                  aria-required="true"
                />
              </Form.Group>
              <Button type="submit" variant="primary" disabled={isLoading || !teamId.trim()}>
                {isLoading ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" />
                    Loading...
                  </>
                ) : (
                  <>
                    <i className="bi bi-search me-1" aria-hidden="true"></i>
                    Load Team
                  </>
                )}
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          <Alert.Heading>Error</Alert.Heading>
          <p className="mb-0">{error}</p>
        </Alert>
      )}

      {teamData && (
        <Card className="mb-3">
          <Card.Header>
            <h5 className="mb-0">
              <i className="bi bi-building me-2" aria-hidden="true"></i>
              {teamData.name}
            </h5>
          </Card.Header>
          <Card.Body>
            <h6 className="mb-3">
              Team Members ({teamData.members.length})
              <span className="text-muted small ms-2">ID: {teamData.team_id}</span>
            </h6>

            <Table responsive hover className="mb-0">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Display Name</th>
                  <th>Events</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {teamData.members.map((member) => (
                  <tr key={member.username}>
                    <td>
                      <code>{member.username}</code>
                    </td>
                    <td>{member.display_name}</td>
                    <td>
                      {member.events.length > 0 ? (
                        <span className="badge text-bg-info">{member.events.length} events</span>
                      ) : (
                        <span className="text-muted small">No events</span>
                      )}
                    </td>
                    <td>
                      {member.etag ? (
                        <span className="text-success small">
                          <i className="bi bi-file-earmark-text me-1" aria-hidden="true"></i>
                          .hday file
                        </span>
                      ) : (
                        <span className="text-muted small">
                          <i className="bi bi-file-earmark-x me-1" aria-hidden="true"></i>
                          No .hday file
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      )}

      {!teamData && !error && !isLoading && (
        <Card className="text-center py-5">
          <Card.Body>
            <i className="bi bi-inbox display-1 text-muted mb-3 d-block" aria-hidden="true"></i>
            <p className="text-muted">Enter a team ID above to load team schedule data.</p>
          </Card.Body>
        </Card>
      )}
    </div>
  );
}
