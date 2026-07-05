export const BLOOD_TYPES = ["A+","A-","B+","B-","AB+","AB-","O+","O-"]; 
export const ORGANS = ["Kidney","Liver","Heart","Lungs","Pancreas","Cornea","Bone Marrow","Small Intestine"];
export const COMPATIBILITY = {
  "A+": ["O-","O+","A-","A+"],
  "A-": ["O-","A-"],
  "B+": ["O-","O+","B-","B+"],
  "B-": ["O-","B-"],
  "AB+": ["O-","O+","A-","A+","B-","B+","AB-","AB+"],
  "AB-": ["O-","A-","B-","AB-"],
  "O+": ["O-","O+"],
  "O-": ["O-"],
};
export const HOSPITAL_GRAPH = {
  h1: { h2: 5, h3: 12, h4: 8 },
  h2: { h1: 5, h3: 7, h5: 15 },
  h3: { h1: 12, h2: 7, h4: 3, h5: 9 },
  h4: { h1: 8, h3: 3, h5: 6 },
  h5: { h2: 15, h3: 9, h4: 6 },
};
export const DAY_MS = 86400000;
export function formatISODate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
export function getToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
export function checkEligibility(lastDate) {
  if (!lastDate) return { eligible: true, daysLeft: 0, daysPassed: 999 };
  const diff = Math.floor((getToday() - new Date(lastDate)) / DAY_MS);
  return { eligible: diff >= 56, daysLeft: Math.max(0, 56 - diff), daysPassed: diff };
}
export function expireUnits(inventory) {
  const today = getToday();
  return (inventory || []).map(unit => ({
    ...unit,
    status: unit.status !== "Reserved" && new Date(unit.expiryDate) < today ? "Expired" : unit.status,
  }));
}
export function matchRequest(inventory, type, quantity, hospitalId) {
  const compat = COMPATIBILITY[type] || [type];
  const today = getToday();
  const matches = (inventory || [])
    .filter(unit =>
      unit.status === "Available" &&
      compat.includes(unit.bloodType) &&
      new Date(unit.expiryDate) > today &&
      unit.hospitalId === hospitalId
    )
    .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  return { matches: matches.slice(0, quantity), canFulfill: matches.length >= quantity, total: matches.length };
}
export function normalizeMatches(matches) {
  return (matches || []).map(match => ({
    hospital: match.hospital,
    distance: match.distance,
    total: match.totalMatches ?? match.total ?? 0,
    matches: match.matches || [],
    canFulfill: match.canFulfill,
  }));
}
export const DEFAULT_TARGET_UNITS = 5;
export function getTargetUnits(bloodCapacities, hospitalId, bloodType) {
  const record = (bloodCapacities || []).find(
    entry => entry.hospitalId === hospitalId && entry.bloodType === bloodType
  );
  return record?.targetUnits ?? DEFAULT_TARGET_UNITS;
}
export function buildStockVsTarget(db, hospitalId) {
  const inventory = expireUnits(db.inventory).filter(
    unit => unit.hospitalId === hospitalId && unit.status === "Available"
  );
  return BLOOD_TYPES.map(bloodType => {
    const count = inventory.filter(unit => unit.bloodType === bloodType).length;
    const target = getTargetUnits(db.bloodCapacities, hospitalId, bloodType);
    return { bt: bloodType, count, target, ratio: target > 0 ? count / target : 1 };
  });
}
