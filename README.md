# Worktime - Shift Tracker & Time Off Management

**Created by [Jorim Tielemans](https://github.com/tjorim)**

A lightweight web application supporting multiple roster patterns including continuous 24/7 rotations, standard weekday schedules, and custom shift patterns. Combines shift tracking with integrated time-off management (.hday format).

## Overview

Worktime helps teams and individuals working in various shift schedules to quickly check:

- Which teams are working on any given day
- When their next shift is scheduled
- Transfer/handover points between teams
- Complete schedule overview with easy navigation
- Vacation and time-off planning with statistics
- Monthly calendar with working days, holidays, and events

**Supported Schedule Types:**

- **5-shift**: Continuous 24/7 rotation with 5 teams (morning/evening/night shifts)
- **9-5**: Standard weekday schedule (Mon-Fri, single user)
- **Weekend shift**: Weekend-only rotation with alternating early/late shifts

**Coming Soon:**

- **2-shift**: Alternating early/late shifts

## Features

### 🕐 Current Status

- Real-time display of your team's current shift
- Next shift countdown and scheduling
- Shift timeline showing current and upcoming shifts
- Date display in YYWW.D format (e.g., 2520.2M = year 2025, week 20, Tuesday Morning)

### 📅 Schedule Selection

- Choose from multiple roster patterns (5-shift, 9-5, weekend-shift)
- Switch between schedule types at any time in settings
- Onboarding wizard for easy setup

### 👥 Team Management (Multi-Team Schedules)

- Team selection on first visit (stored locally)
- Highlight your team across all views
- Easy team switching
- Transfer view to find handover/takeover points

### 📆 Calendar & Schedule Views

- **Schedule Tab**: Today and 7-day schedule views with date navigation
- **Calendar**: Monthly calendar with shift badges, time-off events, and holiday indicators
- **Transfers**: Find handover/takeover points between teams
- **Time Off**: Import/export .hday files for vacation and time-off tracking

### ⌨️ Keyboard Shortcuts

- Tab switching (**C**alendar, **S**chedule, **T**ransfers, Time **O**ff via C/S/T/O keys)
- Date navigation (arrow keys, Ctrl+K/J) and jump to today (Ctrl+H)
- Settings toggle (Ctrl+,)
- Time-off actions (Ctrl+I import, Ctrl+S export, Delete, Escape)
- View all shortcuts via Settings > Keyboard Shortcuts

### 📊 Vacation Statistics

- Comprehensive vacation allowance tracking
- Usage analytics with progress visualization
- Event type breakdown (holiday, business, course, sick leave, etc.)
- Year-based filtering
- Configurable allowance in days or hours

### 📱 Web App Features

- **Responsive**: Mobile-first design with Bootstrap 5
- **Fast**: Optimized build with Vite 8 and React 19
- **Local Storage**: All data stored in browser localStorage
- **Offline Capable**: Fully functional without internet connection

### 📝 .hday File Format

The `.hday` format is a simple text-based format for tracking time off. Each line represents a single event or recurring pattern.

**Quick Example:**

```hday
2024/12/23-2025/01/05 # Christmas vacation
p2024/03/26-2024/03/26 # Half day PM off
b2024/06/10-2024/06/12 # Business trip
s2024/04/08-2024/04/08 # Training course
d1 # Every Monday off
```

**For complete format specification**, see [docs/hday-format-spec.md](docs/hday-format-spec.md)

**Example files** are available in the [examples/](examples/) directory.

## 5-Shift Pattern

The 5-shift schedule is a continuous 24/7 rotation where each team follows a 10-day repeating cycle:

- **Days 1-2**: Morning shift (07:00-15:00) - Code: M
- **Days 3-4**: Evening shift (15:00-23:00) - Code: L (displayed as E)
- **Days 5-6**: Night shift (23:00-07:00) - Code: N
- **Days 7-10**: Off days

Teams are numbered 1-5, with each team starting their cycle 2 days after the previous team, ensuring 24/7 coverage.

**Other Schedules:**

- **9-5**: Monday-Friday day shifts (09:00-17:00) with weekends off
- **Weekend shift**: Weekend-only rotation with alternating early/late shifts
- **2-shift**: Alternating early/late shifts (coming soon)

## Date Format

Dates are displayed in **YYWW.D** format where:

- **YY** = Last 2 digits of year (25 = 2025)
- **WW** = Week number (20 = week 20)
- **D** = Weekday (1=Monday, 2=Tuesday...7=Sunday)

Optional shift code suffixes (M/E/N) can be added to specify the shift type:

Examples:

- Tuesday, May 13, 2025 = `2520.2` (year 2025, week 20, Tuesday)
- Morning shift: `2520.2M`
- Evening shift: `2520.2E`
- Night shift: `2520.1N` (uses previous day for night starting at 23:00)

## Getting Started

### Prerequisites

- Node.js 20.19.0 or higher
- npm (comes with Node.js)

### Local Development

1. **Clone the repository**

   ```bash
   git clone https://github.com/tjorim/worktime.git
   cd worktime
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Start development server**

   ```bash
   npm run dev
   ```

4. **Open your browser**
   - Navigate to `http://localhost:8000`
   - Follow the onboarding wizard:
     1. Choose your schedule type (5-shift, 9-5, or weekend-shift)
     2. Select your team (for multi-team schedules)
     3. Configure vacation allowance (optional)
   - Start tracking your shifts!

### Building for Production

```bash
# Build the application
npm run build

# Preview the production build
npm run preview
```

**⚠️ Important**: Always run `npm run build` before `npm run preview`. The preview command serves the built files from the `dist/` directory.

The built files will be in the `dist/` directory, ready for deployment to any static hosting service.

## Configuration

Reference dates and teams for shift calculations are configured per schedule in
`src/data/rosters.ts`. Each roster entry defines its own `referenceDate` and
`referenceTeam` values, and the application uses those values automatically.

### Development Commands

```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build

# Code Quality
npm run lint         # Run oxlint (ultra-fast Rust linter)
npm run format       # Format code with oxfmt
npm run test         # Run test suite
```

## Technology Stack

### Core Framework

- **Frontend**: React 19 + TypeScript with modern JSX transform
- **Build Tool**: Vite 8 for modern development and optimization
- **UI Framework**: React Bootstrap (Bootstrap 5 components)
- **Styling**: Sass with Bootstrap 5 design system

### Development Tools

- **Linting**: oxlint and oxfmt (OXC tools - ultra-fast Rust-based)
- **Testing**: Vitest + React Testing Library
- **Type Checking**: TypeScript with strict configuration
- **Hot Reload**: Vite development server with HMR

### Data & State

- **Date Handling**: Day.js with timezone and week plugins
- **Storage**: Custom localStorage hook with error handling
- **State Management**: React Context + custom hooks
- **Icons**: Bootstrap Icons + programmatically generated favicons

### Deployment

- **CI/CD**: GitHub Actions with comprehensive workflows
- **Static Hosting**: Deployable to any static hosting service
- **Performance**: Lighthouse monitoring and optimization

## Recent Improvements

### 🗓️ Calendar View

- **Monthly Calendar**: Calendar tab displaying working days with shift badges
- **Event Overlays**: Time-off events, public holidays, school holidays, and paydays
- **Calendar Legend**: Popover legend explaining event colors and day indicators
- **Empty State**: Helpful guidance when no schedule selected

### ⌨️ Keyboard Shortcuts

- **Navigation**: Tab switching (C/S/T/O), date navigation (arrows, Ctrl+H/J/K)
- **Quick Actions**: Settings (Ctrl+,), import (Ctrl+I), export (Ctrl+S)
- **Editing**: Delete events, cancel edits (Escape), undo/redo (Ctrl+Z/Y)
- **Discoverability**: Keyboard shortcuts modal accessible via Settings

### 📊 Vacation Statistics

- **Allowance Tracking**: Configure annual vacation in days or hours
- **Usage Analytics**: Real-time calculation of used vs. remaining vacation
- **Progress Visualization**: Interactive progress bar and breakdown table
- **Year Filtering**: Filter vacation data by year with automatic detection

### 📅 Multi-Schedule Support

- **Schedule Selection**: Choose from 5-shift, 9-5, or weekend-shift patterns
- **Schedule Switching**: Switch between schedule types at any time
- **Onboarding Wizard**: 5-step wizard with schedule, team, and vacation setup
- **Schedule-Generic Components**: All components work with any schedule type

### 🚀 Performance & UI

- **60x Faster Updates**: Live time updates every minute instead of every second
- **Component Architecture**: Reusable shared components (ShiftBadge, ShiftTimeDisplay, CountdownBadge)
- **Better Mobile**: Fixed horizontal scroll and layout overflow issues
- **Accessibility**: Semantic HTML, ARIA labels, keyboard navigation throughout

## 🤝 Contributing & Support

### 📞 Get Help & Report Issues

- **🐛 Bug Reports**: [Create an issue](https://github.com/tjorim/worktime/issues/new?template=bug_report.md)
- **💡 Feature Requests**: [Request a feature](https://github.com/tjorim/worktime/issues/new?template=feature_request.md)
- **❓ Questions & Discussion**: [GitHub Discussions](https://github.com/tjorim/worktime/discussions)

### 🛠️ Development

- **Fork the repo**: [https://github.com/tjorim/worktime](https://github.com/tjorim/worktime)
- **Submit Pull Requests**: All contributions welcome!
- **Follow the code style**: Uses OXC tools (oxlint/oxfmt) for consistent formatting

### 📬 Contact

- **Author**: [Jorim Tielemans](https://github.com/tjorim)
- **Repository**: [https://github.com/tjorim/worktime](https://github.com/tjorim/worktime)

## Browser Support

**Modern Browsers** (last 2 versions):

- Chrome/Chromium 108+
- Firefox 108+
- Safari 16+
- Edge 108+

**Requirements**:

- ES2020+ support
- Service Worker API
- localStorage API
- CSS Grid and Flexbox

## License

Apache License 2.0 - see LICENSE file for details.
