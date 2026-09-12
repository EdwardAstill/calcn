// jStat does not publish TypeScript declarations.
// @ts-expect-error Untyped upstream module; the used API is described below.
import jstat from 'jstat'

type Family = { pdf(x: number, ...args: number[]): number; cdf(x: number, ...args: number[]): number; inv(p: number, ...args: number[]): number; mean(...args: number[]): number; variance(...args: number[]): number }
const stats = jstat.jStat as Record<string, Family> & { gammaln(x: number): number; lowRegGamma(a: number, x: number): number; ibeta(x: number, a: number, b: number): number; erfc(x: number): number }

export const DISTRIBUTIONS = {
  Norm: ['mean', 'variance'], N: ['mean', 'variance'], Pois: ['rate'],
  Bin: ['trials', 'probability'], Bern: ['probability'], Unif: ['lower', 'upper'],
  Exp: ['rate'], Weib: ['shape', 'scale'], Gamma: ['shape', 'scale'],
  Beta: ['alpha', 'beta'], T: ['degrees'], Chi2: ['degrees'], F: ['degrees1', 'degrees2'],
} as const
export type DistributionName = keyof typeof DISTRIBUTIONS
export function isDistribution(name: string): name is DistributionName { return Object.hasOwn(DISTRIBUTIONS, name) }
export type Distribution = {
  discrete: boolean
  support: [number, number]
  pdf(x: number): number
  cdf(x: number): number
  sf(x: number): number
  quantile(p: number): number
  mean(): number
  variance(): number
}

export function distribution(name: DistributionName, args: number[]): Distribution {
  if (args.length !== DISTRIBUTIONS[name].length || args.some(x => !Number.isFinite(x))) throw new Error(`${name} requires finite numeric parameters.`)
  const [a, b] = args as [number, number]
  const positive = (x: number, label: string) => { if (!(x > 0)) throw new Error(`${name}: ${label} must be greater than zero.`) }
  const probability = (x: number) => { if (x < 0 || x > 1) throw new Error(`${name}: probability must be between 0 and 1.`) }
  let family: Family
  let parameters = args
  let support: [number, number] = [0, Infinity]
  let discrete = false
  switch (name) {
    case 'Norm': case 'N': positive(b, 'variance'); family = stats.normal; parameters = [a, Math.sqrt(b)]; support = [-Infinity, Infinity]; break
    case 'Pois': if (a < 0) throw new Error('Pois: rate must be nonnegative.'); family = stats.poisson; discrete = true; if (a === 0) support = [0, 0]; break
    case 'Bin': if (!Number.isSafeInteger(a) || a < 0) throw new Error('Bin: trials must be a nonnegative integer.'); probability(b); family = stats.binomial; discrete = true; support = b === 0 ? [0, 0] : b === 1 ? [a, a] : [0, a]; break
    case 'Bern': probability(a); family = stats.binomial; parameters = [1, a]; discrete = true; support = a === 0 ? [0, 0] : a === 1 ? [1, 1] : [0, 1]; break
    case 'Unif': if (!(b > a)) throw new Error('Unif: upper bound must exceed lower bound.'); family = stats.uniform; support = [a, b]; break
    case 'Exp': positive(a, 'rate'); family = stats.exponential; break
    case 'Weib': positive(a, 'shape'); positive(b, 'scale'); family = stats.weibull; parameters = [b, a]; break
    case 'Gamma': positive(a, 'shape'); positive(b, 'scale'); family = stats.gamma; break
    case 'Beta': positive(a, 'alpha'); positive(b, 'beta'); family = stats.beta; support = [0, 1]; break
    case 'T': positive(a, 'degrees of freedom'); family = stats.studentt; support = [-Infinity, Infinity]; break
    case 'Chi2': positive(a, 'degrees of freedom'); family = stats.chisquare; break
    case 'F': positive(a, 'numerator degrees of freedom'); positive(b, 'denominator degrees of freedom'); family = stats.centralF; break
  }
  const clamp = (x: number) => {
    if (!Number.isFinite(x)) throw new Error(`Could not evaluate ${name} accurately for these parameters.`)
    return Math.max(0, Math.min(1, x))
  }
  // Continued fraction for the Normal survival function avoids 1 - erf
  // cancellation in jStat's extreme tails (Laplace's Mills-ratio fraction).
  const normalTail = (z: number): number => {
    if (z === 0) return 0.5
    if (z < 0) return 1 - normalTail(-z)
    if (z < 5) return stats.erfc(z / Math.SQRT2) / 2
    let fraction = 0
    for (let i = 100; i >= 1; i--) fraction = i / (z + fraction)
    return Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI) / (z + fraction)
  }
  const cdf = (x: number): number => {
    if (x < support[0]) return 0
    if (x >= support[1]) return 1
    if (x === -Infinity) return 0
    if (discrete) x = Math.floor(x)
    // Use the incomplete beta rather than jStat's rounded binomial CDF.
    if (name === 'Bin' || name === 'Bern') return clamp(stats.ibeta(1 - parameters[1], parameters[0] - x, x + 1))
    if (name === 'Pois') return clamp(1 - stats.lowRegGamma(x + 1, a))
    if (name === 'Norm' || name === 'N') return normalTail((a - x) / Math.sqrt(b))
    return clamp(family.cdf(x, ...parameters))
  }
  const sf = (x: number): number => {
    if (x < support[0] || x === -Infinity) return 1
    if (x >= support[1]) return 0
    if (name === 'Norm' || name === 'N') return normalTail((x - a) / Math.sqrt(b))
    if (name === 'Exp') return Math.exp(-a * x)
    if (name === 'Weib') return Math.exp(-Math.pow(x / b, a))
    if (name === 'Pois') return clamp(stats.lowRegGamma(Math.floor(x) + 1, a))
    if (name === 'Bin' || name === 'Bern') return clamp(stats.ibeta(parameters[1], Math.floor(x) + 1, parameters[0] - Math.floor(x)))
    return clamp(1 - cdf(x))
  }
  const quantile = (p: number): number => {
    if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error('quantile: probability must be between 0 and 1.')
    if (p === 0) return support[0]
    if (p === 1) return support[1]
    if (!discrete) return family.inv(p, ...parameters)
    let low = support[0], high = Number.isFinite(support[1]) ? support[1] : Math.max(1, Math.ceil(a))
    while (cdf(high) < p && high < Number.MAX_SAFE_INTEGER / 2) high *= 2
    if (cdf(high) < p) throw new Error('Quantile exceeds the supported numeric range.')
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2)
      if (cdf(middle) >= p) high = middle
      else low = middle + 1
    }
    return low
  }
  return {
    discrete, support, cdf, sf, quantile,
    pdf(x) {
      if (x < support[0] || x > support[1] || (discrete && !Number.isInteger(x))) return 0
      if (support[0] === support[1]) return x === support[0] ? 1 : 0
      if (name === 'Bin' || name === 'Bern') {
        const [n, p] = parameters
        return Math.exp(stats.gammaln(n + 1) - stats.gammaln(x + 1) - stats.gammaln(n - x + 1) + x * Math.log(p) + (n - x) * Math.log1p(-p))
      }
      if (name === 'Pois') return Math.exp(x * Math.log(a) - a - stats.gammaln(x + 1))
      return family.pdf(x, ...parameters)
    },
    mean() {
      if (name === 'Bin' || name === 'Bern') return parameters[0] * parameters[1]
      if (name === 'Pois') return a
      return family.mean(...parameters)
    },
    variance() {
      if (name === 'Bin' || name === 'Bern') return parameters[0] * parameters[1] * (1 - parameters[1])
      if (name === 'Pois') return a
      return family.variance(...parameters)
    },
  }
}
