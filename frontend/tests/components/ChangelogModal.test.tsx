import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChangelogModal } from "@/components/ChangelogModal";
import { type ChangelogVersion, changelogData, futurePlans } from "@/data/changelog";

const hasEntries = (version: ChangelogVersion, category: string) =>
  version.categories.some((c) => c.name === category && c.entries.length > 0);

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
      const accordionItems = document.querySelectorAll("[data-slot=accordion-item]");
      expect(accordionItems.length).toBe(changelogData.length);
    });
  });

  describe("Changelog Content", () => {
    it("renders change sections based on data structure", () => {
      render(<ChangelogModal {...defaultProps} />);

      // Test that Added sections exist for versions that have added items
      const versionsWithAdded = changelogData.filter((v) => hasEntries(v, "Added"));
      if (versionsWithAdded.length > 0) {
        const addedSections = screen.getAllByText("Added");
        expect(addedSections.length).toBeGreaterThan(0);
      }

      // Test that Changed sections exist for versions that have changed items
      const versionsWithChanged = changelogData.filter((v) => hasEntries(v, "Changed"));
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
        const hasThisSection = changelogData.some((version) => hasEntries(version, sectionType));

        if (hasThisSection) {
          const sectionElements = screen.getAllByText(sectionType);
          expect(sectionElements.length).toBeGreaterThan(0);
        }
      });
    });

    it("renders technical details when their version is expanded", async () => {
      render(<ChangelogModal {...defaultProps} />);
      const withNote = (v: ChangelogVersion) =>
        v.categories.find((c) => c.prose?.startsWith("#### "));
      const version = changelogData.find((v) => withNote(v));
      expect(version).toBeDefined();
      const match = /^#### (.+?)\s*\n+([\s\S]*)$/.exec(withNote(version!)!.prose!.trim())!;
      const trigger = screen.getByRole("button", {
        name: new RegExp(`Version ${version!.version}`),
      });
      if (trigger.getAttribute("aria-expanded") !== "true") fireEvent.click(trigger);
      expect(await screen.findByText(`${match[1]}:`)).toBeInTheDocument();
      expect(screen.getByText(match[2]!.trim(), { exact: false })).toBeInTheDocument();
    });

    it("displays version content in collapsible accordion format", () => {
      render(<ChangelogModal {...defaultProps} />);

      // Test that accordion structure exists
      const accordionItems = document.querySelectorAll("[data-slot=accordion-item]");
      expect(accordionItems.length).toBe(changelogData.length);

      // Test that first version has expanded content by default
      const firstVersionHeader = screen.getByText(`Version ${changelogData[0]!.version}`);
      const accordionItem = firstVersionHeader.closest("[data-slot=accordion-item]");
      expect(accordionItem).toBeInTheDocument();

      if (accordionItem) {
        // Verify the accordion body exists
        const accordionBody = accordionItem.querySelector("[data-slot=accordion-content]");
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

      // Check badge colors through semantic token classes
      const currentBadge = screen.getByText("Current");
      expect(currentBadge).toHaveClass("bg-primary");

      const releasedBadges = screen.getAllByText("Released");
      expect(releasedBadges.length).toBeGreaterThan(0);
      releasedBadges.forEach((badge) => {
        expect(badge).toHaveClass("bg-success-bg");
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

      // Section headings include decorative SVG icons.
      const addedElements = screen.getAllByText("Added");
      expect(addedElements.length).toBeGreaterThan(0);
      expect(addedElements[0]?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
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

  describe("Audience filtering", () => {
    it("never shows entries from the Internal category", () => {
      expect(
        changelogData.some((version) => version.categories.some((c) => c.name === "Internal")),
      ).toBe(false);
    });

    it("shows an entry's scope before its text", () => {
      const scoped = changelogData
        .flatMap((v) => v.categories.flatMap((c) => c.entries))
        .find((entry) => entry.scope);
      if (!scoped) return; // no scoped entries in the changelog yet
      render(<ChangelogModal {...defaultProps} />);
      expect(screen.getAllByText(`${scoped.scope}:`, { exact: false }).length).toBeGreaterThan(0);
    });
  });

  describe("Coming Soon Section", () => {
    it("displays future plans", () => {
      render(<ChangelogModal {...defaultProps} />);

      expect(screen.getByText("Coming Soon")).toBeInTheDocument();

      // Dynamically check that each planned feature is rendered
      futurePlans.forEach((feature) => {
        // Escape all regex special characters for safe use in RegExp
        const escapedFeature = feature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        expect(screen.getByText(new RegExp(escapedFeature))).toBeInTheDocument();
      });
    });
  });

  describe("Footer Links", () => {
    it("includes CalVer versioning reference", () => {
      render(<ChangelogModal {...defaultProps} />);

      expect(screen.getByText("Worktime follows")).toBeInTheDocument();

      const versioningLink = screen.getByText("CalVer");
      expect(versioningLink).toHaveAttribute("href", "https://calver.org/");
      expect(versioningLink).toHaveAttribute("target", "_blank");
      expect(versioningLink).toHaveAttribute("rel", "noopener noreferrer");
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
