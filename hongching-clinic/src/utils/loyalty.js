// ══════════════════════════════════
// Loyalty Points System
// ══════════════════════════════════
// Points earn rate: $1 = 1 point
// Redemption: 100 points = $1 discount
// Bonus: birthday month 2x, referral +500

const POINTS_PER_DOLLAR = 1;
const REDEMPTION_RATE = 100; // 100 points = $1

export const LOYALTY_CONFIG = {
  pointsPerDollar: POINTS_PER_DOLLAR,
  redemptionRate: REDEMPTION_RATE,
  birthdayMultiplier: 2,
  referralBonus: 500,
  firstVisitBonus: 200,
  reviewBonus: 100,
};

// Calculate points from revenue
export function calculatePointsFromSpending(amount) {
  return Math.floor(Number(amount || 0) * POINTS_PER_DOLLAR);
}

// Calculate discount value from points
export function pointsToDiscount(points) {
  return Math.floor(Number(points || 0) / REDEMPTION_RATE);
}

// Get loyalty points for a patient
export function getPatientPoints(patientName, revenue, pointsHistory) {
  // Calculate earned points from revenue
  const patientRevenue = (revenue || []).filter(r => r.name === patientName);
  const totalSpent = patientRevenue.reduce((s, r) => s + Number(r.amount || 0), 0);
  const earnedFromSpending = calculatePointsFromSpending(totalSpent);

  // Check bonus points from history
  const history = (pointsHistory || []).filter(h => h.patientName === patientName);
  const bonusPoints = history.filter(h => h.type === 'bonus').reduce((s, h) => s + Number(h.points || 0), 0);
  const redeemedPoints = history.filter(h => h.type === 'redeem').reduce((s, h) => s + Math.abs(Number(h.points || 0)), 0);

  const totalPoints = earnedFromSpending + bonusPoints - redeemedPoints;

  return {
    earned: earnedFromSpending,
    bonus: bonusPoints,
    redeemed: redeemedPoints,
    balance: Math.max(0, totalPoints),
    discountAvailable: pointsToDiscount(Math.max(0, totalPoints)),
  };
}

// Get loyalty tier based on points
export function getLoyaltyTier(points) {
  if (points >= 20000) return { name: '鑽石', color: '#818cf8', icon: '💎', discount: 15 };
  if (points >= 10000) return { name: '金卡', color: '#DAA520', icon: '🏆', discount: 10 };
  if (points >= 5000) return { name: '銀卡', color: '#A0A0A0', icon: '🥈', discount: 5 };
  if (points >= 1000) return { name: '銅卡', color: '#CD7F32', icon: '🥉', discount: 3 };
  return { name: '普通', color: '#888', icon: '👤', discount: 0 };
}

// Load/save points history from localStorage
export function loadPointsHistory() {
  try { return JSON.parse(localStorage.getItem('hcmc_loyalty_points') || '[]'); } catch { return []; }
}

export function savePointsHistory(history) {
  localStorage.setItem('hcmc_loyalty_points', JSON.stringify(history));
}

export function addPointsEntry(history, entry) {
  const updated = [...history, { ...entry, id: Date.now().toString(36), date: new Date().toISOString() }];
  savePointsHistory(updated);
  return updated;
}
