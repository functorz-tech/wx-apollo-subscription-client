"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_link_1 = require("apollo-link");
class WebSocketLink extends apollo_link_1.ApolloLink {
    constructor(paramsOrClient) {
        super();
        this.subscriptionClient = paramsOrClient;
    }
    request(operation) {
        return this.subscriptionClient.request(operation);
    }
}
exports.WebSocketLink = WebSocketLink;
