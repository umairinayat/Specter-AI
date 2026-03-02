// Type declarations for modules without @types packages

declare module 'mic' {
  interface MicOptions {
    rate?: string
    channels?: string
    fileType?: string
    bitwidth?: string
    encoding?: string
    endian?: string
    device?: string
    [key: string]: string | undefined
  }

  interface MicInstance {
    getAudioStream(): NodeJS.ReadableStream
    start(): void
    stop(): void
  }

  function mic(opts: MicOptions): MicInstance
  export = mic
}

declare module 'screenshot-desktop' {
  interface ScreenshotOptions {
    format?: 'png' | 'jpg'
    screen?: number
    filename?: string
  }

  function screenshot(options?: ScreenshotOptions): Promise<Buffer>
  export = screenshot
}
