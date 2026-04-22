import Stripe from "stripe";

export function makeStripe(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
    apiVersion: "2024-09-30.acacia",
  });
}
