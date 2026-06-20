import type { Plan } from './types.js'

export const DEFAULT_PLANS: Plan[] = [
  {
    id: 'dev-small',
    name: 'Small',
    credits: 100,
    priceCents: 500,
    currency: 'CNY',
    enabled: true,
    recommended: false,
    description: '适合轻量体验和少量素材生成。',
  },
  {
    id: 'dev-medium',
    name: 'Medium',
    credits: 500,
    priceCents: 2000,
    currency: 'CNY',
    enabled: true,
    recommended: true,
    description: '适合稳定创作、批量出图和商业项目交付。',
  },
  {
    id: 'dev-free',
    name: 'Free Trial',
    credits: 20,
    priceCents: 0,
    currency: 'CNY',
    enabled: true,
    recommended: false,
    description: '用于新用户试用平台托管生图能力。',
  },
]
