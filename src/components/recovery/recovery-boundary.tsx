import type { ErrorInfo, ReactNode } from "react"
import { Component } from "react"
import { RecoveryFallback } from "@/components/recovery/recovery-fallback"
import { logger } from "@/utils/logger"

interface RecoveryBoundaryProps {
  children: ReactNode
}

interface RecoveryBoundaryState {
  error: Error | null
}

/**
 * Catches a render error anywhere in the popup or settings page and shows
 * the recovery screen, which can reset the config and try again.
 */
export class RecoveryBoundary extends Component<RecoveryBoundaryProps, RecoveryBoundaryState> {
  override state: RecoveryBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): RecoveryBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error("Render failed", error, info.componentStack)
  }

  reset = () => {
    this.setState({ error: null })
  }

  override render() {
    if (this.state.error) {
      return <RecoveryFallback error={this.state.error} onRecovered={this.reset} />
    }
    return this.props.children
  }
}
