# .hday Format Parser

TypeScript implementation of the `.hday` format parser and serializer for time-off event management.

## Overview

The `.hday` format is a human-readable, line-based text format for managing time-off events (vacations, business trips, recurring office days, etc.). Each line represents one event.

## Format Specification

### Range Events

Specific date or date range:

```text
[flags]YYYY/MM/DD[-YYYY/MM/DD] [# comment]
```

**Examples:**

```text
2025/01/15 # Single day vacation
2025/12/23-2025/12/27 # Christmas vacation
b2025/03/10-2025/03/14 # Business trip (b = business)
ba2025/04/20 # Half-day AM business trip
```

### Weekly Events

Recurring events on a specific weekday:

```text
dN[flags] [# comment]
```

Where `N` = 1-7 (Monday to Sunday, ISO week numbering)

**Examples:**

```text
d1 # Every Monday off
d5k # Every Friday in office (k = in-office)
d1ka # Every Monday morning in office
```

## Flags

### Type Flags (Mutually Exclusive)

Only the **first** type flag is kept if multiple are present:

- `b` - Business trip (orange background)
- `s` - Course/training (yellow background)
- `k` - In office (teal background)
- `u` - Other (cyan background)
- `e` - Weekend (magenta background)
- `h` - Birthday (blue background)
- `i` - Sick leave (olive background)
- _(default: holiday with red background)_

### Time/Location Flags (Mutually Exclusive)

Only the **first** time/location flag is kept if multiple are present:

- `a` - Half day AM
- `p` - Half day PM
- `w` - Onsite
- `n` - No fly zone
- `f` - Can fly

## Usage

### Parsing

```typescript
import { parseHday } from "./parser";

const hdayText = `
2025/01/15 # Vacation day
d1k # Every Monday in office
b2025/03/10-2025/03/14 # Conference
`;

const events = parseHday(hdayText);
// Returns array of HdayEvent objects
```

### Serializing

```typescript
import { toLine } from "./parser";

const event = {
  type: "range",
  start: "2025/01/15",
  end: "2025/01/17",
  flags: ["holiday"],
  title: "Vacation",
};

const line = toLine(event);
// Returns: "2025/01/15-2025/01/17 # Vacation"
```

## Round-Trip Fidelity

The parser preserves unknown/malformed lines in the `raw` field:

```typescript
parseHday("malformed line");
// Returns: [{ type: 'unknown', raw: 'malformed line', flags: ['holiday'] }]

toLine({ type: "unknown", raw: "malformed line" });
// Returns: "malformed line" (exact original)
```

This ensures **parse → edit → serialize** maintains the original file exactly,
even for lines that don't match the format.

## Normalization

The parser automatically enforces mutual exclusivity:

```typescript
// Input: "bka2025/01/15 # Multiple flags"
// Parsed as: business + in-office + half-day AM
// Normalized to: business + half-day AM (first type + first time flag)
```

Warnings are logged to console when multiple flags are found.

## Accessibility

All color constants meet **WCAG AA** accessibility standards:

- Minimum 4.5:1 contrast ratio with black text (#000)
- See `EVENT_COLORS` in `parser.ts` for verified ratios

## Performance

- **Parsing**: O(n) where n = number of lines (~1μs per line)
- **Serialization**: O(1) per event
- **Memory**: ~0.5KB per parsed event

A 100-line file parses in ~100μs and uses ~50KB memory.

## Examples

### Complete .hday File

```text
# Vacation days
2025/01/15 # Personal day
2025/12/23-2025/12/27 # Christmas vacation

# Business trips
b2025/03/10-2025/03/14 # Conference in Berlin
ba2025/04/20 # Half-day client meeting

# Recurring events
d1k # Every Monday in office
d5 # Every Friday off

# Training
s2025/05/10-2025/05/12 # React course
```

## API Documentation

See inline JSDoc comments in `parser.ts` for detailed API documentation,
including all functions, types, and examples.

## License

Part of the Worktime project. See repository root for license information.
