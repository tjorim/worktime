# `.hday` File Format Specification

A simple text-based format for tracking time off. Each line represents a single event or recurring pattern.

## Basic Syntax

```
[flags]<date-pattern> [# comment]
```

## Date Patterns

**Single or Range:**

```
YYYY/MM/DD               # Single day
YYYY/MM/DD-YYYY/MM/DD    # Date range (inclusive)
```

**Weekly Recurring:**

```
d<1-7>    # Recurring every week on specific day (ISO weekday: 1=Monday, 7=Sunday)
```

## Prefix Flags

Flags modify the type or timing of an event. You can combine one time/location flag with one type flag.

### Time/Location Flags (Mutually Exclusive)

Only one of these flags can be used at a time:

- `a` - Half day **morning/AM** off
- `p` - Half day a**fternoon/PM** off
- `w` - Onsite support (outside usual location)
- `n` - **N**ot able to fly
- `f` - In principle able to **f**ly, to be aligned

**Note:** If multiple time/location flags are present in the input (e.g., `ap`), only the **first one** is kept. The list order above does NOT imply priority.

### Type Flags (Mutually Exclusive)

Only one of these flags can be used at a time:

- `b` - **Business** trip / out for work
- `e` - Week**e**nd
- `h` - Birthday / **h**oliday event
- `i` - **I**ll / sick leave
- `k` - In office (override - mar**k**s presence)
- `s` - Training / cour**se**
- `u` - Other / **u**nspecified
- _(no flag)_ - Regular vacation/holiday

**Note:** If multiple type flags are present in the input (e.g., `sb`), only the **first one** is kept. The list order above does NOT imply priority.

## Flag Combinations

Flags can be combined by concatenating them. The most common pattern is:

> **[type][time/location]**

Where:

- **type**: One of `b` (business), `s` (training), `k` (in office), `e` (weekend), `h` (birthday), `i` (ill), `u` (other), or none (vacation/holiday)
- **time/location**: One of `a` (AM), `p` (PM), `w` (onsite), `n` (not able to fly), or `f` (able to fly)

**Important:** Only one time or location flag (`a`, `p`, `w`, `n`, `f`) may be used per event. Combinations like `aw`, `pa`, `an`, `pw`, etc. are **not permitted**.

### Common Flag Combinations

| Flags    | Meaning                        | Display Color                    |
| -------- | ------------------------------ | -------------------------------- |
| _(none)_ | Regular vacation/holiday       | Red (#EC0000)                    |
| `a`      | Half day AM off                | Pink with `,` (#FF8A8A)          |
| `p`      | Half day PM off                | Pink with `'` (#FF8A8A)          |
| `b`      | Business trip (full day)       | Orange (#FF9500)                 |
| `ba`     | Business trip, half day AM     | Light Orange with `,` (#FFC04D)  |
| `bp`     | Business trip, half day PM     | Light Orange with `'` (#FFC04D)  |
| `bw`     | Business trip, onsite          | Orange (#FF9500)                 |
| `bn`     | Business trip, not able to fly | Orange (#FF9500)                 |
| `bf`     | Business trip, able to fly     | Orange (#FF9500)                 |
| `s`      | Training/course (full day)     | Dark Yellow/Gold (#D9AD00)       |
| `sa`     | Training, half day AM          | Light Yellow with `,` (#F0D04D)  |
| `sp`     | Training, half day PM          | Light Yellow with `'` (#F0D04D)  |
| `sw`     | Training, onsite               | Dark Yellow/Gold (#D9AD00)       |
| `sn`     | Training, not able to fly      | Dark Yellow/Gold (#D9AD00)       |
| `sf`     | Training, able to fly          | Dark Yellow/Gold (#D9AD00)       |
| `k`      | In office                      | Teal (#008899)                   |
| `ka`     | In office, half day AM         | Light Teal with `,` (#00B8CC)    |
| `kp`     | In office, half day PM         | Light Teal with `'` (#00B8CC)    |
| `kw`     | In office, onsite              | Teal (#008899)                   |
| `kn`     | In office, not able to fly     | Teal (#008899)                   |
| `kf`     | In office, able to fly         | Teal (#008899)                   |
| `e`      | Weekend                        | Dark Magenta (#990099)           |
| `ea`     | Weekend, half day AM           | Light Magenta with `,` (#CC66CC) |
| `ep`     | Weekend, half day PM           | Light Magenta with `'` (#CC66CC) |
| `ew`     | Weekend, onsite                | Dark Magenta (#990099)           |
| `en`     | Weekend, not able to fly       | Dark Magenta (#990099)           |
| `ef`     | Weekend, able to fly           | Dark Magenta (#990099)           |
| `h`      | Birthday                       | Dark Blue (#0000CC)              |
| `ha`     | Birthday, half day AM          | Light Blue with `,` (#6666FF)    |
| `hp`     | Birthday, half day PM          | Light Blue with `'` (#6666FF)    |
| `hw`     | Birthday, onsite               | Dark Blue (#0000CC)              |
| `hn`     | Birthday, not able to fly      | Dark Blue (#0000CC)              |
| `hf`     | Birthday, able to fly          | Dark Blue (#0000CC)              |
| `i`      | Ill/sick leave                 | Dark Olive (#336600)             |
| `ia`     | Ill, half day AM               | Light Olive with `,` (#669933)   |
| `ip`     | Ill, half day PM               | Light Olive with `'` (#669933)   |
| `iw`     | Ill, onsite                    | Dark Olive (#336600)             |
| `in`     | Ill, not able to fly           | Dark Olive (#336600)             |
| `if`     | Ill, able to fly               | Dark Olive (#336600)             |
| `u`      | Other/unspecified              | Slate Gray (#6C757D)              |
| `ua`     | Other, half day AM             | Light Cyan with `,` (#4DB8B8)    |
| `up`     | Other, half day PM             | Light Cyan with `'` (#4DB8B8)    |
| `uw`     | Other, onsite                  | Slate Gray (#6C757D)              |
| `un`     | Other, not able to fly         | Slate Gray (#6C757D)              |
| `uf`     | Other, able to fly             | Slate Gray (#6C757D)              |
| `w`      | Onsite support (no type)       | Red (#EC0000)                    |
| `n`      | Not able to fly (no type)      | Red (#EC0000)                    |
| `f`      | Able to fly (no type)          | Red (#EC0000)                    |

## Comments and Metadata

```
# Comment         # Line starting with # is ignored
r Release info   # Line starting with 'r' is a metadata line (release tag from tools)
```

## Keyword Detection (for automated calendar export tools)

Legacy Outlook integration detected event types by calendar subject keywords:

- **Vacation/Holiday** (no flag): "VAKANTIE", "VACATION", "HOLIDAY"
- **Training** (`s` flag): "CURSUS", "TRAINING", "COURSE"
- **Business** (`b` flag): Default for out-of-office without above keywords
- **Private** appointments: Subject replaced with "Private" text

## Complete Examples

```hday
# Regular vacation
2024/12/23-2025/01/05 # Christmas vacation
2024/08/05-2024/08/11 # Summer vacation week 1

# Half days
p2024/03/26-2024/03/26 # Half day PM off
a2024/05/15-2024/05/15 # Half day AM off



# Business trips
b2024/06/10-2024/06/12 # Business trip
bp2024/09/15-2024/09/15 # Business trip, back at half day PM
bw2024/10/01-2024/10/01 # Business trip, onsite

# Training
s2024/04/08-2024/04/08 # Training course
sa2024/03/12-2024/03/12 # Training in morning only

# In office (override for presence)
k2024/07/01-2024/07/01 # In office despite vacation period
kp2024/03/20-2024/03/20 # In office, leaving at noon

# Weekend events
e2024/06/15-2024/06/16 # Weekend work event
ep2024/03/08-2024/03/08 # Weekend afternoon shift

# Birthday
h2024/05/20-2024/05/20 # Birthday

# Sick leave
i2024/02/10-2024/02/12 # Sick leave
ia2024/03/05-2024/03/05 # Sick in morning, recovered PM

# Other/unspecified
u2024/04/22-2024/04/22 # Personal day
ua2024/09/30-2024/09/30 # Appointment in morning



# Weekly recurring (ISO weekday: 1=Mon, 7=Sun)
d1 # Every Monday off
d5 # Every Friday off
d3p # Every Wednesday afternoon off
d2bw # Every Tuesday business trip onsite

# Metadata
r Generated by: holidaytool V1.0RC7
```

## Display Color Reference

When rendered in team overview pages (in Worktime the light and dark values are defined once in `frontend/src/styles/_variables.scss`; this table documents the light ones):

| Color            | Hex     | Meaning                           |
| ---------------- | ------- | --------------------------------- |
| Red              | #EC0000 | Off work / vacation               |
| Pink             | #FF8A8A | Half day off (`,` = AM, `'` = PM) |
| Orange           | #FF9500 | Business trip                     |
| Light Orange     | #FFC04D | Half day business                 |
| Dark Yellow/Gold | #D9AD00 | Training / course                 |
| Light Yellow     | #F0D04D | Half day training                 |
| Teal             | #008899 | In office                         |
| Light Teal       | #00B8CC | Half day in office                |
| Dark Magenta     | #990099 | Weekend event                     |
| Light Magenta    | #CC66CC | Half day weekend                  |
| Dark Blue        | #0000CC | Birthday                          |
| Light Blue       | #6666FF | Half day birthday                 |
| Dark Olive       | #336600 | Ill / sick leave                  |
| Light Olive      | #669933 | Half day ill                      |
| Slate Gray       | #6C757D | Other / unspecified               |
| Light Gray       | #ADB5BD | Half day other                    |
| Brown            | #8B5A2B | Weekly recurring day off          |
| Light Brown      | #C9A27A | Half day weekly recurring         |
| Gray             | #AAAAAA | Weekend day (calendar background) |
| Light Blue (bg)  | #AAAAFF | Official holiday (CR day)         |
| Light Green      | #BBFFBB | In during school vacation         |
| Green            | #90EE90 | Regular work day / "today" marker |

**Note:** Weekly recurring events (regular weekly day off) use the same color scheme based on their flags (business/course/in). With no type flag they use Brown rather than the vacation Red, so a standing day off is distinguishable from booked leave.

**Note:** "Other / unspecified" was Slate Gray (#6C757D) in the legacy planner, which is indistinguishable from In office (Teal #008899) side by side, so Worktime shows it as Slate Gray. In dark mode the same hues are used at adjusted lightness (see `_shifts.scss`).

## Special Symbols (in team overviews)

- `,` (comma) = Half day AM indicator
- `'` (apostrophe) = Half day PM indicator
- `.` (dot) = Today marker
- `C` = Onsite support outside VHV
- `N` = Not able to fly
- `F` = In principle able to fly, to be aligned

## Compatibility with Legacy Systems

The `.hday` format maintains compatibility with legacy ASML holiday overview systems:

- Prefix flags (`a`, `p`, `b`, `e`, `h`, `i`, `k`, `s`, `u`, `w`, `n`, `f`) are preserved
- Date ranges use the same format: `[flags]YYYY/MM/DD-YYYY/MM/DD`
- Weekly recurring patterns use ISO weekday: `dN[flags]` where N is 1-7 (Mon-Sun)
- Optional `# title` comments are supported
- Existing overview pages continue working since files and structure remain unchanged
