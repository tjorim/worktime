/**
 * Mock for frappe-gantt, which is a browser-only package not available in the
 * test environment. GanttChart loads it via a dynamic import inside a useEffect,
 * so tests never actually call these methods — the mock just prevents the module
 * resolution error.
 */
export default class Gantt {
  constructor() {}
  refresh() {}
  change_view_mode() {}
  destroy() {}
}
