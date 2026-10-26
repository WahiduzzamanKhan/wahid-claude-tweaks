export type Tally = { input: number; output: number; cacheRead: number; cacheWrite: number }

export type ContextFill = { tokens?: number; window: number; percent?: number }

export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Gauge = { context: ContextFill | null; rateLimits: Limit[]; usd: number | null }

// What the settings pane switches: which sections show, the hourglass before
// reset countdowns, whether the band shows outside the terminal, and the
// percentages where meters turn amber and red.
export type Prefs = {
  tokens: boolean
  agents: boolean
  context: boolean
  quota: boolean
  hourglass: boolean
  terminalOnly: boolean
  warnAt: number
  hotAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'token-meter': { sessionId: string; session: Tally; agents: number; gauge: Gauge; prefs: Prefs }
  }
}
