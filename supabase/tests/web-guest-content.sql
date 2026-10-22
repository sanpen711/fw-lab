begin;
insert into public.site_announcements(id,title,body,is_published,published_at) values
 ('f0000000-2026-4000-8000-000000000001','Guest test published','test',true,now()),
 ('f0000000-2026-4000-8000-000000000002','Guest test draft','test',false,null);
insert into public.site_activities(id,title,body,starts_at,ends_at,is_published,published_at) values
 ('f0000000-2026-4000-8000-000000000003','Guest test activity','test',now(),now()+interval '1 day',true,now()),
 ('f0000000-2026-4000-8000-000000000004','Guest test activity draft','test',now(),now()+interval '1 day',false,null);
insert into public.shop_products(id,title,price_cents,image_paths,is_active) values
 ('f0000000-2026-4000-8000-000000000005','Guest test product',1000,array['products/f0000000-2026-4000-8000-000000000005/00000000-0000-4000-8000-000000000001.webp'],true),
 ('f0000000-2026-4000-8000-000000000006','Guest test inactive product',1000,array['products/f0000000-2026-4000-8000-000000000006/00000000-0000-4000-8000-000000000001.webp'],false);
set local role anon;
do $$ begin
 if (select count(*) from public.site_announcements where id::text like 'f0000000-2026-%')<>1 then raise exception 'guest announcement visibility'; end if;
 if (select count(*) from public.site_activities where id::text like 'f0000000-2026-%')<>1 then raise exception 'guest activity visibility'; end if;
 if has_table_privilege('anon','public.shop_products','select') then raise exception 'guest products exposed'; end if;
 if has_table_privilege('anon','public.shop_orders','select') then raise exception 'guest orders exposed'; end if;
 if has_table_privilege('anon','public.chat_room_messages','select') then raise exception 'guest chat exposed'; end if;
 if has_table_privilege('anon','public.site_announcements','insert,update,delete') then raise exception 'guest announcement write'; end if;
 if has_table_privilege('anon','public.site_activities','insert,update,delete') then raise exception 'guest activity write'; end if;
 if has_table_privilege('anon','public.shop_products','insert,update,delete') then raise exception 'guest product write'; end if;
end $$;
reset role;
rollback;
