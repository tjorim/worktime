# Worktime - Shift Tracker & Time Off Management

**Created by [Jorim Tielemans](https://github.com/tjorim)**

A lightweight web application for tracking 5-team continuous (24/7) shift schedules and managing time-off with .hday files.

## Overview

Worktime helps teams working in a 5-team rotating shift system to quickly check:

- Which teams are working on any given day
- When their next shift is scheduled
- Transfer/handover points between teams
- Complete schedule overview with easy navigation

## Features

### 🕐 Current Status

- Real-time display of your team's current shift
- Next shift countdown and scheduling
- Date display in YYWW.D format (e.g., 2520.2M = year 2025, week 20, Tuesday Morning)

### 👥 Team Management

- Team selection on first visit (stored locally)
- Highlight your team across all views
- Easy team switching

### 📅 Schedule Views

- **Today**: All 5 teams' current shifts
- **Schedule**: 7-day calendar view with navigation
- **Transfers**: Find handover/takeover points between teams
- **Time Off**: Import/export .hday files for vacation and time-off tracking

### 📱 Web App Features

- **Responsive**: Mobile-first design with Bootstrap 5
- **Fast**: Optimized build with Vite
- **Local Storage**: All data stored in browser localStorage

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

## Shift Pattern

Each team follows a 10-day repeating cycle:

- **Days 1-2**: Morning shift (07:00-15:00) - Code: M
- **Days 3-4**: Evening shift (15:00-23:00) - Code: E
- **Days 5-6**: Night shift (23:00-07:00) - Code: N
- **Days 7-10**: Off days

Teams are numbered 1-5, with each team starting their cycle 2 days after the previous team.

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

- Node.js 18 or higher
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
   - Select your team when prompted
   - Start tracking your shifts!

### Building for Production

```bash
# Build the application
npm run build

# Preview the production build
npm run preview
```

The built files will be in the `dist/` directory, ready for deployment to any static hosting service.

## Configuration

### Environment Variables

Configure reference variables for shift calculations using environment variables or runtime configuration:

```bash
# Development (.env file)
VITE_REFERENCE_DATE=2025-01-06
VITE_REFERENCE_TEAM=1

# Production build
VITE_REFERENCE_DATE=2025-01-13 VITE_REFERENCE_TEAM=3 npm run build
```

### Runtime Configuration

Alternatively, configure at runtime by adding to your HTML before the main script:

```javascript
window.WORKTIME_CONFIG = {
  REFERENCE_DATE: "2025-01-06",
  REFERENCE_TEAM: 1,
};
```

These variables anchor all shift calculations to your specific schedule. If not configured, defaults to `2025-01-06` and team `1`.

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

- **Frontend**: React 19 + TypeScript
- **Build Tool**: Vite 8 beta
- **UI Framework**: React Bootstrap (Bootstrap 5 components)
- **Styling**: CSS3 with Bootstrap 5 design system

### Development Tools

- **Linting**: oxlint and oxfmt (OXC tools - ultra-fast Rust-based)
- **Testing**: Vitest + React Testing Library
- **Type Checking**: TypeScript with strict configuration
- **Hot Reload**: Vite development server with HMR

### Data & State

- **Date Handling**: Day.js with timezone and week plugins
- **Storage**: Custom localStorage hook with error handling
- **State Management**: React hooks + custom hooks
- **Icons**: PNG icons generated programmatically

### Deployment

- **CI/CD**: GitHub Actions with comprehensive workflows
- **Static Hosting**: Deployable to any static hosting service
- **Performance**: Lighthouse monitoring and optimization

## What's New in v3.1+

### 🚀 Performance & Accuracy

- **60x Faster Updates**: Live time now updates every minute instead of every second for better performance
- **Accurate Night Shifts**: Date codes now correctly show shift day (2530.5N) instead of calendar day (2530.6N)
- **Smart Timeline**: Timeline now shows next shift from tomorrow when current shift is the last of the day

### 🎨 Enhanced UI

- **Timeline Component**: Extracted shift timeline into dedicated component with cleaner design
- **Improved Layout**: Current status header optimized with better spacing and information display
- **Interactive Changelog**: In-app changelog viewer with accordion interface
- **Toast Notifications**: Global notification system for better user feedback

### 🔧 Developer Experience

- **Component Architecture**: Better separation of concerns with dedicated timeline component
- **Enhanced Testing**: Data-driven tests for better maintainability
- **Error Boundaries**: Graceful error handling and recovery
- **TypeScript**: Improved type safety and documentation

### 📱 User Experience

- **Clearer Date Display**: Shows both calendar day and shift day in tooltips for clarity
- **Contextual Information**: Enhanced date format "2530.5N • Saturday, Jul 26 • 02:24"
- **Better Performance**: Reduced re-renders and smoother interactions

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
