import {
  ArrowLeftRight as ArrowLeftRightIcon,
  Book as BookIcon,
  Bug as BugIcon,
  CalendarDays as CalendarDaysIcon,
  CircleUser as CircleUserIcon,
  Code as CodeIcon,
  CodeXml as CodeXmlIcon,
  FileText as FileTextIcon,
  Headset as HeadsetIcon,
  History as HistoryIcon,
  Info as InfoIcon,
  Lightbulb as LightbulbIcon,
  Link as LinkIcon,
  Shield as ShieldIcon,
  ShieldCheck as ShieldCheckIcon,
  SquareCode as SquareCodeIcon,
  Star as StarIcon,
  Tag as TagIcon,
  Users as UsersIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Grid, GridItem } from "@/components/ui/grid";
import { Link } from "@tanstack/react-router";
import { useSettings } from "@/contexts/SettingsContext";
import { CONFIG } from "@/utils/config";
import { getScheduleConfig } from "@/utils/scheduleUtils";
import * as m from "@/paraglide/messages.js";

interface AboutModalProps {
  show: boolean;
  onHide: () => void;
}

/**
 * Render the About modal for Worktime with version, features, support links and credits.
 *
 * @param show - Whether the modal is visible
 * @param onHide - Callback invoked when the modal should be closed
 * @returns The React element for the About modal
 */
export function AboutModal({ show, onHide }: AboutModalProps) {
  const { scheduleType } = useSettings();
  const scheduleConfig = getScheduleConfig(scheduleType);
  const isFiveShift = scheduleConfig.value === "5-shift";

  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) onHide();
      }}
    >
      <DialogContent size="lg" scrollable>
        <DialogHeader>
          <DialogTitle>
            <Icon icon={InfoIcon} className="me-2" />
            {m.about_modal_title()}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto p-4">
          {/* App Title & Version */}
          <div className="text-center mb-6">
            <div className="mb-2">
              <Icon icon={HistoryIcon} className="text-primary text-3xl" />
            </div>
            <h5 className="mb-2">{m.about_app_subtitle()}</h5>
            <div className="mb-2">
              <Badge variant="default">
                <Icon icon={TagIcon} className="me-1" />
                {m.about_version_badge({ version: CONFIG.VERSION })}
              </Badge>
            </div>
          </div>

          {/* Author Section */}
          <div className="text-center mb-6">
            <div className="flex justify-center items-center gap-2 mb-2">
              <Icon icon={CircleUserIcon} className="text-muted-foreground" />
              <span className="font-semibold">{m.about_created_by()}</span>
            </div>
            <a
              href="https://github.com/tjorim"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({
                variant: "outline",
                size: "sm",
                className: "h-auto py-1.5 whitespace-normal no-underline",
              })}
            >
              <Icon icon={CodeXmlIcon} className="me-1" />
              {m.about_github_profile_btn()}
            </a>
          </div>

          <hr />

          {/* Features List with Icons */}
          <div className="mb-6">
            <h6 className="mb-4">
              <Icon icon={StarIcon} className="me-2 text-warning" />
              {m.about_key_features_heading()}
            </h6>
            <Grid className="gap-2">
              <GridItem span={6}>
                <div className="flex items-center text-sm">
                  {isFiveShift ? (
                    <>
                      <Icon icon={UsersIcon} className="text-primary me-2" />
                      <span>{m.about_feature_5shift()}</span>
                    </>
                  ) : (
                    <>
                      <Icon icon={CalendarDaysIcon} className="text-primary me-2" />
                      <span>
                        {m.about_feature_schedule_type({ scheduleTitle: scheduleConfig.title })}
                      </span>
                    </>
                  )}
                </div>
              </GridItem>
              <GridItem span={6}>
                <div className="flex items-center text-sm">
                  <Icon icon={FileTextIcon} className="text-success me-2" />
                  <span>{m.about_feature_hday()}</span>
                </div>
              </GridItem>
              {isFiveShift && (
                <GridItem span={6}>
                  <div className="flex items-center text-sm">
                    <Icon icon={ArrowLeftRightIcon} className="text-info me-2" />
                    <span>{m.about_feature_transfers()}</span>
                  </div>
                </GridItem>
              )}
              <GridItem span={6}>
                <div className="flex items-center text-sm">
                  <Icon icon={CalendarDaysIcon} className="text-muted-foreground me-2" />
                  <span>{m.about_feature_date_format()}</span>
                </div>
              </GridItem>
            </Grid>
          </div>

          <hr />

          {/* Quick Links */}
          <div className="mb-6">
            <h6 className="mb-4">
              <Icon icon={LinkIcon} className="me-2 text-info" />
              {m.about_quick_links_heading()}
            </h6>
            <div className="grid gap-2">
              <Grid className="gap-2">
                <GridItem span={12} desktopSpan={4}>
                  <a
                    href="https://github.com/tjorim/worktime#readme"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className: "h-auto py-1.5 whitespace-normal no-underline w-full",
                    })}
                  >
                    <Icon icon={BookIcon} className="me-1" />
                    {m.about_documentation_btn()}
                  </a>
                </GridItem>
                <GridItem span={12} desktopSpan={4}>
                  <a
                    href="https://github.com/tjorim/worktime"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className: "h-auto py-1.5 whitespace-normal no-underline w-full",
                    })}
                  >
                    <Icon icon={CodeIcon} className="me-1" />
                    {m.about_source_code_btn()}
                  </a>
                </GridItem>
                <GridItem span={12} desktopSpan={4}>
                  <Link
                    to="/privacy"
                    onClick={onHide}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className: "h-auto py-1.5 whitespace-normal no-underline w-full",
                    })}
                  >
                    <Icon icon={ShieldIcon} className="me-1" />
                    {m.about_privacy_policy_btn()}
                  </Link>
                </GridItem>
              </Grid>
            </div>
          </div>

          {/* Support Section */}
          <div className="mb-6">
            <h6 className="mb-4">
              <Icon icon={HeadsetIcon} className="me-2 text-success" />
              {m.about_support_heading()}
            </h6>
            <div className="grid gap-2">
              <Grid className="gap-2">
                <GridItem span={6}>
                  <a
                    href="https://github.com/tjorim/worktime/issues/new?template=bug_report.yml"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className: "h-auto py-1.5 whitespace-normal no-underline w-full",
                    })}
                  >
                    <Icon icon={BugIcon} className="me-1" />
                    {m.about_report_bug_btn()}
                  </a>
                </GridItem>
                <GridItem span={6}>
                  <a
                    href="https://github.com/tjorim/worktime/issues/new?template=feature_request.yml"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className: "h-auto py-1.5 whitespace-normal no-underline w-full",
                    })}
                  >
                    <Icon icon={LightbulbIcon} className="me-1" />
                    {m.about_request_feature_btn()}
                  </a>
                </GridItem>
              </Grid>
            </div>
          </div>

          {/* Footer Info */}
          <div className="text-center">
            <div className="flex justify-center items-center gap-4 text-sm text-muted-foreground">
              <span>
                <Icon icon={ShieldCheckIcon} className="me-1" />
                Apache 2.0
              </span>
              <span>
                <Icon icon={SquareCodeIcon} className="me-1" />
                React + TypeScript
              </span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onHide}>
            {m.close()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
