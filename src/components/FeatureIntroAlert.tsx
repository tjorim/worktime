import Alert from "react-bootstrap/Alert";

interface Feature {
  name: string;
  detail: string;
}

interface FeatureIntroAlertProps {
  features: Feature[];
  onDismiss: () => void;
}

export function FeatureIntroAlert({ features, onDismiss }: FeatureIntroAlertProps) {
  return (
    <Alert variant="info" dismissible onClose={onDismiss} className="rounded-0 mb-0 border-start-0 border-end-0">
      <strong>New since your last visit:</strong>{" "}
      {features.map((f, i) => (
        <span key={f.name}>
          {i > 0 && " · "}
          <strong>{f.name}</strong> — {f.detail}
        </span>
      ))}
      {". "}
      Enable in <strong>Settings</strong>{" "}
      <span aria-hidden="true">⚙</span>.
    </Alert>
  );
}
