import type { ReactNode } from "react";
import Button from "react-bootstrap/Button";

interface EmptyStateProps {
  /** Bootstrap icon class name (e.g., "bi-bar-chart") */
  icon: string;
  /** Main heading text */
  title: string;
  /** Description/help text */
  description: ReactNode;
  /** Optional call-to-action button */
  ctaButton?: {
    label: string;
    onClick: () => void;
    icon?: string;
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
        <i
          className={`bi ${icon} text-muted`}
          style={{ fontSize: iconSize }}
          aria-hidden="true"
        ></i>
      </div>
      <h6 className="text-muted mb-2">{title}</h6>
      <p className="text-muted small mb-3">{description}</p>
      {ctaButton && (
        <Button size="sm" variant={ctaButton.variant} onClick={ctaButton.onClick}>
          <i className={`bi ${ctaButton.icon ?? "bi-plus-circle"} me-1`} aria-hidden="true"></i>
          {ctaButton.label}
        </Button>
      )}
    </div>
  );
}
