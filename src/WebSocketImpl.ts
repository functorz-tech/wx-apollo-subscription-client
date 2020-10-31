import EventEmitter from 'eventemitter3';
import GRAPHQL_WS from './protocol';

export const CONNECTING = 0;
export const OPEN = 1;
export const CLOSING = 2;
export const CLOSED = 3;

export class WebSocketImpl extends EventEmitter implements WebSocket {

  public get CLOSED() {
    return 3;
  }

  public get CLOSING() {
    return 2;
  }

  public get CONNECTING() {
    return 0;
  }

  public get OPEN() {
    return 1;
  }

  protocol: string;

  public get readyState() {
    return this.socketTask.readyState;
  }

  url: string;

  binaryType: BinaryType;

  bufferedAmount: 0;

  extensions: string;

  private socketTask: WX.SocketTask;

  private listenersByType: Map<string, Set<any>>;

  constructor(url: string, protocols?: string[]) {
    super();
    this.url = url;
    this.protocol = GRAPHQL_WS;
    this.extensions = '';
    this.binaryType = 'blob';
    this.listenersByType = new Map();
    const option: WX.ConnectOption = {
      url: this.url,
      protocols: [this.protocol],
      success: res => {
        const listeners = this.listenersByType.get('open');
        if (listeners) {
          listeners.forEach(listener => listener(res));
        }
      },
    };
    this.socketTask = wx.connectSocket(option);
    this.socketTask.onClose((ev: CloseEvent) => {
      const listeners = this.listenersByType.get('close');
      if (listeners) {
        listeners.forEach(listener => {
          if (listener) {
            listener(ev);
          }
        });
      }
    });
    this.socketTask.onError((ev: WX.ErrorEvent) => {
      const listeners = this.listenersByType.get('error');
      if (listeners) {
        listeners.forEach(listener => listener(ev));
      }
    });
    this.socketTask.onMessage((ev: WX.MessageEvent<any>) => {
      const listeners = this.listenersByType.get('message');
      if (listeners) {
        listeners.forEach(listener => listener(ev));
      }
    });
    this.socketTask.onOpen((ev: WX.OnOpenEvent) => {
      const listeners = this.listenersByType.get('open');
      if (listeners) {
        listeners.forEach(listener => listener(ev));
      }
    });
  }
  terminate(): void {
    throw new Error('Method not implemented.');
  }
  setMaxListeners(n: number): this {
    throw new Error('Method not implemented.');
  }
  getMaxListeners(): number {
    throw new Error('Method not implemented.');
  }
  rawListeners(event: string | symbol): Function[] {
    throw new Error('Method not implemented.');
  }
  prependListener(event: string | symbol, listener: (...args: any[]) => void): this {
    throw new Error('Method not implemented.');
  }
  prependOnceListener(event: string | symbol, listener: (...args: any[]) => void): this {
    throw new Error('Method not implemented.');
  }

  dispatchEvent(event: Event): boolean {
    throw new Error('Method not implemented.');
  }

  public get onclose() {
    throw new Error('Method not implemented.');  // maybe return a chained function depending on the content of listenersByType
  }

  public set onclose(listener: (this: WebSocket, ev: CloseEvent) => any) {
    this.listenersByType.set('close', new Set([listener]));
  }

  public get onerror() {
    throw new Error('Method not implemented.'); // maybe return a chained function depending on the content of listenersByType
  }

  public set onerror(listener: (this: WebSocket, ev: Event) => any) {
    this.listenersByType.set('error', new Set([listener]));
  }

  public get onmessage() {
    throw new Error('Method not implemented.'); // maybe return a chained function depending on the content of listenersByType
  }

  public set onmessage(
    listener: (this: WebSocket, ev: MessageEvent) => any
  ) {
    this.listenersByType.set('message', new Set([listener]));
  }

  public get onopen() {
    throw new Error('Method not implemented.'); // maybe return a chained function depending on the content of listenersByType
  }

  public set onopen(listener: (this: WebSocket, ev: Event) => any) {
    this.listenersByType.set('open', new Set([listener]));
    if (this.readyState === OPEN && listener) {
      listener.apply(this);
    }
  }

  ping(data, mask, cb) {
    console.log('not sure how to deal with ping', data, mask, cb);
  }

  pong(data, mask, cb) {
    console.log('not sure how to deal with pong', data, mask, cb);
  }

  close(code?: number, reason?: string): void {
    this.socketTask.close({ code, reason });
  }

  send(
    data: string | ArrayBuffer | SharedArrayBuffer | Blob | ArrayBufferView
  ): void {
    const d = data as string;
    this.socketTask.send({ data: d });
  }

  addEventListener<K extends 'close' | 'error' | 'message' | 'open'>(
    type: K,
    listener: (this: WebSocket, ev: WebSocketEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): void;

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void;

  addEventListener(type: any, listener: any, options?: any) {
    let listeners = this.listenersByType.get(type);
    if (!listeners) {
      listeners = new Set();
    }
    listeners.add(listener);
  }

  removeEventListener<K extends 'close' | 'error' | 'message' | 'open'>(
    type: K,
    listener: (this: WebSocket, ev: WebSocketEventMap[K]) => any,
    options?: boolean | EventListenerOptions
  ): void;

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void;

  removeEventListener(type: any, listener: any, options?: any) {
    let listeners = this.listenersByType.get(type);
    if (!listeners) {
      listeners = new Set();
    }
    listeners.add(listener);
  }
}
