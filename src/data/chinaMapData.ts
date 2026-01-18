// TradeLab - Данные для карты производителей Китая
// Ключевые провинции и города для импортёров из СНГ/ЕАЭС

export type Industry =
  | "electronics"
  | "textiles"
  | "furniture"
  | "ceramics"
  | "machinery"
  | "auto"
  | "building"
  | "footwear"
  | "small_goods"
  | "logistics"
  | "chemicals"
  | "food";

export interface IndustryInfo {
  id: Industry;
  name_ru: string;
  name_en: string;
  color: string;
  icon: string;
}

export interface City {
  id: string;
  name_ru: string;
  name_en: string;
  name_zh: string;
  province_id: string;
  // Координаты для позиционирования маркера (в % от размера карты)
  coordinates: { x: number; y: number };
  brief_ru: string;
  industries: Industry[];
  why_relevant_ru: string;
}

export interface Province {
  id: string; // ID из @svg-maps/china (например: 'guangdong')
  svg_id: string; // ID в SVG файле
  name_ru: string;
  name_en: string;
  name_zh: string;
  industries: Industry[]; // Агрегат из городов
}

// Справочник отраслей
export const industries: IndustryInfo[] = [
  {
    id: "electronics",
    name_ru: "Электроника",
    name_en: "Electronics",
    color: "#3B82F6",
    icon: "💻",
  },
  {
    id: "textiles",
    name_ru: "Текстиль",
    name_en: "Textiles",
    color: "#EC4899",
    icon: "🧵",
  },
  {
    id: "furniture",
    name_ru: "Мебель",
    name_en: "Furniture",
    color: "#F59E0B",
    icon: "🪑",
  },
  {
    id: "ceramics",
    name_ru: "Керамика",
    name_en: "Ceramics",
    color: "#EF4444",
    icon: "🏺",
  },
  {
    id: "machinery",
    name_ru: "Машиностроение",
    name_en: "Machinery",
    color: "#6366F1",
    icon: "⚙️",
  },
  {
    id: "auto",
    name_ru: "Автокомпоненты",
    name_en: "Auto parts",
    color: "#8B5CF6",
    icon: "🚗",
  },
  {
    id: "building",
    name_ru: "Стройматериалы",
    name_en: "Building materials",
    color: "#78716C",
    icon: "🧱",
  },
  {
    id: "footwear",
    name_ru: "Обувь",
    name_en: "Footwear",
    color: "#14B8A6",
    icon: "👟",
  },
  {
    id: "small_goods",
    name_ru: "Мелкий опт",
    name_en: "Small goods",
    color: "#F97316",
    icon: "📦",
  },
  {
    id: "logistics",
    name_ru: "Логистика",
    name_en: "Logistics",
    color: "#22C55E",
    icon: "🚚",
  },
  {
    id: "chemicals",
    name_ru: "Химия",
    name_en: "Chemicals",
    color: "#A855F7",
    icon: "🧪",
  },
  {
    id: "food",
    name_ru: "Продукты",
    name_en: "Food",
    color: "#84CC16",
    icon: "🍵",
  },
];

// Провинции (только ключевые для СНГ импортёров)
export const provinces: Province[] = [
  {
    id: "guangdong",
    svg_id: "guangdong",
    name_ru: "Гуандун",
    name_en: "Guangdong",
    name_zh: "广东",
    industries: ["electronics", "furniture", "ceramics", "textiles"],
  },
  {
    id: "zhejiang",
    svg_id: "zhejiang",
    name_ru: "Чжэцзян",
    name_en: "Zhejiang",
    name_zh: "浙江",
    industries: ["textiles", "small_goods", "machinery", "furniture"],
  },
  {
    id: "jiangsu",
    svg_id: "jiangsu",
    name_ru: "Цзянсу",
    name_en: "Jiangsu",
    name_zh: "江苏",
    industries: ["electronics", "machinery", "textiles", "chemicals"],
  },
  {
    id: "shandong",
    svg_id: "shandong",
    name_ru: "Шаньдун",
    name_en: "Shandong",
    name_zh: "山东",
    industries: ["machinery", "building", "chemicals", "auto"],
  },
  {
    id: "fujian",
    svg_id: "fujian",
    name_ru: "Фуцзянь",
    name_en: "Fujian",
    name_zh: "福建",
    industries: ["footwear", "ceramics", "food", "textiles"],
  },
  {
    id: "shanghai",
    svg_id: "shanghai",
    name_ru: "Шанхай",
    name_en: "Shanghai",
    name_zh: "上海",
    industries: ["electronics", "machinery", "auto", "chemicals"],
  },
  {
    id: "beijing",
    svg_id: "beijing",
    name_ru: "Пекин",
    name_en: "Beijing",
    name_zh: "北京",
    industries: ["electronics", "machinery"],
  },
  {
    id: "hebei",
    svg_id: "hebei",
    name_ru: "Хэбэй",
    name_en: "Hebei",
    name_zh: "河北",
    industries: ["building", "machinery", "chemicals"],
  },
  {
    id: "henan",
    svg_id: "henan",
    name_ru: "Хэнань",
    name_en: "Henan",
    name_zh: "河南",
    industries: ["textiles", "logistics", "machinery", "food"],
  },
  {
    id: "sichuan",
    svg_id: "sichuan",
    name_ru: "Сычуань",
    name_en: "Sichuan",
    name_zh: "四川",
    industries: ["electronics", "auto", "machinery"],
  },
  {
    id: "xinjiang",
    svg_id: "xinjiang",
    name_ru: "Синьцзян",
    name_en: "Xinjiang",
    name_zh: "新疆",
    industries: ["logistics", "food", "textiles"],
  },
  {
    id: "liaoning",
    svg_id: "liaoning",
    name_ru: "Ляонин",
    name_en: "Liaoning",
    name_zh: "辽宁",
    industries: ["machinery", "auto", "chemicals"],
  },
];

// Города (ключевые для торговли с СНГ)
export const cities: City[] = [
  // Гуандун
  {
    id: "guangzhou",
    name_ru: "Гуанчжоу",
    name_en: "Guangzhou",
    name_zh: "广州",
    province_id: "guangdong",
    coordinates: { x: 75.5, y: 78 },
    brief_ru:
      "Столица провинции Гуандун. Место проведения Canton Fair — крупнейшей торговой выставки в мире. Крупнейший торговый и логистический хаб южного Китая.",
    industries: ["electronics", "textiles", "furniture"],
    why_relevant_ru:
      "Canton Fair дважды в год — главное место для поиска поставщиков",
  },
  {
    id: "shenzhen",
    name_ru: "Шэньчжэнь",
    name_en: "Shenzhen",
    name_zh: "深圳",
    province_id: "guangdong",
    coordinates: { x: 76.5, y: 80 },
    brief_ru:
      "Технологическая столица Китая. Штаб-квартиры Huawei, Tencent, BYD, DJI. Центр производства электроники, гаджетов и IoT-устройств.",
    industries: ["electronics"],
    why_relevant_ru: "Электроника, гаджеты, LED, батареи — всё здесь",
  },
  {
    id: "dongguan",
    name_ru: "Дунгуань",
    name_en: "Dongguan",
    name_zh: "东莞",
    province_id: "guangdong",
    coordinates: { x: 76, y: 79 },
    brief_ru:
      "Мировая столица мебельного производства. Более 8000 мебельных фабрик. Также производство электроники и игрушек.",
    industries: ["furniture", "electronics"],
    why_relevant_ru: "Мебель любого ценового сегмента, фурнитура",
  },
  {
    id: "foshan",
    name_ru: "Фошань",
    name_en: "Foshan",
    name_zh: "佛山",
    province_id: "guangdong",
    coordinates: { x: 74.5, y: 79 },
    brief_ru:
      "Мировой центр производства керамической плитки и сантехники. До 60% мирового производства керамики. Также мебель и алюминиевые профили.",
    industries: ["ceramics", "furniture", "building"],
    why_relevant_ru: "Керамическая плитка, сантехника, алюминиевые профили",
  },
  // Чжэцзян
  {
    id: "yiwu",
    name_ru: "Иу",
    name_en: "Yiwu",
    name_zh: "义乌",
    province_id: "zhejiang",
    coordinates: { x: 82, y: 64 },
    brief_ru:
      "Крупнейший в мире рынок мелкого опта. Futian Market — 75,000+ павильонов. Всё для розницы: от канцелярии до игрушек.",
    industries: ["small_goods", "textiles"],
    why_relevant_ru:
      "Мелкий опт любых товаров, низкие MOQ, прямые ж/д до СНГ",
  },
  {
    id: "hangzhou",
    name_ru: "Ханчжоу",
    name_en: "Hangzhou",
    name_zh: "杭州",
    province_id: "zhejiang",
    coordinates: { x: 81, y: 62 },
    brief_ru:
      "Столица провинции. Штаб-квартира Alibaba. Центр e-commerce и текстильной промышленности. Известен шёлком и чаем.",
    industries: ["textiles", "electronics", "food"],
    why_relevant_ru: "Текстиль, шёлк, e-commerce инфраструктура",
  },
  {
    id: "ningbo",
    name_ru: "Нинбо",
    name_en: "Ningbo",
    name_zh: "宁波",
    province_id: "zhejiang",
    coordinates: { x: 83, y: 62 },
    brief_ru:
      "Крупнейший порт мира по грузообороту. Центр производства бытовой техники, пластика и текстиля.",
    industries: ["machinery", "chemicals", "textiles"],
    why_relevant_ru: "Главный порт для экспорта, бытовая техника",
  },
  {
    id: "wenzhou",
    name_ru: "Вэньчжоу",
    name_en: "Wenzhou",
    name_zh: "温州",
    province_id: "zhejiang",
    coordinates: { x: 82, y: 66 },
    brief_ru:
      "Столица обувной промышленности Китая. Также производство очков, зажигалок, кожгалантереи.",
    industries: ["footwear", "textiles"],
    why_relevant_ru: "Обувь всех категорий, кожаные изделия",
  },
  // Цзянсу
  {
    id: "suzhou",
    name_ru: "Сучжоу",
    name_en: "Suzhou",
    name_zh: "苏州",
    province_id: "jiangsu",
    coordinates: { x: 81, y: 59 },
    brief_ru:
      "Промышленный центр дельты Янцзы. Электроника, точное машиностроение, текстиль. Много иностранных производств.",
    industries: ["electronics", "machinery", "textiles"],
    why_relevant_ru: "Качественная электроника, комплектующие",
  },
  {
    id: "nanjing",
    name_ru: "Нанкин",
    name_en: "Nanjing",
    name_zh: "南京",
    province_id: "jiangsu",
    coordinates: { x: 79, y: 59 },
    brief_ru:
      "Столица провинции. Автомобильная промышленность, электроника, нефтехимия. Крупный образовательный центр.",
    industries: ["auto", "electronics", "chemicals"],
    why_relevant_ru: "Автокомпоненты, промышленное оборудование",
  },
  {
    id: "wuxi",
    name_ru: "Уси",
    name_en: "Wuxi",
    name_zh: "无锡",
    province_id: "jiangsu",
    coordinates: { x: 80.5, y: 58 },
    brief_ru:
      "Центр производства солнечных панелей и полупроводников. Текстиль, машиностроение.",
    industries: ["electronics", "machinery", "textiles"],
    why_relevant_ru: "Солнечные панели, микроэлектроника",
  },
  // Шаньдун
  {
    id: "qingdao",
    name_ru: "Циндао",
    name_en: "Qingdao",
    name_zh: "青岛",
    province_id: "shandong",
    coordinates: { x: 81, y: 50 },
    brief_ru:
      "Крупный порт. Штаб-квартиры Haier, Hisense. Производство бытовой техники, шин, пива.",
    industries: ["machinery", "chemicals", "food"],
    why_relevant_ru: "Бытовая техника, шины, портовая логистика",
  },
  {
    id: "jinan",
    name_ru: "Цзинань",
    name_en: "Jinan",
    name_zh: "济南",
    province_id: "shandong",
    coordinates: { x: 78, y: 50 },
    brief_ru:
      "Столица провинции. Тяжёлое машиностроение, автомобили, металлургия.",
    industries: ["machinery", "auto"],
    why_relevant_ru: "Промышленное оборудование, грузовики",
  },
  {
    id: "linyi",
    name_ru: "Линьи",
    name_en: "Linyi",
    name_zh: "临沂",
    province_id: "shandong",
    coordinates: { x: 79, y: 52 },
    brief_ru:
      "Крупнейший оптовый рынок северного Китая. Стройматериалы, фанера, мебельные плиты.",
    industries: ["building", "furniture"],
    why_relevant_ru: "Стройматериалы, фанера, OSB — дешевле чем в Гуандуне",
  },
  // Фуцзянь
  {
    id: "xiamen",
    name_ru: "Сямэнь",
    name_en: "Xiamen",
    name_zh: "厦门",
    province_id: "fujian",
    coordinates: { x: 79, y: 72 },
    brief_ru:
      "Особая экономическая зона. Производство чая, камня, электроники. Крупный порт.",
    industries: ["food", "building", "electronics"],
    why_relevant_ru: "Чай, гранит, морепродукты",
  },
  {
    id: "quanzhou",
    name_ru: "Цюаньчжоу",
    name_en: "Quanzhou",
    name_zh: "泉州",
    province_id: "fujian",
    coordinates: { x: 79.5, y: 71 },
    brief_ru:
      "Столица спортивной обуви Китая. Бренды: Anta, 361°, Peak. Также керамика и камень.",
    industries: ["footwear", "ceramics"],
    why_relevant_ru: "Спортивная обувь, кроссовки",
  },
  {
    id: "putian",
    name_ru: "Путянь",
    name_en: "Putian",
    name_zh: "莆田",
    province_id: "fujian",
    coordinates: { x: 79, y: 70 },
    brief_ru:
      "Центр производства обуви (включая реплики). Также ювелирные изделия и медицинское оборудование.",
    industries: ["footwear"],
    why_relevant_ru: "Обувь среднего сегмента, большие объёмы",
  },
  // Шанхай
  {
    id: "shanghai_city",
    name_ru: "Шанхай",
    name_en: "Shanghai",
    name_zh: "上海",
    province_id: "shanghai",
    coordinates: { x: 82, y: 59 },
    brief_ru:
      "Финансовая столица Китая. Крупнейший порт. Штаб-квартиры международных компаний. Центр проведения выставок.",
    industries: ["electronics", "machinery", "auto", "chemicals"],
    why_relevant_ru: "Международные выставки, штаб-квартиры, финансы",
  },
  // Пекин
  {
    id: "beijing_city",
    name_ru: "Пекин",
    name_en: "Beijing",
    name_zh: "北京",
    province_id: "beijing",
    coordinates: { x: 77, y: 44 },
    brief_ru:
      "Столица КНР. Политический и культурный центр. B2B выставки, госзакупки, штаб-квартиры госкомпаний.",
    industries: ["electronics", "machinery"],
    why_relevant_ru: "Государственные тендеры, отраслевые выставки",
  },
  // Хэнань
  {
    id: "zhengzhou",
    name_ru: "Чжэнчжоу",
    name_en: "Zhengzhou",
    name_zh: "郑州",
    province_id: "henan",
    coordinates: { x: 73, y: 52 },
    brief_ru:
      "Крупнейший ж/д хаб Китая. Сборка iPhone (Foxconn). Текстиль, продукты питания.",
    industries: ["electronics", "textiles", "logistics", "food"],
    why_relevant_ru:
      "Ж/д маршруты в Европу и СНГ, логистический хаб",
  },
  // Сычуань
  {
    id: "chengdu",
    name_ru: "Чэнду",
    name_en: "Chengdu",
    name_zh: "成都",
    province_id: "sichuan",
    coordinates: { x: 62, y: 62 },
    brief_ru:
      "Столица провинции. Быстрорастущий технологический центр. Электроника, авиация, автомобили.",
    industries: ["electronics", "auto", "machinery"],
    why_relevant_ru: "Растущий экспортный хаб западного Китая",
  },
  // Синьцзян
  {
    id: "urumqi",
    name_ru: "Урумчи",
    name_en: "Urumqi",
    name_zh: "乌鲁木齐",
    province_id: "xinjiang",
    coordinates: { x: 42, y: 38 },
    brief_ru:
      "Столица Синьцзяна. Ворота в Центральную Азию. Торговля с Казахстаном и СНГ.",
    industries: ["logistics", "food", "textiles"],
    why_relevant_ru: "Приграничная торговля, сухопутный маршрут",
  },
  {
    id: "khorgos",
    name_ru: "Хоргос",
    name_en: "Khorgos",
    name_zh: "霍尔果斯",
    province_id: "xinjiang",
    coordinates: { x: 35, y: 38 },
    brief_ru:
      "Сухой порт на границе с Казахстаном. Зона свободной торговли. Крупнейший ж/д переход Китай-СНГ.",
    industries: ["logistics"],
    why_relevant_ru:
      "Прямая граница с Казахстаном, СЭЗ, беспошлинная торговля",
  },
  // Ляонин
  {
    id: "dalian",
    name_ru: "Далянь",
    name_en: "Dalian",
    name_zh: "大连",
    province_id: "liaoning",
    coordinates: { x: 82, y: 44 },
    brief_ru:
      "Крупный порт северо-восточного Китая. Судостроение, нефтехимия, машиностроение.",
    industries: ["machinery", "chemicals"],
    why_relevant_ru: "Порт для северного направления, судостроение",
  },
  {
    id: "shenyang",
    name_ru: "Шэньян",
    name_en: "Shenyang",
    name_zh: "沈阳",
    province_id: "liaoning",
    coordinates: { x: 83, y: 40 },
    brief_ru:
      "Столица провинции. Историческая промышленная база. Автомобили, авиация, тяжёлое машиностроение.",
    industries: ["auto", "machinery"],
    why_relevant_ru: "Автозапчасти, промышленное оборудование",
  },
];

// Функция для получения городов провинции
export function getCitiesByProvince(provinceId: string): City[] {
  return cities.filter((city) => city.province_id === provinceId);
}

// Функция для получения городов по отрасли
export function getCitiesByIndustry(industryId: Industry): City[] {
  return cities.filter((city) => city.industries.includes(industryId));
}

// Функция для получения провинций по отрасли
export function getProvincesByIndustry(industryId: Industry): Province[] {
  return provinces.filter((province) => province.industries.includes(industryId));
}

// Функция для получения информации об отрасли
export function getIndustryInfo(
  industryId: Industry
): IndustryInfo | undefined {
  return industries.find((industry) => industry.id === industryId);
}
