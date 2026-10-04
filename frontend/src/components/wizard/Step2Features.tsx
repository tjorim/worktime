import {
  ArrowLeft as ArrowLeftIcon,
  ArrowRight as ArrowRightIcon,
  CalendarCheck as CalendarCheckIcon,
  ChartGantt as ChartGanttIcon,
  Globe as GlobeIcon,
  History as HistoryIcon,
  Settings as SettingsIcon,
  Timer as TimerIcon,
  Users as UsersIcon,
  WifiOff as WifiOffIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Grid, GridItem } from "@/components/ui/grid";
import type { RefObject } from "react";
import { WizardActions } from "./WizardParts";
import * as m from "@/paraglide/messages.js";

interface Step2FeaturesProps {
  onPrev: () => void;
  onNext: () => void;
  firstButtonRef?: RefObject<HTMLButtonElement | null>;
  /**
   * String describing where to find settings; caller is responsible for any desired styling.
   */
  settingsLocationText: string;
}

export function Step2Features({
  onPrev,
  onNext,
  firstButtonRef,
  settingsLocationText,
}: Step2FeaturesProps) {
  return (
    <>
      <div className="mb-4">
        <h5 className="mb-4 text-center text-xl font-medium">{m.wizard_features_heading()}</h5>
        <Grid className="gap-3">
          <GridItem desktopSpan={6}>
            <div className="flex items-start gap-3">
              <Icon icon={TimerIcon} className="mt-1 text-2xl text-success" />
              <div>
                <h6 className="mb-1 text-base font-medium">{m.wizard_feature_countdown_title()}</h6>
                <small className="text-sm text-muted-foreground">
                  {m.wizard_feature_countdown_desc()}
                </small>
              </div>
            </div>
          </GridItem>
          <GridItem desktopSpan={6}>
            <div className="flex items-start gap-3">
              <Icon icon={WifiOffIcon} className="mt-1 text-2xl text-info" />
              <div>
                <h6 className="mb-1 text-base font-medium">{m.wizard_feature_local_title()}</h6>
                <small className="text-sm text-muted-foreground">
                  {m.wizard_feature_local_desc()}
                </small>
              </div>
            </div>
          </GridItem>
          <GridItem desktopSpan={6}>
            <div className="flex items-start gap-3">
              <Icon icon={UsersIcon} className="mt-1 text-2xl text-warning" />
              <div>
                <h6 className="mb-1 text-base font-medium">{m.wizard_feature_team_title()}</h6>
                <small className="text-sm text-muted-foreground">
                  {m.wizard_feature_team_desc()}
                </small>
              </div>
            </div>
          </GridItem>
          <GridItem desktopSpan={6}>
            <div className="flex items-start gap-3">
              <Icon icon={CalendarCheckIcon} className="mt-1 text-2xl text-primary" />
              <div>
                <h6 className="mb-1 text-base font-medium">{m.wizard_feature_timeoff_title()}</h6>
                <small className="text-sm text-muted-foreground">
                  {m.wizard_feature_timeoff_desc()}
                </small>
              </div>
            </div>
          </GridItem>
          <GridItem desktopSpan={6}>
            <div className="flex items-start gap-3">
              <Icon icon={HistoryIcon} className="mt-1 text-2xl text-success" />
              <div>
                <h6 className="mb-1 text-base font-medium">{m.wizard_feature_tracking_title()}</h6>
                <small className="text-sm text-muted-foreground">
                  {m.wizard_feature_tracking_desc()}
                </small>
              </div>
            </div>
          </GridItem>
          <GridItem desktopSpan={6}>
            <div className="flex items-start gap-3">
              <Icon icon={ChartGanttIcon} className="mt-1 text-2xl text-warning" />
              <div>
                <h6 className="mb-1 text-base font-medium">{m.wizard_feature_gantt_title()}</h6>
                <small className="text-sm text-muted-foreground">
                  {m.wizard_feature_gantt_desc()}
                </small>
              </div>
            </div>
          </GridItem>
          <GridItem desktopSpan={6}>
            <div className="flex items-start gap-3">
              <Icon icon={GlobeIcon} className="mt-1 text-2xl text-primary" />
              <div>
                <h6 className="mb-1 text-base font-medium">
                  {m.wizard_feature_crossborder_title()}
                </h6>
                <small className="text-sm text-muted-foreground">
                  {m.wizard_feature_crossborder_desc()}
                </small>
              </div>
            </div>
          </GridItem>
        </Grid>
        <Alert variant="info" className="mt-4">
          <Icon icon={SettingsIcon} />
          <AlertDescription className="text-current">
            {m.wizard_features_tip_full({ settingsLocation: settingsLocationText })}
          </AlertDescription>
        </Alert>
      </div>
      <WizardActions
        start={
          <Button variant="outline" size="lg" onClick={onPrev} ref={firstButtonRef}>
            <Icon icon={ArrowLeftIcon} /> {m.back()}
          </Button>
        }
        end={
          <Button size="lg" onClick={onNext}>
            {m.wizard_choose_schedule_btn()} <Icon icon={ArrowRightIcon} />
          </Button>
        }
      />
    </>
  );
}
