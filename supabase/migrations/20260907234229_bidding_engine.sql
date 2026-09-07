create or replace function public.bid_increment_for(p_amount_cents int, p_currency text)
returns int
language sql
stable
as $$
  select (tier->>'increment_cents')::int
  from public.app_settings s,
       jsonb_array_elements(s.increment_tiers -> p_currency) as tier
  where s.id = 1
    and ((tier->>'up_to_cents') is null
         or p_amount_cents < (tier->>'up_to_cents')::int)
  order by ((tier->>'up_to_cents') is null),          -- non-null tiers first
           nullif((tier->>'up_to_cents'), 'null')::int asc nulls last
  limit 1;
$$;
