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
      <div className="mb-3 text-center">
        <h4 className="mb-1 text-2xl font-medium">{m.wizard_account_heading()}</h4>
        <p className="text-sm text-muted-foreground">{m.wizard_account_subtitle()}</p>
      </div>

      {isAuthenticated ? (
        <div className="py-3 text-center">
          <Icon icon={UserCheckIcon} className="mx-auto mb-3 block text-4xl text-success" />
          <p className="font-medium">
            {displayName ? m.auth_logged_in_as({ displayName }) : m.account_signed_in()}
          </p>
          <p className="text-sm text-muted-foreground">{m.wizard_account_already_connected()}</p>
        </div>
      ) : (
        <Grid className="mb-3">
          {/* Local Only card */}
          <GridItem desktopSpan={6}>
            <Card className="h-full ring-secondary-foreground/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-semibold text-muted-foreground">
                  <Icon icon={HardDriveIcon} />
                  {m.wizard_account_local_card_title()}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <ul className="flex list-none flex-col gap-2 p-0 text-sm">
                  <li>
                    <Icon icon={CircleCheckIcon} className="mr-2 text-success" />
                    {m.wizard_account_local_pro_1()}
                  </li>
                  <li>
                    <Icon icon={CircleCheckIcon} className="mr-2 text-success" />
                    {m.wizard_account_local_pro_2()}
                  </li>
                  <li className="text-muted-foreground">
                    <Icon icon={CircleXIcon} className="mr-2 text-danger-text" />
                    {m.wizard_account_local_con_1()}
                  </li>
                  <li className="text-muted-foreground">
                    <Icon icon={CircleXIcon} className="mr-2 text-danger-text" />
                    {m.wizard_account_local_con_2()}
                  </li>
                </ul>
                <Button variant="outline" className="mt-auto w-full" onClick={onSkip}>
                  {m.skip()}
                </Button>
              </CardContent>
            </Card>
          </GridItem>

          {/* With Account card */}
          <GridItem desktopSpan={6}>
            <Card className="h-full ring-primary">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 font-semibold text-primary">
                  <Icon icon={CloudIcon} />
                  {m.wizard_account_connected_card_title()}
                  <Badge>{m.wizard_account_recommended()}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <ul className="flex list-none flex-col gap-2 p-0 text-sm">
                  <li>
                    <Icon icon={CircleCheckIcon} className="mr-2 text-success" />
                    {m.wizard_account_connected_pro_1()}
                  </li>
                  <li>
                    <Icon icon={CircleCheckIcon} className="mr-2 text-success" />
                    {m.wizard_account_connected_pro_2()}
                  </li>
                  <li>
                    <Icon icon={CircleCheckIcon} className="mr-2 text-success" />
                    {m.wizard_account_connected_pro_3()}
                  </li>
                </ul>
                <Button className="mt-auto w-full" onClick={onConnectAccount}>
                  <Icon icon={UserPlusIcon} />
                  {m.account_connect_btn()}
                </Button>
              </CardContent>
            </Card>
          </GridItem>
        </Grid>
      )}

      <WizardActions
        className="mt-2"
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
