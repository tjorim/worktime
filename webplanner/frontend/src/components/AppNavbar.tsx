import { Container, Nav, Navbar } from "react-bootstrap";

type Props = {
  active: "home" | "timetracker" | "overview";
  onNavigate: (page: "home" | "timetracker" | "overview") => void;
};

export function AppNavbar({ active, onNavigate }: Props) {
  return (
    <Navbar bg="dark" variant="dark" expand="sm" className="border-bottom">
      <Container>
        <Navbar.Brand>WebPlanner</Navbar.Brand>
        <Nav activeKey={active}>
          <Nav.Link eventKey="home" onClick={() => onNavigate("home")}>
            Home
          </Nav.Link>
          <Nav.Link eventKey="timetracker" onClick={() => onNavigate("timetracker")}>
            Time tracker
          </Nav.Link>
          <Nav.Link eventKey="overview" onClick={() => onNavigate("overview")}>
            Overview
          </Nav.Link>
        </Nav>
      </Container>
    </Navbar>
  );
}
