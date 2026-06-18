import type { Plan } from './types.js'

export const DEFAULT_PLANS: Plan[] = [
  {
    id: 'dev-small',
    name: 'Small',
    credits: 100,
    priceCents: 500,
    currency: 'CNY',
    enabled: true,
  },
  {
    id: 'dev-medium',
    name: 'Medium',
    credits: 500,
    priceCents: 2000,
    currency: 'CNY',
    enabled: true,
  },
  {
    id: 'dev-free',
    name: 'Free Trial',
    credits: 20,
    priceCents: 0,
    currency: 'CNY',
    enabled: true,
  },
]
