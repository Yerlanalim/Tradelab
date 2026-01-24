with new_items as (
  select * from (
    values
      ('map', 'Гуандун: электроника и аксессуары', 'Шэньчжэнь и Дунгуань — крупнейшие кластеры электроники и комплектующих.', array['guangdong','shenzhen','electronics','cluster']),
      ('map', 'Чжэцзян: текстиль и фурнитура', 'Нинбо и Иу — сильные цепочки в текстиле, фурнитуре и товарах для дома.', array['zhejiang','ningbo','textile']),
      ('map', 'Фуцзянь: обувь и спортивные товары', 'Сямынь и Цюаньчжоу — обувные фабрики и ODM для спорта.', array['fujian','xiamen','footwear']),
      ('map', 'Шаньдун: машиностроение', 'Циндао — тяжелое машиностроение, металлообработка, станки.', array['shandong','qingdao','machinery']),
      ('map', 'Сычуань: электроника и батареи', 'Чэнду — производственные цепочки для компонентов и батарей.', array['sichuan','chengdu','batteries']),

      ('exhibition', 'Canton Fair (Phase 1)', 'Широкий ассортимент: электроника, техника, промышленность. Гуанчжоу, апрель.', array['guangzhou','guangdong','electronics']),
      ('exhibition', 'Canton Fair (Phase 2)', 'Дом, декор, подарки, товары для дома. Гуанчжоу, апрель.', array['guangzhou','guangdong','home']),
      ('exhibition', 'Global Sources Electronics', 'Электроника и аксессуары. Гонконг, октябрь.', array['hongkong','electronics']),
      ('exhibition', 'China International Industry Fair', 'Промышленные технологии, оборудование. Шанхай, сентябрь.', array['shanghai','industry']),
      ('exhibition', 'Yiwu Commodities Fair', 'Массовые товары и мелкий опт. Иу, октябрь.', array['yiwu','zhejiang','commodities']),

      ('library', 'Чек-лист проверки поставщика', 'Короткий список вопросов и документов для первичного скоринга.', array['checklist','supplier']),
      ('library', 'Как запросить коммерческое предложение', 'Структура запроса, важные поля и типичные ошибки.', array['rfq','quote']),
      ('library', 'HS-код: как выбрать корректно', 'Быстрый гайд по валидации HS-кода и альтернативам.', array['hs','guide']),
      ('library', 'Инкотермс 2020: краткий обзор', 'Что важно знать для импорта и контрактов.', array['incoterms','logistics']),
      ('library', 'Калькулятор landed cost: что учитывать', 'Пояснение статей затрат и типовых сценариев.', array['landed-cost','finance'])
  ) as t(type, title, body, tags)
)
insert into public.content_items (type, title, body, tags)
select n.type, n.title, n.body, n.tags
from new_items n
where not exists (
  select 1
  from public.content_items c
  where c.type = n.type and c.title = n.title
);
