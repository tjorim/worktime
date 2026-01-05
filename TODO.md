# Worktime Development Roadmap

**Current Version**: 4.2.0
**Branch**: `main`
**Status**: Active Development

## Overview

This document serves as a general to-do list and development roadmap for Worktime improvements, covering shift tracking, time-off management, UI enhancements, and user experience improvements.

## Development To-dos

### 🚀 High-Priority Items

Critical features and improvements that significantly impact user experience.

#### 0. Worktime Integration Plan (Phase 1–3 Foundations)

Track the Phase 1–3 extraction and integration work from `WORKTIME_PLAN.md` so the roadmap reflects the shared-library and unified event-store goals beyond the v4.0 in-app integrations.

- **1. Extract `.hday` parser/serializer into shared lib**
  - **Current State**: Parser/serializer already lives in Worktime (`src/lib/hday/parser.ts`)
  - **Implementation**: Move parsing + serialization into a shared package/module for reuse across Worktime/NextShift
  - **Status**: 🔲 Planned (shared-lib extraction)
- **2. Extract shift rotation engine into shared lib**
  - **Current State**: Rotation logic lives in `src/utils/shiftCalculations.ts`
  - **Implementation**: Isolate shift cycle calculation into a reusable library module
  - **Status**: 🔲 Planned
- **3. Unified event store (computed shifts + `.hday` events)**
  - **Current State**: `src/contexts/EventStoreContext.tsx` manages `.hday` time-off events only
  - **Notes**: Enables HdayPlanner gap items 4.2 (Vacation Statistics), 4.3 (Raw .hday Editor), and 4.4 (Utility Functions) by standardizing event handling
  - **Implementation**: Merge computed shift events with imported time-off events in a single in-memory store
  - **Status**: 🔲 Planned (expansion beyond current time-off store)
- **4. Overlay semantics on schedule/transfer views**
  - **Source**: N/A (new definition)
  - **Current State**: Schedule view has time-off overlay dots; Transfer view has none yet
  - **Implementation**: Define merge/priority rules for how time-off overlays appear on Schedule + Transfer views
  - **Status**: 🔲 Planned (formalize semantics + add transfer overlays)

#### 1. Export Schedule Feature

- **Component**: Calendar export functionality
- **Use Cases**:
  - Download shift schedule as .ics calendar file
  - Integration with external calendar apps
  - Team schedule sharing
- **Implementation**: Add calendar generation utility and activate export buttons
- **Files to Modify**:
  - `src/components/SettingsPanel.tsx` - Remove "Coming Soon" badge and enable button
  - `src/components/TeamDetailModal.tsx` - Enable export button
  - `src/utils/exportCalendar.ts` – Add calendar export utility
- **Estimated Effort**: 3–4 hours
- **Status**: 🔲 Planned

#### 2. Keyboard Shortcuts Implementation

- **Component**: Enhanced navigation and time-off workflows with keyboard shortcuts
- **Use Cases**:
  - Quick tab switching (T for Today, S for Schedule, R for Transfers)
  - Date navigation (← → arrow keys)
  - Settings panel toggle (Ctrl+,)
  - Ctrl+S / Cmd+S to download .hday file
  - Ctrl+N to add new time-off event
  - Escape to cancel edit mode
  - Delete key to remove selected event
- **Implementation**: Integrate existing useKeyboardShortcuts hook into components
- **Files to Modify**:
  - `src/components/MainTabs.tsx` - Add shortcut handlers
  - `src/components/ScheduleView.tsx` - Add date navigation shortcuts
  - `src/components/Header.tsx` - Add settings shortcut
  - `src/components/TimeOffView.tsx` - Add time-off specific shortcuts
- **Estimated Effort**: 4–5 hours
- **Status**: 🔲 Planned

#### 3. Version Sync Fix

- **Component**: Changelog version alignment
- **Use Cases**:
  - Accurate "Coming Soon" version display
  - Proper future planning version numbers
- **Implementation**: Update futurePlans in changelog.ts
- **Files to Modify**:
  - `src/data/changelog.ts` - Update version numbers in futurePlans
- **Estimated Effort**: 30 minutes
- **Status**: 🔲 Planned

#### 4. Missing HdayPlanner Features (v4.0 Integration Gaps) ⚠️

**CRITICAL**: Features from HdayPlanner that were NOT merged into Worktime during the v4.0 rebrand/integration. These features are essential for users migrating from HdayPlanner.

**Integration Status:**

- ✅ **Successfully Merged**: .hday parser (139 tests), import/export files, event modal (create/edit/delete), all event flags/types (holiday, business, sick, training, etc.), undo/redo (v4.1.0), bulk operations (v4.1.0), event duplication (v4.1.0)
- ❌ **Missing Core UI**: Vacation statistics dashboard
- ❌ **Missing UX Features**: View/edit raw .hday content
- 📊 **Total Effort to Achieve Parity**: ~9–12 hours (significantly reduced after commit "Add month calendar grid view for Time Off")

---

**4.2 Vacation Statistics Dashboard** 🌟

- **Component**: Vacation allowance tracking and analytics
- **Source**: `HdayPlanner/frontend/src/components/StatisticsCard.tsx`
- **Use Cases**:
  - Annual vacation allowance configuration (days or hours)
  - Days used vs. remaining
  - Breakdown by event type (Holiday, Business, Sick, Training, etc.)
  - Year-specific statistics
  - Hours-to-days conversion
- **Current Worktime**: No statistics tracking
- **Implementation**: Add StatisticsCard accordion to TimeOffView
- **Files to Create**:
  - `src/components/timeoff/VacationStats.tsx` - Statistics component
  - `src/utils/vacationCalculations.ts` - Allowance calculations
- **Files to Modify**:
  - `src/components/TimeOffView.tsx` - Add statistics section
  - `src/contexts/SettingsContext.tsx` - Add vacation allowance settings
- **Estimated Effort**: 5–6 hours
- **Status**: 🔲 Planned (High Priority)

**4.3 Raw .hday Content Editor/Viewer** 🔴 **[CRITICAL - User Request]**

- **Component**: View and edit raw .hday file content
- **Source**: `HdayPlanner/frontend/src/components/RawContentAccordion.tsx`
- **Current Gap**:
  - ❌ **No way to VIEW raw .hday content in UI** - users must export to file, open in notepad
  - ❌ **No way to PASTE/EDIT raw content** - users can't copy/paste .hday text into the app
  - ✅ Export downloads .hday file (but can't see content in UI)
  - ✅ Import reads .hday file (but can't paste text directly)
- **Use Cases**:
  - View entire .hday content as formatted text in UI
  - Copy raw .hday content to clipboard
  - Paste entire .hday file content from clipboard
  - Parse button to convert pasted text to events
  - Flag reference guide embedded in UI
  - Advanced users prefer text editing over forms
  - Quick sharing of events via text (copy/paste into email, chat)
- **Implementation**: Add collapsible accordion with textarea showing exportHday() output
- **Files to Modify**:
  - `src/components/TimeOffView.tsx` - Add "View Raw Content" accordion section
- **Files to Create**:
  - `src/components/timeoff/RawContentEditor.tsx` - Textarea with view/edit/parse logic
- **Estimated Effort**: 2–3 hours
- **Status**: 🔲 Planned (High Priority - User Request)

**4.4 Missing Utility Functions**

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

**4.5 Enhanced Keyboard Navigation**

- **Component**: Calendar-specific keyboard shortcuts
- **Source**: `HdayPlanner/frontend/src/components/MonthGrid.tsx` (roving tabindex)
- **Use Cases**:
  - Arrow keys navigate calendar grid
  - Home/End jump to month bounds
  - Enter opens day for editing
  - Escape closes modals
- **Current Worktime**: Basic keyboard support in modals only
- **Implementation**: Add keyboard handlers to calendar component
- **Dependencies**: None (calendar grid view already available)
- **Estimated Effort**: 2–3 hours
- **Status**: 🔲 Future (depends on calendar view)

**Summary of HdayPlanner Integration Gaps:**

- ✅ **Successfully Merged**: .hday parser (139 tests), import/export files, event modal (create/edit/delete), all flags/types
- ✅ **Restored in Worktime**: Undo/redo with history tracking, bulk operations (multi-select, bulk delete/duplicate, select all)
- 🔴 **CRITICAL Missing Features** (User Requests):
  - ❌ **View/Edit Raw .hday Content** - No way to view or paste .hday text in UI (must use external file)
- ❌ **Missing Core UI**: Statistics dashboard (vacation allowance tracking)
- ❌ **Missing UX**: Advanced keyboard nav for calendar
- 📊 **Total Estimated Effort**: 9–12 hours to achieve feature parity
- 🎯 **Priority Order**:
  1. Raw .hday viewer/editor (2-3h) - Quick win, high user value
  2. Statistics dashboard (5-6h) - Vacation tracking
  3. Advanced keyboard nav (2-3h) - Efficiency improvements

### 🎯 Medium-Priority Items

Features that enhance functionality with moderate development effort.

#### 4. Reusable TeamSelector Component

- **Component**: Extract common team selection logic
- **Use Cases**:
  - Reduce code duplication across TransferView, TeamDetailModal, etc.
  - Consistent team selection UI/UX
  - Easier maintenance and updates
- **Implementation**: Create `components/common/TeamSelector.tsx` with standardized props
- **Files to Modify**:
  - `src/components/TransferView.tsx` - Replace dropdown with TeamSelector
  - `src/components/TeamDetailModal.tsx` - Use common component
  - Create `src/components/common/TeamSelector.tsx`
- **Estimated Effort**: 2–3 hours
- **Status**: 🔲 Planned

#### 5. Enhanced List Groups

- **Component**: `react-bootstrap/ListGroup`
- **Use Cases**:
  - Upcoming shifts list
  - Recent transfers list
  - Clean, organized data display
- **Implementation**: New components for data lists
- **Estimated Effort**: 2–3 hours
- **Status**: 🔲 Future

#### 6. TeamDetailModal Enhancement

- **Component**: Improve existing team detail modal
- **Use Cases**:
  - Enable export functionality in modal
  - Enhanced 7-day schedule view
  - Better team information display
- **Implementation**: Activate disabled features and improve UX
- **Estimated Effort**: 1–2 hours
- **Status**: 🔲 Future

#### 7. Enhanced Error Boundaries

- **Component**: More granular error handling
- **Use Cases**:
  - Component-specific error recovery
  - Better error messages for users
  - Graceful degradation
- **Implementation**: Add specific error boundaries for complex components
- **Estimated Effort**: 2–3 hours
- **Status**: 🔲 Future

#### 8. CurrentStatus Component Refactoring ⭐️

- **Component**: Simplify complex conditional rendering in CurrentStatus
- **Priority**: Elevated due to code review feedback
- **Code Review Feedback**: "This component has grown quite complex with the introduction of the generic view for when no team is selected. The conditional rendering logic, especially within the Your Team Status and Your Next Shift cards, makes it a bit hard to follow." - _Gemini Code Assistant_
- **Use Cases**:
  - Improved code readability and maintainability
  - Easier testing of individual status display logic
  - Better separation of concerns
  - Cleaner component architecture with single responsibility
- **Recommended Implementation**:
  - Extract into `PersonalizedStatus` and `GenericStatus` components
  - Make CurrentStatus a simple router component that decides which view to render
  - Example structure:
    ```tsx
    export function CurrentStatus({ myTeam, currentDate, todayShifts, onTodayClick }) {
      return myTeam ? (
        <PersonalizedStatus myTeam={myTeam} currentDate={currentDate} todayShifts={todayShifts} />
      ) : (
        <GenericStatus currentDate={currentDate} todayShifts={todayShifts} onTodayClick={onTodayClick} />
      );
    }
    ```
- **Files to Modify**:
  - `src/components/CurrentStatus.tsx` - Simplify to router component
  - Create `src/components/status/PersonalizedStatus.tsx` - Handles user's team view
  - Create `src/components/status/GenericStatus.tsx` - Handles no-team-selected view
  - Update tests to cover new component structure
- **Estimated Effort**: 2–3 hours
- **Status**: 🔲 Planned (High Priority)

#### 9. Time-Off Calendar Visual Enhancements

- **Component**: TimeOffView calendar display improvements
- **Use Cases**:
  - Color-coded calendar events matching .hday flag colors
  - Auto-load and highlight current month
  - Visual indicator for today's date
  - Weekly recurring event indicators (d1-d7) on appropriate weekdays
  - Auto-sort events by date in event table
- **Implementation**: Enhance TimeOffView calendar rendering
- **Estimated Effort**: 3–4 hours
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

#### 12. Time-Off Statistics Dashboard

- **Component**: Vacation and time-off analytics
- **Use Cases**:
  - View vacation days used vs. remaining
  - Breakdown by event type (vacation, business, training)
  - Year-over-year comparison
  - Team-wide statistics (if multiple users)
- **Implementation**: New statistics component with charts
- **Estimated Effort**: 4–5 hours
- **Status**: 🔲 Future

### 🎨 Future Enhancements

Advanced features for future development phases.

#### 13. Carousel for Mobile Team View

- **Component**: `react-bootstrap/Carousel`
- **Use Cases**:
  - Swipe through teams on mobile
  - Better mobile navigation
- **Implementation**: Responsive team display
- **Estimated Effort**: 5–6 hours
- **Status**: 🔲 Future

#### 14. Accordion for Transfer History

- **Component**: `react-bootstrap/Accordion`
- **Use Cases**:
  - Collapsible transfer sections by date range
  - Organized historical data
- **Implementation**: Update TransferView component
- **Estimated Effort**: 3–4 hours
- **Status**: 🔲 Future

#### 15. Notification System Implementation

- **Component**: Browser notification functionality
- **Use Cases**:
  - Shift reminders and countdown alerts
  - Time-off event reminders
  - Customizable notification preferences
- **Implementation**: Build on existing notification settings in SettingsContext
- **Estimated Effort**: 4–5 hours
- **Status**: 🔲 Future

#### 16. Advanced Accessibility Features

- **Component**: Enhanced accessibility support
- **Use Cases**:
  - Screen reader improvements
  - High contrast mode
  - Font size preferences
  - Motion reduction settings
- **Implementation**: Accessibility context and enhanced ARIA support
- **Estimated Effort**: 3–4 hours
- **Status**: 🔲 Future

#### 17. Multi-Roster Pattern Support

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

#### 18. Floating Action Button

- **Component**: Custom positioned `react-bootstrap/Button`
- **Use Cases**:
  - Quick team switch
  - Quick add time-off event
  - Add to calendar
  - Quick actions overlay
- **Implementation**: Fixed positioned button system
- **Estimated Effort**: 2–3 hours
- **Status**: 🔲 Future

## Current To-do Status

### 🔲 Next Up

1. **Raw .hday Content Editor/Viewer** - View/edit raw .hday content in UI
2. **Vacation Statistics Dashboard** - Vacation allowance tracking and analytics
3. **Export Schedule Feature** - Calendar export functionality (user-facing)
4. **Enhanced Keyboard Navigation** - Calendar-specific keyboard shortcuts
5. **CurrentStatus Component Refactoring** ⭐️ - Elevated priority due to code review feedback
6. **Version Sync Fix** - Quick changelog alignment (30 min)

### 📋 Backlog (Code Quality)

5. **Reusable TeamSelector Component** - Reduce code duplication

### 📋 Backlog (Features)

6. **Enhanced List Groups** - Better data organization
7. **TeamDetailModal Enhancement** - Activate disabled features
8. **Enhanced Error Boundaries** - Better error handling

### 📋 Backlog (Time-Off Management)

9. **Time-Off Calendar Visual Enhancements** - Color-coded events, auto-load current month, highlight today
10. **Time-Off Bulk Operations** - Multi-select, copy/duplicate, merge imports
11. **Calendar Export Formats** - .ics, CSV export for shifts and time-off
12. **Time-Off Statistics Dashboard** - Vacation days used/remaining, breakdown by type

### 📋 Backlog (UI/UX)

13. **Mobile Carousel** - Improved mobile navigation
14. **Transfer History Accordion** - Organized historical data
15. **Notification System** - Browser notifications for shifts and time-off
16. **Advanced Accessibility** - Enhanced screen reader support, high contrast mode
17. **Multi-Roster Pattern Support** - Support 3/4/6-team rosters and custom patterns
18. **Floating Action Button** - Quick actions overlay

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

**Last Updated**: 2025-12-30
**Next Review**: After Phase 1 completion
