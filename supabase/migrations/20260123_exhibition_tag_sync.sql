update public.content_items
set tags = array(select distinct unnest(tags || array['guangdong']))
where type = 'exhibition' and tags @> array['guangzhou'];

update public.content_items
set tags = array(select distinct unnest(tags || array['guangdong']))
where type = 'exhibition' and tags @> array['shenzhen'];

update public.content_items
set tags = array(select distinct unnest(tags || array['guangdong']))
where type = 'exhibition' and tags @> array['dongguan'];

update public.content_items
set tags = array(select distinct unnest(tags || array['zhejiang']))
where type = 'exhibition' and tags @> array['yiwu'];

update public.content_items
set tags = array(select distinct unnest(tags || array['zhejiang']))
where type = 'exhibition' and tags @> array['ningbo'];

update public.content_items
set tags = array(select distinct unnest(tags || array['zhejiang']))
where type = 'exhibition' and tags @> array['hangzhou'];

update public.content_items
set tags = array(select distinct unnest(tags || array['jiangsu']))
where type = 'exhibition' and tags @> array['suzhou'];

update public.content_items
set tags = array(select distinct unnest(tags || array['fujian']))
where type = 'exhibition' and tags @> array['xiamen'];

update public.content_items
set tags = array(select distinct unnest(tags || array['hubei']))
where type = 'exhibition' and tags @> array['wuhan'];

update public.content_items
set tags = array(select distinct unnest(tags || array['sichuan']))
where type = 'exhibition' and tags @> array['chengdu'];

update public.content_items
set tags = array(select distinct unnest(tags || array['beijing']))
where type = 'exhibition' and tags @> array['beijing'];

update public.content_items
set tags = array(select distinct unnest(tags || array['shanghai']))
where type = 'exhibition' and tags @> array['shanghai'];

update public.content_items
set tags = array(select distinct unnest(tags || array['tianjin']))
where type = 'exhibition' and tags @> array['tianjin'];

update public.content_items
set tags = array(select distinct unnest(tags || array['hongkong']))
where type = 'exhibition' and tags @> array['hongkong'];
