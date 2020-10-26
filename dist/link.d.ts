import { ApolloLink, Operation, FetchResult, Observable } from 'apollo-link';
import { SubscriptionClient } from './client';
export default class WebSocketLink extends ApolloLink {
    private subscriptionClient;
    constructor(paramsOrClient: SubscriptionClient);
    request(operation: Operation): Observable<FetchResult> | null;
}
