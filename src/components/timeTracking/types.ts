import type { TimeTrackingTag } from "./constants";

export type TimeTrackingTask = {
  id: string;
  text: string;
  tag: TimeTrackingTag;
  start: string;
  stop: string;
};

export type StoredTimeTrackingTask = TimeTrackingTask & { date: string };

export type TimeTrackingTemplate = {
  id: number;
  text: string;
  tag: TimeTrackingTag;
  start: string;
  stop: string;
};
