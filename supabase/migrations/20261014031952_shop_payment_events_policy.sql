create policy shop_events_service_only on private.shop_payment_events
  for all to service_role using (true) with check (true);
