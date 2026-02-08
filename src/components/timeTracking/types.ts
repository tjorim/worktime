export type StoredTimeTrackingTask = {
  id: string;
  text: string;
  labelId: string;
  labelName?: string;
  startTime: string;
  stopTime?: string | null;
};

export type TimeTrackingTemplate = {
  id: string;
  text: string;
  labelId: string;
  labelName?: string;
  start: string;
  stop: string;
};
