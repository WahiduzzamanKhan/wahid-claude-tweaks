export type Tally = { input: number; output: number; cacheRead: number; cacheWrite: number }

export type ContextFill = { tokens?: number; window: number; percent?: number }

export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Gauge = { context: ContextFill | null; rateLimits: Limit[]; usd: number | null }

declare module 'claude-code' {
  interface PluginState {
    'token-meter': { sessionId: string; session: Tally; agents: number; gauge: Gauge }
  }
}
