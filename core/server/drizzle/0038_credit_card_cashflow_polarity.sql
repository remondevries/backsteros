-- Flip credit-card ledger amounts from issuer/liability polarity (AMEX NL:
-- charges +, payments -) to cashflow polarity (spend -, payments +).
--
-- Idempotent guards (either is enough to detect liability polarity):
-- 1) Dutch AMEX payment thank-you rows are still negative, or
-- 2) Aggregate credit-card balance is still positive (charges dominate).
-- After flip, payments are positive and typical balances are ≤ 0, so a
-- re-run is a no-op. Fingerprints are unchanged (source polarity).
UPDATE "financial_transactions" AS ft
SET
  "amount_cents" = -ft."amount_cents",
  "balance_after_cents" = CASE
    WHEN ft."balance_after_cents" IS NULL THEN NULL
    ELSE -ft."balance_after_cents"
  END,
  "updated_at" = now()
FROM "bank_accounts" AS ba
WHERE ba."id" = ft."bank_account_id"
  AND ba."type" = 'credit_card'
  AND (
    EXISTS (
      SELECT 1
      FROM "financial_transactions" AS probe
      INNER JOIN "bank_accounts" AS probe_ba
        ON probe_ba."id" = probe."bank_account_id"
      WHERE probe_ba."type" = 'credit_card'
        AND probe."payee" ILIKE '%bedankt%betaling%'
        AND probe."amount_cents" < 0
    )
    OR (
      SELECT coalesce(sum(ft_sum."amount_cents"), 0)
      FROM "financial_transactions" AS ft_sum
      INNER JOIN "bank_accounts" AS ba_sum
        ON ba_sum."id" = ft_sum."bank_account_id"
      WHERE ba_sum."type" = 'credit_card'
    ) > 0
  );
