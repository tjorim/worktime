# Worktime Development Roadmap

**Current Version**: 4.4.1
**Branch**: `main`
**Status**: Active Development

## Overview

This document serves as a general to-do list and development roadmap for Worktime improvements, covering shift tracking, time-off management, UI enhancements, and user experience improvements.

## Development To-dos

### 🚀 High-Priority Items

Critical features and improvements that significantly impact user experience.

#### 1. Export Schedule Feature

- **Component**: Calendar export functionality
- **Use Cases**:
  - Download shift schedule as .ics calendar file
  - Integration with external calendar apps
  - Team schedule sharing
- **Implementation**: Add calendar generation utility and activate export buttons
- **Files to Modify**:
  - `src/components/SettingsPanel.tsx` - Remove "Coming Soon" badge and enable button
  - `src/components/ScheduleDetailModal.tsx` - Enable export button
  - `src/utils/exportCalendar.ts` – Add calendar export utility
- **Estimated Effort**: 3–4 hours
- **Status**: 🔲 Planned

#### 2. Version Sync Fix

- **Component**: Changelog version alignment
- **Use Cases**:
  - Accurate "Coming Soon" version display
  - Proper future planning version numbers
- **Implementation**: Update futurePlans in changelog.ts
- **Files to Modify**:
  - `src/data/changelog.ts` - Update version numbers in futurePlans
- **Estimated Effort**: 30 minutes
- **Status**: 🔲 Planned

#### 3. Missing HdayPlanner Features (v4.0 Integration Gaps) ⚠️

**CRITICAL**: Features from HdayPlanner that were NOT merged into Worktime during the v4.0 rebrand/integration. These features are essential for users migrating from HdayPlanner.

**Integration Status:**

- ✅ **Successfully Merged**: .hday parser (139 tests), import/export files, event modal (create/edit/delete), all event flags/types (holiday, business, sick, training, etc.), undo/redo (v4.1.0), bulk operations (v4.1.0), event duplication (v4.1.0), raw .hday editor (v4.3.0), vacation statistics dashboard (v4.4.0)
- 📊 **Total Effort to Achieve Parity**: ~2–3 hours

---

**3.2 Missing Utility Functions**

- **Component**: Helper functions from HdayPlanner
- **Source**: `HdayPlanner/frontend/src/lib/hday.ts`
- **Functions**:
  - `sortEvents()` - Sort events by date and type (stable ordering)
  - `getEventClass()` - Map event flags to CSS class names
- **Current Worktime**: buildPreviewLine exists, but sorting/class mapping missing
- **Implementation**: Port utility functions to Worktime
- **Files to Modify**:
  - `src/lib/hday/utils.ts` - Add sortEvents and getEventClass
  - `src/components/TimeOffView.tsx` - Use sortEvents for table display
- **Estimated Effort**: 1–2 hours
- **Status**: 🔲 Planned

**Summary of HdayPlanner Integration Gaps:**

- ✅ **Successfully Merged**: .hday parser (139 tests), import/export files, event modal (create/edit/delete), all flags/types
- ✅ **Restored in Worktime**: Undo/redo with history tracking, bulk operations (multi-select, bulk delete/duplicate, select all)
- ✅ **Completed in v4.3.0**: Raw .hday content editor/viewer with dedicated tab view
- ✅ **Completed in v4.4.0**: Vacation statistics dashboard with allowance tracking and analytics
- 📊 **Total Estimated Effort**: 1–2 hours to achieve feature parity

### 🎯 Medium-Priority Items

Features that enhance functionality with moderate development effort.

#### 4. Cross-Schedule Transfer View Enhancement

- **Component**: TransferView with cross-schedule coordination
- **Use Cases**:
  - View when user's schedule overlaps with teams on different schedules
  - 9-5 user can see when their working hours overlap with 5-shift teams
  - Cross-schedule coordination and handover visibility
  - Enables meeting scheduling across different roster patterns
- **Implementation**:
  - Add schedule selector to TransferView (similar to ScheduleView/TodayView)
  - Calculate overlapping work periods between different schedules
  - Define what "transfer" means across different schedule types
  - Show overlap hours/periods instead of traditional handover moments
- **Files to Modify**:
  - `src/components/TransferView.tsx` - Add cross-schedule viewing and overlap calculation
  - `src/utils/shiftCalculations.ts` - Add cross-schedule overlap detection utilities
- **Estimated Effort**: 4-5 hours
- **Status**: 🔲 Planned (enables cross-roster coordination)

#### 5. Reusable TeamSelector Component

- **Component**: Extract common team selection logic
- **Use Cases**:
  - Reduce code duplication across TransferView, ScheduleDetailModal, etc.
  - Consistent team selection UI/UX
  - Easier maintenance and updates
- **Implementation**: Create `components/common/TeamSelector.tsx` with standardized props
- **Files to Modify**:
  - `src/components/TransferView.tsx` - Replace dropdown with TeamSelector
  - `src/components/ScheduleDetailModal.tsx` - Use common component
  - Create `src/components/common/TeamSelector.tsx`
- **Estimated Effort**: 2–3 hours
- **Status**: 🔲 Planned

#### 6. Enhanced List Groups

- **Component**: `react-bootstrap/ListGroup`
- **Use Cases**:
  - Upcoming shifts list
  - Recent transfers list
  - Clean, organized data display
- **Implementation**: New components for data lists
- **Estimated Effort**: 2–3 hours
- **Status**: 🔲 Future

#### 7. ScheduleDetailModal Enhancement

- **Component**: Improve existing schedule detail modal
- **Use Cases**:
  - Enable export functionality in modal
  - Enhanced schedule view for all schedule types
  - Better schedule information display
- **Implementation**: Activate disabled features and improve UX
- **Estimated Effort**: 1–2 hours
- **Status**: 🔲 Future

#### 8. Enhanced Error Boundaries

- **Component**: More granular error handling
- **Use Cases**:
  - Component-specific error recovery
  - Better error messages for users
  - Graceful degradation
- **Implementation**: Add specific error boundaries for complex components
- **Estimated Effort**: 2–3 hours
- **Status**: 🔲 Future

#### 9. Time-Off Visual Integration

- **Component**: Comprehensive time-off event visualization across all views
- **Use Cases**:
  - **TimeOffView Enhancements**:
    - Color-coded calendar events matching .hday flag colors
    - Auto-load and highlight current month
    - Visual indicator for today's date
    - Weekly recurring event indicators (d1-d7) on appropriate weekdays
    - Auto-sort events by date in event table
  - **Schedule & Transfer View Overlays**:
    - Time-off overlay indicators (dots/badges) on ScheduleView grid cells
    - Time-off overlay indicators on TransferView
    - At-a-glance visibility of vacation/business trips on schedule grid
    - Visual hierarchy showing both shifts and time-off events
    - Define merge/priority rules for overlapping indicators
- **Implementation**:
  - Enhance TimeOffView calendar rendering
  - Add event indicator overlays to ScheduleView grid cells
  - Add event indicators to TransferView
  - Define and implement overlay semantics (priority, color, positioning)
- **Estimated Effort**: 5–6 hours
- **Status**: 🔲 Future

#### 10. Time-Off Bulk Operations

- **Component**: Multi-event management
- **Use Cases**:
  - Select multiple events for deletion
  - Copy/duplicate events to different dates
  - Import and merge events from another .hday file
- **Implementation**: Add selection state and bulk action toolbar
- **Estimated Effort**: 3–4 hours
- **Status**: 🔲 Future

#### 11. Calendar Export Formats

- **Component**: Multi-format export functionality
- **Use Cases**:
  - Export shift schedule as .ics calendar file
  - Export time-off events to iCal/ICS format
  - Export to CSV for spreadsheet analysis
  - Integration with external calendar apps (Google Calendar, Outlook)
- **Implementation**: Create export utilities for multiple formats
- **Files to Modify**:
  - `src/utils/exportCalendar.ts` - Add calendar generation utility
  - `src/components/SettingsPanel.tsx` - Enable export buttons
  - `src/components/TimeOffView.tsx` - Add export options
- **Estimated Effort**: 4–5 hours
- **Status**: 🔲 Future

### 🎨 Future Enhancements

Advanced features for future development phases.

#### 12. Carousel for Mobile Team View

- **Component**: `react-bootstrap/Carousel`
- **Use Cases**:
  - Swipe through teams on mobile
  - Better mobile navigation
- **Implementation**: Responsive team display
- **Estimated Effort**: 5–6 hours
- **Status**: 🔲 Future

#### 13. Accordion for Transfer History

- **Component**: `react-bootstrap/Accordion`
- **Use Cases**:
  - Collapsible transfer sections by date range
  - Organized historical data
- **Implementation**: Update TransferView component
- **Estimated Effort**: 3–4 hours
- **Status**: 🔲 Future

#### 14. Notification System Implementation

- **Component**: Browser notification functionality
- **Use Cases**:
  - Shift reminders and countdown alerts
  - Time-off event reminders
  - Customizable notification preferences
- **Implementation**: Build on existing notification settings in SettingsContext
- **Estimated Effort**: 4–5 hours
- **Status**: 🔲 Future

#### 15. Advanced Accessibility Features

- **Component**: Enhanced accessibility support
- **Use Cases**:
  - Screen reader improvements
  - High contrast mode
  - Font size preferences
  - Motion reduction settings
- **Implementation**: Accessibility context and enhanced ARIA support
- **Estimated Effort**: 3–4 hours
- **Status**: 🔲 Future

#### 16. Multi-Roster Pattern Support

- **Component**: Configurable shift patterns beyond 5-team 2-2-2-4 cycle
- **Use Cases**:
  - Support 3-team, 4-team, 6-team rosters
  - Different shift patterns (3-3-3-3, 4-4-4-4, custom patterns)
  - Multiple roster types in same organization
  - Dynamic team count and shift cycle configuration
- **Implementation**: Extract hardcoded pattern logic into configurable system
- **Files to Modify**:
  - `src/utils/shiftCalculations.ts` - Make SHIFTS and cycle logic configurable
  - `src/utils/config.ts` - Add roster pattern configuration
  - `src/components/WelcomeWizard.tsx` - Dynamic team count references
  - `src/components/AboutModal.tsx` - Dynamic roster description
  - `CLAUDE.md` - Update documentation for multiple patterns
- **Technical Requirements**:
  - Roster pattern schema (teams, shifts per team, cycle length)
  - Migration system for existing localStorage data
  - UI for roster selection/configuration
  - Backward compatibility with current 5-team setup
- **Estimated Effort**: 8–12 hours (Major feature)
- **Status**: 🔲 Future

#### 17. Floating Action Button

- **Component**: Custom positioned `react-bootstrap/Button`
- **Use Cases**:
  - Quick team switch
  - Quick add time-off event
  - Add to calendar
  - Quick actions overlay
- **Implementation**: Fixed positioned button system
- **Estimated Effort**: 2–3 hours
- **Status**: 🔲 Future

#### 18. Roster-Specific Shift Times for Live Features

- **Component**: Support different actual start/end times per roster for live status calculations
- **Current Limitation**: `displayHours` in `ShiftDisplayOverride` is display-only (string format). Live features (LIVE badge, countdown timers, "currently working" detection) use global SHIFTS constants (MORNING: 7-15, LATE: 15-23, etc.) which causes incorrect live status for rosters with non-standard hours.
- **Example Issue**: Weekend roster has Early: 06:00-14:30, Late: 13:30-22:00, Day: 08:00-16:30, but live features use the global 07:00-15:00 and 15:00-23:00 times, resulting in wrong LIVE badges and countdowns.
- **Use Cases**:
  - Accurate LIVE badge display for rosters with different shift times
  - Correct countdown timers for next shift
  - Proper "currently working" detection across all roster types
  - Support organizations with multiple roster patterns that have different shift hours
- **Implementation**: Extend `ShiftDisplayOverride` to include numeric start/end time overrides that apply to both display AND live calculations
- **Files to Modify**:
  - `src/data/rosters.ts` - Add start/end time overrides to ShiftDisplayOverride type
  - `src/utils/shiftCalculations.ts` - Update calculateShift to use roster-specific times
  - `src/utils/dateTimeUtils.ts` - Update time formatting to handle roster-specific times
  - `src/components/CurrentStatus.tsx` - Use roster-specific times for live status
  - `src/hooks/useCountdown.ts` - Use roster-specific times for countdown calculations
- **Estimated Effort**: 2–3 hours
- **Status**: 🔲 Future (Low Priority)

#### 19. Backend with Shared .hday Files (Team Collaboration)

- **Component**: Backend API + shared network storage for multi-user .hday time-off collaboration
- **Current State**: Offline-first localStorage, single-user only
- **Scope**: Backend manages **only .hday time-off events**, not shifts (shifts remain client-computed from roster config)
- **Use Cases**:
  - **Team Visibility**: Everyone sees team members' time-off events
  - **Shared Schedule**: Central source of truth for team availability
  - **Real-Time Sync**: Updates from other users appear immediately
  - **Cross-Team Coordination**: "Who's available for Friday meeting?"
  - **Conflict Resolution**: Handle simultaneous edits gracefully
  - **Manager Workflows**: Approval process for vacation requests
- **Architecture Options**:
  - **Option A: UNC Path (Windows Network Share)**
    - Backend reads/writes `\\server\share\team1_timeoff.hday`
    - Corporate infrastructure, Windows-specific
    - Simple file I/O, no database needed
  - **Option B: Cloud Storage (Firebase/Supabase)**
    - Cross-platform, no corporate infrastructure needed
    - Built-in real-time sync and auth
    - Easier development, hosted solution
  - **Option C: Custom Backend + Database**
    - Full control, can use PostgreSQL/MongoDB
    - Most flexible for custom workflows
    - Most development effort
- **Technical Components**:
  1. **REST API** (Phase 1 - Basic CRUD)
     ```http
     GET  /api/teams/:teamId/events?start=X&end=Y
     POST /api/teams/:teamId/events
     PUT  /api/teams/:teamId/events/:id
     DEL  /api/teams/:teamId/events/:id
     ```
  2. **WebSocket** (Phase 2 - Real-Time)
     ```typescript
     socket.on('events:updated', ({ teamId, events }) => {
       unifiedStore.updateTeamEvents(teamId, events);
     });
     ```
  3. **Authentication** (Phase 3 - Permissions)
     - Which teams can user view/edit?
     - Role-based access (member, manager, admin)
     - Network auth integration (AD/LDAP) or OAuth
  4. **File Format Extension** (User Attribution)

     ```text
     # Option A: Comments (backward compatible)
     2025/01/15-2025/01/20 # John's vacation

     # Option B: Extended format (breaking change)
     2025/01/15-2025/01/20 @john # John's vacation

     # Option C: Separate files per user
     \\server\share\team1\john.hday
     ```

- **Migration Path**:
  - **Phase 1**: Backend + manual sync (keep localStorage, add "Sync to team" button)
  - **Phase 2**: Real-time sync (WebSocket, auto-sync, read-only team events)
  - **Phase 3**: Multi-user editing (write access, conflict resolution)
  - **Phase 4**: Collaboration features (conflict UI, approval workflows, "who's editing")
- **Frontend Architecture Options**:
  - **Option A: Extend EventStoreContext** (simpler, recommended)
    - Add `syncWithBackend()` and `subscribeToUpdates()` methods to existing EventStoreContext
    - Shifts remain separate (computed on-demand as today)
    - Components use both `useEventStore()` and shift calculations (minimal changes)
  - **Option B: Unified Event Store** (optional convenience layer)
    - Create wrapper merging shifts + time-off in single API
    - One call to get all events: `getEventsForDate(date, team)`
    - More abstraction, but components still need to differentiate types in UI
    - Additional 6-8 hours of effort, questionable benefit
- **Implementation Requirements**:
  - Backend: Node.js/Express or Python/FastAPI
  - File watching: chokidar (Node) or watchdog (Python)
  - WebSocket: Socket.io or native WebSocket API
  - Frontend: Extend EventStoreContext with backend sync (Option A recommended)
  - Security: Authentication, authorization, audit logs
  - Error handling: Offline mode, conflict resolution, retry logic
- **Files to Create**:
  - `backend/` - New backend service (separate repo or monorepo)
  - `backend/api/events.js` - Event CRUD endpoints
  - `backend/services/fileSync.js` - UNC path file operations
  - `backend/websocket.js` - Real-time event broadcasting
  - `src/services/api.ts` - Frontend API client
  - `src/hooks/useRealtimeSync.ts` - WebSocket hook
- **Files to Modify**:
  - `src/contexts/UnifiedEventStore.tsx` - Add backend sync
  - `src/components/TimeOffView.tsx` - Show who created each event
  - `src/components/SettingsPanel.tsx` - Add server connection settings
  - All view components - Handle multi-user events
- **Challenges**:
  - Conflict resolution (simultaneous edits)
  - Offline capability becomes much harder
  - UNC paths are Windows-specific (not cross-platform)
  - Security concerns (network share access, auth)
  - Increased infrastructure requirements
- **Alternative (Simpler)**:
  - Manual export to shared folder (no backend)
  - "Import team file" button for read-only viewing
  - Gets 80% of benefit with 20% of complexity
- **Estimated Effort**: 40–60 hours (Major feature, requires backend development)
- **Status**: 🔲 Aspirational (future team collaboration feature)
- **Prerequisites**: None (EventStoreContext already exists, just needs backend sync methods)

## Current To-do Status

### 🔲 Next Up

1. **Export Schedule Feature** - Calendar export functionality (user-facing)
2. **Cross-Schedule Transfer View Enhancement** - Enable cross-roster coordination and overlap detection

### 📋 Backlog (Code Quality)

4. **Reusable TeamSelector Component** - Reduce code duplication

### 📋 Backlog (Features)

5. **Enhanced List Groups** - Better data organization
6. **ScheduleDetailModal Enhancement** - Activate disabled features
7. **Enhanced Error Boundaries** - Better error handling

### 📋 Backlog (Time-Off Management)

8. **Time-Off Visual Integration** - Calendar enhancements, schedule/transfer overlays, event indicators
9. **Time-Off Bulk Operations** - Multi-select, copy/duplicate, merge imports
10. **Calendar Export Formats** - .ics, CSV export for shifts and time-off

### 📋 Backlog (UI/UX)

11. **Mobile Carousel** - Improved mobile navigation
12. **Transfer History Accordion** - Organized historical data
13. **Notification System** - Browser notifications for shifts and time-off
14. **Advanced Accessibility** - Enhanced screen reader support, high contrast mode
15. **Multi-Roster Pattern Support** - Support 3/4/6-team rosters and custom patterns
16. **Floating Action Button** - Quick actions overlay

### 📋 Aspirational (Long-Term Vision)

17. **Backend with Shared Files** - Team collaboration with real-time .hday sync (40-60 hours, major undertaking, includes optional unified store)

## Technical Requirements

### Dependencies

- All components use existing `react-bootstrap` - no new dependencies
- Maintain existing responsive design
- Preserve accessibility standards
- Keep bundle size minimal

### Testing Strategy

- Unit tests for all new components
- Integration tests for complex interactions
- Visual regression testing for UI changes
- Accessibility testing with screen readers

### Performance Considerations

- Lazy load modals and heavy components
- Optimize carousel for smooth animations
- Minimize re-renders with proper memoization
- Keep bundle size impact minimal

## Success Metrics

### User Experience

- Reduced cognitive load with visual progress indicators
- Improved discoverability with tooltips
- Enhanced mobile usability with touch-friendly components
- Better feedback with toast notifications

### Technical Quality

- Maintain 100% test coverage
- Zero accessibility regressions
- No performance degradation
- Clean, maintainable code architecture

## Changelog Integration

### In-App Changelog Viewer

- Accessible via settings panel
- Formatted changelog display
- Version history with dates
- Feature highlights with screenshots

### Version Tracking

- Semantic versioning (4.x.x)
- Git tags for releases
- Automated changelog generation
- Release notes in GitHub

## Risk Assessment

### Low-Risk

- Toast notifications (isolated feature)
- Progress bars (simple UI update)
- Tooltips (non-intrusive enhancement)

### Medium Risk

- Offcanvas settings (new navigation pattern)
- Modal components (focus management)

### High-Risk

- Carousel implementation (complex touch handling)
- Major layout changes (potential responsive issues)

## Future Considerations

### Potential Extensions

- Customizable themes
- Advanced notification preferences
- Keyboard shortcuts panel
- Export/import settings
- Integration with calendar apps

### User Account System (Future Phase)

- **Current**: localStorage-based preferences (device-bound, privacy-first)
- **Migration Path**: Hybrid localStorage + cloud sync approach
- **Benefits**: Multi-device sync, backup/restore, team sharing
- **Implementation Strategy**:
  - Phase 1: Keep current localStorage foundation ✅
  - Phase 2: Add optional account sync (hybrid approach)
  - Phase 3: Full multi-device real-time sync
- **Considerations**:
  - Maintain offline-first PWA capabilities
  - Preserve zero-infrastructure-cost option
  - Smooth migration without breaking changes

### State Management Optimization

**Zustand Migration** (Low Priority)

- **Component**: Replace Context API with Zustand for state management
- **Current State**: EventStoreContext uses Context API + useReducer pattern
- **Potential Benefits**:
  - 95% memory reduction with Immer middleware (structural sharing)
  - Zero-code undo/redo via Temporal middleware (eliminates 200+ lines of manual history logic)
  - Granular subscriptions (better performance - components only re-render when their data slice changes)
  - Built-in localStorage persistence
  - Redux DevTools integration
- **Trade-offs**:
  - +15 KB bundle size (Zustand 1 KB + Immer 14 KB)
  - Learning curve for team
  - Migration effort: ~4-5 hours
- **Recommendation**: Consider when adding second store (SettingsStore migration candidate)
- **Status**: 🔲 Future (nice-to-have optimization, not blocking)

### Accessibility Enhancements

- High contrast mode
- Font size preferences
- Motion reduction settings
- Keyboard navigation improvements

---

**Last Updated**: 2026-01-11
**Next Review**: After v4.5.0 (Export Schedule Feature)
