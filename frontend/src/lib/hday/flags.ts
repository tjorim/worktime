import type { EventFlag, TimeLocationFlag, TypeFlag } from "./types";

export const TYPE_FLAGS = [
  "business",
  "weekend",
  "birthday",
  "ill",
  "course",
  "in",
  "other",
] as const satisfies readonly Exclude<TypeFlag, "holiday">[];

export const TIME_LOCATION_FLAGS = [
  "half_am",
  "half_pm",
  "onsite",
  "no_fly",
  "can_fly",
] as const satisfies readonly TimeLocationFlag[];

const TYPE_FLAGS_SET = new Set<string>(TYPE_FLAGS);

export function hasHalfDayFlag(flags?: ReadonlyArray<EventFlag>): boolean {
  if (!flags) {
    return false;
  }
  return flags.includes("half_am") !== flags.includes("half_pm");
}

export function getPrimaryTypeFlag(flags?: ReadonlyArray<EventFlag>): TypeFlag {
  if (!flags) {
    return "holiday";
  }

  for (const flag of TYPE_FLAGS) {
    if (flags.includes(flag)) {
      return flag;
    }
  }

  return "holiday";
}

export function getPrimaryTimeLocationFlag(
  flags?: ReadonlyArray<EventFlag>,
): TimeLocationFlag | null {
  if (!flags) {
    return null;
  }

  for (const flag of TIME_LOCATION_FLAGS) {
    if (flags.includes(flag)) {
      return flag;
    }
  }

  return null;
}

/**
 * Normalize an array of event flags so it contains at most one time/location flag and at least one type flag.
 */
export function normalizeEventFlags(flags: EventFlag[]): EventFlag[] {
  let normalized = [...flags];

  const firstTimeLocationInInput = normalized.find((flag) =>
    TIME_LOCATION_FLAGS.includes(flag as TimeLocationFlag),
  );
  const foundTimeLocation = normalized.filter((flag) =>
    TIME_LOCATION_FLAGS.includes(flag as TimeLocationFlag),
  );

  if (foundTimeLocation.length > 1) {
    normalized = normalized.filter(
      (flag) =>
        !TIME_LOCATION_FLAGS.includes(flag as TimeLocationFlag) || flag === firstTimeLocationInInput,
    );
    console.warn(
      `Multiple time/location flags found (${foundTimeLocation.join(", ")}). Keeping first from input: ${firstTimeLocationInInput}`,
    );
  }

  const firstTypeInInput = normalized.find((flag) => TYPE_FLAGS.includes(flag as Exclude<TypeFlag, "holiday">));
  const foundTypes = normalized.filter((flag) => TYPE_FLAGS.includes(flag as Exclude<TypeFlag, "holiday">));

  if (foundTypes.length > 1) {
    normalized = normalized.filter(
      (flag) => !TYPE_FLAGS.includes(flag as Exclude<TypeFlag, "holiday">) || flag === firstTypeInInput,
    );
    console.warn(
      `Multiple type flags found (${foundTypes.join(", ")}). Keeping first from input: ${firstTypeInInput}`,
    );
  }

  if (!normalized.some((flag) => TYPE_FLAGS_SET.has(flag))) {
    return [...normalized, "holiday"];
  }

  return normalized;
}
