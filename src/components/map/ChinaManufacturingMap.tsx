"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import China from "@svg-maps/china";

import {
  cities,
  getCitiesByIndustry,
  getCitiesByProvince,
  getIndustryInfo,
  getProvincesByIndustry,
  industries,
  provinces,
  type City,
  type Industry,
  type Province,
} from "@/data/chinaMapData";

// Стили для карты
const mapStyles = `
  .china-map-container {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .china-map-svg {
    width: 100%;
    height: 100%;
  }

  .china-map-svg svg {
    width: 100%;
    height: auto;
  }

  .china-map-svg path {
    fill: rgba(148, 163, 184, 0.18);
    stroke: rgba(148, 163, 184, 0.35);
    stroke-width: 0.6;
    cursor: pointer;
    transition: fill 0.2s ease, opacity 0.2s ease;
  }

  .china-map-svg path:hover {
    fill: rgba(148, 163, 184, 0.32);
  }

  .china-map-svg path.highlighted {
    fill: rgba(59, 130, 246, 0.45);
    opacity: 0.7;
  }

  .china-map-svg path.highlighted:hover {
    fill: rgba(59, 130, 246, 0.7);
    opacity: 0.85;
  }

  .china-map-svg path.dimmed {
    fill: rgba(148, 163, 184, 0.12);
    opacity: 0.35;
  }

  .china-map-svg path.selected {
    fill: rgba(16, 185, 129, 0.6);
    stroke: rgba(16, 185, 129, 0.9);
    stroke-width: 1.4;
  }
`;

type ChinaManufacturingMapProps = {
  onCitySelect?: (city: City | null) => void;
  onProvinceSelect?: (province: Province | null) => void;
  className?: string;
};

type SvgLocation = {
  id: string;
  path: string;
  name?: string;
};

const chinaMap = China as {
  viewBox: string;
  locations: SvgLocation[];
};

type MapBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const parseViewBox = (viewBox: string) => {
  const parts = viewBox
    .trim()
    .split(/\s+/)
    .map((value) => Number(value));
  const width = Number.isFinite(parts[2]) ? parts[2] : 100;
  const height = Number.isFinite(parts[3]) ? parts[3] : 100;
  return { width, height };
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export default function ChinaManufacturingMap({
  onCitySelect,
  onProvinceSelect,
  className = "",
}: ChinaManufacturingMapProps) {
  const [selectedIndustry, setSelectedIndustry] = useState<Industry | null>(
    null
  );
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [selectedProvince, setSelectedProvince] = useState<Province | null>(
    null
  );
  const [hoveredCity, setHoveredCity] = useState<City | null>(null);
  const [isMobileInfoOpen, setIsMobileInfoOpen] = useState(false);
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const mapGroupRef = useRef<SVGGElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  const filteredProvinces = useMemo(() => {
    if (!selectedIndustry) return provinces;
    return getProvincesByIndustry(selectedIndustry);
  }, [selectedIndustry]);

  const filteredCities = useMemo(() => {
    if (!selectedIndustry) return cities;
    return getCitiesByIndustry(selectedIndustry);
  }, [selectedIndustry]);

  const highlightedProvinceIds = useMemo(() => {
    return new Set(filteredProvinces.map((province) => province.svg_id));
  }, [filteredProvinces]);

  const handleIndustryFilter = useCallback((industryId: Industry | null) => {
    setSelectedIndustry(industryId);
    setSelectedCity(null);
    setSelectedProvince(null);
    setIsMobileInfoOpen(false);
  }, []);

  const handleCityClick = useCallback(
    (city: City) => {
      setSelectedCity(city);
      setSelectedProvince(
        provinces.find((province) => province.id === city.province_id) || null
      );
      setIsMobileInfoOpen(true);
      onCitySelect?.(city);
    },
    [onCitySelect]
  );

  const handleProvinceClick = useCallback(
    (provinceId: string) => {
      const province = provinces.find((item) => item.svg_id === provinceId);
      if (province) {
        setSelectedProvince(province);
        setSelectedCity(null);
        setIsMobileInfoOpen(true);
        onProvinceSelect?.(province);
      }
    },
    [onProvinceSelect]
  );

  const closeInfoPanel = useCallback(() => {
    setSelectedCity(null);
    setSelectedProvince(null);
    setIsMobileInfoOpen(false);
    onCitySelect?.(null);
    onProvinceSelect?.(null);
  }, [onCitySelect, onProvinceSelect]);

  const getLocationClassName = useCallback(
    (location: { id: string }) => {
      const isHighlighted = highlightedProvinceIds.has(location.id);
      const isSelected = selectedProvince?.svg_id === location.id;
      const isDimmed = selectedIndustry && !isHighlighted;

      if (isSelected) return "selected";
      if (isDimmed) return "dimmed";
      if (isHighlighted && selectedIndustry) return "highlighted";
      return "";
    },
    [highlightedProvinceIds, selectedProvince, selectedIndustry]
  );

  const provinceCities = useMemo(() => {
    if (!selectedProvince) return [];
    return getCitiesByProvince(selectedProvince.id);
  }, [selectedProvince]);

  const { width: mapWidth, height: mapHeight } = useMemo(
    () => parseViewBox(chinaMap.viewBox),
    []
  );

  useEffect(() => {
    if (!mapGroupRef.current) return;
    const updateBounds = () => {
      const nextBounds = mapGroupRef.current?.getBBox();
      if (!nextBounds || nextBounds.width === 0 || nextBounds.height === 0) {
        return;
      }
      setMapBounds({
        x: nextBounds.x,
        y: nextBounds.y,
        width: nextBounds.width,
        height: nextBounds.height,
      });
    };
    updateBounds();

    const observer = new ResizeObserver(updateBounds);
    if (mapContainerRef.current) {
      observer.observe(mapContainerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    const updateWidth = () =>
      setContainerWidth(mapContainerRef.current?.clientWidth ?? 0);
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(mapContainerRef.current);
    return () => observer.disconnect();
  }, []);

  const toMapX = useCallback(
    (value: number) => {
      if (!mapBounds) return (value / 100) * mapWidth;
      return mapBounds.x + (value / 100) * mapBounds.width;
    },
    [mapBounds, mapWidth]
  );

  const toMapY = useCallback(
    (value: number) => {
      if (!mapBounds) return (value / 100) * mapHeight;
      return mapBounds.y + (value / 100) * mapBounds.height;
    },
    [mapBounds, mapHeight]
  );

  const unitPerPx = useMemo(() => {
    if (!containerWidth || !mapWidth) return 1;
    return mapWidth / containerWidth;
  }, [containerWidth, mapWidth]);

  const markerRadius = useMemo(() => {
    const radiusPx = clamp(containerWidth * 0.006, 4, 9);
    return radiusPx * unitPerPx;
  }, [containerWidth, unitPerPx]);

  const markerRadiusActive = markerRadius * 1.35;
  const markerRadiusPulse = markerRadius * 1.8;
  const labelFontSize = markerRadius * 1.6;

  return (
    <>
      <style>{mapStyles}</style>

      <div
        className={`flex h-full flex-col bg-(--tl-bg-1) text-(--tl-text-inverse) ${className}`}
      >
        <div className="border-b border-white/10 bg-(--tl-bg-2) px-4 py-3">
          <h2 className="text-lg font-semibold text-white">
            🗺️ Карта производителей Китая
          </h2>
          <p className="mt-0.5 text-sm text-(--tl-text-inverse-weak)">
            Ключевые регионы для импортёров из СНГ
          </p>
        </div>

        <div className="border-b border-white/10 bg-(--tl-bg-2) px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleIndustryFilter(null)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                !selectedIndustry
                  ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                  : "bg-white/10 text-white/70 hover:bg-white/20"
              }`}
            >
              Все отрасли
            </button>
            {industries.map((industry) => (
              <button
                key={industry.id}
                onClick={() => handleIndustryFilter(industry.id)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                  selectedIndustry === industry.id
                    ? "text-white shadow-lg"
                    : "bg-white/10 text-white/70 hover:bg-white/20"
                }`}
                style={{
                  backgroundColor:
                    selectedIndustry === industry.id
                      ? industry.color
                      : undefined,
                }}
              >
                <span>{industry.icon}</span>
                <span>{industry.name_ru}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
          <div className="relative flex-1 overflow-hidden p-4">
            <div
              ref={mapContainerRef}
              className="china-map-container flex h-full items-center justify-center"
            >
              <div className="china-map-svg relative w-full max-w-3xl min-w-0">
                <svg
                  viewBox={chinaMap.viewBox}
                  className="block h-auto w-full"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <g ref={mapGroupRef}>
                    {chinaMap.locations.map((location) => (
                      <path
                        key={location.id}
                        id={location.id}
                        d={location.path}
                        className={getLocationClassName(location)}
                        onClick={() => handleProvinceClick(location.id)}
                        aria-label={location.name ?? location.id}
                      />
                    ))}
                  </g>
                </svg>

                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  viewBox={chinaMap.viewBox}
                  preserveAspectRatio="xMidYMid meet"
                >
                  {filteredCities.map((city) => {
                    const isSelected = selectedCity?.id === city.id;
                    const isHovered = hoveredCity?.id === city.id;
                    const industryInfo = city.industries[0]
                      ? getIndustryInfo(city.industries[0])
                      : null;
                    const color = industryInfo?.color || "#3B82F6";

                    return (
                      <g
                        key={city.id}
                        className="pointer-events-auto cursor-pointer"
                        onClick={() => handleCityClick(city)}
                        onMouseEnter={() => setHoveredCity(city)}
                        onMouseLeave={() => setHoveredCity(null)}
                      >
                        {isSelected && (
                          <circle
                            cx={toMapX(city.coordinates.x)}
                            cy={toMapY(city.coordinates.y)}
                            r={markerRadiusPulse}
                            fill={color}
                            opacity="0.3"
                            className="animate-ping"
                          />
                        )}

                        <circle
                          cx={toMapX(city.coordinates.x)}
                          cy={toMapY(city.coordinates.y)}
                          r={
                            isSelected || isHovered
                              ? markerRadiusActive
                              : markerRadius
                          }
                          fill={color}
                          stroke="white"
                          strokeWidth="0.4"
                          className="transition-all duration-200"
                        />

                        {(isHovered || isSelected) && (
                          <text
                            x={toMapX(city.coordinates.x)}
                            y={toMapY(city.coordinates.y) - markerRadius * 2.1}
                            textAnchor="middle"
                            fill="#E2E8F0"
                            fontSize={labelFontSize}
                            fontWeight="600"
                            className="pointer-events-none"
                          >
                            {city.name_ru}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {selectedIndustry && (
              <div className="absolute bottom-4 left-4 rounded-lg ui-glass-panel px-3 py-2 text-xs text-white/80 shadow-lg">
                <div className="flex items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 rounded"
                    style={{
                      backgroundColor:
                        getIndustryInfo(selectedIndustry)?.color,
                    }}
                  />
                  <span>{getIndustryInfo(selectedIndustry)?.name_ru}</span>
                  <span className="text-white/50">
                    ({filteredCities.length} городов)
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="hidden w-80 overflow-y-auto border-l border-white/10 bg-(--tl-bg-2) lg:block">
            <InfoPanel
              selectedCity={selectedCity}
              selectedProvince={selectedProvince}
              provinceCities={provinceCities}
              onCityClick={handleCityClick}
            />
          </div>
        </div>

        {isMobileInfoOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-black/30"
              onClick={closeInfoPanel}
            />

            <div className="absolute bottom-0 left-0 right-0 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-(--tl-bg-2) animate-slide-up">
              <div className="sticky top-0 border-b border-white/10 bg-(--tl-bg-2) px-4 py-3">
                <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/30" />
                <button
                  onClick={closeInfoPanel}
                  className="absolute right-3 top-3 p-2 text-white/60 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <InfoPanel
                selectedCity={selectedCity}
                selectedProvince={selectedProvince}
                provinceCities={provinceCities}
                onCityClick={handleCityClick}
              />
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </>
  );
}

type InfoPanelProps = {
  selectedCity: City | null;
  selectedProvince: Province | null;
  provinceCities: City[];
  onCityClick: (city: City) => void;
};

function InfoPanel({
  selectedCity,
  selectedProvince,
  provinceCities,
  onCityClick,
}: InfoPanelProps) {
  if (selectedCity) {
    return (
      <div className="p-4">
        <div className="mb-4">
          <h3 className="text-xl font-bold text-white">
            {selectedCity.name_ru}
          </h3>
          <p className="text-sm text-white/60">
            {selectedCity.name_en} · {selectedCity.name_zh}
          </p>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {selectedCity.industries.map((industryId) => {
            const info = getIndustryInfo(industryId);
            if (!info) return null;
            return (
              <span
                key={industryId}
                className="rounded-full px-2 py-1 text-xs font-medium text-white/95 shadow"
                style={{ backgroundColor: info.color }}
              >
                {info.icon} {info.name_ru}
              </span>
            );
          })}
        </div>

        <div className="mb-4">
          <p className="text-sm leading-relaxed text-white/80">
            {selectedCity.brief_ru}
          </p>
        </div>

        <div className="mb-4 rounded-lg bg-blue-500/10 p-3 text-white/80">
          <p className="mb-1 text-xs font-semibold text-blue-300">
            💡 Почему интересен для СНГ
          </p>
          <p className="text-sm text-blue-100/80">
            {selectedCity.why_relevant_ru}
          </p>
        </div>

        <a
          href={`/exhibitions?city=${selectedCity.id}`}
          className="block w-full rounded-lg bg-emerald-500/90 py-2.5 text-center font-medium text-white transition-colors hover:bg-emerald-500"
        >
          📅 Выставки в {selectedCity.name_ru} →
        </a>

        {provinceCities.length > 1 && (
          <div className="mt-6 border-t border-white/10 pt-4">
            <p className="mb-2 text-xs font-semibold text-white/50">
              Другие города в провинции:
            </p>
            <div className="flex flex-wrap gap-2">
              {provinceCities
                .filter((city) => city.id !== selectedCity.id)
                .map((city) => (
                  <button
                    key={city.id}
                    onClick={() => onCityClick(city)}
                    className="rounded bg-white/10 px-2 py-1 text-xs text-white/80 transition-colors hover:bg-white/20"
                  >
                    {city.name_ru}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (selectedProvince) {
    return (
      <div className="p-4">
        <div className="mb-4">
          <h3 className="text-xl font-bold text-white">
            {selectedProvince.name_ru}
          </h3>
          <p className="text-sm text-white/60">
            {selectedProvince.name_en} · {selectedProvince.name_zh}
          </p>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {selectedProvince.industries.map((industryId) => {
            const info = getIndustryInfo(industryId);
            if (!info) return null;
            return (
              <span
                key={industryId}
                className="rounded-full px-2 py-1 text-xs font-medium text-white/95 shadow"
                style={{ backgroundColor: info.color }}
              >
                {info.icon} {info.name_ru}
              </span>
            );
          })}
        </div>

        {provinceCities.length > 0 && (
          <div>
            <p className="mb-3 text-xs font-semibold text-white/50">
              Ключевые города ({provinceCities.length}):
            </p>
            <div className="space-y-2">
              {provinceCities.map((city) => {
                const mainIndustry = city.industries[0]
                  ? getIndustryInfo(city.industries[0])
                  : null;
                return (
                  <button
                    key={city.id}
                    onClick={() => onCityClick(city)}
                    className="w-full rounded-lg bg-white/5 p-3 text-left text-white/80 transition-colors hover:bg-white/10"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-white">
                        {city.name_ru}
                      </span>
                      {mainIndustry && (
                        <span
                          className="rounded-full px-2 py-0.5 text-xs text-white/95"
                          style={{ backgroundColor: mainIndustry.color }}
                        >
                          {mainIndustry.icon}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-white/60">
                      {city.why_relevant_ru}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <a
          href={`/exhibitions?province=${selectedProvince.id}`}
          className="mt-4 block w-full rounded-lg bg-emerald-500/90 py-2.5 text-center font-medium text-white transition-colors hover:bg-emerald-500"
        >
          📅 Выставки в провинции →
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center p-4 text-center">
      <div className="mb-3 text-4xl">🏭</div>
      <h3 className="mb-2 text-lg font-semibold text-white">
        Выберите регион
      </h3>
      <p className="max-w-xs text-sm text-white/60">
        Кликните на провинцию или город на карте, чтобы увидеть подробную
        информацию
      </p>

      <div className="mt-6 w-full text-left">
        <p className="mb-2 text-xs font-semibold text-white/50">Подсказка:</p>
        <ul className="space-y-1 text-xs text-white/60">
          <li>• Используйте фильтры для поиска по отраслям</li>
          <li>• Наведите на маркер, чтобы увидеть название</li>
          <li>• Кликните для подробной информации</li>
        </ul>
      </div>
    </div>
  );
}
