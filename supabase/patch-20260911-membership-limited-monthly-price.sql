-- Keep the introductory monthly membership price in data so every client sees
-- the same amount. The crossed-out price is display-only and is not charged.
update public.membership_plans
set price_cents = 200,
    compare_at_price_cents = 990,
    updated_at = now()
where id = 'monthly';
