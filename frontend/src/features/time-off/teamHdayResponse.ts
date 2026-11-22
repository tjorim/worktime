import type { EventFlag, HdayEvent } from "@/lib/hday/types";
import {
  getEntryTimeFlagFromDisplayFlags,
  getEntryTypeFromDisplayFlags,
} from "@/lib/time-off/codecs";
import type { TimeOffRangeEntry, TimeOffWeeklyEntry } from "@/lib/time-off/types";

export type TeamTimeOffEntry = (TimeOffRangeEntry | TimeOffWeeklyEntry) & {
  // Helper files may carry combinations that personal entries cannot store.
  flags: EventFlag[];
};

export interface TeamMemberSchedule {
  username: string;
  display_name: string;
  etag: string | null;
  entries: TeamTimeOffEntry[];
}

interface TeamHdayMember extends Omit<TeamMemberSchedule, "entries"> {
  events: HdayEvent[];
}

export interface TeamHdayResponse {
  team_id: string;
  name: string;
  members: TeamHdayMember[];
  sections: { title: string | null; members: TeamHdayMember[] }[];
}

export function toTeamTimeOffEntries(events: HdayEvent[]): TeamTimeOffEntry[] {
  return events.flatMap<TeamTimeOffEntry>((event, index) => {
    const flags = event.flags ?? [];
    const metadata = {
      id: String(index),
      entryType: getEntryTypeFromDisplayFlags(flags),
      entryFlag: getEntryTimeFlagFromDisplayFlags(flags),
      note: event.title?.trim() || null,
      flags,
    };
    if (event.type === "weekly" && event.weekday) {
      return [{ ...metadata, entryKind: "weekly", weekday: event.weekday }];
    }
    if (event.type === "range" && event.start && event.end) {
      return [
        {
          ...metadata,
          entryKind: "range",
          start: event.start.replace(/\//g, "-"),
          end: event.end.replace(/\//g, "-"),
        },
      ];
    }
    return [];
  });
}

export function toTeamSchedule(data: TeamHdayResponse) {
  return {
    id: data.team_id,
    name: data.name,
    memberCount: data.members.length,
    sections: data.sections.map(({ title, members }) => ({
      title,
      members: members.map(({ events, username, display_name, etag }): TeamMemberSchedule => ({
        username,
        display_name,
        etag,
        entries: toTeamTimeOffEntries(events),
      })),
    })),
  };
}
