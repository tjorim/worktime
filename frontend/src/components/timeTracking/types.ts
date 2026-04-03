export type StoredTimeTrackingTask = {
  id: string;
  text: string;
  label: string;
  startTime: string;
  stopTime?: string | null;
  includesBreak?: boolean;
};

export type TimeTrackingTemplate = {
  id: string;
  text: string;
  label: string;
  start: string;
  stop: string;
};
