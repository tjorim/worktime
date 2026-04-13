import Container from "react-bootstrap/Container";
import { Outlet } from "@tanstack/react-router";
import { AboutModal } from "@/components/AboutModal";
import { FeatureIntroAlert } from "@/components/FeatureIntroAlert";
import { Header } from "@/components/Header";
import { useAppShellContext } from "@/contexts/AppShellContext";

export function AppLayout() {
  const { featureAnnouncements, dismissFeatureAnnouncements, showAbout, closeAbout } =
    useAppShellContext();

  return (
    <div className="min-vh-100">
      <Container fluid>
        <Header />
        {featureAnnouncements.length > 0 && (
          <FeatureIntroAlert features={featureAnnouncements} onDismiss={dismissFeatureAnnouncements} />
        )}
        <Outlet />
        <AboutModal show={showAbout} onHide={closeAbout} />
      </Container>
    </div>
  );
}
