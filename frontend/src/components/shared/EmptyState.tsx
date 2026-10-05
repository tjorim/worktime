import { CirclePlus as CirclePlusIcon, type LucideIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  /** Lucide icon component */
  icon: LucideIcon;
  /** Main heading text */
  title: string;
  /** Description/help text */
  description: ReactNode;
  /** Optional call-to-action button */
  ctaButton?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
    variant?: React.ComponentProps<typeof Button>["variant"];
  };
}

/**
 * Reusable empty state component for views with no data.
 * Provides consistent styling and accessibility across all panels.
 */
export function EmptyState({ icon, title, description, ctaButton }: EmptyStateProps) {
  return (
    <div className="text-center py-6">
      <div className="mb-4">
        <Icon icon={icon} className="size-12 text-muted-foreground" />
      </div>
      <h6 className="text-muted-foreground mb-2">{title}</h6>
      <p className="text-muted-foreground text-sm mb-4">{description}</p>
      {ctaButton && (
        <Button size="sm" variant={ctaButton.variant} onClick={ctaButton.onClick}>
          <Icon icon={ctaButton.icon ?? CirclePlusIcon} className="me-1" />
          {ctaButton.label}
        </Button>
      )}
    </div>
  );
}
