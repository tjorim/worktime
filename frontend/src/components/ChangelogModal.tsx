import type { LucideIcon } from "lucide-react";
import {
  Bug as BugIcon,
  CalendarClock as CalendarClockIcon,
  CirclePlus as CirclePlusIcon,
  Info as InfoIcon,
  NotebookText as NotebookTextIcon,
  RefreshCw as RefreshCwIcon,
  Rocket as RocketIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useState } from "react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { type ChangelogVersion, changelogData, futurePlans } from "@/data/changelog";
import * as m from "@/paraglide/messages.js";

interface ChangelogModalProps {
  show: boolean;
  onHide: () => void;
}

/**
 * Render a modal displaying the application's changelog, per-version details and upcoming plans.
 *
 * @param show - Whether the modal is visible
 * @param onHide - Callback invoked to request closing the modal
 * @returns The Modal JSX element containing the changelog, versioned entries and "Coming Soon" plans
 */
export function ChangelogModal({ show, onHide }: ChangelogModalProps) {
  const [activeKey, setActiveKey] = useState<string>("0");

  const getStatusBadge = (status: ChangelogVersion["status"]) => {
    switch (status) {
      case "current":
        return <Badge variant="default">{m.changelog_status_current()}</Badge>;
      case "planned":
        return <Badge variant="secondary">{m.changelog_status_planned()}</Badge>;
      case "released":
        return <Badge variant="success">{m.changelog_status_released()}</Badge>;
      default:
        return null;
    }
  };

  const getIconForSection = (title: string): LucideIcon => {
    switch (title) {
      case "added":
        return CirclePlusIcon;
      case "changed":
        return RefreshCwIcon;
      case "fixed":
        return BugIcon;
      case "planned":
        return CalendarClockIcon;
      default:
        return InfoIcon;
    }
  };

  const renderChangeSection = (
    key: "added" | "changed" | "fixed" | "planned",
    label: string,
    items: string[],
    textClass: string,
  ) => {
    if (items.length === 0) return null;
    const seen = new Map<string, number>();

    return (
      <div className="mb-4">
        <h6 className={cn(textClass, "mb-2")}>
          <Icon icon={getIconForSection(key)} className="me-2" />
          {label}
        </h6>
        <ul className="list-none pl-0">
          {items.map((item) => {
            const occurrence = (seen.get(item) ?? 0) + 1;
            seen.set(item, occurrence);
            return (
              <li key={`${key}-${item}-${occurrence}`} className="mb-1">
                <small className="text-muted-foreground">•</small> {item}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) onHide();
      }}
    >
      <DialogContent size="lg" scrollable position="top">
        <DialogHeader>
          <DialogTitle>
            <Icon icon={NotebookTextIcon} className="me-2" />
            {m.changelog_modal_title()}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto p-4">
          <div className="mb-4">
            <p className="text-muted-foreground">{m.changelog_modal_description()}</p>
          </div>

          <Accordion
            value={activeKey ? [activeKey] : []}
            onValueChange={(keys) => setActiveKey(String(keys[0] ?? ""))}
          >
            {changelogData.map((version, index) => (
              <AccordionItem value={index.toString()} key={version.version}>
                <AccordionTrigger>
                  <div className="flex justify-between items-center w-full me-2">
                    <div>
                      <strong>{m.changelog_version_label({ version: version.version })}</strong>
                      <small className="text-muted-foreground ms-2">{version.date}</small>
                    </div>
                    {getStatusBadge(version.status)}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {renderChangeSection(
                    "added",
                    m.changelog_section_added(),
                    version.added,
                    "text-success",
                  )}
                  {renderChangeSection(
                    "changed",
                    m.changelog_section_changed(),
                    version.changed,
                    "text-info",
                  )}
                  {renderChangeSection(
                    "fixed",
                    m.changelog_section_fixed(),
                    version.fixed,
                    "text-warning",
                  )}
                  {version.planned &&
                    renderChangeSection(
                      "planned",
                      m.changelog_section_planned(),
                      version.planned,
                      "text-muted-foreground",
                    )}

                  {version.technicalDetails && (
                    <Card className="mt-4 border-0 bg-secondary">
                      <CardContent className="py-2">
                        <small className="text-muted-foreground">
                          <Icon icon={InfoIcon} className="me-1" />
                          <strong>{version.technicalDetails.title}:</strong>{" "}
                          {version.technicalDetails.description}
                        </small>
                      </CardContent>
                    </Card>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="mt-6 p-4 bg-secondary rounded-md">
            <h6 className="text-primary mb-2">
              <Icon icon={RocketIcon} className="me-2" />
              {m.changelog_coming_soon_heading()}
            </h6>
            <p className="mb-0 text-sm text-muted-foreground">{futurePlans.join(", ")}</p>
          </div>
        </div>
        <DialogFooter>
          <small className="text-muted-foreground me-auto">
            {m.changelog_versioning_text()}{" "}
            <a href="https://calver.org/" target="_blank" rel="noopener noreferrer">
              {m.changelog_versioning_link()}
            </a>
          </small>
          <Button variant="secondary" onClick={onHide}>
            {m.close()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
