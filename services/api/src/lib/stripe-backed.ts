import Stripe from "stripe";
import type {
  CheckoutSession,
  CheckoutSessionRequest,
  ConnectAccountStatus,
  ConnectOnboardingRequest,
  ConnectOnboardingResult,
  StripeAdapter,
  StripeRefundRequest,
  StripeRefundResult,
  TransferRequest,
  TransferResult,
} from "./stripe";

/**
 * Production Stripe adapter (P4-A-2 follow-up).
 *
 * Wraps the official `stripe` SDK. Selected via STRIPE_DRIVER=stripe
 * + STRIPE_SECRET_KEY=<sk_…>. The Noop adapter stays the default so
 * tests + dev environments without keys keep working unchanged.
 *
 * Subscription support (P4-B): when an IAP purchase's `iap_products`
 * row is type=subscription, the caller passes the line item that
 * looks like a Stripe Price object (recurring), and the adapter
 * switches Checkout into `mode: "subscription"`. v1 ships the
 * one-time path; the subscription branch is plumbed but not yet
 * exposed to callers — pricing.ts + iap.ts callers still use
 * mode:payment. Switching is a single line change once we know how
 * the route disambiguates (likely by inspecting the parent product
 * type, which the route has in scope but the adapter doesn't).
 */
export class StripeBackedAdapter implements StripeAdapter {
  private client: Stripe;

  constructor(secretKey: string) {
    this.client = new Stripe(secretKey, {
      // Pin a stable API version so dashboard changes don't quietly
      // alter our object shapes. Use the SDK's published version
      // string for type alignment.
      apiVersion: "2025-02-24.acacia",
      // Surface a recognizable User-Agent in Stripe's request logs.
      appInfo: {
        name: "openmarket",
        url: "https://openmarket.app",
      },
    });
  }

  name(): string {
    return "stripe";
  }

  isLive(): boolean {
    return true;
  }

  async createCheckoutSession(
    req: CheckoutSessionRequest,
  ): Promise<CheckoutSession> {
    const session = await this.client.checkout.sessions.create(
      {
        mode: "payment",
        customer_email: req.customerEmail,
        line_items: [
          {
            price_data: {
              currency: req.currency.toLowerCase(),
              product_data: { name: req.appTitle },
              unit_amount: req.priceCents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          purchaseId: req.purchaseId,
          appId: req.appId,
        },
        // Stripe receives a snapshot — don't bake the userId into
        // metadata since the row already correlates via purchaseId.
        success_url: req.successUrl,
        cancel_url: req.cancelUrl,
      },
      {
        // Idempotency: if the network drops our response and the caller
        // retries, Stripe returns the SAME session instead of creating a
        // duplicate charge surface. Keyed on purchaseId (unique per
        // attempt). Stripe expires the key after 24h, which lines up with
        // Checkout session expiry — a genuinely new attempt next day gets
        // a fresh session.
        idempotencyKey: `checkout_${req.purchaseId}`,
      },
    );

    if (!session.url) {
      // Stripe always populates `url` for hosted Checkout. A null
      // here means the session was created with `ui_mode: "embedded"`
      // or there's an SDK regression — fail loudly.
      throw new Error(
        `Stripe checkout.sessions.create returned a session without a url (id=${session.id})`,
      );
    }

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);

    return {
      sessionId: session.id,
      paymentIntentId,
      url: session.url,
    };
  }

  async refundPayment(req: StripeRefundRequest): Promise<StripeRefundResult> {
    const refund = await this.client.refunds.create({
      payment_intent: req.paymentIntentId,
      reason: "requested_by_customer",
      metadata: req.reason ? { note: req.reason } : undefined,
    });
    return {
      refundId: refund.id,
      status: refund.status ?? "unknown",
    };
  }

  // ── Connect (P4-D) ──────────────────────────────────────────

  async createConnectOnboarding(
    req: ConnectOnboardingRequest,
  ): Promise<ConnectOnboardingResult> {
    const account = await this.client.accounts.create({
      type: "express",
      email: req.email,
      country: req.countryCode,
      capabilities: {
        transfers: { requested: true },
      },
      metadata: { developerId: req.developerId },
    });
    const link = await this.client.accountLinks.create({
      account: account.id,
      refresh_url: req.refreshUrl,
      return_url: req.returnUrl,
      type: "account_onboarding",
    });
    return {
      accountId: account.id,
      onboardingUrl: link.url,
    };
  }

  async refreshConnectOnboarding(args: {
    accountId: string;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<{ onboardingUrl: string }> {
    const link = await this.client.accountLinks.create({
      account: args.accountId,
      refresh_url: args.refreshUrl,
      return_url: args.returnUrl,
      type: "account_onboarding",
    });
    return { onboardingUrl: link.url };
  }

  async retrieveConnectAccount(
    accountId: string,
  ): Promise<ConnectAccountStatus> {
    const account = await this.client.accounts.retrieve(accountId);
    return {
      chargesEnabled: account.charges_enabled ?? false,
      payoutsEnabled: account.payouts_enabled ?? false,
      detailsSubmitted: account.details_submitted ?? false,
      defaultCurrency: account.default_currency ?? null,
      country: account.country ?? null,
    };
  }

  async createTransfer(req: TransferRequest): Promise<TransferResult> {
    const transfer = await this.client.transfers.create(
      {
        amount: req.amountCents,
        currency: req.currency.toLowerCase(),
        destination: req.destinationAccountId,
        metadata: {
          payoutId: req.metadata.payoutId,
          developerId: req.metadata.developerId,
        },
      },
      {
        // Idempotency: a retried transfer after a lost response must NOT
        // pay a developer twice. Keyed on payoutId (one transfer per
        // payout row), so Stripe collapses retries to a single transfer.
        idempotencyKey: `transfer_${req.metadata.payoutId}`,
      },
    );
    return { transferId: transfer.id };
  }
}
