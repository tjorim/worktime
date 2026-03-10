export type TimeTrackingLabel = {
  id: string;
  name: string;
  color: string;
};

export type TimeTrackingLabelInput = Omit<TimeTrackingLabel, "id"> & { id?: string };
