import type { Dayjs } from "dayjs";
import type { TimeTrackingTag } from "./constants";

export type StoredTimeTrackingTask = {
  id: string;
  text: string;
  tag: TimeTrackingTag;
  startTime: Dayjs;
  stopTime: Dayjs;
};

export type TimeTrackingTemplate = {
  id: string;
  text: string;
  tag: TimeTrackingTag;
  start: string;
  stop: string;
};
