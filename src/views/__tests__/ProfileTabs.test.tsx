import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Profile from "../Profile";
import { api } from "@/lib/api";
import type { User } from "@/lib/api";
import enTranslations from "@/locales/en.json";

function getTranslation(obj: unknown, path: string): string {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return path;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : path;
}

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { count?: number; email?: string }) => {
        if (key === "profile.fields.ageUnit") {
          return `${options?.count} years`;
        }
        if (options?.email) {
          return key.replace("{{email}}", options.email);
        }
        return getTranslation(enTranslations, key) || key;
      },
      i18n: { language: "en" },
    }),
  };
});

vi.mock("@/lib/api", () => ({
  api: {
    updateProfile: vi.fn(),
    uploadProfilePicture: vi.fn(),
    changePassword: vi.fn(),
    deleteUserData: vi.fn(),
    deleteAccount: vi.fn(),
    getMe: vi.fn(),
    getIntegrations: vi.fn().mockResolvedValue([]),
  },
}));

describe("Profile Tabbed Navigation and Functionality", () => {
  const mockUser: User = {
    id: 1,
    email: "testuser@example.com",
    display_name: "Tab Tester",
    gender: "male",
    birthday: "1990-05-15",
    height_cm: 180,
    target_weight_kg: 75,
    profile_image_path: null,
    profile_image_url: null,
    preferred_language: "en",
    email_confirmed: true,
    pending_email: null,
    created_at: "2026-01-01T00:00:00Z",
  };

  const mockOnProfileUpdated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all 5 tabs and defaults to Account Information", () => {
    render(<Profile user={mockUser} onProfileUpdated={mockOnProfileUpdated} />);

    const accountTabs = screen.getAllByRole("tab", { name: /Account Information/i });
    expect(accountTabs.length).toBeGreaterThanOrEqual(1);

    const personalTabs = screen.getAllByRole("tab", { name: /Personal Details/i });
    expect(personalTabs.length).toBeGreaterThanOrEqual(1);

    const securityTabs = screen.getAllByRole("tab", { name: /Security/i });
    expect(securityTabs.length).toBeGreaterThanOrEqual(1);

    const privacyTabs = screen.getAllByRole("tab", { name: /Privacy/i });
    expect(privacyTabs.length).toBeGreaterThanOrEqual(1);

    const integrationsTabs = screen.getAllByRole("tab", { name: /Integrations/i });
    expect(integrationsTabs.length).toBeGreaterThanOrEqual(1);

    // Default active panel is Account Information
    expect(screen.getByRole("tabpanel", { name: /Account Information/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Display Name")).toHaveValue("Tab Tester");
  });

  it("switches to Personal Details tab and calculates age in real-time", () => {
    const { container } = render(<Profile user={mockUser} onProfileUpdated={mockOnProfileUpdated} />);

    // Switch to Personal Details
    const personalTab = screen.getAllByRole("tab", { name: /Personal Details/i })[0];
    fireEvent.click(personalTab);

    expect(screen.getByRole("tabpanel", { name: /Personal Details/i })).toBeInTheDocument();

    // Check calculated age input field (1990 birth year -> 36 in 2026)
    const ageInput = screen.getByLabelText("Age");
    expect(ageInput).toBeInTheDocument();
    expect(ageInput).toHaveValue("36 years");

    // Change birth year to 2000
    const yearSelect = container.querySelector("#birthday-year") as HTMLSelectElement;
    expect(yearSelect).toBeInTheDocument();
    fireEvent.change(yearSelect, { target: { value: "2000" } });

    expect(ageInput).toHaveValue("26 years");
  });

  it("saves changes in Account Information tab", async () => {
    vi.mocked(api.updateProfile).mockResolvedValueOnce({
      ...mockUser,
      display_name: "Updated Name",
    });

    render(<Profile user={mockUser} onProfileUpdated={mockOnProfileUpdated} />);

    const nameInput = screen.getByLabelText("Display Name");
    fireEvent.change(nameInput, { target: { value: "Updated Name" } });

    const saveBtn = screen.getByRole("button", { name: /Save Settings/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.updateProfile).toHaveBeenCalledWith({
        display_name: "Updated Name",
        preferred_language: "en",
      });
      expect(mockOnProfileUpdated).toHaveBeenCalled();
    });
  });

  it("saves changes in Personal Details tab", async () => {
    vi.mocked(api.updateProfile).mockResolvedValueOnce({
      ...mockUser,
      height_cm: 185,
    });

    render(<Profile user={mockUser} onProfileUpdated={mockOnProfileUpdated} />);

    // Switch to Personal tab
    const personalTab = screen.getAllByRole("tab", { name: /Personal Details/i })[0];
    fireEvent.click(personalTab);

    const heightInput = screen.getByLabelText("Height (cm)");
    fireEvent.change(heightInput, { target: { value: "185" } });

    const saveBtn = screen.getByRole("button", { name: /Save Settings/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          height_cm: 185,
        })
      );
    });
  });

  it("validates password mismatch in Security tab", async () => {
    render(<Profile user={mockUser} onProfileUpdated={mockOnProfileUpdated} />);

    // Switch to Security tab
    const securityTab = screen.getAllByRole("tab", { name: /Security/i })[0];
    fireEvent.click(securityTab);

    expect(screen.getByRole("tabpanel", { name: /Security/i })).toBeInTheDocument();

    const currentPwd = screen.getByLabelText("Current Password");
    const newPwd = screen.getByLabelText("New Password");
    const confirmPwd = screen.getByLabelText("Confirm New Password");

    fireEvent.change(currentPwd, { target: { value: "current123" } });
    fireEvent.change(newPwd, { target: { value: "newpassword123" } });
    fireEvent.change(confirmPwd, { target: { value: "different123" } });

    const submitBtn = screen.getByRole("button", { name: "Update Password" });
    fireEvent.click(submitBtn);

    expect(screen.getByText("New password and confirmation do not match")).toBeInTheDocument();
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it("successfully updates password in Security tab", async () => {
    vi.mocked(api.changePassword).mockResolvedValueOnce({
      message: "Password changed successfully",
    });

    render(<Profile user={mockUser} onProfileUpdated={mockOnProfileUpdated} />);

    // Switch to Security tab
    const securityTab = screen.getAllByRole("tab", { name: /Security/i })[0];
    fireEvent.click(securityTab);

    const currentPwd = screen.getByLabelText("Current Password");
    const newPwd = screen.getByLabelText("New Password");
    const confirmPwd = screen.getByLabelText("Confirm New Password");

    fireEvent.change(currentPwd, { target: { value: "current123" } });
    fireEvent.change(newPwd, { target: { value: "newpassword123" } });
    fireEvent.change(confirmPwd, { target: { value: "newpassword123" } });

    const submitBtn = screen.getByRole("button", { name: "Update Password" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.changePassword).toHaveBeenCalledWith("current123", "newpassword123");
      expect(screen.getByText("Your password has been changed successfully!")).toBeInTheDocument();
    });
  });

  it("switches to Privacy tab and displays data deletion options", () => {
    render(<Profile user={mockUser} onProfileUpdated={mockOnProfileUpdated} />);

    // Switch to Privacy tab
    const privacyTab = screen.getAllByRole("tab", { name: /Privacy/i })[0];
    fireEvent.click(privacyTab);

    expect(screen.getByRole("tabpanel", { name: /Privacy/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete My Data" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Account" })).toBeInTheDocument();
  });

  it("switches to Integrations tab and displays Fitdays connection panel", async () => {
    render(<Profile user={mockUser} onProfileUpdated={mockOnProfileUpdated} />);

    // Switch to Integrations tab
    const integrationsTab = screen.getAllByRole("tab", { name: /Integrations/i })[0];
    fireEvent.click(integrationsTab);

    expect(screen.getByRole("tabpanel", { name: /Integrations/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Fitdays Cloud")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Connect & Verify" })).toBeInTheDocument();
    });
  });
});
