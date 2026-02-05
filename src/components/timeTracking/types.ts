export type TimeTrackingTask = {
  id: string;
  text: string;
  tag: string;
  start: string;
  stop: string;
};

export type StoredTimeTrackingTask = TimeTrackingTask & { date: string };

export type TimeTrackingTemplate = {
  id: number;
  text: string;
  tag: string;
  start: string;
  stop: string;
};
