# MCP Metrics

The MCP metrics tool exposes counters that describe publish activity. To keep
reporting unambiguous, payment attempts and settlement outcomes are tracked as
separate, non-overlapping metrics.

## Metric semantics

- **payment_attempts** — incremented once for every publish attempt that
  initiates a payment. This counts the *attempt* to pay, regardless of whether
  the payment or the subsequent settlement succeeds.
- **settlements_succeeded** — incremented once when a publish attempt's payment
  settles successfully.
- **settlements_failed** — incremented once when a publish attempt's payment
  succeeds but settlement fails.

A single publish attempt contributes to exactly one settlement metric
(`settlements_succeeded` or `settlements_failed`), and to `payment_attempts`
when it initiates a payment.

## Guarantee: a failure is not a payment

A failed settlement is **not** counted as a payment. `settlements_failed`
records the failure outcome only; it does not increment any payment counter.
Likewise, `payment_attempts` records the attempt to pay and is never used to
represent a settlement outcome.

This separation prevents a publish that pays and then fails settlement from
being double-counted as both a payment and a failure. Such an attempt is
reported as one `payment_attempts` increment and one `settlements_failed`
increment — never as a payment success.

## Retries

When a publish retries the same payment, each retry is a distinct publish
attempt. Each attempt that initiates a payment increments `payment_attempts`,
and each attempt resolves to exactly one settlement metric. Retries therefore do
not cause a single payment to be counted more than once per attempt, and a
failed settlement on a retry is still not counted as a payment.
