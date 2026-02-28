declare module "frappe-gantt" {
  export interface GanttTaskLike {
    id: string;
    name: string;
    start: string;
    end: string;
    progress: number;
    dependencies?: string;
  }

  export interface GanttOptions {
    view_mode?: "Day" | "Week" | "Month" | "Year";
    on_click?: (task: GanttTaskLike) => void;
    on_date_change?: (task: GanttTaskLike, start: Date, end: Date) => void;
    on_progress_change?: (task: GanttTaskLike, progress: number) => void;
  }

  export class Gantt {
    constructor(wrapper: string | Element, tasks: GanttTaskLike[], options?: GanttOptions);
    refresh(tasks: GanttTaskLike[]): void;
    change_view_mode(mode: GanttOptions["view_mode"], maintain_pos?: boolean): void;
    update_options(options: GanttOptions): void;
  }

  export default Gantt;
}
