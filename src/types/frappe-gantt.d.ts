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
    view_mode_select?: boolean;
    today_button?: boolean;
    ignore?: string | string[];
    holidays?: Record<string, string | string[]>;
    on_click?: (task: GanttTaskLike) => void;
    on_date_change?: (task: GanttTaskLike, start: Date, end: Date) => void;
    on_progress_change?: (task: GanttTaskLike, progress: number) => void;
  }

  export type GanttViewModeName = NonNullable<GanttOptions["view_mode"]>;

  export interface GanttViewMode {
    name: string;
    step?: string;
    padding?: string;
    lower_text?: string;
    upper_text?: string;
    upper_text_frequency?: number;
    thick_line?: string;
    date_format?: string;
  }

  export class Gantt {
    constructor(wrapper: string | Element, tasks: GanttTaskLike[], options?: GanttOptions);
    refresh(tasks: GanttTaskLike[]): void;
    change_view_mode(mode: GanttViewModeName | GanttViewMode, maintain_pos?: boolean): void;
    update_options(options: GanttOptions): void;
  }

  export default Gantt;
}
