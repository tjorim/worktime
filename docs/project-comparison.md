# Project Comparison: HdayPlanner vs NextShift

This document tracks the differences between HdayPlanner and NextShift, along with planned improvements for both projects.

## Current Differences

### Tooling

| Aspect          | HdayPlanner                  | NextShift           |
| --------------- | ---------------------------- | ------------------- |
| **Linter**      | Oxlint 1.34.0                | Biome 2.3.10        |
| **Formatter**   | Oxfmt 0.19.0                 | Biome 2.3.10        |
| **Bundler**     | Vite 8.0.0-beta.4 + Rolldown | Vite 7.3.0 + Rollup |
| **TypeScript**  | 5.6.2                        | 5.9.3               |
| **React**       | 18.2.0                       | 19.2.3              |
| **Test Runner** | Vitest 4.0.16                | Vitest 4.0.15       |
| **DOM Testing** | happy-dom 20.0.11            | happy-dom 20.0.11   |

### Build Configuration

#### HdayPlanner

- Minimal Vite config
- No build optimizations
- Using bleeding-edge Rust toolchain (Oxc ecosystem)
- Faster development experience (Rolldown is 5-10x faster)

#### NextShift

- Extensive production optimizations:
  - Terser minification with console.log stripping
  - LightningCSS transformer
  - Manual chunk splitting (vendor-react, vendor-ui, vendor-utils)
  - Better asset organization (js/, css/ subdirectories)
  - Bundle analyzer support (`npm run analyze`)
- PWA configuration with service workers
- Offline support and app shortcuts

### GitHub Actions

#### HdayPlanner

```yaml
- Install dependencies
- Lint code # ✓ Added
- Run tests
- Build
- Deploy
```

#### NextShift

```yaml
- Install dependencies
- Lint code
- Run tests
- Build
- Deploy
```

Both now have identical quality gates before deployment.

### Project Structure

| Aspect          | HdayPlanner                    | NextShift         |
| --------------- | ------------------------------ | ----------------- |
| **Structure**   | Monorepo (frontend/, backend/) | Flat (root-level) |
| **Deploy Path** | frontend/dist → \_site         | dist → \_site     |
| **Base Path**   | /HdayPlanner/                  | /NextShift/       |

## Planned Improvements for HdayPlanner

### High Priority

- [ ] Consider downgrading from Vite 8 beta to Vite 7 stable (remove `.npmrc` workaround)
- [ ] Evaluate if Rolldown is production-ready or if we should wait for stable release

### Medium Priority

- [ ] Add production build optimizations from NextShift:
  - Terser minification with console stripping
  - Manual vendor chunk splitting
  - Better asset organization
- [ ] Upgrade React 18 → 19 (breaking changes to review)
- [ ] Consider adding PWA support if offline functionality is needed

### Low Priority

- [ ] Add bundle analyzer script for build size monitoring
- [x] ~~Consider switching from jsdom to happy-dom (performance)~~ - Completed 2025-12-22

## Planned Improvements for NextShift

### High Priority

- [ ] **Migrate to Oxc toolchain** (oxlint + oxfmt)
  - Benefits: 10-100x faster than Biome/ESLint
  - Built in Rust, same ecosystem as Rolldown
  - Better performance for large codebases
  - Replace Biome completely

### Medium Priority

- [ ] **Upgrade to Vite 8 + Rolldown** (when stable)
  - 5-10x faster builds
  - Better tree-shaking
  - Smaller bundle sizes
  - Wait for stable release (currently beta)
  - Will need `.npmrc` workaround initially

### Low Priority

- [ ] Consider TypeScript version alignment

## Why HdayPlanner Uses Cutting-Edge Tools

HdayPlanner is intentionally using bleeding-edge tooling as an experimental project:

1. **Oxc Ecosystem**: Next-generation Rust-based toolchain
   - Oxlint: Fast linting (10-100x faster than ESLint)
   - Oxfmt: Fast formatting (compatible with Prettier)
   - Future: Oxc will have full TypeScript support

2. **Vite 8 + Rolldown**: Next-generation bundler
   - Written in Rust (5-10x faster than Rollup)
   - Better tree-shaking and smaller bundles
   - Currently beta, but stable enough for experimentation

3. **Trade-offs**:
   - Requires `legacy-peer-deps` workaround temporarily
   - Less mature ecosystem
   - Potential breaking changes
   - Benefits: Significantly faster development experience

## Migration Path: NextShift → Oxc Toolchain

When ready to migrate NextShift from Biome to Oxc:

### Step 1: Install Oxc tools

```bash
npm install -D oxlint oxfmt
npm uninstall @biomejs/biome
```

### Step 2: Update package.json scripts

```json
{
  "lint": "oxlint",
  "format": "oxfmt ."
}
```

### Step 3: Remove biome.json, create oxlintrc.json if needed

Oxlint has sensible defaults, minimal config needed.

### Step 4: Update GitHub Actions workflows

Replace `biome check` with `npm run lint`.

### Step 5: Test thoroughly

Run full test suite and validate all linting rules still apply.

## Decision Log

### 2025-12-22: Added lint step to HdayPlanner deploy workflow

- **Reason**: Prevent deploying code with linting errors
- **Impact**: Matches NextShift's quality gates
- **Trade-off**: Slightly longer CI time, but catches issues earlier

### 2025-12-22: Added base path to vite.config.ts

- **Reason**: Fix 404 errors on GitHub Pages subdirectory deployment
- **Impact**: Assets now load correctly from `/HdayPlanner/assets/*`
- **Trade-off**: None, this was a required fix

### 2025-12-22: Migrated from jsdom to happy-dom

- **Reason**: Align with bleeding-edge tooling philosophy, reduce dependency weight
- **Impact**: Removed 52 packages, added only 13 (net -39), faster test environment
- **Performance**: All 184 tests pass, test duration 1.42s (comparable to jsdom)
- **Trade-off**: happy-dom has some edge cases with fireEvent, but none encountered in our tests

## Notes

- Both projects successfully deploy to GitHub Pages subdirectories
- Both use GitHub Actions with similar workflows
- HdayPlanner is more experimental, NextShift is more production-focused
- Consider consolidating tooling choices once Vite 8 + Rolldown are stable
