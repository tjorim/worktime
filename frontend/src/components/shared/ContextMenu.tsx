import type { LucideIcon } from "lucide-react";
import type { RefObject } from "react";
import { useMemo } from "react";
import { Menu } from "@base-ui/react/menu";
import { Icon } from "@/components/shared/Icon";
import { cn } from "@/lib/utils";

export type ContextMenuItem =
  | {
      separator?: false;
      label: string;
      icon?: LucideIcon;
      onClick: () => void;
      variant?: "danger";
      disabled?: boolean;
    }
  | { separator: true };
interface ContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  onClose: () => void;
  items: ContextMenuItem[];
  triggerRef?: RefObject<HTMLElement | null>;
}

export function ContextMenu({ isOpen, x, y, onClose, items, triggerRef }: ContextMenuProps) {
  // The pointer is a virtual anchor; Base UI owns collision detection and focus.
  const anchor = useMemo(() => ({ getBoundingClientRect: () => new DOMRect(x, y, 0, 0) }), [x, y]);
  return (
    <Menu.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Menu.Portal>
        <Menu.Positioner
          anchor={anchor}
          side="bottom"
          align="start"
          className="tw:z-popover"
          collisionPadding={8}
        >
          <Menu.Popup
            finalFocus={triggerRef}
            className="tw:min-w-40 tw:rounded-lg tw:border tw:border-wt-context-menu-border tw:bg-wt-context-menu-bg tw:p-1 tw:text-wt-context-menu-item-text tw:shadow-lg tw:outline-none"
          >
            {items.map((item, index) =>
              item.separator ? (
                <Menu.Separator key={index} className="tw:my-1 tw:border-t tw:border-border" />
              ) : (
                <Menu.Item
                  key={`${index}-${item.label}`}
                  disabled={item.disabled}
                  closeOnClick={false}
                  onClick={() => {
                    onClose();
                    item.onClick();
                  }}
                  className={cn(
                    "tw:flex tw:cursor-default tw:items-center tw:gap-2 tw:rounded-md tw:px-3 tw:py-2 tw:text-sm tw:outline-none tw:data-highlighted:bg-wt-context-menu-item-hover tw:data-disabled:opacity-50",
                    item.variant === "danger" && "tw:text-danger-text",
                  )}
                >
                  {item.icon && <Icon icon={item.icon} />}
                  {item.label}
                </Menu.Item>
              ),
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
