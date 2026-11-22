declare module "frappe-gantt" {
  export interface GanttTaskLike {
    id: string;
    name: string;
    start: string;
    end: string;
    progress: number;
    dependencies?: string;
    /** custom field passed through from our GanttTask; sets the bar's fill color */
    color?: string;
    /** frappe-gantt computed start Date */
    _start?: Date;
    /** frappe-gantt computed end Date */
    _end?: Date;
    /** frappe-gantt computed duration in days */
    actual_duration?: number;
    /** custom field passed through from our GanttTask */
    notes?: string;
  }

  export interface GanttPopupContext {
    task: GanttTaskLike;
    set_title(title: string): void;
    set_subtitle(subtitle: string): void;
    set_details(details: string): void;
  }

  export interface GanttOptions {
    view_mode?: import("@/types/gantt").GanttViewMode;
    scroll_to?: string;
    view_mode_select?: boolean;
    today_button?: boolean;
    ignore?: string | string[] | ((date: Date) => boolean);
    holidays?: Record<string, string | string[]>;
    language?: string;
    popup?: (ctx: GanttPopupContext) => void;
    popup_on?: "click" | "hover";
    on_click?: (task: GanttTaskLike) => void;
    on_date_change?: (task: GanttTaskLike, start: Date, end: Date) => void;
    on_progress_change?: (task: GanttTaskLike, progress: number) => void;
    on_view_change?: (mode: GanttViewMode) => void;
  }

  export type GanttViewModeName = NonNullable<GanttOptions["view_mode"]>;

  export interface GanttViewMode {
    name: GanttViewModeName;
    step?: string;
    padding?: string;
    lower_text?: string;
    upper_text?: string;
    upper_text_frequency?: number;
    thick_line?: string;
    date_format?: string;
  }

  export class Gantt {
    readonly options: GanttOptions;
    constructor(wrapper: string | Element, tasks: GanttTaskLike[], options?: GanttOptions);
    refresh(tasks: GanttTaskLike[]): void;
    update_task(id: string, details: Partial<GanttTaskLike>): void;
    change_view_mode(mode: GanttViewModeName | GanttViewMode, maintain_pos?: boolean): void;
    update_options(options: GanttOptions): void;
  }

  export default Gantt;
}
