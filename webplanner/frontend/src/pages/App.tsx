import { useMemo, useState } from "react";
import { Container } from "react-bootstrap";
import { AppNavbar } from "../components/AppNavbar";
import { HomePage } from "./HomePage";
import { TimeTrackerPage } from "./TimeTrackerPage";
import { OverviewPage } from "./OverviewPage";

type Page = "home" | "timetracker" | "overview";

export function App() {
  const [page, setPage] = useState<Page>("timetracker");

  const content = useMemo(() => {
    switch (page) {
      case "overview":
        return <OverviewPage />;
      case "home":
        return <HomePage />;
      default:
        return <TimeTrackerPage />;
    }
  }, [page]);

  return (
    <div className="app-shell">
      <AppNavbar active={page} onNavigate={setPage} />
      <Container className="py-4">{content}</Container>
    </div>
  );
}
