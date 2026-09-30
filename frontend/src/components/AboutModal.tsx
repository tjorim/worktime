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
            <Icon icon={InfoIcon} className="tw:me-2" />
            {m.about_modal_title()}
          </DialogTitle>
        </DialogHeader>
        <div className="tw:min-h-0 tw:overflow-y-auto tw:p-4">
          {/* App Title & Version */}
          <div className="tw:text-center tw:mb-6">
            <div className="tw:mb-2">
              <Icon icon={HistoryIcon} className="tw:text-primary tw:text-3xl" />
            </div>
            <h5 className="tw:mb-2">{m.about_app_subtitle()}</h5>
            <div className="tw:mb-2">
              <Badge variant="default">
                <Icon icon={TagIcon} className="tw:me-1" />
                {m.about_version_badge({ version: CONFIG.VERSION })}
              </Badge>
            </div>
          </div>

          {/* Author Section */}
          <div className="tw:text-center tw:mb-6">
            <div className="tw:flex tw:justify-center tw:items-center tw:gap-2 tw:mb-2">
              <Icon icon={CircleUserIcon} className="tw:text-muted-foreground" />
              <span className="tw:font-semibold">{m.about_created_by()}</span>
            </div>
            <a
              href="https://github.com/tjorim"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({
                variant: "outline",
                size: "sm",
                className: "tw:h-auto tw:py-1.5 tw:whitespace-normal tw:no-underline",
              })}
            >
              <Icon icon={CodeXmlIcon} className="tw:me-1" />
              {m.about_github_profile_btn()}
            </a>
          </div>

          <hr />

          {/* Features List with Icons */}
          <div className="tw:mb-6">
            <h6 className="tw:mb-4">
              <Icon icon={StarIcon} className="tw:me-2 tw:text-warning" />
              {m.about_key_features_heading()}
            </h6>
            <Grid className="tw:gap-2">
              <GridItem span={6}>
                <div className="tw:flex tw:items-center tw:text-sm">
                  {isFiveShift ? (
                    <>
                      <Icon icon={UsersIcon} className="tw:text-primary tw:me-2" />
                      <span>{m.about_feature_5shift()}</span>
                    </>
                  ) : (
                    <>
                      <Icon icon={CalendarDaysIcon} className="tw:text-primary tw:me-2" />
                      <span>
                        {m.about_feature_schedule_type({ scheduleTitle: scheduleConfig.title })}
                      </span>
                    </>
                  )}
                </div>
              </GridItem>
              <GridItem span={6}>
                <div className="tw:flex tw:items-center tw:text-sm">
                  <Icon icon={FileTextIcon} className="tw:text-success tw:me-2" />
                  <span>{m.about_feature_hday()}</span>
                </div>
              </GridItem>
              {isFiveShift && (
                <GridItem span={6}>
                  <div className="tw:flex tw:items-center tw:text-sm">
                    <Icon icon={ArrowLeftRightIcon} className="tw:text-info tw:me-2" />
                    <span>{m.about_feature_transfers()}</span>
                  </div>
                </GridItem>
              )}
              <GridItem span={6}>
                <div className="tw:flex tw:items-center tw:text-sm">
                  <Icon icon={CalendarDaysIcon} className="tw:text-muted-foreground tw:me-2" />
                  <span>{m.about_feature_date_format()}</span>
                </div>
              </GridItem>
            </Grid>
          </div>

          <hr />

          {/* Quick Links */}
          <div className="tw:mb-6">
            <h6 className="tw:mb-4">
              <Icon icon={LinkIcon} className="tw:me-2 tw:text-info" />
              {m.about_quick_links_heading()}
            </h6>
            <div className="tw:grid tw:gap-2">
              <Grid className="tw:gap-2">
                <GridItem span={12} desktopSpan={4}>
                  <a
                    href="https://github.com/tjorim/worktime#readme"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className:
                        "tw:h-auto tw:py-1.5 tw:whitespace-normal tw:no-underline tw:w-full",
                    })}
                  >
                    <Icon icon={BookIcon} className="tw:me-1" />
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
                      className:
                        "tw:h-auto tw:py-1.5 tw:whitespace-normal tw:no-underline tw:w-full",
                    })}
                  >
                    <Icon icon={CodeIcon} className="tw:me-1" />
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
                      className:
                        "tw:h-auto tw:py-1.5 tw:whitespace-normal tw:no-underline tw:w-full",
                    })}
                  >
                    <Icon icon={ShieldIcon} className="tw:me-1" />
                    {m.about_privacy_policy_btn()}
                  </Link>
                </GridItem>
              </Grid>
            </div>
          </div>

          {/* Support Section */}
          <div className="tw:mb-6">
            <h6 className="tw:mb-4">
              <Icon icon={HeadsetIcon} className="tw:me-2 tw:text-success" />
              {m.about_support_heading()}
            </h6>
            <div className="tw:grid tw:gap-2">
              <Grid className="tw:gap-2">
                <GridItem span={6}>
                  <a
                    href="https://github.com/tjorim/worktime/issues/new?template=bug_report.yml"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className:
                        "tw:h-auto tw:py-1.5 tw:whitespace-normal tw:no-underline tw:w-full",
                    })}
                  >
                    <Icon icon={BugIcon} className="tw:me-1" />
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
                      className:
                        "tw:h-auto tw:py-1.5 tw:whitespace-normal tw:no-underline tw:w-full",
                    })}
                  >
                    <Icon icon={LightbulbIcon} className="tw:me-1" />
                    {m.about_request_feature_btn()}
                  </a>
                </GridItem>
              </Grid>
            </div>
          </div>

          {/* Footer Info */}
          <div className="tw:text-center">
            <div className="tw:flex tw:justify-center tw:items-center tw:gap-4 tw:text-sm tw:text-muted-foreground">
              <span>
                <Icon icon={ShieldCheckIcon} className="tw:me-1" />
                Apache 2.0
              </span>
              <span>
                <Icon icon={SquareCodeIcon} className="tw:me-1" />
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
