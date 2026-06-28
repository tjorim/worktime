import Card from "react-bootstrap/Card";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
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
    <div className="col-sm-6 col-lg-3">
      <Card className="text-center h-100">
        <Card.Body>
          <div className="text-muted small text-uppercase mb-1">{label}</div>
          <div className={`h4 mb-0${truncate ? " text-truncate" : ""}`}>{value}</div>
        </Card.Body>
      </Card>
    </div>
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
    <OverlayTrigger
      show={copiedCellId === cellId}
      overlay={<Tooltip id={`copy-${cellId}`}>{m.tt_copied()}</Tooltip>}
    >
      <td
        className={className}
        onClick={cellValue ? () => onCopyCell(cellId, cellValue) : undefined}
        style={cellValue ? { cursor: "copy" } : undefined}
      >
        {cellValue ?? "-"}
      </td>
    </OverlayTrigger>
  );
}
