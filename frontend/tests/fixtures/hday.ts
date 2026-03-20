/**
 * Test fixtures for .hday content
 *
 * Reusable test data for TimeOffView integration tests.
 * Uses fixed dates to ensure deterministic test results.
 */

/**
 * Simple fixture with a few basic range events
 */
export const SIMPLE_HDAY = `2025/01/15 # Vacation day
2025/02/10-2025/02/14 # Week vacation
2025/03/20 # Doctor appointment`;

/**
 * Fixture with multiple event types (business, course, in-office, etc.)
 */
export const MULTI_TYPE_HDAY = `2025/01/10 # Regular vacation
b2025/02/05-2025/02/07 # Business trip
s2025/03/15 # Training course
k2025/04/01 # In office`;

/**
 * Fixture with weekly recurring events
 */
export const WEEKLY_EVENTS_HDAY = `d1k # Every Monday in office
d5 # Every Friday off`;

/**
 * Fixture with event flags (half-day, onsite, etc.)
 */
export const EVENT_FLAGS_HDAY = `a2025/01/20 # Half day AM
p2025/01/21 # Half day PM
bw2025/02/10-2025/02/12 # Business trip onsite`;

/**
 * Complex fixture with mix of range, weekly, and various flags
 */
export const COMPLEX_HDAY = `2025/01/15 # New Year vacation
b2025/02/10-2025/02/14 # Conference trip
d1k # Every Monday in office
a2025/03/20 # Medical appointment AM
s2025/04/05-2025/04/07 # Training workshop
d5 # Every Friday WFH
p2025/05/10 # Dentist PM`;

/**
 * Empty fixture for testing fresh state
 */
export const EMPTY_HDAY = "";

/**
 * Malformed hday content for error handling tests
 */
export const MALFORMED_HDAY = `2025/01/15 # Valid event
this is not a valid line
2025/02/30 # Invalid date
2025/03/20 # Another valid event`;
