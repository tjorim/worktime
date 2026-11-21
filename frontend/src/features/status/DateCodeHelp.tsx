import type { ReactElement } from "react";
import { DetailsPopover, PopoverBody, PopoverHeader } from "@/components/ui/popover";
import * as m from "@/paraglide/messages.js";

export function DateCodeHelp({
  children,
  todayCode,
  shiftDayCode,
}: {
  children: ReactElement;
  todayCode: string;
  shiftDayCode: string;
}) {
  return (
    <DetailsPopover
      content={
        <div>
          <PopoverHeader>{m.current_status_date_format()}</PopoverHeader>
          <PopoverBody>
            {m.current_status_yy_help()}
            <br />
            {m.current_status_ww_help()}
            <br />
            {m.current_status_d_help()}
            <br />
            <em>
              {m.current_status_today_code({ code: todayCode })}
              <br />
              {m.current_status_shift_day_code({ code: shiftDayCode })}
            </em>
          </PopoverBody>
        </div>
      }
    >
      {children}
    </DetailsPopover>
  );
}
