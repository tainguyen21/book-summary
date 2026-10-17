import { render, screen } from "@testing-library/react";
import HomePage from "./page";

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: { email: "reader@example.com" },
    loginWithRedirect: vi.fn(),
    logout: vi.fn(),
  }),
}));

it("renders the landing page heading", () => {
  render(<HomePage />);

  expect(
    screen.getByRole("heading", { level: 1, name: /Understand any book/ }),
  ).toBeVisible();
});
