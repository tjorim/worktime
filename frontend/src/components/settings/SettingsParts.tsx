import { useId, type ComponentProps, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface SettingsHeadingProps {
  icon: LucideIcon;
  id?: string;
  /** Extra content shown after the title, for example a status badge. */
  aside?: ReactNode;
  children: ReactNode;
}

/** Section heading with a decorative leading icon. */
export function SettingsHeading({ icon, id, aside, children }: SettingsHeadingProps) {
  return (
    <div className="tw:mb-3 tw:flex tw:flex-wrap tw:items-center tw:gap-2">
      <h2
        id={id}
        className="tw:m-0 tw:flex tw:items-center tw:gap-2 tw:text-base tw:font-medium tw:text-muted-foreground"
      >
        <Icon icon={icon} />
        {children}
      </h2>
      {aside}
    </div>
  );
}

interface SettingsSectionProps extends Omit<ComponentProps<"section">, "title"> {
  icon: LucideIcon;
  title: ReactNode;
}

/** A titled block of the settings page; neighbouring sections are separated by a rule. */
export function SettingsSection({
  icon,
  title,
  className,
  children,
  ...props
}: SettingsSectionProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn("tw:border-b tw:border-border tw:p-4 tw:last:border-b-0", className)}
      {...props}
    >
      <SettingsHeading icon={icon} id={headingId}>
        {title}
      </SettingsHeading>
      {children}
    </section>
  );
}

/** Semantic list whose items are separated by a hairline. */
export function SettingsList({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      className={cn("tw:m-0 tw:list-none tw:divide-y tw:divide-border tw:p-0", className)}
      {...props}
    />
  );
}

export function SettingsItem({ className, ...props }: ComponentProps<"li">) {
  return <li className={cn("tw:py-3 tw:first:pt-0 tw:last:pb-0", className)} {...props} />;
}

interface SettingsRowTextProps {
  icon?: LucideIcon;
  iconClassName?: string;
  title: ReactNode;
  description?: ReactNode;
  titleId?: string;
  descriptionId?: string;
}

/** Title with an optional icon and a muted description underneath. */
export function SettingsRowText({
  icon,
  iconClassName,
  title,
  description,
  titleId,
  descriptionId,
}: SettingsRowTextProps) {
  return (
    <div className="tw:min-w-0">
      <div id={titleId} className="tw:font-medium">
        {icon ? <Icon icon={icon} className={cn("tw:mr-2", iconClassName)} /> : null}
        {title}
      </div>
      {description ? (
        <div id={descriptionId} className="tw:text-sm tw:text-muted-foreground">
          {description}
        </div>
      ) : null}
    </div>
  );
}

interface SettingsRowProps extends SettingsRowTextProps {
  /** Control shown at the end of the row; it wraps below the text on narrow screens. */
  children?: ReactNode;
  className?: string;
}

/** A list item with text on the left and a control on the right. */
export function SettingsRow({ children, className, ...text }: SettingsRowProps) {
  return (
    <SettingsItem
      className={cn("tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3", className)}
    >
      <SettingsRowText {...text} />
      {children}
    </SettingsItem>
  );
}

interface SettingsActionRowProps extends Omit<
  ComponentProps<typeof Button>,
  "title" | "children" | "variant"
> {
  icon: LucideIcon;
  title: ReactNode;
  description: ReactNode;
  trailingIcon: LucideIcon;
  trailingIconClassName?: string;
}

/** A full-width row that behaves as a button, with a trailing affordance icon. */
export function SettingsActionRow({
  icon,
  title,
  description,
  trailingIcon,
  trailingIconClassName = "tw:text-muted-foreground",
  className,
  ...props
}: SettingsActionRowProps) {
  return (
    <SettingsItem className="tw:py-1">
      <Button
        variant="ghost"
        className={cn(
          "tw:h-auto tw:w-full tw:justify-between tw:gap-3 tw:py-2 tw:text-left tw:text-base tw:font-normal tw:whitespace-normal",
          className,
        )}
        {...props}
      >
        <SettingsRowText icon={icon} title={title} description={description} />
        <Icon icon={trailingIcon} className={trailingIconClassName} />
      </Button>
    </SettingsItem>
  );
}

interface SettingsSwitchRowProps {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** A row whose whole text acts as the label of a switch. */
export function SettingsSwitchRow({
  id,
  title,
  description,
  checked,
  onCheckedChange,
}: SettingsSwitchRowProps) {
  const titleId = `${id}-label`;
  const descriptionId = `${id}-description`;
  return (
    <SettingsItem>
      <Label className="tw:cursor-pointer tw:justify-between tw:gap-3 tw:text-base tw:leading-normal tw:font-normal">
        <SettingsRowText
          title={title}
          description={description}
          titleId={titleId}
          descriptionId={descriptionId}
        />
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
        />
      </Label>
    </SettingsItem>
  );
}

/** Inline loading indicator announced to assistive technology. */
export function SettingsLoading({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-muted-foreground"
    >
      <Spinner size="sm" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

/** Muted explanatory copy used for hints and empty states. */
export function SettingsHint({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("tw:m-0 tw:text-sm tw:text-muted-foreground", className)} {...props} />;
}

/** A secret shown once, selectable in a single click. */
export function SettingsSecret({ className, ...props }: ComponentProps<"code">) {
  return (
    <code
      className={cn(
        "tw:block tw:rounded-md tw:bg-muted tw:p-2 tw:break-all tw:text-foreground tw:select-all",
        className,
      )}
      {...props}
    />
  );
}
