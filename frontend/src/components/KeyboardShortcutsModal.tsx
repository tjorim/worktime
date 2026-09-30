import { Keyboard as KeyboardIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import * as m from "@/paraglide/messages.js";

interface KeyboardShortcutsModalProps {
  show: boolean;
  onHide: () => void;
  enableTimeOff?: boolean;
  enableTimeTracking?: boolean;
  enableGantt?: boolean;
}

/**
 * Modal displaying available keyboard shortcuts organized by category.
 */
export function KeyboardShortcutsModal({
  show,
  onHide,
  enableTimeOff = false,
  enableTimeTracking = false,
  enableGantt = false,
}: KeyboardShortcutsModalProps) {
  const navigationItems = [
    { keys: ["C"], description: m.shortcuts_calendar_tab() },
    { keys: ["S"], description: m.shortcuts_schedule_tab() },
    ...(enableTimeOff ? [{ keys: ["O"], description: m.shortcuts_timeoff_tab() }] : []),
    ...(enableTimeTracking ? [{ keys: ["T"], description: m.shortcuts_timetracking_tab() }] : []),
    ...(enableGantt ? [{ keys: ["G"], description: m.shortcuts_gantt_tab() }] : []),
    { keys: ["H"], description: m.shortcuts_today() },
    { keys: ["←", "→"], description: m.shortcuts_prev_next_date() },
    { keys: ["K", "J"], description: m.shortcuts_prev_next_date_alt() },
    { keys: ["Alt", "T"], description: m.shortcuts_team_select() },
    { keys: ["Ctrl", ","], description: m.shortcuts_open_settings() },
    { keys: ["?"], description: m.shortcuts_show_shortcuts() },
  ];

  const categories = [{ category: m.shortcuts_nav_category(), items: navigationItems }];

  if (enableTimeOff) {
    categories.push({
      category: m.shortcuts_timeoff_category(),
      items: [
        { keys: ["Ctrl", "I"], description: m.shortcuts_import_hday() },
        { keys: ["Ctrl", "S"], description: m.shortcuts_export_hday() },
        { keys: ["Delete"], description: m.shortcuts_delete_events() },
        { keys: ["Escape"], description: m.shortcuts_cancel_edit() },
      ],
    });
  }

  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) onHide();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Icon icon={KeyboardIcon} className="tw:me-2" />
            {m.keyboard_shortcuts_label()}
          </DialogTitle>
        </DialogHeader>
        <div className="tw:min-h-0 tw:overflow-y-auto tw:p-4">
          {categories.map(({ category, items }) => (
            <div key={category} className="tw:mb-4">
              <h6 className="tw:text-muted-foreground tw:mb-2">{category}</h6>
              <div className="tw:grid tw:gap-2">
                {items.map(({ keys, description }) => (
                  <div key={description} className="tw:flex tw:justify-between tw:items-center">
                    <span className="tw:text-muted-foreground tw:text-sm">{description}</span>
                    <span>
                      {keys.map((key, i) => (
                        <span key={key}>
                          {i > 0 && <span className="tw:text-muted-foreground tw:mx-1">+</span>}
                          <kbd>{key}</kbd>
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
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
