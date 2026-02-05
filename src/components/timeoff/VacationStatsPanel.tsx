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
import type {
  VacationAllowanceSettings,
  VacationAllowanceUnit,
} from "../../utils/vacationCalculations";
import {
  calculateVacationStats,
  formatVacationValue,
  getAllowanceDays,
  getAllowanceHours,
  getAvailableYears,
} from "../../utils/vacationCalculations";

/** Default hours per day for vacation allowance calculations */
export const DEFAULT_HOURS_PER_DAY = 8;

interface VacationStatsProps {
  events: HdayEvent[];
  allowance: VacationAllowanceSettings;
  onUpdateAllowance: (allowance: Partial<VacationAllowanceSettings>) => void;
}

export function VacationStatsPanel({ events, allowance, onUpdateAllowance }: VacationStatsProps) {
  const years = useMemo(() => getAvailableYears(events, dayjs().year()), [events]);
  const [selectedYear, setSelectedYear] = useState(() => years[0] ?? dayjs().year());

  // Local state for input values to allow typing intermediate invalid values
  const [amountInput, setAmountInput] = useState(allowance.amount.toString());
  const [hoursPerDayInput, setHoursPerDayInput] = useState(allowance.hoursPerDay.toString());

  // Sync local state when prop changes externally
  useEffect(() => {
    setAmountInput(allowance.amount.toString());
  }, [allowance.amount]);

  useEffect(() => {
    setHoursPerDayInput(allowance.hoursPerDay.toString());
  }, [allowance.hoursPerDay]);

  useEffect(() => {
    if (!years.includes(selectedYear)) {
      setSelectedYear(years[0] ?? dayjs().year());
    }
  }, [selectedYear, years]);

  const stats = useMemo(
    () => calculateVacationStats(events, selectedYear, allowance.hoursPerDay),
    [allowance.hoursPerDay, events, selectedYear],
  );

  // Memoize filtered types to avoid duplicate filtering
  const filteredTypes = useMemo(() => stats.byType.filter((type) => type.days > 0), [stats.byType]);

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

  // Validation states
  const amountValue = Number(amountInput);
  const isAmountValid = amountInput !== "" && Number.isFinite(amountValue) && amountValue >= 0;
  const isAmountInvalid = amountInput !== "" && !isAmountValid;

  const hoursPerDayValue = Number(hoursPerDayInput);
  const isHoursPerDayValid =
    hoursPerDayInput !== "" && Number.isFinite(hoursPerDayValue) && hoursPerDayValue >= 1;
  const isHoursPerDayInvalid = hoursPerDayInput !== "" && !isHoursPerDayValid;

  const handleAmountChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target.value;
    setAmountInput(input);

    // Only update parent if valid
    const value = Number(input);
    if (input !== "" && Number.isFinite(value) && value >= 0) {
      onUpdateAllowance({ amount: value });
    }
  };

  const handleUnitChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdateAllowance({ unit: event.target.value as VacationAllowanceUnit });
  };

  const handleHoursPerDayChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target.value;
    setHoursPerDayInput(input);

    // Only update parent if valid
    const value = Number(input);
    if (input !== "" && Number.isFinite(value) && value >= 1) {
      onUpdateAllowance({ hoursPerDay: value });
    }
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
              <Card.Header className="fw-semibold">Allowance Settings</Card.Header>
              <Card.Body>
                <Form.Group className="mb-3" controlId="vacationAllowanceAmount">
                  <Form.Label>Annual vacation allowance</Form.Label>
                  <Form.Control
                    type="number"
                    min={0}
                    step={0.5}
                    value={amountInput}
                    onChange={handleAmountChange}
                    placeholder="e.g., 25"
                    isInvalid={isAmountInvalid}
                    aria-describedby={
                      isAmountInvalid
                        ? "vacationAllowanceAmount-feedback vacationAllowanceAmountHelp"
                        : "vacationAllowanceAmountHelp"
                    }
                  />
                  <Form.Control.Feedback type="invalid" id="vacationAllowanceAmount-feedback">
                    Please enter a valid number (0 or greater)
                  </Form.Control.Feedback>
                  <Form.Text className="text-muted" id="vacationAllowanceAmountHelp">
                    Set to 0 to disable vacation tracking
                  </Form.Text>
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
                        value={hoursPerDayInput}
                        onChange={handleHoursPerDayChange}
                        isInvalid={isHoursPerDayInvalid}
                        aria-describedby={
                          isHoursPerDayInvalid
                            ? "vacationHoursPerDay-feedback vacationHoursPerDayHelp"
                            : "vacationHoursPerDayHelp"
                        }
                      />
                      <Form.Control.Feedback type="invalid" id="vacationHoursPerDay-feedback">
                        Please enter a value of at least 1
                      </Form.Control.Feedback>
                      <Form.Text className="text-muted" id="vacationHoursPerDayHelp">
                        Used for converting between days and hours
                      </Form.Text>
                    </Form.Group>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </Col>

          <Col xs={12} lg={7}>
            <Card className="h-100">
              <Card.Header className="d-flex flex-column flex-lg-row justify-content-between align-items-start align-items-lg-center gap-2">
                <div className="fw-semibold">Vacation usage</div>
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
              </Card.Header>
              <Card.Body>
                <p className="text-muted small mb-3">Based on Holiday events in {selectedYear}</p>

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
              {filteredTypes.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-muted text-center">
                    No time off recorded for {selectedYear}
                  </td>
                </tr>
              )}
              {filteredTypes.map((type) => (
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
