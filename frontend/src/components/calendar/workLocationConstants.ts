import type { WorkLocation } from "@/types/workLocation";

export const WORK_LOCATION_ICON_CLASS: Record<WorkLocation, string> = {
  home: "bi-house",
  office: "bi-building",
  other: "bi-geo-alt",
};

export const WORK_LOCATION_LABEL: Record<WorkLocation, string> = {
  home: "Home",
  office: "Office",
  other: "Other",
};
