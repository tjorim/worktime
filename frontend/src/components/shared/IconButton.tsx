import { type LucideIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import Button from "react-bootstrap/Button";

type BootstrapButtonProps = ComponentPropsWithoutRef<typeof Button>;

interface IconButtonProps extends Omit<BootstrapButtonProps, "aria-label" | "children"> {
  icon: LucideIcon;
  label: string;
  iconClassName?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, iconClassName, title, ...buttonProps },
  ref,
) {
  return (
    <Button ref={ref} aria-label={label} title={title ?? label} {...buttonProps}>
      <Icon icon={icon} className={iconClassName} />
    </Button>
  );
});
