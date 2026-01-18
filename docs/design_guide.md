# TradeLab Design Guide (Draft)

Цель: стандартизировать дизайн и код, чтобы не хардкодить стили на каждой странице.

## 1) Дизайн-принципы
- Evidence-first: рядом с выводом всегда показываем факторы и источники.
- Human-in-the-loop: подтверждение при низкой уверенности.
- Data-dense: читаемость и структура важнее декоративности.
- Trust by design: дисклеймеры и прозрачность ограничений.
- Composition-first: страницы собираются из блоков, а не уникальных стилей.

## 2) Дизайн-токены (основа)
Используем токены как единственный источник правды. Никаких inline-цветов.

### Цвета
- Background: `bg-0`, `bg-1`, `bg-2`
- Surface: `surface-1`, `surface-2`
- Text: `text-strong`, `text-default`, `text-weak`
- Border: `border-subtle`, `border-strong`
- Accent: `accent`, `accent-strong`
- Status: `success`, `warning`, `error`, `info`

### Типографика
- Размеры: 12 / 14 / 16 / 18 / 20 / 24
- Линии: 1.3 (заголовки), 1.5 (текст), 1.6 (длинные описания)
- Вес: 400 / 500 / 600 / 700

### Радиусы
- `r-sm` 8px, `r-md` 12px, `r-lg` 16px, `r-xl` 20px

### Отступы
- 4 / 8 / 12 / 16 / 24 / 32 / 48

### Тени и blur
- 2 уровня тени (карточки, hover)
- blur только для фоновых декоративных элементов

## 3) Layout-правила
- AppShell: Sidebar 240-260px, Chat 320px (collapsible).
- Контент: max-width 1200-1280px, базовые отступы 24-32px.
- На ноутбуках/планшетах Sidebar и Chat уходят в sheet/drawer.
- Для отчетов и таблиц используем светлые панели на темном фоне.

## 4) Шаблоны страниц
Фиксируем 5 шаблонов. Новые страницы только из них.

### Dashboard
- KPI Cards
- Quick Actions
- Recent Reports
- Tips/Updates

### Catalog/List
- Filters
- DataTable
- Bulk Actions

### Report View
- Summary
- Evidence
- Charts
- Recommendations

### Tools
- Conversational Form
- Results Panel
- CTA

### Content
- Categories
- Article List
- Viewer

## 5) Доменные UI-компоненты
- `ReportCard`
- `SupplierRow`
- `RiskBadge`
- `PriceBench`
- `EvidenceList`
- `DataTable`
- `HSCodeChip`

Состояния для всех компонентов:
- `loading`, `empty`, `error`, `partial-data`, `requires-confirm`

## 6) AI-чат и микро-копирайт
- У каждого раздела свой контекст и system-профиль.
- Каждая AI-ответная карточка должна содержать:
  - источник данных
  - ограничение/дисклеймер
- CTA-врезки короткие, не более 1 строки.

## 7) Доступность и локализация
- Контраст не ниже 4.5:1 в рабочих экранах.
- RU/EN/中文 должны помещаться без ломания сетки.
- Текстовые блоки не шире 70-80 символов.

## 8) Принципы внедрения в код
- Все компоненты строим из токенов.
- Не допускаем page-specific классов и цветов.
- Логику держим отдельно, UI слой максимально чистый.

## 9) Проверка соответствия
- Все новые экраны используют шаблон.
- Все компоненты используют токены.
- Отчеты читаемы без увеличения масштаба.
