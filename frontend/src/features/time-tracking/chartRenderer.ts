import { motion } from "@tanstack/charts/motion";

/** Spring transition shared by the time-tracking charts as their data changes. */
export const chartRenderer = motion({
  transition: { type: "spring", stiffness: 170, damping: 22, mass: 1 },
});
