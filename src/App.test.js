import { render, screen } from "@testing-library/react";
import App from "./app/App";

test("renders app title", () => {
  render(<App />);
  const title = screen.getByText(/porodicni atlas/i);
  expect(title).toBeInTheDocument();
});
