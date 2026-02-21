import type { WorkLocation } from "../../types/workLocation";

export const WORK_LOCATION_ORDER: readonly WorkLocation[] = ["home", "office", "other"];

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

export const WORK_LOCATION_WEEKLY_TITLE: Record<WorkLocation, string> = {
  home: "Work from home days",
  office: "Office days",
  other: "Other location days",
};
