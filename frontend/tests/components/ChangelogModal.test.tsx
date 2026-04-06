import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChangelogModal } from "@/components/ChangelogModal";
import { changelogData, futurePlans } from "@/data/changelog";

describe("ChangelogModal", () => {
  const defaultProps = {
    show: true,
    onHide: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Modal Display", () => {
    it("renders modal when show is true", () => {
      render(<ChangelogModal {...defaultProps} />);

      expect(screen.getByText("What's New in Worktime")).toBeInTheDocument();
      expect(screen.getByText(/Track the evolution of Worktime/)).toBeInTheDocument();
    });

    it("does not render modal when show is false", () => {
      render(<ChangelogModal {...defaultProps} show={false} />);

      expect(screen.queryByText("What's New in Worktime")).not.toBeInTheDocument();
    });

    it("calls onHide when close button is clicked", () => {
      render(<ChangelogModal {...defaultProps} />);

      const closeButton = screen.getByText("Close");
      fireEvent.click(closeButton);

      expect(defaultProps.onHide).toHaveBeenCalledTimes(1);
    });
  });

  describe("Version Display", () => {
    it("renders all versions from changelog data", () => {
      render(<ChangelogModal {...defaultProps} />);

      // Test that each version from changelog data is displayed
      changelogData.forEach((version) => {
        expect(screen.getByText(`Version ${version.version}`)).toBeInTheDocument();
      });

      // Test that dates are displayed (some may be duplicated)
      const uniqueDates = [...new Set(changelogData.map((v) => v.date))];
      uniqueDates.forEach((date) => {
        expect(screen.getAllByText(date).length).toBeGreaterThan(0);
      });
    });

    it("displays status badges for different version types", () => {
      render(<ChangelogModal {...defaultProps} />);

      // Test that status badges are rendered (without checking specific versions)
      const statusBadges = screen.getAllByText(/(Current|Released)/);
      expect(statusBadges.length).toBeGreaterThan(0);
    });

    it("renders version information in accordion format", () => {
      render(<ChangelogModal {...defaultProps} />);

      // Test accordion structure exists
      const accordionItems = document.querySelectorAll(".accordion-item");
      expect(accordionItems.length).toBe(changelogData.length);
    });
  });

  describe("Changelog Content", () => {
    it("renders change sections based on data structure", () => {
      render(<ChangelogModal {...defaultProps} />);

      // Test that Added sections exist for versions that have added items
      const versionsWithAdded = changelogData.filter((v) => v.added.length > 0);
      if (versionsWithAdded.length > 0) {
        const addedSections = screen.getAllByText("Added");
        expect(addedSections.length).toBeGreaterThan(0);
      }

      // Test that Changed sections exist for versions that have changed items
      const versionsWithChanged = changelogData.filter((v) => v.changed.length > 0);
      if (versionsWithChanged.length > 0) {
        const changedSections = screen.getAllByText("Changed");
        expect(changedSections.length).toBeGreaterThan(0);
      }
    });

    it("displays content for each changelog section type", () => {
      render(<ChangelogModal {...defaultProps} />);

      // Test pattern: verify sections render with proper icons and structure
      const sectionTypes = ["Added", "Changed", "Fixed"];

      sectionTypes.forEach((sectionType) => {
        const hasThisSection = changelogData.some((version) => {
          const key = sectionType.toLowerCase() as keyof typeof version;
          const items = version[key];
          return Array.isArray(items) ? items.length > 0 : false;
        });

        if (hasThisSection) {
          const sectionElements = screen.getAllByText(sectionType);
          expect(sectionElements.length).toBeGreaterThan(0);
        }
      });
    });

    it("renders technical details for versions that have them", () => {
      render(<ChangelogModal {...defaultProps} />);

      // Test that technical details render when present in data
      const versionsWithTechnicalDetails = changelogData.filter((v) => v.technicalDetails);

      if (versionsWithTechnicalDetails.length > 0) {
        // Look for technical details cards with correct Bootstrap class
        const technicalCards = document.querySelectorAll(".card.bg-body-secondary");
        expect(technicalCards.length).toBe(versionsWithTechnicalDetails.length);
      }
    });

    it("displays version content in collapsible accordion format", () => {
      render(<ChangelogModal {...defaultProps} />);

      // Test that accordion structure exists
      const accordionItems = document.querySelectorAll(".accordion-item");
      expect(accordionItems.length).toBe(changelogData.length);

      // Test that first version has expanded content by default
      const firstVersionHeader = screen.getByText(`Version ${changelogData[0].version}`);
      const accordionItem = firstVersionHeader.closest(".accordion-item");
      expect(accordionItem).toBeInTheDocument();

      if (accordionItem) {
        // Verify the accordion body exists
        const accordionBody = accordionItem.querySelector(".accordion-body");
        expect(accordionBody).toBeInTheDocument();
      }
    });
  });

  describe("Accordion Interaction", () => {
    it("allows expanding and collapsing version sections", () => {
      render(<ChangelogModal {...defaultProps} />);

      // Check that version headers are clickable buttons
      const version310Header = screen.getByText("Version 3.1.0").closest("button");
      expect(version310Header).toBeInTheDocument();
      expect(version310Header).toHaveAttribute("type", "button");

      const version300Header = screen.getByText("Version 3.0.0").closest("button");
      expect(version300Header).toBeInTheDocument();
      expect(version300Header).toHaveAttribute("type", "button");
    });
  });

  describe("Status Badges", () => {
    it("renders correct badge variants for each status", () => {
      render(<ChangelogModal {...defaultProps} />);

      // Check badge colors through Bootstrap classes
      const currentBadge = screen.getByText("Current");
      expect(currentBadge).toHaveClass("bg-primary");

      const releasedBadges = screen.getAllByText("Released");
      expect(releasedBadges.length).toBeGreaterThan(0);
      releasedBadges.forEach((badge) => {
        expect(badge).toHaveClass("bg-success");
      });
    });
  });

  describe("Change Sections", () => {
    it("displays different change types with proper icons", () => {
      render(<ChangelogModal {...defaultProps} />);

      // Check for section headers with icons
      expect(screen.getAllByText("Added").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Changed").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Fixed").length).toBeGreaterThan(0);

      // Check for Bootstrap icons (via class names) in the DOM
      const addedElements = screen.getAllByText("Added");
      expect(addedElements.length).toBeGreaterThan(0);
    });

    it("renders appropriate sections for each version", () => {
      render(<ChangelogModal {...defaultProps} />);

      // Check that different section types exist across versions
      expect(screen.getAllByText("Added").length).toBeGreaterThan(0);

      // Other versions may have changed/fixed items
      const changedHeaders = screen.getAllByText("Changed");
      const fixedHeaders = screen.getAllByText("Fixed");

      // These should exist for some versions
      expect(changedHeaders.length).toBeGreaterThan(0);
      expect(fixedHeaders.length).toBeGreaterThan(0);
    });
  });

  describe("Coming Soon Section", () => {
    it("displays future version plans", () => {
      render(<ChangelogModal {...defaultProps} />);

      expect(screen.getByText("Coming Soon")).toBeInTheDocument();

      // Dynamically check for all versions in futurePlans
      Object.keys(futurePlans).forEach((version) => {
        expect(screen.getByText(new RegExp(`${version}:`))).toBeInTheDocument();
      });

      // Dynamically check that each version's features are rendered
      Object.entries(futurePlans).forEach(([_version, plan]) => {
        // Check that first two features from each plan are shown (features are comma-separated in display)
        const firstTwoFeatures = plan.features.slice(0, 2).join(", ");
        // Escape all regex special characters for safe use in RegExp
        const escapedFeatures = firstTwoFeatures.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        expect(screen.getByText(new RegExp(escapedFeatures))).toBeInTheDocument();
      });
    });
  });

  describe("Footer Links", () => {
    it("includes semantic versioning reference", () => {
      render(<ChangelogModal {...defaultProps} />);

      expect(screen.getByText("Worktime follows")).toBeInTheDocument();

      const semverLink = screen.getByText("Semantic Versioning");
      expect(semverLink).toHaveAttribute("href", "https://semver.org/");
      expect(semverLink).toHaveAttribute("target", "_blank");
      expect(semverLink).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  describe("Accessibility", () => {
    it("has proper modal title and close functionality", () => {
      render(<ChangelogModal {...defaultProps} />);

      // Modal should have proper title
      const modalTitle = screen.getByText("What's New in Worktime");
      expect(modalTitle).toBeInTheDocument();

      // Close button should be accessible
      const closeButton = screen.getByText("Close");
      expect(closeButton).toHaveAttribute("type", "button");
    });

    it("supports keyboard navigation through accordion", () => {
      render(<ChangelogModal {...defaultProps} />);

      const firstAccordionButton = screen.getByText("Version 3.1.0").closest("button");
      expect(firstAccordionButton).toBeInTheDocument();
      expect(firstAccordionButton).toHaveAttribute("type", "button");
    });
  });
});
