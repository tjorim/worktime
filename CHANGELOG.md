# Changelog

All notable changes to Worktime will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - Future Enhancements

### Planned

- Vacation statistics dashboard
- Time-off allowance tracking
- Breakdown by event type
- Year-specific analytics
- Calendar export (.ics format)
- Enhanced keyboard shortcuts
- Notification system
- Theme customization

## [4.3.0] - 2026-01-06

### Added

- Raw .hday Content Editor Tab: Third tab view for direct text editing alongside Calendar and Table views
- Unsaved Changes Indicator: Yellow badge on 'Raw .hday' button when content has unsaved edits
- Visual Validation Feedback: Bootstrap isInvalid styling shows red border on textarea when errors occur
- RawContentAccordion Component: Dedicated component with 11 unit tests for raw content editing
- File Import State Reset: Automatically resets raw editor dirty/error state when importing .hday files
- Help Text Lookup: Object-based help text for better maintainability

### Changed

- TimeOffView: Moved raw .hday editor from accordion to dedicated tab for better discoverability
- Performance: Optimized handleRawEditorChange callback with empty dependency array
- Code Quality: Refactored nested ternary to object lookup pattern for readability
- Accessibility: Visually hidden redundant form labels while maintaining screen reader support
- Documentation: Fixed placeholder example flag (d3pb → d3ab) to match AM business trip

### Fixed

- Selection State Management: Now correctly clears selected indices after applying raw .hday content
- Test Coverage: Fixed 'multiple elements' test failure by scoping date search to table
- Callback Optimization: Removed unnecessary rawEditorError dependency from handleRawEditorChange

### Raw .hday Content Editor Implementation

Implemented comprehensive raw .hday content editor as a dedicated tab view. Created RawContentAccordion component (69 lines) with visual validation feedback and unsaved changes indicator. Added selection clearing logic to prevent stale selections after import/apply operations. Improved file import flow to reset raw editor state. Optimized callback dependencies for better performance. Added 11 unit tests for RawContentAccordion and 4 integration tests for TimeOffView raw editor workflows. Refactored nested ternary operators and visually hidden redundant labels for better code quality and accessibility. All 529 tests passing with comprehensive coverage.

## [4.2.0] - 2026-01-02

### Added

- Month Calendar Grid View: Visual calendar component with event overlays for time-off management
- Calendar/Table View Toggle: Switch between calendar grid and table views
- Keyboard Navigation: Arrow keys, Home, End for navigating calendar days with cross-month support
- Visual Indicators: Public holidays (🎉), school holidays (🏫), and paydays (💶) displayed on calendar
- DayCell Component: Dedicated component for individual calendar day cells with accessibility features
- Event Type Badges: Colored badges in table view with consistent styling
- Context-Aware Help Text: Different guidance shown for calendar vs table view modes
- Comprehensive ARIA Labels: Full accessibility support with descriptive labels for screen readers

### Changed

- EmptyState Component: Simplified nested ternary operators for better readability
- Inline Styles: Moved inline styling to SCSS for better maintainability
- useOpenHolidays Hook: Memoized paramsKey calculation for improved performance
- Error Message Dependencies: Removed unnecessary dependencies from useEffect

### Fixed

- December Payday Bug: Fixed incorrect payday calculation when Christmas falls on Saturday (now correctly Dec 23 instead of Dec 24)
- Weekday Bounds Checking: Added validation to prevent undefined display for invalid weekday values
- ARIA Grid Compatibility: Removed incompatible ARIA grid roles for CSS Grid layout
- TypeScript Type Safety: Added undefined checks for optional weekday property
- Hidden File Input: Added aria-label for accessibility compliance

### Month Calendar Grid View Implementation

Implemented comprehensive month calendar grid view for time-off management. Created MonthCalendar (299 lines) and DayCell (244 lines) components with full accessibility support including keyboard navigation, ARIA labels, and screen reader compatibility. Added view mode toggle to TimeOffView for switching between calendar and table views. Includes public holiday, school holiday, and payday indicators with emoji visualization. Added 45 comprehensive tests (20 MonthCalendar + 25 DayCell) covering rendering, navigation, events, accessibility, and keyboard interactions. Fixed December payday calculation bug and improved code quality with TypeScript documentation and SCSS organization. All 517 tests passing.

## [4.1.0] - 2025-12-30

### Added

- Undo/Redo: History tracking with undo/redo buttons and keyboard shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
- Bulk Operations: Select multiple events with checkboxes and perform bulk delete or duplicate
- Event Duplication: Duplicate single or multiple time-off events
- Select All/Clear All: Quick selection management buttons
- History Stack: 50-state history limit with visual disabled states when empty
- Keyboard Shortcuts: Ctrl+Z (undo), Ctrl+Y (redo), Ctrl+Shift+Z (redo alternative)

### Changed

- TimeOffView: Added checkbox column for multi-select, bulk action toolbar with undo/redo controls
- EventStoreContext: Added history/future stacks and UNDO/REDO actions to reducer
- MainTabs: Pass isActive prop to TimeOffView for keyboard shortcut management

### Time Off Event History & Bulk Operations

Implemented undo/redo functionality and bulk operations for time-off events. Added history and future stacks to EventStoreContext with 50-state limit. Created checkbox-based multi-select UI with bulk delete, bulk duplicate, select all, and clear selection. Added keyboard shortcuts for undo (Ctrl+Z), redo (Ctrl+Y, Ctrl+Shift+Z) with proper event handling. Toast notifications provide user feedback. Added 15+ tests covering undo/redo flows and bulk operations.

## [4.0.0] - 2025-12-29

### Added

- Time Off Management: Dedicated tab for importing/exporting .hday files for vacation and time-off tracking
- .hday Parser: Comprehensive parser with 139 test cases supporting range and weekly events
- Event Modal: Interactive form for creating/editing time-off events with live .hday preview
- Event Store Context: React Context for managing time-off events with CRUD operations
- Event Overlays: Colored dots on schedule view showing time-off events for each day
- Today Banner: Alert banner showing today's time-off events in Today view
- Import/Export: File picker for importing .hday files and download for exporting
- Weekly Events: Support for recurring events (e.g., "Every Monday")
- Event Flags: Business trips, training, in-office, sick leave, and time/location flags
- CalendarEvent Model: Unified event model bridging shifts and time-off events
- Event Converters: Convert between .hday events and calendar display format
- Confirmation Dialog: Safety prompt before deleting events
- Comprehensive Testing: 50 new tests for converters, EventStore, and TimeOffView
- Accessibility Features: ARIA labels, keyboard navigation, form validation

### Changed

- 🎨 REBRAND: Complete rebrand from NextShift to Worktime to reflect merged shift tracking + time-off management
- Updated all user-facing text from NextShift to Worktime (ChangelogModal, TerminalHeader, etc.)
- Updated configuration interfaces: NextShiftConfig → WorktimeConfig, NextShiftUserState → WorktimeUserState
- Updated type interfaces: NextShiftResult → UpcomingShiftResult
- Updated window configuration: window.NEXTSHIFT_CONFIG → window.WORKTIME_CONFIG
- Updated all documentation (CLAUDE.md, TODO.md, CHANGELOG.md, README.md) with Worktime branding
- Merged HdayPlanner TODO items into unified Worktime roadmap
- Upgraded to Vite 8.0.0-beta.5 with Rolldown bundler for faster builds
- Replaced Biome with oxlint and oxfmt (OXC tools) for ultra-fast Rust-based linting
- Removed cookie consent system (internal users only - no consent needed)
- Simplified localStorage hooks (removed consent categories)
- Simplified WelcomeWizard (removed consent step, now 3-step flow)
- App.tsx: Added EventStoreProvider wrapping entire app
- MainTabs: Added fourth tab for Time Off Management
- ScheduleView: Enhanced with event overlay indicators
- TodayView: Enhanced with time-off event banner
- Simplified deployment: Now standard web app with browser HTTP caching (no PWA complexity)

### Fixed

- 🔧 Fixed 6 TypeScript build errors: unused imports, type guards, RefObject types, missing properties, Rolldown compatibility
- ✅ Fixed 42 test failures: EventStoreProvider, mocks, branding, localStorage keys (460 tests now passing)
- dayjs comparisons: Fixed isSameOrBefore/isSameOrAfter (not built-in) with explicit logic
- EventStoreContext: Fixed React batching issues with functional state updates
- localStorage cleanup: Now removes keys when empty instead of storing empty strings
- filterEventsInRange: Proper date range filtering with inclusive boundaries
- Test stability: Fixed multiple element matches in TimeOffView tests

### Planned

- 🚫 BREAKING: Removed all PWA functionality (9 files total) to eliminate cache issues where users get stuck on old versions
- Benefits: Force refresh works (Ctrl+F5), simpler deployment, -1600 lines of code, standard browser caching

### Worktime v4.0: Complete Rebrand + Time-Off Integration + PWA Removal

Complete rebrand from NextShift to Worktime. Merged HdayPlanner's .hday time-off management. Created src/lib/hday/ parser (482 lines), src/lib/events/ converters, EventStoreContext for state management, TimeOffView and EventModal components. Removed all PWA functionality (service workers, install prompts, offline status) to avoid cache-related issues - users can now force refresh. Upgraded build toolchain to Vite 8 beta and OXC tools. All 460 tests passing (139 .hday parser + 50 integration tests + 271 existing tests).

## [3.4.0] - 2025-11-17

### Added

- Shared isCurrentlyWorking() utility: Extracted from TodayView for reuse across components

### Changed

- CurrentStatus.tsx: Refactored to use shared isCurrentlyWorking() utility
- TodayView.tsx: Refactored to use shared isCurrentlyWorking() utility
- TransferView.tsx: Added edge case handling for empty availableOtherTeams
- shiftCalculations.ts: Added isCurrentlyWorking() as shared utility function

### Code Quality Improvements

Extracted shared utilities for shift activity detection. Enhanced edge case handling for single-team configurations.

## [3.3.0] - 2025-08-18

### Added

- Cookie Consent System: GDPR-compliant privacy controls integrated into app flow
- CookieConsentProvider context for managing consent preferences application-wide
- Consent-aware localStorage hook that respects user preferences
- Data categorization: Strictly Necessary (always enabled), Functional (requires consent), Analytics (not implemented)
- Automatic data migration system for existing users to prevent data loss
- Custom event system for same-tab consent changes (nextshift:consent-changed)
- Privacy Settings in Settings Panel: New Privacy & Data modal with toggle controls
- Enhanced Welcome Wizard: Integrated consent into onboarding flow (4-step wizard)
- Consent-Aware Team Features: Team selection respects functional cookie preferences
- Toast notifications for consent-related actions

### Changed

- App Architecture: Wrapped entire app in CookieConsentProvider for global consent state
- Data Storage Pattern: Split user data into consent-categorized storage locations
- Welcome Wizard Flow: Extended from 3 to 4 steps with integrated privacy preferences
- Settings Panel: Replaced generic Reset Data with comprehensive privacy controls
- Team Selection Logic: Now consent-aware with graceful fallback for declined functional cookies

### Fixed

- Data Migration: Seamless migration of existing user preferences to consent-aware structure
- Cross-test Contamination: Fixed test cleanup to properly restore mocked globals
- Same-tab Event Handling: Custom events ensure consent changes are immediately reflected across components

### GDPR Privacy Compliance System

Implemented comprehensive cookie consent system with CookieConsentContext, consent-aware useLocalStorage hook, automatic data migration, and integrated privacy controls. Enhanced Welcome Wizard with 4-step flow including privacy preferences. Added Privacy & Data section to Settings with granular consent management.

## [3.2.0] - 2025-07-27

### Added

- Welcome Wizard: Interactive onboarding experience for new users
- Optional Team Selection: Users can skip team selection and browse all teams
- Settings Panel: Complete Offcanvas settings with preferences, theme, and time format
- Enhanced Theme Support: Auto/Light/Dark theme switching with system preference detection
- Notification Settings: User-configurable shift reminders and alerts
- Share Functionality: Share app or current view with colleagues
- Settings Reset: Option to clear all preferences and start fresh
- Enhanced User Preferences: Persistent team selection with localStorage
- Bootstrap UI Enhancements: Toast notification system for user feedback
- Progress bar visualization for off-day tracking (CurrentStatus component)
- Tooltips for shift code explanations with enhanced accessibility
- In-app changelog viewer with interactive accordion interface
- Bootstrap Icons integration for improved visual consistency
- Documentation & Planning: Bootstrap UI Enhancement Plan documentation with phased approach
- Comprehensive changelog system following Keep a Changelog format
- Version tracking infrastructure with semantic versioning
- Enhanced component composition patterns
- Context API integration for toast notifications
- Improved accessibility with ARIA labels and tooltips
- Consistent styling with Bootstrap component integration
- React Bootstrap component consistency across all UI elements
- Transfer type badges with explanatory tooltips for better UX
- Seamless tab-content styling for professional appearance
- TeamDetailModal: Complete modal for detailed team information and 7-day schedules

### Changed

- Updated package.json version to 3.2.0
- App.tsx: Complete onboarding flow with welcome wizard integration
- CurrentStatus component: Enhanced to handle null team selection gracefully
- Header component: Added Settings panel trigger and enhanced navigation
- Enhanced Header component with changelog access button
- Improved user feedback with contextual toast notifications
- Centralized Day.js configuration with ISO week numbering support
- Unified date/time formatting utilities across the application
- TransferView: Reorganized controls layout for better space utilization and UX
- TransferInfo interface: Refactored from isHandover boolean to semantic TransferType union
- Shift display: Implemented single source of truth using getShiftDisplayName utility
- TodayView: Converted HTML button cards to proper React Bootstrap Card components
- ScheduleView: Replaced HTML fieldset btn-group with React Bootstrap ButtonGroup
- Component architecture: Improved semantic variable naming and accessibility

### Fixed

- Critical: Sunday week number calculation using ISO week standard (#13)
- Year boundary bug: December 31, 2024 now correctly shows as week 2501.2
- ISO week consistency: All date codes now use ISO week numbering
- Date code accuracy: Night shifts now use correct shift day instead of calendar day
- Cross-day timeline: Fixed timeline to show next shift from tomorrow when needed
- Test environment: dayjs plugin loading and configuration in test suite

### Major Architecture & Component Updates

Added WelcomeWizard.tsx for onboarding, SettingsPanel.tsx with Offcanvas UI, SettingsContext.tsx for global preferences, dateTimeUtils.ts for centralized date handling. Enhanced App.tsx with complete onboarding flow, CurrentStatus.tsx with null team support, Header.tsx with settings integration. Critical fixes to ISO week numbering and date code calculations.

## [3.1.0] - 2025-07-26

### Added

- Initial Bootstrap UI foundation and component integration
- Toast notification system prototype
- Progress bar visualization for shift tracking
- Enhanced tooltips and accessibility features
- Changelog infrastructure and version tracking

### Changed

- Improved component composition patterns
- Enhanced user interface consistency

### Fixed

- Component testing and integration issues

### UI Foundation

Established Bootstrap UI component integration and accessibility improvements.

## [3.0.0] - 2025-07-25

### Added

- Weekday display in transfer dates (e.g., "Wed, Jan 15, 2025")
- Currently working team indicator in Current Status view
- Off-day progress tracking ("Day X of 4 off days")
- Consistent card heights across all team displays
- Refactored off-day progress calculation to utils layer
- New getOffDayProgress() utility function with comprehensive tests
- Improved separation of concerns between UI and business logic
- Added comprehensive test coverage (228 tests total)
- Updated test mocks to match actual shift names with emojis
- Resolved test conflicts with multiple team elements
- Enhanced TypeScript type safety

### Changed

- TodayView component now shows consistent content for all teams
- Off teams display "Not working today" instead of space
- Transfer dates include weekday context for better planning
- CurrentStatus component shows both working team and user's team status

### Fixed

- Inconsistent card heights between working and off teams
- Test failures due to multiple identical text elements
- Code formatting and linting issues
- Unicode emoji compatibility in test patterns

### Technical Highlights

This release focused on UX improvements and code quality, adding 42 comprehensive tests for shift calculations, updating component tests for new UI elements, and refactoring business logic for better maintainability.

## [2.0.0] - 2025-07-23

### Added

- Progressive Web App (PWA) functionality
- Offline support with service worker
- Team shift tracking and calculations
- Transfer/handover detection between teams
- Responsive Bootstrap UI design
- Date navigation and shift visualization
- 5-team continuous shift schedule (M/E/N/Off pattern)
- Today's team overview with active shift highlighting
- Next shift calculation with countdown timer
- Transfer point detection between teams
- Date picker with custom range selection
- Installation prompts for mobile/desktop
- Offline functionality with cached data
- App shortcuts for quick access
- Service worker for background updates
- Bootstrap 5 responsive design
- Color-coded shift badges
- Team highlighting for user's selected team
- Mobile-optimized touch interface

### Technical Stack

Built with React 19 with TypeScript, Vite build system with PWA plugin, Day.js for date handling, React Bootstrap components, Vitest testing framework, and Biome for linting and formatting.

---

## Version Planning

### v4.4.0 - Statistics & Analytics

- Vacation statistics dashboard
- Time-off allowance tracking
- Breakdown by event type
- Year-specific analytics

### v4.5.0 - Advanced Features

- Calendar export (.ics format)
- Enhanced keyboard shortcuts
- Notification system
- Theme customization

### Future Releases

- Multi-language support
- Data export capabilities
- Mobile carousel for team browsing
- Advanced accessibility features

[Unreleased]: https://github.com/tjorim/worktime/compare/v4.3.0...HEAD
[4.3.0]: https://github.com/tjorim/worktime/compare/v4.2.0...v4.3.0
[4.2.0]: https://github.com/tjorim/worktime/compare/v4.1.0...v4.2.0
[4.1.0]: https://github.com/tjorim/worktime/compare/v4.0.0...v4.1.0
[4.0.0]: https://github.com/tjorim/worktime/compare/v3.4.0...v4.0.0
[3.4.0]: https://github.com/tjorim/worktime/compare/v3.3.0...v3.4.0
[3.3.0]: https://github.com/tjorim/worktime/compare/v3.2.0...v3.3.0
[3.2.0]: https://github.com/tjorim/worktime/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/tjorim/worktime/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/tjorim/worktime/compare/v2.0.0...v3.0.0
[2.0.0]: https://github.com/tjorim/worktime/releases/tag/v2.0.0
