import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OwnerGate } from "./OwnerGate";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => mocks.verify,
}));
vi.mock("@/lib/session.functions", () => ({
  verifyOwnerAccess: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
      onAuthStateChange: mocks.onAuthStateChange,
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mocks.signInWithPassword.mockResolvedValue({ error: null });
  mocks.verify.mockResolvedValue({ authorized: true });
  mocks.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
});

describe("OwnerGate", () => {
  it("shows a login form before authentication, hiding the dashboard", async () => {
    render(<OwnerGate><div>لوحة خاصة</div></OwnerGate>);
    expect(await screen.findByRole("button", { name: /دخول لوحة التحكم/ })).toBeInTheDocument();
    expect(screen.queryByText("لوحة خاصة")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("البريد الإلكتروني"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("كلمة المرور"), { target: { value: "a-test-password" } });
    fireEvent.click(screen.getByRole("button", { name: /دخول لوحة التحكم/ }));
    await waitFor(() => {
      expect(mocks.signInWithPassword).toHaveBeenCalledWith({
        email: "owner@example.com",
        password: "a-test-password",
      });
    });
  });

  it("does not render dashboard for a signed-in user rejected by server verification", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "fake-user-token" } },
      error: null,
    });
    mocks.verify.mockRejectedValue(new Error("Not authorized"));
    render(<OwnerGate><div>لوحة خاصة</div></OwnerGate>);
    expect(await screen.findByText(/لم يتم تأكيد صلاحية مالك النظام/)).toBeInTheDocument();
    expect(screen.queryByText("لوحة خاصة")).not.toBeInTheDocument();
  });

  it("renders dashboard only after the server confirms owner access", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "owner-token" } },
      error: null,
    });
    render(<OwnerGate><div>لوحة خاصة</div></OwnerGate>);
    expect(await screen.findByText("لوحة خاصة")).toBeInTheDocument();
    expect(mocks.verify).toHaveBeenCalledWith({ data: {} });
  });
});
