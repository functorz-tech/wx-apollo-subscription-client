declare namespace WX {
  interface ConnectOption {
    url: string
    complete?: (res: Record<string, any>) => void
    fail?: (res: Record<string, any>) => void
    header?: Record<string, any>
    protocols?: string[]
    success?: (res: Record<string, any>) => void
    tcpNoDelay?: boolean
  }

  interface CloseOption {
    code?: number
    complete?: (res: Record<string, any>) => void
    fail?: (res: Record<string, any>) => void
    reason?: string
    success?: (res: Record<string, any>) => void
  }
  type OnCloseCallback = (
    result: OnCloseCallbackResult,
  ) => void
  interface OnCloseCallbackResult {
    code: number
    reason: string
  }
  type OnErrorCallback = (
    result: ErrorEvent,
  ) => void
  interface ErrorEvent {
    errMsg: string
  }
  type OnMessageCallback<T = any> = (
    result: MessageEvent<T>,
  ) => void
  interface MessageEvent<T extends any | string | ArrayBuffer = any> {
    data: T
  }
  type OnOpenCallback = (result: OnOpenEvent) => void
  interface OnOpenEvent {
    header: Record<string, any>
  }
  interface SendOption {
    data: string | ArrayBuffer
    complete?: (res: Record<string, any>) => void
    fail?: (res: Record<string, any>) => void
    success?: (res: Record<string, any>) => void
  }

  interface SocketTask {
    close(option: CloseOption): void
    onClose(
      callback: OnCloseCallback,
    ): void
    onError(
      callback: OnErrorCallback,
    ): void

    onMessage<T = any>(
      callback: OnMessageCallback<T>,
    ): void

    onOpen(
      callback: OnOpenCallback,
    ): void
    send(option: SendOption): void

    readonly socketTaskId: number
    readonly readyState: number
    readonly errMsg: string
    readonly CONNECTING: number
    readonly OPEN: number
    readonly CLOSING: number
    readonly CLOSED: number
  }
}

declare namespace wx {
  function connectSocket(option: WX.ConnectOption): WX.SocketTask
}