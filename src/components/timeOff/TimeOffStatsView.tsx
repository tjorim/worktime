import { useEffect, useMemo, useState } from "react";
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
  getEffectiveAmount,
} from "../../utils/vacationCalculations";
import * as m from "../../paraglide/messages.js";

/** Default hours per day for vacation allowance calculations */
export const DEFAULT_HOURS_PER_DAY = 8;

interface TimeOffStatsViewProps {
  events: HdayEvent[];
  allowance: VacationAllowanceSettings;
  onUpdateAllowance: (allowance: Partial<VacationAllowanceSettings>) => void;
}

export function TimeOffStatsView({ events, allowance, onUpdateAllowance }: TimeOffStatsViewProps) {
  const getUnitLabel = (unit: VacationAllowanceUnit) => {
    switch (unit) {
      case "days":
        return m.timeoff_days_unit();
      case "hours":
        return m.tt_hours_unit();
      default: {
        const exhaustiveCheck: never = unit;
        return exhaustiveCheck;
      }
    }
  };
  const years = useMemo(() => getAvailableYears(events, dayjs().year()), [events]);
  const [selectedYear, setSelectedYear] = useState(() => years[0] ?? dayjs().year());

  // Local state for input values to allow typing intermediate invalid values
  const effectiveAmount = getEffectiveAmount(allowance, selectedYear);
  const [amountInput, setAmountInput] = useState(effectiveAmount.toString());
  const [hoursPerDayInput, setHoursPerDayInput] = useState(allowance.hoursPerDay.toString());

  // Sync local state when prop or selected year changes externally
  useEffect(() => {
    setAmountInput(getEffectiveAmount(allowance, selectedYear).toString());
  }, [allowance, selectedYear]);

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
  const filteredTypes = useMemo(
    () => stats.byType.filter((type) => type.days > 0 || type.hours > 0),
    [stats.byType],
  );

  const allowanceDays = getAllowanceDays(allowance, selectedYear);
  const allowanceHours = getAllowanceHours(allowance, selectedYear);
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
      onUpdateAllowance({
        yearlyAmounts: { ...allowance.yearlyAmounts, [String(selectedYear)]: value },
      });
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
    <Card className="mb-3 shadow-sm">
      <Card.Header>
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
          <span className="fw-semibold">
            <i className="bi bi-graph-up-arrow me-2" aria-hidden="true"></i>
            {m.timeoff_vacation_stats()}
          </span>
          <div className="d-flex align-items-center gap-2">
            <small className="text-muted">{m.timeoff_year_label()}</small>
            <Form.Select
              size="sm"
              aria-label={m.timeoff_select_year_aria()}
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
        </div>
      </Card.Header>
      <Card.Body>
        <Row className="g-3">
          <Col xs={12} md={5}>
            <Card className="h-100">
              <Card.Body>
                <h6 className="text-uppercase text-muted mb-3">
                  <i className="bi bi-sliders me-2" aria-hidden="true"></i>
                  {m.timeoff_allowance_settings()}
                </h6>
                <Form.Group className="mb-3" controlId="vacationAllowanceAmount">
                  <Form.Label>{m.timeoff_allowance_for_year({ year: selectedYear })}</Form.Label>
                  <Form.Control
                    type="number"
                    min={0}
                    step={0.5}
                    value={amountInput}
                    onChange={handleAmountChange}
                    placeholder={m.timeoff_allowance_placeholder()}
                    isInvalid={isAmountInvalid}
                    required
                    aria-required="true"
                    aria-describedby={
                      isAmountInvalid
                        ? "vacationAllowanceAmount-feedback vacationAllowanceAmountHelp"
                        : "vacationAllowanceAmountHelp"
                    }
                  />
                  <Form.Control.Feedback type="invalid" id="vacationAllowanceAmount-feedback">
                    {m.timeoff_allowance_invalid()}
                  </Form.Control.Feedback>
                  <Form.Text className="text-muted" id="vacationAllowanceAmountHelp">
                    {m.timeoff_allowance_help({ year: selectedYear })}
                  </Form.Text>
                </Form.Group>
                <Row className="g-2">
                  <Col xs={12} md={6}>
                    <Form.Group controlId="vacationAllowanceUnit">
                      <Form.Label>{m.timeoff_unit()}</Form.Label>
                      <Form.Select value={allowance.unit} onChange={handleUnitChange}>
                        <option value="days">{m.timeoff_vacation_unit_days()}</option>
                        <option value="hours">{m.timeoff_vacation_unit_hours()}</option>
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Group controlId="vacationHoursPerDay">
                      <Form.Label>{m.timeoff_hours_per_day()}</Form.Label>
                      <Form.Control
                        type="number"
                        min={1}
                        step={0.5}
                        value={hoursPerDayInput}
                        onChange={handleHoursPerDayChange}
                        isInvalid={isHoursPerDayInvalid}
                        required
                        aria-required="true"
                        aria-describedby={
                          isHoursPerDayInvalid
                            ? "vacationHoursPerDay-feedback vacationHoursPerDayHelp"
                            : "vacationHoursPerDayHelp"
                        }
                      />
                      <Form.Control.Feedback type="invalid" id="vacationHoursPerDay-feedback">
                        {m.timeoff_hours_per_day_invalid()}
                      </Form.Control.Feedback>
                      <Form.Text className="text-muted" id="vacationHoursPerDayHelp">
                        {m.timeoff_hours_per_day_help()}
                      </Form.Text>
                    </Form.Group>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </Col>

          <Col xs={12} md={7}>
            <Card className="h-100">
              <Card.Body>
                <h6 className="text-uppercase text-muted mb-2">
                  <i className="bi bi-calendar-check me-2" aria-hidden="true"></i>
                  {m.timeoff_vacation_usage()}
                </h6>
                <p className="text-muted small mb-3">
                  {m.timeoff_based_on_holiday_year({ year: selectedYear })}
                </p>

                <div className="mb-3">
                  <div className="d-flex justify-content-between small text-muted mb-1">
                    <span>{m.timeoff_used()}</span>
                    <span>
                      {formatVacationValue(usedValue)} / {formatVacationValue(allowanceValue)}{" "}
                      {getUnitLabel(allowance.unit)}
                    </span>
                  </div>
                  <ProgressBar now={usagePercent} label={`${Math.round(usagePercent)}%`} />
                </div>

                <Row className="text-center">
                  <Col xs={6}>
                    <div className="fw-semibold">{m.timeoff_remaining()}</div>
                    <div className="fs-4">{formatVacationValue(remainingValue)}</div>
                    <div className="text-muted small">{getUnitLabel(allowance.unit)}</div>
                  </Col>
                  <Col xs={6}>
                    <div className="fw-semibold">{m.timeoff_total_time_off()}</div>
                    <div className="fs-4">{formatVacationValue(stats.totalDays)}</div>
                    <div className="text-muted small">
                      {m.timeoff_days_unit()} ({formatVacationValue(stats.totalHours)} h)
                    </div>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        <div className="mt-4">
          <h6 className="text-uppercase text-muted mb-3">
            <i className="bi bi-pie-chart me-2" aria-hidden="true"></i>
            {m.timeoff_breakdown_by_type()}
          </h6>
          <Table responsive size="sm" className="mb-0">
            <thead>
              <tr>
                <th>{m.timeoff_col_type()}</th>
                <th className="text-end">{m.timeoff_days_unit()}</th>
                <th className="text-end">{m.tt_hours_unit()}</th>
              </tr>
            </thead>
            <tbody>
              {filteredTypes.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-muted text-center">
                    {m.timeoff_no_time_off_year({ year: selectedYear })}
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
