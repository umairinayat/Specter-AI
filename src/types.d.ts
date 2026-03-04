// Type declarations for modules without @types packages

declare module 'screenshot-desktop' {
  interface ScreenshotOptions {
    format?: 'png' | 'jpg'
    screen?: number
    filename?: string
  }

  function screenshot(options?: ScreenshotOptions): Promise<Buffer>
  export = screenshot
}
