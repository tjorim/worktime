# Project Alignment: HdayPlanner ↔ NextShift

This document compares HdayPlanner and NextShift projects to identify what each does well, with detailed implementation guidance for adopting patterns from one project to the other.

---

## Overview

### NextShift

- **Purpose**: Team shift tracker PWA for 5-team continuous (24/7) schedules
- **Architecture**: Single-repo React PWA with offline support
- **Tech Stack**: React 19, Vite, Biome, Vitest, Bootstrap 5, React-Bootstrap
- **Deployment**: GitHub Pages

### HdayPlanner

- **Purpose**: Holiday/vacation tracking system based on `.hday` text file format
- **Architecture**: Multi-component (Frontend + Backend + Analysis Scripts)
- **Tech Stack**: React 18, Vite, Biome, Vitest, FastAPI (Python backend)
- **Deployment**: Frontend to GitHub Pages, optional backend deployment

---

## HdayPlanner Strengths - Deep Dive

### 1. 🌟🌟🌟 Dual-Mode Architecture (Highest Priority)

**What HdayPlanner Does:**

- Frontend works 100% standalone (client-side only) OR with optional backend
- Controlled by single environment variable: `VITE_USE_BACKEND=true/false`
- Same codebase supports both modes without code duplication
- **Perfect for corporate environments** where backend deployment requires approval/infrastructure

**Why This Matters:**

- **Deployment flexibility**: Deploy static files to GitHub Pages/Netlify without any server
- **Corporate-friendly**: Many enterprises restrict backend services but allow static hosting
- **Faster time-to-value**: Users can start immediately without waiting for backend approval
- **Fallback option**: If backend goes down, users can still work offline

**Implementation Pattern:**

```typescript
// In API client
const USE_BACKEND = import.meta.env.VITE_USE_BACKEND === "true";

async function loadData(username: string) {
  if (USE_BACKEND) {
    // Backend mode: Fetch from API
    const response = await fetch(`/api/data/${username}`);
    return response.json();
  } else {
    // Standalone mode: Load from file upload or localStorage
    return loadFromLocalStorage();
  }
}
```

**Recommendation for NextShift:**

- **If applicable**: Consider if NextShift could benefit from standalone mode
- **If backend required**: Could you provide a "demo mode" or "local-only mode" for quick starts?
- **Decision criteria**: Does your app require server-side processing, or could all logic run client-side?

---

### 2. 📝 Git-Friendly File Format

**What HdayPlanner Does:**

- Uses simple `.hday` text format (one event per line)
- Human-readable and editable in any text editor
- Perfect for version control (meaningful diffs)
- Comprehensive format specification in `docs/hday-format-spec.md`

**Example `.hday` File:**

```hday
2024/12/23-2025/01/05 # Christmas vacation
p2024/03/26-2024/03/26 # Half day PM off
b2024/06/10-2024/06/12 # Business trip
d1 # Every Monday off
```

**Why This Matters:**

- Users can edit files directly without the app
- Version control shows clear diffs
- Easy to script/automate
- No vendor lock-in to proprietary format

**Recommendation for NextShift:**

- [ ] Add a human-readable export format (not just JSON)
- [ ] Support text-based configuration format for user preferences
- [ ] Document the format specification for transparency
- [ ] Enable version control workflows for team schedules

---

### 3. ♿ Accessibility-First Design

**What HdayPlanner Does:**

- **WCAG AA compliant** colors (4.5:1 contrast ratio minimum)
- **Robust focus trap** in dialogs (filters disabled/hidden elements)
- **Full keyboard navigation** with roving tabindex
- **Comprehensive ARIA** labels and semantic HTML
- **Keyboard shortcuts**: Ctrl+S, Ctrl+N, Delete, Escape, etc.

**Implementation Example:**

```typescript
// Focus trap that handles disabled/hidden elements
function useFocusTrap(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const focusableElements = ref.current?.querySelectorAll(
      "button:not([disabled]), [href], input:not([disabled]), ...",
    );
    // Filter out hidden elements
    const visible = Array.from(focusableElements).filter((el) => el.offsetParent !== null);
    // Handle Tab/Shift+Tab with wrapping
  }, [ref]);
}
```

**Why This Matters:**

- Legal compliance (ADA, WCAG)
- Better UX for everyone (keyboard power users love shortcuts)
- Corporate requirement for enterprise software
- Demonstrates professional quality

**Recommendation for NextShift:**

- [ ] Audit color contrast meets WCAG AA (use browser DevTools)
- [ ] Ensure all interactive elements keyboard accessible
- [ ] Implement focus management in modals/dialogs
- [ ] Add ARIA labels on non-obvious controls
- [ ] Document keyboard shortcuts

---

### 4. 🏗️ Clean Backend Architecture

**What HdayPlanner Does:**

- **Modular structure**: Separate modules for auth, audit, hday parsing, graph sync
- **Audit logging built-in**: NDJSON format for compliance tracking
- **Authentication stubs ready**: Easy to swap in Azure AD, Auth0, Keycloak
- **Configuration via environment variables**: No hardcoded values
- **CORS properly configured**: Different for dev/prod

**Directory Structure:**

```text
backend/app/
├── main.py           # FastAPI entry point
├── config.py         # Environment-based configuration
├── hday/             # Domain logic (parsing, serialization)
├── auth/             # Authentication (stub ready for JWT)
├── audit/            # Compliance logging (NDJSON)
└── graph/            # External integration stub (MS Graph)
```

**Audit Log Example:**

```json
{
  "ts": "2025-12-19T20:10:00.123Z",
  "user": "alice",
  "target": "bob.hday",
  "action": "write",
  "details": "Updated 2 events"
}
```

**Why This Matters:**

- **Compliance**: Audit logs required for many corporate environments
- **Extensibility**: Auth stubs make enterprise integration straightforward
- **Testability**: Modular structure is easy to mock/test
- **Maintainability**: Clear separation of concerns

**Recommendation for NextShift:**
If NextShift adds a backend:

- [ ] Add audit logging for sensitive operations
- [ ] Create auth stubs/interfaces for easy integration
- [ ] Document expected environment variables
- [ ] Separate domain logic from API routes

---

### 5. 📦 Minimal Dependencies

**What HdayPlanner Does:**

- Frontend: React + Vite only (no UI library, no state management library)
- No Redux, no Zustand, no MUI - just React's `useState`
- Custom components for everything (dialogs, toasts, calendar)
- Bundle size monitored (configurable threshold in CI)

**Frontend Dependencies:**

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}
```

That's it. Just 2 production dependencies.

**Why This Matters:**

- **Smaller bundle**: Faster load times, better mobile experience
- **Fewer vulnerabilities**: Less attack surface from dependencies
- **Longer lifespan**: Fewer breaking changes from updates
- **Better learning**: Team learns React fundamentals, not library-specific APIs

**Comparison with NextShift:**
NextShift uses Bootstrap 5 and React-Bootstrap, which is a valid tradeoff for rapid development. HdayPlanner chose custom components for full control.

**Recommendation for NextShift:**

- [ ] Audit unused dependencies (`npm ls` or `depcheck`)
- [ ] Consider if heavy libraries are necessary
- [ ] Document why each major dependency is needed
- [ ] Set bundle size budgets in CI

---

### 6. 🧪 Test Organization

**What HdayPlanner Does:**

- Tests in separate `tests/` folder (industry standard)
- Clear separation: `src/` for code, `tests/` for tests
- Import paths use `../src/lib/` prefix
- 126 tests all passing, focused on domain logic

**Structure:**

```text
frontend/
├── src/
│   ├── lib/
│   │   └── hday.ts          # Parser implementation
│   └── components/
│       └── MonthGrid.tsx    # Component
└── tests/
    ├── hday.test.ts         # Parser tests
    └── MonthGrid.test.tsx   # Component tests
```

**Why This Matters:**

- **Industry standard**: Follows convention from many major projects
- **Cleaner imports**: Test files don't clutter `src/` in IDE
- **Easier to exclude**: Build/deploy tools can ignore `tests/` easily
- **Better organization**: Clear mental model of production vs test code

**Recommendation for NextShift:**
If tests are currently in `src/`:

- [ ] Move to `tests/` folder
- [ ] Update tsconfig.json to include tests
- [ ] Update import paths in tests
- [ ] Update .gitignore and build configs if needed

---

### 7. 📖 Comprehensive Documentation

**What HdayPlanner Does:**

- `docs/hday-format-spec.md` - Complete file format specification with examples
- `docs/project-alignment.md` - Comparison with other projects (this document)
- `docs/alignment-summary.md` - Implementation metrics
- `CLAUDE.md` - AI assistant guidance (high-level architecture)
- README with clear deployment options

**Format Spec Quality:**

- Every flag documented with examples
- Color codes with hex values
- Parsing rules explained (XOR half-day logic, etc.)
- Compatibility notes with legacy systems

**Why This Matters:**

- **Onboarding**: New developers understand system faster
- **Maintenance**: Future you thanks past you for documentation
- **Trust**: Users trust well-documented systems
- **Automation**: Other tools can integrate using spec

**Recommendation for NextShift:**

- [ ] Create architecture decision records (ADRs) for major choices
- [ ] Document data formats/APIs comprehensively
- [ ] Add CLAUDE.md or similar for AI assistants
- [ ] Include deployment guide with troubleshooting

---

### 8. 🔧 Configurable CI Thresholds (NEW)

**What HdayPlanner Does:**

- Bundle size threshold configurable via GitHub repository variable
- Falls back to sensible default (500KB) if not set
- Allows per-repo customization without editing workflows

**Implementation:**

```yaml
env:
  MAX_BUNDLE_SIZE_KB: ${{ vars.MAX_BUNDLE_SIZE_KB || '500' }}
```

**Why This Matters:**

- **Flexibility**: Different projects have different needs
- **No workflow edits**: Adjust threshold via GitHub UI
- **Reusable workflows**: Same workflow file works for multiple projects

**Recommendation for NextShift:**
Look for hardcoded values in workflows:

- [ ] Bundle size thresholds
- [ ] Test timeout values
- [ ] Performance budgets
- [ ] Coverage percentage requirements

---

### 9. 📊 Test Coverage Reporting (NEW)

**What HdayPlanner Does:**

- Added `npm run test:coverage` script
- Vitest configured with v8 coverage provider
- Multiple output formats: text, JSON, HTML, lcov
- Coverage reports excluded from git

**Configuration:**

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html', 'lcov'],
  exclude: ['node_modules/', 'tests/', '**/*.test.ts', ...]
}
```

**Why This Matters:**

- **Visibility**: See which code is tested
- **Quality gate**: Can fail CI if coverage drops
- **Trend tracking**: Watch coverage over time
- **Find gaps**: Identify untested critical paths

**Recommendation for NextShift:**
**NextShift doesn't have coverage reporting yet** - this would be valuable to add:

- [ ] Add coverage configuration to Vitest
- [ ] Add `test:coverage` script
- [ ] Consider uploading to Codecov/Coveralls
- [ ] Add coverage badge to README

---

## NextShift Strengths

### 1. ⭐⭐⭐ GitHub Automation (IMPLEMENTED in HdayPlanner)

NextShift has comprehensive CI/CD workflows:

- ✅ Dependabot configuration with smart grouping
- ✅ Multiple workflows (CI, deploy, lint, PR validation, dependency checks, Lighthouse)
- ✅ Issue templates (bug report, feature request, question)
- ✅ CODEOWNERS file
- ✅ Reusable composite actions

**Status**: ✅ **IMPLEMENTED** - HdayPlanner now has all these features as of PR #32.

---

### 2. ⭐⭐⭐ Code Quality Tools (IMPLEMENTED in HdayPlanner)

NextShift uses Biome for modern linting and formatting:

- Fast, all-in-one tool (replaces ESLint + Prettier)
- Strict TypeScript rules
- Consistent code style enforcement

**Status**: ✅ **IMPLEMENTED** - HdayPlanner now uses Biome with matching configuration.

---

### 3. ⭐⭐ TypeScript Configuration (IMPLEMENTED in HdayPlanner)

NextShift has modular TypeScript configuration:

- Split configs: app, node, test
- Stricter type checking (noUnusedLocals, noUncheckedIndexedAccess)
- Better build optimization with tsBuildInfo

**Status**: ✅ **IMPLEMENTED** - HdayPlanner now has split tsconfig files.

---

### 4. ⭐⭐ PWA Features

NextShift is a full PWA:

- Service worker for offline support
- Manifest for installability
- Lighthouse CI for performance monitoring

**Recommendation for HdayPlanner**: Consider adding PWA features since it's designed for offline-first usage anyway.

---

### 5. ⭐ Modern React Version

NextShift uses:

- React 19 (latest)
- More recent ecosystem libraries

**Status**: HdayPlanner uses React 18, which is sufficient for current needs. React 19 can be considered for future upgrade.

---

## Top 3 Recommendations for NextShift

Based on impact vs. effort:

### 1. **Test Coverage Reporting** ⭐⭐⭐⭐⭐

- **Impact**: High (visibility into code quality)
- **Effort**: Low (just configuration)
- **Action**: Add Vitest coverage config like HdayPlanner just did
- **When**: ASAP (quick win)

### 2. **Accessibility Audit** ⭐⭐⭐⭐

- **Impact**: High (legal compliance + better UX)
- **Effort**: Medium (review and fix incrementally)
- **Action**: Audit WCAG AA compliance, keyboard nav, focus management
- **When**: ASAP (accessibility is table stakes for enterprise)

### 3. **Dual-Mode Architecture** ⭐⭐⭐⭐⭐ (if applicable)

- **Impact**: Very High (massive deployment flexibility)
- **Effort**: High (requires refactoring)
- **Action**: Evaluate if NextShift could work standalone without backend
- **When**: If NextShift could benefit from offline/standalone mode

---

## Architecture Comparison

### Deployment Strategy

**NextShift**:

```text
Single Repo → GitHub Actions CI/CD → GitHub Pages
```

**HdayPlanner**:

```text
Frontend → GitHub Actions → GitHub Pages (standalone mode)
Backend → Manual deployment → Corporate server (optional)
Scripts → Local execution → Analysis
```

**Winner**: **HdayPlanner** for flexibility in corporate environments.

---

### State Management

**NextShift**:

- React Context and useState
- Bootstrap for UI components
- Local storage for persistence

**HdayPlanner**:

- React hooks and useState
- Custom components (no UI library)
- Dual storage: local + optional API

**Winner**: Tie - different approaches for different use cases.

---

### Testing

Both projects:

- ✅ Use Vitest with JSDOM
- ✅ Use @testing-library/react
- ✅ Have good test coverage
- ✅ Run tests in CI

**Difference**: HdayPlanner now has coverage reporting configured.

---

## Questions for NextShift Evaluation

To determine which patterns apply to NextShift:

1. **Does NextShift require a backend, or could it work standalone?**
   - If standalone is possible → Implement dual-mode architecture
   - If backend is essential → Focus on other patterns

2. **What file formats does NextShift use?**
   - Binary/proprietary → Consider adding text export
   - Already text-based → Document the format

3. **Has NextShift been audited for accessibility?**
   - No → High priority to implement
   - Yes → Verify WCAG AA compliance

4. **How many production dependencies does NextShift have?**
   - > 20 → Review for unused/consolidatable libs
   - <10 → Already minimal, maintain this discipline

5. **Where are test files located?**
   - In `src/` → Consider moving to `tests/`
   - Already separate → Good, maintain structure

6. **Does NextShift have test coverage reporting?**
   - No → Add it (quick win, high value)
   - Yes → Ensure it's visible in CI/README

---

## Summary

### HdayPlanner's Unique Strengths

- ✅ **Dual-mode architecture** (standalone + optional backend)
- ✅ **Git-friendly .hday file format** with comprehensive documentation
- ✅ **Corporate-friendly** deployment model
- ✅ **Minimal dependencies** (2 production deps)
- ✅ **Accessibility-first** design (WCAG AA)
- ✅ **Clean backend architecture** with audit logging
- ✅ **Multi-language tooling** (Python + TypeScript)
- ✅ **Test organization** in separate folder
- ✅ **Comprehensive documentation**

### Improvements Applied from NextShift (PR #32)

- ✅ Modern CI/CD workflows
- ✅ Biome linting and formatting
- ✅ Stricter TypeScript configuration
- ✅ Comprehensive issue templates
- ✅ Automated dependency monitoring
- ✅ Configurable CI thresholds
- ✅ Test coverage reporting

### Next Steps for NextShift

1. **Add test coverage reporting** (quick win)
2. **Audit accessibility** (high priority)
3. **Evaluate dual-mode architecture** (if applicable)
4. **Add text export format** (for version control)
5. **Document architecture decisions** (ADRs or similar)

Both projects now share similar DevOps practices while maintaining their unique architectural advantages. 🎉

---

**Last Updated**: 2025-12-21
**Status**: HdayPlanner aligned with NextShift DevOps practices + identified bidirectional improvement opportunities
