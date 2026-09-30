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
import clsx from "clsx";
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
      <div className="tw:mb-4">
        <h6 className={clsx(textClass, "tw:mb-2")}>
          <Icon icon={getIconForSection(key)} className="tw:me-2" />
          {label}
        </h6>
        <ul className="tw:list-none tw:pl-0">
          {items.map((item) => {
            const occurrence = (seen.get(item) ?? 0) + 1;
            seen.set(item, occurrence);
            return (
              <li key={`${key}-${item}-${occurrence}`} className="tw:mb-1">
                <small className="tw:text-muted-foreground">•</small> {item}
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
            <Icon icon={NotebookTextIcon} className="tw:me-2" />
            {m.changelog_modal_title()}
          </DialogTitle>
        </DialogHeader>
        <div className="tw:min-h-0 tw:overflow-y-auto tw:p-4">
          <div className="tw:mb-4">
            <p className="tw:text-muted-foreground">{m.changelog_modal_description()}</p>
          </div>

          <Accordion
            value={activeKey ? [activeKey] : []}
            onValueChange={(keys) => setActiveKey(String(keys[0] ?? ""))}
          >
            {changelogData.map((version, index) => (
              <AccordionItem value={index.toString()} key={version.version}>
                <AccordionTrigger>
                  <div className="tw:flex tw:justify-between tw:items-center tw:w-full tw:me-2">
                    <div>
                      <strong>{m.changelog_version_label({ version: version.version })}</strong>
                      <small className="tw:text-muted-foreground tw:ms-2">{version.date}</small>
                    </div>
                    {getStatusBadge(version.status)}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {renderChangeSection(
                    "added",
                    m.changelog_section_added(),
                    version.added,
                    "tw:text-success",
                  )}
                  {renderChangeSection(
                    "changed",
                    m.changelog_section_changed(),
                    version.changed,
                    "tw:text-info",
                  )}
                  {renderChangeSection(
                    "fixed",
                    m.changelog_section_fixed(),
                    version.fixed,
                    "tw:text-warning",
                  )}
                  {version.planned &&
                    renderChangeSection(
                      "planned",
                      m.changelog_section_planned(),
                      version.planned,
                      "tw:text-muted-foreground",
                    )}

                  {version.technicalDetails && (
                    <Card className="tw:mt-4 tw:border-0 tw:bg-secondary">
                      <CardContent className="tw:py-2">
                        <small className="tw:text-muted-foreground">
                          <Icon icon={InfoIcon} className="tw:me-1" />
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

          <div className="tw:mt-6 tw:p-4 tw:bg-secondary tw:rounded-md">
            <h6 className="tw:text-primary tw:mb-2">
              <Icon icon={RocketIcon} className="tw:me-2" />
              {m.changelog_coming_soon_heading()}
            </h6>
            <p className="tw:mb-0 tw:text-sm tw:text-muted-foreground">{futurePlans.join(", ")}</p>
          </div>
        </div>
        <DialogFooter>
          <small className="tw:text-muted-foreground tw:me-auto">
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
