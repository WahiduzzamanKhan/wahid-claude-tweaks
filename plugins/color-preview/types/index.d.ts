// Which colour formats get painted; every one is on until switched off.
export type Formats = { hex: boolean; rgb: boolean; hsl: boolean; named: boolean }

declare module 'claude-code' {
  interface PluginState {
    'color-preview': { formats: Formats }
  }
}
