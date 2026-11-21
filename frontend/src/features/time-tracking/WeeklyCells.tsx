import { Card, CardContent } from "@/components/ui/card";
import { Hint } from "@/components/ui/tooltip";
import { TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import * as m from "@/paraglide/messages.js";

export function MetricCard({
  label,
  value,
  truncate = false,
}: {
  label: string;
  value: string;
  truncate?: boolean;
}) {
  return (
    <Card className="h-full text-center">
      <CardContent>
        <div className="mb-1 text-sm text-muted-foreground uppercase">{label}</div>
        <div className={cn("text-2xl font-medium", truncate && "truncate")}>{value}</div>
      </CardContent>
    </Card>
  );
}

export function CopyableHoursCell({
  cellId,
  cellValue,
  copiedCellId,
  onCopyCell,
  className,
}: {
  cellId: string;
  cellValue: string | null;
  copiedCellId: string | null;
  onCopyCell: (id: string, value: string) => void;
  className?: string;
}) {
  return (
    <Hint open={copiedCellId === cellId} content={<div id={`copy-${cellId}`}>{m.tt_copied()}</div>}>
      <TableCell
        className={cn(cellValue && "cursor-copy", className)}
        onClick={cellValue ? () => onCopyCell(cellId, cellValue) : undefined}
      >
        {cellValue ?? "-"}
      </TableCell>
    </Hint>
  );
}
