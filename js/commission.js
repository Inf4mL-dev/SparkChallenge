// EIC agent commission (rule 29). Motor only: this app sells Third Party and Comprehensive cover.
// Integer pesewas and basis points throughout, so nothing is rounded until it is displayed.
//   net        = premium - GH₵79 sticker fee
//   gross      = net x rate               (Third Party 7.5%, Comprehensive 12.5%)
//   final      = gross x (1 - 10%)        (the 10% is called "commission tax")
// There are no tiers, caps, minimums or bonuses.

export const STICKER_FEE_PESEWAS = 7900;
const RATE_BASIS_POINTS = { 'Third Party': 750, Comprehensive: 1250 };

/** premiumGhs: the quoted premium in GH₵. Returns { status, numerator? }.
 *  numerator is in pesewas x 100,000, so it can be summed exactly and rounded once, for display. */
export function motorCommission(premiumGhs, coverType) {
  const rate = RATE_BASIS_POINTS[coverType];
  if (!rate) return { status: 'unsupported' };
  const premium = Math.round(Number(premiumGhs) * 100);
  if (!(premium > 0)) return { status: 'invalid' };
  const net = premium - STICKER_FEE_PESEWAS;
  if (net < 0) return { status: 'below-fee' };            // never return a negative commission
  return { status: 'ok', numerator: net * rate * 9 };      // net x (rate/10000) x 0.9 x 100000
}

/** Round once, at display: pesewas, half up. */
export function numeratorToPesewas(numerator) {
  return Math.floor((numerator + 50000) / 100000);
}
