-- my_bid_lots / my_watched_lots are for signed-in members only. Supabase's default
-- privileges grant EXECUTE on new public functions to anon as well, so the
-- `revoke ... from public` in the previous migration does not remove anon's own
-- grant. Revoke it explicitly to match the authenticated-only intent.
--
-- (Both functions were already safe for anon — they filter by auth.uid(), which is
-- null for anon, so anon would get no rows and reserve_cents is never exposed — but
-- this aligns privileges with intent and clears the security-advisor warning.)
revoke execute on function public.my_bid_lots() from anon;
revoke execute on function public.my_watched_lots() from anon;
