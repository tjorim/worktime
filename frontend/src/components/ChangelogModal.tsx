import type { LucideIcon } from "lucide-react";
import {
  BugIcon,
  CalendarClockIcon,
  CirclePlusIcon,
  InfoIcon,
  NotebookTextIcon,
  RefreshCwIcon,
  RocketIcon,
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
import {
  type ChangelogCategory,
  type ChangelogVersion,
  changelogData,
  futurePlans,
} from "@/data/changelog";
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
      case "released":
        return <Badge variant="success">{m.changelog_status_released()}</Badge>;
      default:
        return null;
    }
  };

  /** Icon, colour and (translated, where we have one) label for a changelog `###` heading. */
  const getCategoryStyle = (
    name: string,
  ): { icon: LucideIcon; textClass: string; label: string } => {
    switch (name.toLowerCase()) {
      case "added":
        return {
          icon: CirclePlusIcon,
          textClass: "text-success",
          label: m.changelog_section_added(),
        };
      case "changed":
        return {
          icon: RefreshCwIcon,
          textClass: "text-info",
          label: m.changelog_section_changed(),
        };
      case "fixed":
        return { icon: BugIcon, textClass: "text-warning", label: m.changelog_section_fixed() };
      case "planned":
        return {
          icon: CalendarClockIcon,
          textClass: "text-muted-foreground",
          label: m.changelog_section_planned(),
        };
      case "removed":
        return {
          icon: InfoIcon,
          textClass: "text-muted-foreground",
          label: m.changelog_section_removed(),
        };
      case "security":
        return {
          icon: InfoIcon,
          textClass: "text-muted-foreground",
          label: m.changelog_section_security(),
        };
      case "deprecated":
        return {
          icon: InfoIcon,
          textClass: "text-muted-foreground",
          label: m.changelog_section_deprecated(),
        };
      default:
        return { icon: InfoIcon, textClass: "text-muted-foreground", label: name };
    }
  };

  const renderCategory = (category: ChangelogCategory) => {
    if (category.entries.length === 0) return null;
    const seen = new Map<string, number>();
    const style = category.name ? getCategoryStyle(category.name) : null;

    return (
      <div className="mb-4" key={category.name ?? "uncategorized"}>
        {style && (
          <h6 className={cn(style.textClass, "mb-2")}>
            <Icon icon={style.icon} className="me-2" />
            {style.label}
          </h6>
        )}
        <ul className="list-none pl-0">
          {category.entries.map((entry) => {
            const occurrence = (seen.get(entry.text) ?? 0) + 1;
            seen.set(entry.text, occurrence);
            return (
              <li key={`${category.name}-${entry.text}-${occurrence}`} className="mb-1">
                <small className="text-muted-foreground">•</small>{" "}
                {entry.scope && <strong>{entry.scope}: </strong>}
                {entry.text}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  /** A `#### Title` note under a version becomes "Title: description"; other prose is shown as is. */
  const renderNotes = (version: ChangelogVersion) => {
    const notes = version.categories.flatMap((category) =>
      category.prose ? [category.prose] : [],
    );
    if (notes.length === 0) return null;
    return notes.map((note) => {
      const match = /^#### (.+?)\s*\n+([\s\S]*)$/.exec(note.trim());
      return (
        <Card className="mt-4 border-0 bg-secondary" key={note}>
          <CardContent className="py-2">
            <small className="text-muted-foreground">
              <Icon icon={InfoIcon} className="me-1" />
              {match ? (
                <>
                  <strong>{match[1]}:</strong> {match[2]!.trim()}
                </>
              ) : (
                note
              )}
            </small>
          </CardContent>
        </Card>
      );
    });
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
                  {version.categories.map(renderCategory)}
                  {renderNotes(version)}
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
