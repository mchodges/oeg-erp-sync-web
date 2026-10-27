/**
 * Catalog items that are tracked as price benchmarks on the Trends screen. Each follows one
 * catalog item (by its exact Master_Item_Name) so every point compares like with like.
 * Still to add once chosen: the storm sewer manhole and sanitary manhole benchmarks.
 */
export const BENCHMARKS: { key: string; label: string; catalogName: string }[] = [
  { key: "rcp24", label: '24" RCP storm sewer', catalogName: "24-Inch, CLIII R/G, RCP Storm Sewer" },
  { key: "water8", label: '8" PVC waterline', catalogName: "8-Inch C-900, PVC Water Line" },
  { key: "san8", label: '8" PVC sanitary sewer', catalogName: "8-Inch SDR-26, PVC Sanitary Sewer (All Depths)" },
  { key: "pave6", label: '6" reinforced concrete pavement', catalogName: "6-Inch Reinforced Concrete Pavement" },
];
