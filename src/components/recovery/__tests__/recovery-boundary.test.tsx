// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { expect, it } from "vitest"
import { RecoveryBoundary } from "../recovery-boundary"

function BrokenView(): never {
  throw new Error("config field is missing")
}

it("user opens a view that fails to render: Given a child that throws, When the boundary renders it, Then the user sees the recovery screen with the error", () => {
  // Given
  const view = (
    <RecoveryBoundary>
      <BrokenView />
    </RecoveryBoundary>
  )

  // When
  render(view)

  // Then
  expect(screen.getByRole("heading", { name: "errorRecovery.title" })).toBeInTheDocument()
  expect(screen.getByRole("alert")).toHaveTextContent("config field is missing")
})
