import {
  ArrowLeft as ArrowLeftIcon,
  ArrowRight as ArrowRightIcon,
  Check as CheckIcon,
  Globe as GlobeIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { RefObject } from "react";
import { type CountryCode } from "@/types/countries";
import { FieldDescription, FieldLabel } from "@/components/ui/field";
import { CountrySelect } from "@/components/shared/CountrySelect";
import { WizardActions, WizardToggle } from "./WizardParts";
import * as m from "@/paraglide/messages.js";

interface Step8WorkLocationSetupProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  homeCountry: CountryCode | null;
  officeCountry: CountryCode | null;
  onHomeCountryChange: (country: CountryCode | null) => void;
  onOfficeCountryChange: (country: CountryCode | null) => void;
  onPrev: () => void;
  onComplete: () => void;
  isLastStep?: boolean;
  firstButtonRef?: RefObject<HTMLButtonElement | null>;
}

export function Step8WorkLocationSetup({
  isEnabled,
  onToggle,
  homeCountry,
  officeCountry,
  onHomeCountryChange,
  onOfficeCountryChange,
  onPrev,
  onComplete,
  isLastStep,
  firstButtonRef,
}: Step8WorkLocationSetupProps) {
  return (
    <>
      <div className="tw:mb-4 tw:text-center">
        <Icon icon={GlobeIcon} className="tw:text-5xl tw:text-primary" />
        <h4 className="tw:mt-3 tw:text-2xl tw:font-medium">{m.wizard_location_heading()}</h4>
        <p className="tw:text-muted-foreground">{m.wizard_location_subtitle()}</p>
      </div>

      <Alert variant="info" className="tw:mt-3">
        <AlertDescription className="tw:text-current">{m.wizard_location_info()}</AlertDescription>
      </Alert>

      <WizardToggle
        id="enable-work-location"
        label={m.wizard_location_enable()}
        hint={m.wizard_location_disable_hint()}
        checked={isEnabled}
        onCheckedChange={onToggle}
      />

      {isEnabled && (
        <div className="tw:mt-3 tw:flex tw:flex-col tw:gap-3">
          {(
            [
              {
                id: "wizard-home-country",
                label: m.home_country_label(),
                description: m.home_country_description(),
                value: homeCountry,
                onChange: onHomeCountryChange,
              },
              {
                id: "wizard-office-country",
                label: m.office_country_label(),
                description: m.office_country_description(),
                value: officeCountry,
                onChange: onOfficeCountryChange,
              },
            ] as const
          ).map((field) => (
            <div
              key={field.id}
              className="tw:flex tw:flex-col tw:gap-2 tw:sm:flex-row tw:sm:items-center tw:sm:justify-between tw:sm:gap-3"
            >
              <div>
                <FieldLabel htmlFor={field.id}>{field.label}</FieldLabel>
                <FieldDescription>{field.description}</FieldDescription>
              </div>
              <div className="tw:min-w-0 tw:sm:flex-1">
                <CountrySelect
                  inputId={field.id}
                  value={field.value}
                  onChange={field.onChange}
                  ariaLabel={field.label}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <WizardActions
        className="tw:mt-4"
        start={
          <Button variant="outline" size="lg" onClick={onPrev} ref={firstButtonRef}>
            <Icon icon={ArrowLeftIcon} /> {m.back()}
          </Button>
        }
        end={
          <Button size="lg" onClick={onComplete}>
            {isLastStep ? m.wizard_finish_setup() : m.continue()}
            <Icon icon={isLastStep ? CheckIcon : ArrowRightIcon} />
          </Button>
        }
      />
    </>
  );
}
