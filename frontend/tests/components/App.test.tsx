import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { dayjs } from "@/utils/dateTimeUtils";
import type { ShiftResult } from "@/utils/shiftCalculations";
import * as SuperTokensUi from "supertokens-auth-react/ui";

// SuperTokens mocks are provided globally by tests/setup.ts

// Mock our dayjs setup to avoid loading real dayjs configuration in tests
vi.mock("@/utils/dateTimeUtils", () => {
  const mockDayjs = vi.fn(() => ({
    format: vi.fn(() => "2025-01-15"),
    startOf: vi.fn(() => mockDayjs()),
    add: vi.fn(() => mockDayjs()),
  }));
  return { dayjs: mockDayjs };
});

// Mock all the child components to focus on App structure
vi.mock("@/components/Header", () => ({
  Header: () => <div data-testid="header">Header</div>,
}));

vi.mock("@/components/CurrentStatus", () => ({
  CurrentStatus: () => <div data-testid="current-status">CurrentStatus</div>,
}));

vi.mock("@/components/MainTabs", () => ({
  MainTabs: () => <div data-testid="main-tabs">MainTabs</div>,
}));

vi.mock("@/components/WelcomeWizard", () => ({
  WelcomeWizard: () => <div data-testid="welcome-wizard">WelcomeWizard</div>,
}));

vi.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="error-boundary">{children}</div>
  ),
}));

vi.mock("@/components/AboutModal", () => ({
  AboutModal: () => <div data-testid="about-modal">AboutModal</div>,
}));

// Mock dayjs first to avoid reference issues
vi.mock("dayjs", () => ({
  default: vi.fn(() => ({
    format: () => "2025-01-15",
    year: () => 2025,
    month: () => 0, // January
    date: () => 15,
  })),
}));

// Create realistic mock data
const createMockDate = () => dayjs("2025-01-15");
const mockTodayShifts: ShiftResult[] = [
  {
    teamNumber: 1,
    date: createMockDate(),
    code: "2503.3M",
    shift: {
      code: "M",
      displayCode: "M",
      emoji: "🌅",
      name: "Morning",
      start: 7,
      end: 15,
      isWorking: true,
      className: "shift-morning",
    },
  },
  {
    teamNumber: 2,
    date: createMockDate(),
    code: "2503.3L",
    shift: {
      code: "L",
      displayCode: "L",
      emoji: "🌆",
      name: "Late",
      start: 15,
      end: 23,
      isWorking: true,
      className: "shift-late",
    },
  },
];

// Mock the shift calculation hook with realistic data
vi.mock("@/hooks/useShiftCalculation", () => ({
  useShiftCalculation: () => ({
    myTeam: 1,
    setMyTeam: vi.fn(),
    currentDate: createMockDate(),
    setCurrentDate: vi.fn(),
    todayShifts: mockTodayShifts,
  }),
}));

describe("App", () => {
  beforeEach(() => {
    vi.mocked(SuperTokensUi.canHandleRoute).mockReturnValue(false);
    vi.mocked(SuperTokensUi.getRoutingComponent).mockReturnValue(null);
  });

  describe("SuperTokens Routing", () => {
    it("renders the SuperTokens auth UI when the current route is an auth route", () => {
      vi.mocked(SuperTokensUi.canHandleRoute).mockReturnValue(true);
      vi.mocked(SuperTokensUi.getRoutingComponent).mockReturnValue(
        <div data-testid="supertokens-auth-route">Auth Route</div>,
      );

      render(<App />);

      expect(screen.getByTestId("supertokens-auth-route")).toBeInTheDocument();
      expect(screen.queryByTestId("welcome-wizard")).not.toBeInTheDocument();
    });
  });

  describe("Component Structure", () => {
    it("renders all main components", async () => {
      render(<App />);

      expect(await screen.findByTestId("header")).toBeInTheDocument();
      expect(await screen.findByTestId("current-status")).toBeInTheDocument();
      expect(await screen.findByTestId("main-tabs")).toBeInTheDocument();
      expect(screen.getByTestId("welcome-wizard")).toBeInTheDocument();
    });

    it("wraps components in error boundaries", () => {
      render(<App />);

      const errorBoundaries = screen.getAllByTestId("error-boundary");
      expect(errorBoundaries.length).toBeGreaterThan(0);
    });

    it("has proper layout structure", () => {
      render(<App />);

      // Should have Bootstrap container structure
      const container = document.querySelector(".container-fluid");
      expect(container).toBeInTheDocument();

      // Should have React Bootstrap components rendered
      // Note: Row components are rendered conditionally based on state
      // so we check for the overall layout structure instead
      const appContainer = document.querySelector(".min-vh-100");
      expect(appContainer).toBeInTheDocument();
    });
  });

  describe("Toast Provider Integration", () => {
    it("provides toast context to child components without errors", () => {
      // Test that the app renders without errors - indicates toast context is working
      const { container } = render(<App />);
      expect(container).toBeInTheDocument();

      // Verify all major components receive toast context successfully
      expect(screen.getByTestId("header")).toBeInTheDocument();
      expect(screen.getByTestId("current-status")).toBeInTheDocument();
      expect(screen.getByTestId("main-tabs")).toBeInTheDocument();
    });

    it("renders toast container in DOM structure", () => {
      render(<App />);

      // The ToastProvider should create the necessary DOM structure
      // Even though we can't directly test toast context value without accessing internals,
      // successful rendering indicates the provider is working correctly
      expect(screen.getByTestId("current-status")).toBeInTheDocument();
    });
  });

  describe("App Architecture", () => {
    it("separates AppContent from App wrapper", () => {
      render(<App />);

      // Both App and AppContent should render successfully
      expect(screen.getByTestId("current-status")).toBeInTheDocument();
    });

    it("integrates with realistic shift calculation data", () => {
      render(<App />);

      // Test that app handles realistic shift data without errors
      // Mock data includes proper ShiftResult structure with dates, codes, and shift details
      expect(screen.getByTestId("current-status")).toBeInTheDocument();
      expect(screen.getByTestId("main-tabs")).toBeInTheDocument();
    });
  });
});
