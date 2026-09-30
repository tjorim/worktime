import { CirclePlus as CirclePlusIcon, type LucideIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import type { ReactNode } from "react";
import Button from "react-bootstrap/Button";

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
    variant?: string;
  };
  /** Optional icon size (default: "3rem") */
  iconSize?: string;
}

/**
 * Reusable empty state component for views with no data.
 * Provides consistent styling and accessibility across all panels.
 */
export function EmptyState({
  icon,
  title,
  description,
  ctaButton,
  iconSize = "3rem",
}: EmptyStateProps) {
  return (
    <div className="text-center py-4">
      <div className="mb-3">
        <Icon
          icon={icon}
          className="text-muted"

          style={{ fontSize: iconSize }}
        />
      </div>
      <h6 className="text-muted mb-2">{title}</h6>
      <p className="text-muted small mb-3">{description}</p>
      {ctaButton && (
        <Button size="sm" variant={ctaButton.variant} onClick={ctaButton.onClick}>
          <Icon icon={ctaButton.icon ?? CirclePlusIcon} className="me-1" />
          {ctaButton.label}
        </Button>
      )}
    </div>
  );
}
