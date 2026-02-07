import type { TimeTrackingTag } from "./constants";

export type StoredTimeTrackingTask = {
  id: string;
  text: string;
  tag: TimeTrackingTag;
  startTime: string;
  stopTime?: string | null;
};

export type TimeTrackingTemplate = {
  id: string;
  text: string;
  tag: TimeTrackingTag;
  start: string;
  stop: string;
};
