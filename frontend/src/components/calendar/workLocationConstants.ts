import type { LucideIcon } from "lucide-react";
import { Building as BuildingIcon, House as HouseIcon, MapPin as MapPinIcon } from "lucide-react";
import type { WorkLocation } from "@/types/workLocation";

export const WORK_LOCATION_ICONS: Record<WorkLocation, LucideIcon> = {
  home: HouseIcon,
  office: BuildingIcon,
  other: MapPinIcon,
};

export const WORK_LOCATION_LABEL: Record<WorkLocation, string> = {
  home: "Home",
  office: "Office",
  other: "Other",
};
