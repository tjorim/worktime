import {
  CalendarCheck as CalendarCheckIcon,
  CloudDownload as CloudDownloadIcon,
  CloudUpload as CloudUploadIcon,
  Download as DownloadIcon,
  Plus as PlusIcon,
  Trash2 as Trash2Icon,
  Upload as UploadIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { CardHeader } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { TimeOffViewMode } from "@/data/timeoffConstants";
import * as m from "@/paraglide/messages.js";

type TimeOffToolbarProps = {
  // Selection
  eventCount: number;
  selectedCount: number;
  onSelectAll: () => void;
  /** How many entries "Select all" would select. Defaults to `eventCount`; smaller while a search is active. */
  selectableCount?: number;
  /** A search is active, so "Select all" selects only the matching entries. */
  isFiltered?: boolean;
  onClearSelection: () => void;
  onBulkDelete: () => void;

  // Import/Export
  onImport: () => void;
  onExport: () => void;
  onPullFromHelper?: () => void;
  isPullingFromHelper: boolean;
  onPushToHelper?: () => void;
  isPushingToHelper: boolean;

  // Add event
  onAddEvent: () => void;

  // View mode
  viewMode: TimeOffViewMode;
};

/**
 * Toolbar component for Time Off Management view.
 * Contains all action buttons and table-only controls.
 * Memoized to prevent unnecessary re-renders from parent prop changes.
 */
function TimeOffToolbarComponent({
  eventCount,
  selectedCount,
  onSelectAll,
  selectableCount,
  isFiltered = false,
  onClearSelection,
  onBulkDelete,
  onImport,
  onExport,
  onPullFromHelper,
  isPullingFromHelper,
  onPushToHelper,
  isPushingToHelper,
  onAddEvent,
  viewMode,
}: TimeOffToolbarProps) {
  return (
    <CardHeader className="tw:border-b tw:border-border">
      <div className="tw:mb-2 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2">
        <span className="tw:font-semibold">
          <Icon icon={CalendarCheckIcon} className="tw:mr-2" />
          {m.timeoff_management_heading()}
        </span>
        <div className="tw:flex tw:flex-wrap tw:gap-2">
          {viewMode === "table" && (
            <Button size="sm" onClick={onAddEvent} aria-label={m.timeoff_add_event_aria()}>
              <Icon icon={PlusIcon} className="tw:mr-1" />
              {m.timeoff_add_event_btn()}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onImport}
            aria-label={m.timeoff_import_events_aria()}
          >
            <Icon icon={DownloadIcon} className="tw:mr-1" />
            {m.timeoff_import_btn()}
          </Button>
          {onPullFromHelper && (
            <Button
              variant="outline"
              size="sm"
              onClick={onPullFromHelper}
              disabled={isPullingFromHelper || isPushingToHelper}
              aria-label={m.timeoff_pull_events_aria()}
            >
              {isPullingFromHelper ? (
                <Spinner size="sm" className="tw:mr-1" />
              ) : (
                <Icon icon={CloudDownloadIcon} className="tw:mr-1" />
              )}
              {m.timeoff_pull_btn()}
            </Button>
          )}
          {onPushToHelper && (
            <Button
              variant="outline"
              size="sm"
              onClick={onPushToHelper}
              disabled={isPushingToHelper || isPullingFromHelper}
              aria-label={m.timeoff_push_events_aria()}
            >
              {isPushingToHelper ? (
                <Spinner size="sm" className="tw:mr-1" />
              ) : (
                <Icon icon={CloudUploadIcon} className="tw:mr-1" />
              )}
              {m.timeoff_push_btn()}
            </Button>
          )}
          {eventCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onExport}
              aria-label={m.timeoff_export_events_aria()}
            >
              <Icon icon={UploadIcon} className="tw:mr-1" />
              {m.timeoff_export_btn()}
            </Button>
          )}
        </div>
      </div>
      {viewMode === "table" && selectedCount > 0 && (
        <div className="tw:flex tw:flex-wrap tw:gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={onBulkDelete}
            aria-label={m.timeoff_delete_selected_events_aria()}
          >
            <Icon icon={Trash2Icon} className="tw:mr-1" />
            {m.timeoff_delete_selected_btn()}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onSelectAll}
            disabled={selectedCount >= (selectableCount ?? eventCount)}
            aria-label={
              isFiltered ? m.timeoff_select_all_matching_aria() : m.timeoff_select_all_events_aria()
            }
          >
            {isFiltered ? m.timeoff_select_all_matching_btn() : m.timeoff_select_all_btn()}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onClearSelection}
            aria-label={m.timeoff_clear_selection_aria()}
          >
            {m.timeoff_clear_selection_btn()}
          </Button>
        </div>
      )}
    </CardHeader>
  );
}

export const TimeOffToolbar = memo(TimeOffToolbarComponent);
TimeOffToolbar.displayName = "TimeOffToolbar";
