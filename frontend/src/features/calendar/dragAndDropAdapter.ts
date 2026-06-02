import { createDragAndDropPlugin as createV3Plugin } from "@schedule-x/drag-and-drop";

/**
 * Adapts the v3 drag-and-drop plugin to the v4 interface.
 * The only breaking change between v3 and v4 was renaming create* to start*.
 * All internal types and logic are identical.
 */
export function createDragAndDropPlugin(minutesPerInterval = 15) {
  const plugin = createV3Plugin(minutesPerInterval);
  return {
    ...plugin,
    startTimeGridDrag: plugin.createTimeGridDragHandler.bind(plugin),
    startDateGridDrag: plugin.createDateGridDragHandler.bind(plugin),
    startMonthGridDrag: plugin.createMonthGridDragHandler.bind(plugin),
  };
}
