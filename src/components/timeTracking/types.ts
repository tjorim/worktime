export type StoredTimeTrackingTask = {
  id: string;
  text: string;
  labelId: string;
  startTime: string;
  stopTime?: string | null;
};

export type TimeTrackingTemplate = {
  id: string;
  text: string;
  labelId: string;
  start: string;
  stop: string;
};
