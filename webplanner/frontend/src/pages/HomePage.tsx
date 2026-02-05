import { Card } from "react-bootstrap";

export function HomePage() {
  return (
    <Card className="shadow-sm">
      <Card.Body>
        <Card.Title>Welcome to WebPlanner</Card.Title>
        <Card.Text>
          Track daily tasks, reuse templates, and review weekly summaries. Use the
          navigation above to open the time tracker or weekly overview.
        </Card.Text>
      </Card.Body>
    </Card>
  );
}
