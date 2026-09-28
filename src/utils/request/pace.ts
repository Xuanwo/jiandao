/** What a service has shown it tolerates. Stored per service, so the next session starts here. */
export interface PaceState {
  /** Requests per second the queue uses now. */
  rate: number
  /** The rate at which the service last answered 429 or timed out; null until that happens. */
  ceiling: number | null
}

export interface PaceLimits {
  minRate: number
  /** A numerical guard, not a policy: the service's own throttling is the real limit. */
  maxRate: number
  /** The burst allowance, as seconds' worth of requests at the current rate. */
  burstSeconds: number
}

/** The rate settles this far below a known ceiling instead of running into it again. */
const HEADROOM = 0.9
/** After this many successes in a row, a known ceiling is raised to see whether the service allows more. */
const RELAX_AFTER = 50
const RELAX_FACTOR = 1.2

/**
 * Finds and keeps the pace a service tolerates, with no fixed limit of its
 * own. Until the service first throttles, every success doubles the rate.
 * A 429 or a timeout records the current rate as the ceiling and halves the
 * rate; after that every success closes half the gap to just below the
 * ceiling. A run of successes raises the ceiling, so a service that lifts its
 * limits is noticed. Starting from a stored state skips all of this probing.
 */
export class Pace {
  private state: PaceState
  private streak = 0

  constructor(private readonly limits: PaceLimits, initial: PaceState, private readonly onChange?: (state: PaceState) => void) {
    this.state = { rate: this.clamp(initial.rate), ceiling: initial.ceiling }
  }

  get rate(): number {
    return this.state.rate
  }

  get capacity(): number {
    return Math.max(1, Math.round(this.state.rate * this.limits.burstSeconds))
  }

  snapshot(): PaceState {
    return { ...this.state }
  }

  recordSuccess() {
    this.streak++
    let { rate, ceiling } = this.state
    if (ceiling === null) {
      rate *= 2
    }
    else {
      if (this.streak >= RELAX_AFTER) {
        this.streak = 0
        ceiling = Math.min(this.limits.maxRate, ceiling * RELAX_FACTOR)
      }
      const target = ceiling * HEADROOM
      if (rate < target)
        rate += (target - rate) / 2
    }
    this.update({ rate, ceiling })
  }

  recordThrottle() {
    this.streak = 0
    this.update({ rate: this.state.rate / 2, ceiling: this.state.rate })
  }

  private update(next: PaceState) {
    const state = { rate: this.clamp(next.rate), ceiling: next.ceiling }
    if (state.rate === this.state.rate && state.ceiling === this.state.ceiling)
      return
    this.state = state
    this.onChange?.(this.snapshot())
  }

  private clamp(rate: number): number {
    return Math.min(this.limits.maxRate, Math.max(this.limits.minRate, rate))
  }
}
