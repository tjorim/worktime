/**
 * Empty state component for when no time-off events exist.
 * Adapts styling and messaging based on the current view mode.
 */
export function EmptyState() {
  return (
    <div className="text-center text-muted py-5">
      <i className="bi bi-calendar-x display-4 d-block mb-3"></i>
      <p>No time-off events yet.</p>
      <p className="small">
        Click "Add Event" to create your first event, or "Import" to load an existing .hday file.
      </p>
    </div>
  );
}
