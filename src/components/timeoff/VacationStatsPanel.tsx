import { useEffect, useMemo, useState } from "react";
import Badge from "react-bootstrap/Badge";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import ProgressBar from "react-bootstrap/ProgressBar";
import Row from "react-bootstrap/Row";
import Table from "react-bootstrap/Table";
import type { HdayEvent } from "../../lib/hday/types";
import { dayjs } from "../../utils/dateTimeUtils";
import type { VacationAllowanceSettings, VacationAllowanceUnit } from "../../utils/vacationCalculations";
import {
  calculateVacationStats,
  formatVacationValue,
  getAllowanceDays,
  getAllowanceHours,
  getAvailableYears,
} from "../../utils/vacationCalculations";

const DEFAULT_HOURS_PER_DAY = 8;

interface VacationStatsProps {
  events: HdayEvent[];
  allowance: VacationAllowanceSettings;
  onUpdateAllowance: (allowance: Partial<VacationAllowanceSettings>) => void;
}

export function VacationStatsPanel({ events, allowance, onUpdateAllowance }: VacationStatsProps) {
  const years = useMemo(() => getAvailableYears(events, dayjs().year()), [events]);
  const [selectedYear, setSelectedYear] = useState(() => years[0] ?? dayjs().year());

  useEffect(() => {
    if (!years.includes(selectedYear)) {
      setSelectedYear(years[0] ?? dayjs().year());
    }
  }, [selectedYear, years]);

  const stats = useMemo(
    () => calculateVacationStats(events, selectedYear, allowance.hoursPerDay),
    [allowance.hoursPerDay, events, selectedYear],
  );

  const allowanceDays = getAllowanceDays(allowance);
  const allowanceHours = getAllowanceHours(allowance);
  const usedDays = stats.holidayDays;
  const usedHours = stats.holidayHours;
  const remainingDays = Math.max(allowanceDays - usedDays, 0);
  const remainingHours = Math.max(allowanceHours - usedHours, 0);
  const usedValue = allowance.unit === "days" ? usedDays : usedHours;
  const allowanceValue = allowance.unit === "days" ? allowanceDays : allowanceHours;
  const remainingValue = allowance.unit === "days" ? remainingDays : remainingHours;
  const usagePercent = allowanceValue > 0 ? Math.min((usedValue / allowanceValue) * 100, 100) : 0;

  const handleAmountChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    onUpdateAllowance({ amount: Number.isFinite(value) ? value : 0 });
  };

  const handleUnitChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdateAllowance({ unit: event.target.value as VacationAllowanceUnit });
  };

  const handleHoursPerDayChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    onUpdateAllowance({ hoursPerDay: Number.isFinite(value) ? value : DEFAULT_HOURS_PER_DAY });
  };

  return (
    <Card className="mb-3">
      <Card.Header className="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div className="fw-semibold">
          <i className="bi bi-graph-up-arrow me-2"></i>
          Vacation Statistics
        </div>
        <Badge bg="primary">{selectedYear}</Badge>
      </Card.Header>
      <Card.Body>
        <Row className="g-3">
          <Col xs={12} lg={5}>
            <Card className="h-100">
              <Card.Body>
                <Card.Title className="h6">Allowance Settings</Card.Title>
                <Form.Group className="mb-3" controlId="vacationAllowanceAmount">
                  <Form.Label>Annual allowance</Form.Label>
                  <Form.Control
                    type="number"
                    min={0}
                    step={0.5}
                    value={allowance.amount}
                    onChange={handleAmountChange}
                  />
                </Form.Group>
                <Row className="g-2">
                  <Col xs={12} md={6}>
                    <Form.Group controlId="vacationAllowanceUnit">
                      <Form.Label>Unit</Form.Label>
                      <Form.Select value={allowance.unit} onChange={handleUnitChange}>
                        <option value="days">Days</option>
                        <option value="hours">Hours</option>
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Group controlId="vacationHoursPerDay">
                      <Form.Label>Hours per day</Form.Label>
                      <Form.Control
                        type="number"
                        min={1}
                        step={0.5}
                        value={allowance.hoursPerDay}
                        onChange={handleHoursPerDayChange}
                      />
                    </Form.Group>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </Col>

          <Col xs={12} lg={7}>
            <Card className="h-100">
              <Card.Body>
                <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-2 mb-3">
                  <div>
                    <Card.Title className="h6 mb-1">Vacation usage</Card.Title>
                    <p className="text-muted small mb-0">
                      Based on Holiday events in {selectedYear}
                    </p>
                  </div>
                  <Form.Select
                    size="sm"
                    aria-label="Select year for vacation statistics"
                    value={selectedYear}
                    onChange={(event) => setSelectedYear(Number(event.target.value))}
                    className="w-auto"
                  >
                    {years.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </Form.Select>
                </div>

                <div className="mb-3">
                  <div className="d-flex justify-content-between small text-muted mb-1">
                    <span>Used</span>
                    <span>
                      {formatVacationValue(usedValue)} / {formatVacationValue(allowanceValue)}{" "}
                      {allowance.unit}
                    </span>
                  </div>
                  <ProgressBar now={usagePercent} label={`${Math.round(usagePercent)}%`} />
                </div>

                <Row className="text-center">
                  <Col xs={6}>
                    <div className="fw-semibold">Remaining</div>
                    <div className="fs-4">{formatVacationValue(remainingValue)}</div>
                    <div className="text-muted small">{allowance.unit}</div>
                  </Col>
                  <Col xs={6}>
                    <div className="fw-semibold">Total time off</div>
                    <div className="fs-4">{formatVacationValue(stats.totalDays)}</div>
                    <div className="text-muted small">
                      days ({formatVacationValue(stats.totalHours)} h)
                    </div>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        <div className="mt-4">
          <h6 className="mb-3">Breakdown by type</h6>
          <Table responsive size="sm" className="mb-0">
            <thead>
              <tr>
                <th>Type</th>
                <th className="text-end">Days</th>
                <th className="text-end">Hours</th>
              </tr>
            </thead>
            <tbody>
              {stats.byType.map((type) => (
                <tr key={type.key}>
                  <td>{type.label}</td>
                  <td className="text-end">{formatVacationValue(type.days)}</td>
                  <td className="text-end">{formatVacationValue(type.hours)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card.Body>
    </Card>
  );
}
