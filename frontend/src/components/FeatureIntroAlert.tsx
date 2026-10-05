import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import * as m from "@/paraglide/messages";
import { Alert } from "@/components/ui/alert";

interface Feature {
  name: string;
  detail: string;
}

interface FeatureIntroAlertProps {
  features: Feature[];
  onDismiss: () => void;
}

export function FeatureIntroAlert({ features, onDismiss }: FeatureIntroAlertProps) {
  if (!features || features.length === 0) {
    return null;
  }

  return (
    <Alert variant="info" className="rounded-none mb-0 border-l-0 border-r-0 pr-12">
      <div>
        <strong>New since your last visit:</strong>{" "}
        {features.map((f, i) => (
          <span key={`${f.name}-${i}`}>
            {i > 0 && " · "}
            <strong>{f.name}</strong> — {f.detail}
          </span>
        ))}
        {". "}
        Enable in <strong>Settings</strong> <span aria-hidden="true">⚙</span>.
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute top-2 right-2"
        onClick={onDismiss}
        aria-label={m.close()}
      >
        <Icon icon={X} />
      </Button>
    </Alert>
  );
}
