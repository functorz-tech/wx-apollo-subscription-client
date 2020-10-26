# wx-apollo-subscription-client
A drop-in replacement for standard websocket that works in wechat miniprogram, useful when you want to utilize graphql subscription
```typescript

import { ApolloClient, DefaultOptions } from 'apollo-client'
import { ApolloLink, from, split } from 'apollo-link'
import { HttpLink } from 'apollo-link-http'
import { InMemoryCache } from 'apollo-cache-inmemory'
import wxApolloFetcher from 'wx-apollo-fetcher'
import { getMainDefinition } from 'apollo-utilities'
import { SubscriptionClient, WebSocketImpl, WebSocketLink } from 'wx-apollo-subscription-client';

function createApolloClient(httpUrl:string, wsUrl:string, token: string) {
  const httpAuthMiddleware = new ApolloLink((operation, forward) => {
    operation.setContext((context: Record<string, any>) => {
      let headers = context.headers || [];
      return {
        headers: {
          ...headers,
          Authorization: 'Bearer ' + token
        },
      };
    });
    return forward(operation);
  });
  
  const httpLink = from([
    httpAuthMiddleware,
    new HttpLink({
      uri: httpUrl,
      fetch: wxApolloFetcher
    })
  ]);
  
  const subClient = new SubscriptionClient(wsUrl, {
    lazy: true,
    reconnect: true,
    connectionParams: () => {
      const headers = {
        Authorization: 'Bearer ' + token
      };
      return { authToken: token, headers }; // depending on your graphql implementation, either headers or authToken
    },
  }, WebSocketImpl);
  
  const wsLink = new WebSocketLink(subClient);
  
  const link = split(
    ({ query }) => {
      const definition = getMainDefinition(query);
      return definition.kind === 'OperationDefinition' && definition.operation === 'subscription';
    },
    wsLink,
    httpLink
  );
  
  const defaultOptions: DefaultOptions = {
    watchQuery: {
      fetchPolicy: 'no-cache',
      errorPolicy: 'ignore',
    },
    query: {
      fetchPolicy: 'no-cache',
      errorPolicy: 'all',
    },
  }
  
  const apolloClient = new ApolloClient({
    link,
    cache: new InMemoryCache(),
    defaultOptions: defaultOptions,
  });
  
  return apolloClient;
}
```
