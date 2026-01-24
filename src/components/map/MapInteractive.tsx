"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import ChinaManufacturingMap from "@/components/map/ChinaManufacturingMap";
import { Button } from "@/components/ui/Button";
import type { City, Province } from "@/data/chinaMapData";

export function MapInteractive() {
  const router = useRouter();
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [selectedProvince, setSelectedProvince] = useState<Province | null>(null);

  const handleOpenExhibitions = () => {
    if (selectedCity?.id) {
      router.push(`/exhibitions?city=${selectedCity.id}`);
      return;
    }
    if (selectedProvince?.id) {
      router.push(`/exhibitions?province=${selectedProvince.id}`);
    }
  };

  return (
    <>
      <div className="h-[70vh] min-h-[520px] max-h-[780px] overflow-hidden rounded-2xl border border-white/10 ui-glass-panel">
        <ChinaManufacturingMap
          className="h-full"
          onCitySelect={setSelectedCity}
          onProvinceSelect={setSelectedProvince}
        />
      </div>
      {(selectedCity || selectedProvince) && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
          <div>
            {selectedCity ? (
              <span>Выбран город: {selectedCity.name_ru}</span>
            ) : (
              <span>Выбрана провинция: {selectedProvince?.name_ru}</span>
            )}
          </div>
          <Button variant="secondary" onClick={handleOpenExhibitions}>
            Показать выставки по региону
          </Button>
        </div>
      )}
    </>
  );
}
