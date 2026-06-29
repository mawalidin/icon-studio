export const BRANDS = [
  { id: "reddoorz", name: "RedDoorz",   primary: "#E63946", duotone: "#FCD9DC" },
  { id: "sans",     name: "SANS Hotels", primary: "#1D2A3A", duotone: "#D6DCE3" },
  { id: "urbanview",name: "Urbanview",  primary: "#2E7D6B", duotone: "#D2E8E1" },
  { id: "lavana",   name: "The Lavana", primary: "#1B2A4A", duotone: "#E7D6A8" },
];

export const ALL_BRAND_IDS = BRANDS.map((b) => b.id);

export function getBrand(id) {
  return BRANDS.find((b) => b.id === id) ?? BRANDS[0];
}
