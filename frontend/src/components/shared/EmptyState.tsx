import { CirclePlusIcon, type LucideIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

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
    <Empty className="py-6">
      <EmptyHeader>
        <EmptyMedia>
          <Icon icon={icon} className="size-12 text-muted-foreground" />
        </EmptyMedia>
        <EmptyTitle className="text-muted-foreground">{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {ctaButton && (
        <EmptyContent>
          <Button size="sm" variant={ctaButton.variant} onClick={ctaButton.onClick}>
            <Icon icon={ctaButton.icon ?? CirclePlusIcon} className="me-1" />
            {ctaButton.label}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
