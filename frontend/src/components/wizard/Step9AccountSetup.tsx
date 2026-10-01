import {
  ArrowLeft as ArrowLeftIcon,
  Check as CheckIcon,
  CircleCheck as CircleCheckIcon,
  CircleX as CircleXIcon,
  Cloud as CloudIcon,
  HardDrive as HardDriveIcon,
  UserCheck as UserCheckIcon,
  UserPlus as UserPlusIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Grid, GridItem } from "@/components/ui/grid";
import type { RefObject } from "react";
import { WizardActions } from "./WizardParts";
import * as m from "@/paraglide/messages.js";

interface Step9AccountSetupProps {
  isAuthenticated: boolean;
  displayName: string | null;
  onConnectAccount: () => void;
  onSkip: () => void;
  onPrev: () => void;
  firstButtonRef?: RefObject<HTMLButtonElement | null>;
}

export function Step9AccountSetup({
  isAuthenticated,
  displayName,
  onConnectAccount,
  onSkip,
  onPrev,
  firstButtonRef,
}: Step9AccountSetupProps) {
  return (
    <>
      <div className="tw:mb-3 tw:text-center">
        <h4 className="tw:mb-1 tw:text-2xl tw:font-medium">{m.wizard_account_heading()}</h4>
        <p className="tw:text-sm tw:text-muted-foreground">{m.wizard_account_subtitle()}</p>
      </div>

      {isAuthenticated ? (
        <div className="tw:py-3 tw:text-center">
          <Icon
            icon={UserCheckIcon}
            className="tw:mx-auto tw:mb-3 tw:block tw:text-4xl tw:text-success"
          />
          <p className="tw:font-medium">
            {displayName ? m.auth_logged_in_as({ displayName }) : m.account_signed_in()}
          </p>
          <p className="tw:text-sm tw:text-muted-foreground">
            {m.wizard_account_already_connected()}
          </p>
        </div>
      ) : (
        <Grid className="tw:mb-3">
          {/* Local Only card */}
          <GridItem desktopSpan={6}>
            <Card className="tw:h-full tw:ring-secondary-foreground/40">
              <CardHeader>
                <CardTitle className="tw:flex tw:items-center tw:gap-2 tw:font-semibold tw:text-muted-foreground">
                  <Icon icon={HardDriveIcon} />
                  {m.wizard_account_local_card_title()}
                </CardTitle>
              </CardHeader>
              <CardContent className="tw:flex tw:flex-1 tw:flex-col tw:gap-3">
                <ul className="tw:flex tw:list-none tw:flex-col tw:gap-2 tw:p-0 tw:text-sm">
                  <li>
                    <Icon icon={CircleCheckIcon} className="tw:mr-2 tw:text-success" />
                    {m.wizard_account_local_pro_1()}
                  </li>
                  <li>
                    <Icon icon={CircleCheckIcon} className="tw:mr-2 tw:text-success" />
                    {m.wizard_account_local_pro_2()}
                  </li>
                  <li className="tw:text-muted-foreground">
                    <Icon icon={CircleXIcon} className="tw:mr-2 tw:text-danger-text" />
                    {m.wizard_account_local_con_1()}
                  </li>
                  <li className="tw:text-muted-foreground">
                    <Icon icon={CircleXIcon} className="tw:mr-2 tw:text-danger-text" />
                    {m.wizard_account_local_con_2()}
                  </li>
                </ul>
                <Button variant="outline" className="tw:mt-auto tw:w-full" onClick={onSkip}>
                  {m.skip()}
                </Button>
              </CardContent>
            </Card>
          </GridItem>

          {/* With Account card */}
          <GridItem desktopSpan={6}>
            <Card className="tw:h-full tw:ring-primary">
              <CardHeader>
                <CardTitle className="tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:font-semibold tw:text-primary">
                  <Icon icon={CloudIcon} />
                  {m.wizard_account_connected_card_title()}
                  <Badge>{m.wizard_account_recommended()}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="tw:flex tw:flex-1 tw:flex-col tw:gap-3">
                <ul className="tw:flex tw:list-none tw:flex-col tw:gap-2 tw:p-0 tw:text-sm">
                  <li>
                    <Icon icon={CircleCheckIcon} className="tw:mr-2 tw:text-success" />
                    {m.wizard_account_connected_pro_1()}
                  </li>
                  <li>
                    <Icon icon={CircleCheckIcon} className="tw:mr-2 tw:text-success" />
                    {m.wizard_account_connected_pro_2()}
                  </li>
                  <li>
                    <Icon icon={CircleCheckIcon} className="tw:mr-2 tw:text-success" />
                    {m.wizard_account_connected_pro_3()}
                  </li>
                </ul>
                <Button className="tw:mt-auto tw:w-full" onClick={onConnectAccount}>
                  <Icon icon={UserPlusIcon} />
                  {m.account_connect_btn()}
                </Button>
              </CardContent>
            </Card>
          </GridItem>
        </Grid>
      )}

      <WizardActions
        className="tw:mt-2"
        start={
          <Button variant="outline" size="lg" onClick={onPrev} ref={firstButtonRef}>
            <Icon icon={ArrowLeftIcon} /> {m.back()}
          </Button>
        }
        end={
          isAuthenticated ? (
            <Button size="lg" onClick={onSkip}>
              {m.wizard_finish_setup()} <Icon icon={CheckIcon} />
            </Button>
          ) : undefined
        }
      />
    </>
  );
}
