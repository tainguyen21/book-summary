import { render, screen } from "@testing-library/react";
import HomePage from "./page";

it("renders the library heading", () => {
  render(<HomePage />);

  expect(screen.getByRole("heading", { name: "Your library" })).toBeVisible();
});
