import { ApolloLink, Operation, FetchResult, Observable } from 'apollo-link';

import { SubscriptionClient } from './client';

export class WebSocketLink extends ApolloLink {
  private subscriptionClient: SubscriptionClient;

  constructor(paramsOrClient: SubscriptionClient) {
    super();
    this.subscriptionClient = paramsOrClient;
  }

  public request(operation: Operation): Observable<FetchResult> | null {
    return this.subscriptionClient.request(operation) as Observable<
      FetchResult
    >;
  }
}
