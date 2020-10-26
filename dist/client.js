"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const backo2_1 = __importDefault(require("backo2"));
const eventemitter3_1 = require("eventemitter3");
const printer_1 = require("graphql/language/printer");
const getOperationAST_1 = require("graphql/utilities/getOperationAST");
const symbol_observable_1 = __importDefault(require("symbol-observable"));
const is_object_1 = __importDefault(require("./is-object"));
const is_string_1 = __importDefault(require("./is-string"));
const protocol_1 = __importDefault(require("./protocol"));
const defaults_1 = require("./defaults");
const message_types_1 = __importDefault(require("./message-types"));
class SubscriptionClient {
    constructor(url, options, webSocketImpl, webSocketProtocols) {
        const { connectionCallback = undefined, connectionParams = {}, minTimeout = defaults_1.MIN_WS_TIMEOUT, timeout = defaults_1.WS_TIMEOUT, reconnect = false, reconnectionAttempts = Infinity, lazy = false, inactivityTimeout = 0, wsOptionArguments = [], } = options || {};
        this.wsImpl = webSocketImpl;
        if (!this.wsImpl) {
            throw new Error('must provide wsImpl');
        }
        this.wsProtocols = webSocketProtocols || protocol_1.default;
        this.connectionCallback = connectionCallback;
        this.url = url;
        this.operations = {};
        this.nextOperationId = 0;
        this.minWsTimeout = minTimeout;
        this.wsTimeout = timeout;
        this.unsentMessagesQueue = [];
        this.reconnect = reconnect;
        this.reconnecting = false;
        this.reconnectionAttempts = reconnectionAttempts;
        this.lazy = !!lazy;
        this.inactivityTimeout = inactivityTimeout;
        this.closedByUser = false;
        this.backoff = new backo2_1.default({ jitter: 0.5 });
        this.eventEmitter = new eventemitter3_1.EventEmitter();
        this.middlewares = [];
        this.client = null;
        this.maxConnectTimeGenerator = this.createMaxConnectTimeGenerator();
        this.connectionParams = this.getConnectionParams(connectionParams);
        this.wsOptionArguments = wsOptionArguments;
        if (!this.lazy) {
            this.connect();
        }
    }
    get status() {
        if (this.client === null) {
            return this.wsImpl.CLOSED;
        }
        return this.client.readyState;
    }
    close(isForced = true, closedByUser = true) {
        this.clearInactivityTimeout();
        if (this.client !== null) {
            this.closedByUser = closedByUser;
            if (isForced) {
                this.clearCheckConnectionInterval();
                this.clearMaxConnectTimeout();
                this.clearTryReconnectTimeout();
                this.unsubscribeAll();
                this.sendMessage(undefined, message_types_1.default.GQL_CONNECTION_TERMINATE, null);
            }
            this.client.close();
            this.client.onopen = null;
            this.client.onclose = null;
            this.client.onerror = null;
            this.client.onmessage = null;
            this.client = null;
            this.eventEmitter.emit('disconnected');
            if (!isForced) {
                this.tryReconnect();
            }
        }
    }
    request(request) {
        const getObserver = this.getObserver.bind(this);
        const executeOperation = this.executeOperation.bind(this);
        const unsubscribe = this.unsubscribe.bind(this);
        let opId;
        this.clearInactivityTimeout();
        return {
            [symbol_observable_1.default]() {
                return this;
            },
            subscribe(observerOrNext, onError, onComplete) {
                const observer = getObserver(observerOrNext, onError, onComplete);
                opId = executeOperation(request, (error, result) => {
                    if (error === null && result === null) {
                        if (observer.complete) {
                            observer.complete();
                        }
                    }
                    else if (error) {
                        if (observer.error) {
                            observer.error(error[0]);
                        }
                    }
                    else if (observer.next) {
                        observer.next(result);
                    }
                });
                return {
                    unsubscribe: () => {
                        if (opId) {
                            unsubscribe(opId);
                            opId = null;
                        }
                    },
                };
            },
        };
    }
    on(eventName, callback, context) {
        const handler = this.eventEmitter.on(eventName, callback, context);
        return () => {
            handler.off(eventName, callback, context);
        };
    }
    onConnected(callback, context) {
        return this.on('connected', callback, context);
    }
    onConnecting(callback, context) {
        return this.on('connecting', callback, context);
    }
    onDisconnected(callback, context) {
        return this.on('disconnected', callback, context);
    }
    onReconnected(callback, context) {
        return this.on('reconnected', callback, context);
    }
    onReconnecting(callback, context) {
        return this.on('reconnecting', callback, context);
    }
    onError(callback, context) {
        return this.on('error', callback, context);
    }
    unsubscribeAll() {
        Object.keys(this.operations).forEach(subId => {
            this.unsubscribe(subId);
        });
    }
    applyMiddlewares(options) {
        return new Promise((resolve, reject) => {
            const queue = (funcs, scope) => {
                const next = (error) => {
                    if (error) {
                        reject(error);
                    }
                    else if (funcs.length > 0) {
                        const f = funcs.shift();
                        if (f) {
                            f.applyMiddleware.apply(scope, [options, next]);
                        }
                    }
                    else {
                        resolve(options);
                    }
                };
                next();
            };
            queue([...this.middlewares], this);
        });
    }
    use(middlewares) {
        middlewares.forEach(middleware => {
            if (typeof middleware.applyMiddleware === 'function') {
                this.middlewares.push(middleware);
            }
            else {
                throw new Error('Middleware must implement the applyMiddleware function.');
            }
        });
        return this;
    }
    getConnectionParams(connectionParams) {
        return () => new Promise((resolve, reject) => {
            if (typeof connectionParams === 'function') {
                try {
                    return resolve(connectionParams.call(null));
                }
                catch (error) {
                    return reject(error);
                }
            }
            resolve(connectionParams);
        });
    }
    executeOperation(options, handler) {
        if (this.client === null) {
            this.connect();
        }
        const opId = this.generateOperationId();
        this.operations[opId] = { options, handler };
        this.applyMiddlewares(options)
            .then(processedOptions => {
            this.checkOperationOptions(processedOptions, handler);
            if (this.operations[opId]) {
                this.operations[opId] = { options: processedOptions, handler };
                this.sendMessage(opId, message_types_1.default.GQL_START, processedOptions);
            }
        })
            .catch(error => {
            this.unsubscribe(opId);
            handler(this.formatErrors(error));
        });
        return opId;
    }
    getObserver(observerOrNext, error, complete) {
        if (typeof observerOrNext === 'function') {
            return {
                next: (v) => observerOrNext(v),
                error: (e) => error && error(e),
                complete: () => complete && complete(),
            };
        }
        return observerOrNext;
    }
    createMaxConnectTimeGenerator() {
        const minValue = this.minWsTimeout;
        const maxValue = this.wsTimeout;
        return new backo2_1.default({
            min: minValue,
            max: maxValue,
            factor: 1.2,
        });
    }
    clearCheckConnectionInterval() {
        if (this.checkConnectionIntervalId) {
            clearInterval(this.checkConnectionIntervalId);
            this.checkConnectionIntervalId = null;
        }
    }
    clearMaxConnectTimeout() {
        if (this.maxConnectTimeoutId) {
            clearTimeout(this.maxConnectTimeoutId);
            this.maxConnectTimeoutId = null;
        }
    }
    clearTryReconnectTimeout() {
        if (this.tryReconnectTimeoutId) {
            clearTimeout(this.tryReconnectTimeoutId);
            this.tryReconnectTimeoutId = null;
        }
    }
    clearInactivityTimeout() {
        if (this.inactivityTimeoutId) {
            clearTimeout(this.inactivityTimeoutId);
            this.inactivityTimeoutId = null;
        }
    }
    setInactivityTimeout() {
        if (this.inactivityTimeout > 0 &&
            Object.keys(this.operations).length === 0) {
            this.inactivityTimeoutId = setTimeout(() => {
                if (Object.keys(this.operations).length === 0) {
                    this.close();
                }
            }, this.inactivityTimeout);
        }
    }
    checkOperationOptions(options, handler) {
        const { query, variables, operationName } = options;
        if (!query) {
            throw new Error('Must provide a query.');
        }
        if (!handler) {
            throw new Error('Must provide an handler.');
        }
        if ((!is_string_1.default(query) && !getOperationAST_1.getOperationAST(query, operationName)) ||
            (operationName && !is_string_1.default(operationName)) ||
            (variables && !is_object_1.default(variables))) {
            throw new Error('Incorrect option types. query must be a string or a document,' +
                '`operationName` must be a string, and `variables` must be an object.');
        }
    }
    buildMessage(id, type, payload) {
        const payloadToReturn = payload && payload.query
            ? Object.assign(Object.assign({}, payload), { query: typeof payload.query === 'string'
                    ? payload.query
                    : printer_1.print(payload.query) }) : payload;
        return {
            id,
            type,
            payload: payloadToReturn,
        };
    }
    formatErrors(errors) {
        if (Array.isArray(errors)) {
            return errors;
        }
        if (errors && errors.errors) {
            return this.formatErrors(errors.errors);
        }
        if (errors && errors.message) {
            return [errors];
        }
        return [
            {
                name: 'FormatedError',
                message: 'Unknown error',
                originalError: errors,
            },
        ];
    }
    sendMessage(id, type, payload) {
        this.sendMessageRaw(this.buildMessage(id, type, payload));
    }
    // send message, or queue it if connection is not open
    sendMessageRaw(message) {
        switch (this.status) {
            case this.wsImpl.OPEN: {
                const serializedMessage = JSON.stringify(message);
                try {
                    JSON.parse(serializedMessage);
                }
                catch (e) {
                    this.eventEmitter.emit('error', new Error(`Message must be JSON-serializable. Got: ${message}`));
                }
                this.client.send(serializedMessage);
                break;
            }
            case this.wsImpl.CONNECTING:
                this.unsentMessagesQueue.push(message);
                break;
            default:
                if (!this.reconnecting) {
                    this.eventEmitter.emit('error', new Error(`${'A message was not sent because socket is not connected, is closing or ' +
                        'is already closed. Message was: '}${JSON.stringify(message)}`));
                }
        }
    }
    generateOperationId() {
        return String(++this.nextOperationId);
    }
    tryReconnect() {
        if (!this.reconnect || this.backoff.attempts >= this.reconnectionAttempts) {
            return;
        }
        if (!this.reconnecting) {
            Object.keys(this.operations).forEach(key => {
                this.unsentMessagesQueue.push(this.buildMessage(key, message_types_1.default.GQL_START, this.operations[key].options));
            });
            this.reconnecting = true;
        }
        this.clearTryReconnectTimeout();
        const delay = this.backoff.duration();
        this.tryReconnectTimeoutId = setTimeout(() => {
            this.connect();
        }, delay);
    }
    flushUnsentMessagesQueue() {
        this.unsentMessagesQueue.forEach(message => {
            this.sendMessageRaw(message);
        });
        this.unsentMessagesQueue = [];
    }
    checkConnection() {
        if (this.wasKeepAliveReceived) {
            this.wasKeepAliveReceived = false;
            return;
        }
        if (!this.reconnecting) {
            this.close(false, true);
        }
    }
    checkMaxConnectTimeout() {
        this.clearMaxConnectTimeout();
        // Max timeout trying to connect
        this.maxConnectTimeoutId = setTimeout(() => {
            if (this.status !== this.wsImpl.OPEN) {
                this.reconnecting = true;
                this.close(false, true);
            }
        }, this.maxConnectTimeGenerator.duration());
    }
    connect() {
        this.client = new this.wsImpl(this.url, this.wsProtocols, ...this.wsOptionArguments);
        console.log('ws impl created');
        this.checkMaxConnectTimeout();
        this.client.onopen = async () => {
            console.log('subscription client onopen');
            if (this.status === this.wsImpl.OPEN) {
                this.clearMaxConnectTimeout();
                this.closedByUser = false;
                this.eventEmitter.emit(this.reconnecting ? 'reconnecting' : 'connecting');
                try {
                    const connectionParams = await this.connectionParams();
                    // Send CONNECTION_INIT message, no need to wait for connection to success (reduce roundtrips)
                    this.sendMessage(undefined, message_types_1.default.GQL_CONNECTION_INIT, connectionParams);
                    this.flushUnsentMessagesQueue();
                }
                catch (error) {
                    this.sendMessage(undefined, message_types_1.default.GQL_CONNECTION_ERROR, error);
                    this.flushUnsentMessagesQueue();
                }
            }
        };
        this.client.onclose = () => {
            if (!this.closedByUser) {
                this.close(false, false);
            }
        };
        this.client.onerror = (err) => {
            // Capture and ignore errors to prevent unhandled exceptions, wait for
            // onclose to fire before attempting a reconnect.
            this.eventEmitter.emit('error', err);
        };
        this.client.onmessage = ({ data }) => {
            this.processReceivedData(data);
        };
    }
    processReceivedData(receivedData) {
        let parsedMessage;
        let opId;
        try {
            parsedMessage = JSON.parse(receivedData);
            opId = parsedMessage.id;
        }
        catch (e) {
            throw new Error(`Message must be JSON-parseable. Got: ${receivedData}`);
        }
        if ([
            message_types_1.default.GQL_DATA,
            message_types_1.default.GQL_COMPLETE,
            message_types_1.default.GQL_ERROR,
        ].indexOf(parsedMessage.type) !== -1 &&
            !this.operations[opId]) {
            this.unsubscribe(opId);
            return;
        }
        switch (parsedMessage.type) {
            case message_types_1.default.GQL_CONNECTION_ERROR:
                if (this.connectionCallback) {
                    this.connectionCallback(parsedMessage.payload);
                }
                break;
            case message_types_1.default.GQL_CONNECTION_ACK:
                this.eventEmitter.emit(this.reconnecting ? 'reconnected' : 'connected', parsedMessage.payload);
                this.reconnecting = false;
                this.backoff.reset();
                this.maxConnectTimeGenerator.reset();
                if (this.connectionCallback) {
                    this.connectionCallback();
                }
                break;
            case message_types_1.default.GQL_COMPLETE: {
                const { handler } = this.operations[opId];
                delete this.operations[opId];
                handler.call(this, null, null);
                break;
            }
            case message_types_1.default.GQL_ERROR:
                this.operations[opId].handler(this.formatErrors(parsedMessage.payload), null);
                delete this.operations[opId];
                break;
            case message_types_1.default.GQL_DATA: {
                const parsedPayload = !parsedMessage.payload.errors
                    ? parsedMessage.payload
                    : Object.assign(Object.assign({}, parsedMessage.payload), { errors: this.formatErrors(parsedMessage.payload.errors) });
                this.operations[opId].handler(null, parsedPayload);
                break;
            }
            case message_types_1.default.GQL_CONNECTION_KEEP_ALIVE: {
                const firstKA = typeof this.wasKeepAliveReceived === 'undefined';
                this.wasKeepAliveReceived = true;
                if (firstKA) {
                    this.checkConnection();
                }
                if (this.checkConnectionIntervalId) {
                    clearInterval(this.checkConnectionIntervalId);
                    this.checkConnection();
                }
                this.checkConnectionIntervalId = setInterval(this.checkConnection.bind(this), this.wsTimeout);
                break;
            }
            default:
                throw new Error('Invalid message type!');
        }
    }
    unsubscribe(opId) {
        if (this.operations[opId]) {
            delete this.operations[opId];
            this.setInactivityTimeout();
            this.sendMessage(opId, message_types_1.default.GQL_STOP, undefined);
        }
    }
}
exports.SubscriptionClient = SubscriptionClient;
