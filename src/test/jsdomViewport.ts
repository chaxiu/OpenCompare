import { afterAll, beforeAll } from 'vitest'

interface JsdomViewportOptions {
  readonly width?: number
  readonly height?: number
}

/**
 * jsdom reports zero-sized elements, which leaves virtualised trees without a
 * viewport. Pin a fixed client box for the whole file and restore it afterwards.
 */
export function installJsdomViewport({
  width = 1200,
  height = 640
}: JsdomViewportOptions = {}): () => void {
  const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
  const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')

  const restore = (): void => {
    if (originalWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalWidth)
    else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
    if (originalHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalHeight)
    else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
  }

  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => width
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => height
    })
  })

  afterAll(restore)
  return restore
}
