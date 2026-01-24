with new_items as (
  select * from (
    values
      ('map', 'Шанхай: логистика и машиностроение', 'Крупнейший портовый хаб, развитые цепочки машиностроения и логистики.', array['shanghai','logistics','machinery']),
      ('map', 'Цзянсу: химия и промышленность', 'Сучжоу и Нанкин — промкластеры химии и производственного оборудования.', array['jiangsu','suzhou','chemicals','machinery']),
      ('map', 'Хэбэй: сталь и стройматериалы', 'Регион тяжелой индустрии, производство стали и стройматериалов.', array['hebei','shijiazhuang','building']),
      ('map', 'Хэнань: пищевая промышленность', 'Производство продуктов питания и упаковки, развитая логистика.', array['henan','zhengzhou','food']),
      ('map', 'Хубэй: автокомпоненты', 'Ухань — автокомпоненты и машиностроение, сильные цепочки поставок.', array['hubei','wuhan','auto']),
      ('map', 'Хунань: спецтехника', 'Чанша — спецтехника, машиностроение и комплектующие.', array['hunan','changsha','machinery']),
      ('map', 'Аньхой: бытовая техника', 'Хэфэй — кластеры бытовой техники и электроники.', array['anhui','hefei','electronics']),
      ('map', 'Цзянси: текстиль', 'Наньчан — текстиль и комплектующие.', array['jiangxi','nanchang','textiles']),
      ('map', 'Гуанси: мебель', 'Наньнин — мебель и товары для дома.', array['guangxi','nanning','furniture']),
      ('map', 'Тяньцзинь: химия и логистика', 'Портовый хаб, химическая промышленность и логистика.', array['tianjin','chemicals','logistics']),
      ('map', 'Пекин: электроника и стартапы', 'Высокотехнологичные цепочки и R&D-компании.', array['beijing','electronics']),
      ('map', 'Ляонин: тяжелая промышленность', 'Шэньян — машиностроение и металлургия.', array['liaoning','shenyang','machinery']),

      ('exhibition', 'Shanghai Logistics Expo', 'Логистика, складские технологии, цепочки поставок. Шанхай, май.', array['shanghai','logistics']),
      ('exhibition', 'China Machinery Fair', 'Станки и промышленное оборудование. Шанхай, июнь.', array['shanghai','machinery']),
      ('exhibition', 'Shenzhen Hi-Tech Fair', 'Электроника, IoT, инновации. Шэньчжэнь, ноябрь.', array['shenzhen','guangdong','electronics']),
      ('exhibition', 'Chengdu Food Expo', 'Продукты питания и упаковка. Чэнду, август.', array['chengdu','sichuan','food']),
      ('exhibition', 'Ningbo Export Fair', 'Товары для дома, текстиль, комплектующие. Нинбо, март.', array['ningbo','zhejiang','textiles']),
      ('exhibition', 'Suzhou Manufacturing Expo', 'Промышленное производство и автоматизация. Сучжоу, сентябрь.', array['suzhou','jiangsu','machinery']),
      ('exhibition', 'Xiamen Footwear Expo', 'Обувь и аксессуары. Сямынь, июль.', array['xiamen','fujian','footwear']),
      ('exhibition', 'Wuhan Auto Parts Expo', 'Автокомпоненты и спецтехника. Ухань, октябрь.', array['wuhan','hubei','auto']),
      ('exhibition', 'Hangzhou E-commerce Expo', 'Электронная коммерция и малый опт. Ханчжоу, апрель.', array['hangzhou','zhejiang','small_goods']),
      ('exhibition', 'Beijing Packaging Expo', 'Упаковка, материалы, оборудование. Пекин, май.', array['beijing','building']),
      ('exhibition', 'Tianjin Chemicals Expo', 'Химическая промышленность и сырье. Тяньцзинь, июнь.', array['tianjin','chemicals']),
      ('exhibition', 'Dongguan Furniture Fair', 'Мебель и комплектующие. Дунгуань, декабрь.', array['dongguan','guangdong','furniture']),

      ('library', 'Как проверить MOQ и цены', 'Подход к оценке MOQ, диапазона цен и скрытых затрат.', array['supplier','checklist','finance']),
      ('library', 'Матрица сравнения поставщиков', 'Шаблон для сравнения по цене, MOQ, рискам, срокам.', array['supplier','checklist']),
      ('library', 'Документы для первого заказа', 'Список документов: инвойс, упаковочный лист, контракт.', array['contract','logistics']),
      ('library', 'Как читать торговую статистику', 'Быстрые правила интерпретации таможенных данных.', array['guide','hs']),
      ('library', 'Схемы логистики: море/жд/авиа', 'Плюсы, минусы, типовые сроки и риски.', array['logistics','shipping']),
      ('library', 'Проверка сертификатов (CE/ISO)', 'Как проверить подлинность и соответствие.', array['quality','compliance']),
      ('library', 'Шаблон NDA с поставщиком', 'Ключевые пункты и типовые риски.', array['contract']),
      ('library', 'Контракт на поставку: структура', 'Каркас разделов и критичных условий.', array['contract','guide']),
      ('library', 'Риски предоплаты', 'Типовые сценарии и способы минимизации.', array['payment','finance']),
      ('library', 'Проверка фабрики по фото', 'Что смотреть на фото/видео и как запросить доп.материалы.', array['supplier','checklist']),
      ('library', 'Быстрый гайд по таможенным кодам', 'Ключевые шаги выбора HS.', array['hs','guide']),
      ('library', 'Подготовка к инспекции', 'Список проверок перед аудитом фабрики.', array['quality','checklist'])
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
