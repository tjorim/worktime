# Worktime Development Roadmap

**Current Version**: 4.7.0
**Branch**: `main`
**Status**: Active Development

## Overview

This document serves as a general to-do list and development roadmap for Worktime improvements, covering shift tracking, time-off management, UI enhancements, and user experience improvements.

## Development To-dos

### 🎯 Medium-Priority Items

Features that enhance functionality with moderate development effort.

#### 1. Cross-Schedule Transfer View Enhancement

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

#### 2. Reusable TeamSelector Component

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

#### 3. ScheduleDetailModal Enhancement

- **Component**: Improve existing schedule detail modal
- **Use Cases**:
  - Enable export functionality in modal
  - Enhanced schedule view for all schedule types
  - Better schedule information display
- **Implementation**: Activate disabled features and improve UX
- **Estimated Effort**: 1–2 hours
- **Status**: 🔲 Future

#### 4. Enhanced Error Boundaries

- **Component**: More granular error handling
- **Use Cases**:
  - Component-specific error recovery
  - Better error messages for users
  - Graceful degradation
- **Implementation**: Add specific error boundaries for complex components
- **Estimated Effort**: 2–3 hours
- **Status**: 🔲 Future

#### 5. Time-Off TransferView Overlays

- **Component**: Time-off event visualization on TransferView
- **Use Cases**:
  - Time-off overlay indicators on TransferView
  - At-a-glance visibility of vacation/business trips alongside transfer points
  - Visual hierarchy showing both transfers and time-off events
- **Implementation**: Add event indicator overlays to TransferView
- **Note**: TimeOffView calendar enhancements (color-coded events, today indicator, month navigation, weekly recurring events) and ScheduleView overlay dots are already complete
- **Estimated Effort**: 2–3 hours
- **Status**: 🔲 Future

#### 6. iCal Subscription Link (Backend Required)

- **Component**: Server-side iCal feed for calendar app integration
- **Use Cases**:
  - Subscribe to shift schedule in Google Calendar, Outlook, Apple Calendar, etc.
  - Auto-refreshing feed — calendar app polls the URL periodically
  - Combined feed with shifts and time-off events
  - Per-user personalized feed (user's team, schedule type, time-off)
- **Implementation**: Backend endpoint serving RFC 5545 iCalendar (.ics) format
- **Prerequisite**: Backend sync (item 11) must be in place first
- **Note**: Replaces the previous client-side .ics file export approach — a subscription link is more useful than a one-time download
- **Status**: 🔲 Future (blocked on backend)
- **See also**: `backend/README.md` for endpoint specification

### 🎨 Future Enhancements

Advanced features for future development phases.

#### 7. Carousel for Mobile Team View

- **Component**: `react-bootstrap/Carousel`
- **Use Cases**:
  - Swipe through teams on mobile
  - Better mobile navigation
- **Implementation**: Responsive team display
- **Estimated Effort**: 5–6 hours
- **Status**: 🔲 Future

#### 8. Notification System Implementation

- **Component**: Browser notification functionality
- **Use Cases**:
  - Shift reminders and countdown alerts
  - Time-off event reminders
  - Customizable notification preferences
- **Implementation**: Build on existing notification settings in SettingsContext
- **Estimated Effort**: 4–5 hours
- **Status**: 🔲 Future

#### 9. Advanced Accessibility Features

- **Component**: Enhanced accessibility support
- **Use Cases**:
  - Screen reader improvements
  - High contrast mode
  - Font size preferences
  - Motion reduction settings
- **Implementation**: Accessibility context and enhanced ARIA support
- **Estimated Effort**: 3–4 hours
- **Status**: 🔲 Future

#### 10. Floating Action Button

- **Component**: Custom positioned `react-bootstrap/Button`
- **Use Cases**:
  - Quick team switch
  - Quick add time-off event
  - Add to calendar
  - Quick actions overlay
- **Implementation**: Fixed positioned button system
- **Estimated Effort**: 2–3 hours
- **Status**: 🔲 Future

#### 11. Backend with Shared .hday Files (Team Collaboration)

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
     socket.on("events:updated", ({ teamId, events }) => {
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

1. **Cross-Schedule Transfer View Enhancement** - Enable cross-roster coordination and overlap detection

### 📋 Backlog (Code Quality)

2. **Reusable TeamSelector Component** - Reduce code duplication

### 📋 Backlog (Features)

3. **ScheduleDetailModal Enhancement** - Activate disabled features
4. **Enhanced Error Boundaries** - Better error handling

### 📋 Backlog (Time-Off Management)

5. **Time-Off TransferView Overlays** - Event indicators on transfer view
6. **iCal Subscription Link** - Server-side calendar feed (blocked on backend)

### 📋 Backlog (UI/UX)

7. **Mobile Carousel** - Improved mobile navigation
8. **Notification System** - Browser notifications for shifts and time-off
9. **Advanced Accessibility** - Enhanced screen reader support, high contrast mode
10. **Floating Action Button** - Quick actions overlay

### 📋 Aspirational (Long-Term Vision)

11. **Backend with Shared Files** - Team collaboration with real-time .hday sync (40-60 hours, major undertaking, includes optional unified store)

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

- Advanced notification preferences
- Export/import settings

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

---

**Last Updated**: 2026-02-22
**Next Review**: After v4.8.0
