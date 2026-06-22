import { useEffect, useState, type ReactNode, type SVGProps } from 'react'
import { getActiveApiProfile } from '../lib/apiProfiles'
import { getPlatformPublicConfig } from '../lib/platformAccountApi'
import { useStore } from '../store'
import type { PlatformPublicConfigResponse } from '../lib/platformApiContracts'
import { EditIcon, HistoryIcon, LinkIcon, SettingsIcon, UserIcon } from './icons'

function SparkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9L12 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
    </svg>
  )
}

function ShieldIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l7 3v5c0 4.4-2.8 8.4-7 10-4.2-1.6-7-5.6-7-10V6l7-3z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-5" />
    </svg>
  )
}

function WalletIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7a3 3 0 013-3h11a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12h4v4h-4a2 2 0 110-4zM4 8h16" />
    </svg>
  )
}

function Metric({ value, label, icon: Icon }: { value: string; label: string; icon: (props: SVGProps<SVGSVGElement>) => ReactNode }) {
  return (
    <div className="home-reveal rounded-2xl border border-gray-200 bg-white/75 p-4 shadow-sm backdrop-blur dark:border-white/[0.08] dark:bg-white/[0.05]">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gray-950 text-white dark:bg-white dark:text-gray-950">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <div className="text-2xl font-black text-gray-950 dark:text-white">{value}</div>
          <div className="mt-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">{label}</div>
        </div>
      </div>
    </div>
  )
}

function PreviewTile({ className, label, delayClass }: { className: string; label: string; delayClass: string }) {
  return (
    <div className={`home-preview-float ${delayClass} relative min-h-[168px] overflow-hidden rounded-2xl border border-white/40 shadow-2xl ${className}`}>
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.38),transparent_36%,rgba(0,0,0,0.22))]" />
      <div className="home-sheen absolute inset-0" />
      <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/78 px-2.5 py-1 text-[11px] font-bold text-gray-800 shadow-sm backdrop-blur">
        <SparkIcon className="h-3.5 w-3.5 text-amber-500" />
        {label}
      </div>
      <div className="absolute bottom-3 left-3 right-3 rounded-xl bg-white/38 p-2 backdrop-blur-md">
        <div className="h-2 w-2/3 rounded-full bg-white/65" />
        <div className="mt-2 h-2 w-1/2 rounded-full bg-white/45" />
      </div>
    </div>
  )
}

const capabilityCards = [
  {
    title: 'AI 生图工作流',
    body: '提示词、参考图、批量生成、作品画廊与历史记录都在同一条创作链路里，用户从灵感到交付更顺。',
    icon: SparkIcon,
    tone: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200',
  },
  {
    title: '商业计费闭环',
    body: '套餐次数优先扣减，余额自动抵扣订单，余额不足时再进入支付渠道，减少无效订单堆积。',
    icon: WalletIcon,
    tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200',
  },
  {
    title: '运营后台可配置',
    body: '站点名称、模型、价格、支付方式、用户余额与订单状态集中管理，适合真实商业运营。',
    icon: SettingsIcon,
    tone: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200',
  },
]

const flowSteps = [
  ['01', '进入官网', '用户快速理解产品能力与价格结构。'],
  ['02', '开始创作', '跳转作品画廊，提交提示词并生成图片。'],
  ['03', '余额扣费', '套餐次数不足时按后台价格扣余额。'],
  ['04', '套餐充值', '余额可抵扣套餐订单，再补齐第三方支付。'],
]

export default function HomePage() {
  const settings = useStore((s) => s.settings)
  const setAppMode = useStore((s) => s.setAppMode)
  const activeProfile = getActiveApiProfile(settings)
  const [publicConfig, setPublicConfig] = useState<PlatformPublicConfigResponse['config'] | null>(null)
  const siteName = publicConfig?.siteName || 'Image Idea'

  useEffect(() => {
    void getPlatformPublicConfig(activeProfile.baseUrl).then((response) => setPublicConfig(response.config)).catch(() => undefined)
  }, [activeProfile.baseUrl])

  const navigate = (path: string, mode: 'gallery' | 'plans' | 'user-center') => {
    window.history.pushState(null, '', path)
    setAppMode(mode)
  }

  return (
    <main className="home-page-enter overflow-hidden bg-[#f7f4ee] text-gray-950 dark:bg-gray-950 dark:text-white">
      <section className="relative min-h-[calc(100vh-5rem)] px-4 pb-16 pt-10 sm:pt-14">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(17,24,39,0.06)_1px,transparent_1px),linear-gradient(rgba(17,24,39,0.05)_1px,transparent_1px)] bg-[size:44px_44px] dark:bg-[linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px)]" />
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.24),transparent_58%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.94fr)_minmax(420px,1.06fr)] lg:items-center">
          <div className="home-hero-copy pt-8 lg:pt-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-gray-900/10 bg-white/70 px-3 py-1.5 text-xs font-bold text-gray-700 shadow-sm backdrop-blur dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-gray-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              多用户计费 · 套餐充值 · 余额抵扣 · 管理后台
            </div>
            <h1 className="mt-6 max-w-4xl text-5xl font-black leading-[0.96] tracking-tight text-gray-950 dark:text-white sm:text-6xl lg:text-7xl">
              {siteName}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-700 dark:text-gray-300">
              面向创作者、品牌团队和电商运营的 AI 生图平台。把灵感生成、作品沉淀、套餐余额、订单支付和后台运营集中在一套可商业化系统里。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => navigate('/gallery', 'gallery')} className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-gray-950 px-5 py-3 text-sm font-black text-white shadow-xl shadow-gray-950/15 transition hover:-translate-y-0.5 hover:bg-gray-800 dark:bg-white dark:text-gray-950">
                <EditIcon className="h-5 w-5 transition group-hover:rotate-[-8deg]" />
                立即开始生图
              </button>
              <button type="button" onClick={() => navigate('/plans', 'plans')} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-300 bg-white/75 px-5 py-3 text-sm font-bold text-gray-800 shadow-sm transition hover:-translate-y-0.5 hover:border-gray-950 dark:border-white/[0.12] dark:bg-white/[0.06] dark:text-gray-100">
                <WalletIcon className="h-5 w-5" />
                查看套餐与余额
              </button>
            </div>
            <div className="home-reveal-grid mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
              <Metric value="30s" label="快速出图链路" icon={SparkIcon} />
              <Metric value="3x" label="批量创意效率" icon={HistoryIcon} />
              <Metric value="24h" label="订单流水追踪" icon={ShieldIcon} />
            </div>
          </div>

          <div className="home-hero-preview relative">
            <div className="absolute -inset-4 rounded-[2rem] bg-gray-950 shadow-2xl shadow-gray-950/20 dark:bg-white/[0.06]" />
            <div className="relative rounded-[1.75rem] border border-gray-900/10 bg-white p-3 shadow-2xl dark:border-white/[0.1] dark:bg-gray-900">
              <div className="grid grid-cols-2 gap-3">
                <PreviewTile delayClass="home-float-a" label="商品海报" className="bg-[radial-gradient(circle_at_28%_26%,#fef3c7,transparent_34%),linear-gradient(135deg,#0f172a,#2563eb_48%,#f97316)]" />
                <PreviewTile delayClass="home-float-b" label="角色设定" className="bg-[radial-gradient(circle_at_70%_30%,#fecdd3,transparent_30%),linear-gradient(135deg,#111827,#7c3aed_48%,#22c55e)]" />
                <PreviewTile delayClass="home-float-c" label="电商素材" className="bg-[radial-gradient(circle_at_35%_65%,#d9f99d,transparent_32%),linear-gradient(135deg,#164e63,#0ea5e9_48%,#facc15)]" />
                <PreviewTile delayClass="home-float-d" label="品牌视觉" className="bg-[radial-gradient(circle_at_70%_20%,#bfdbfe,transparent_34%),linear-gradient(135deg,#18181b,#db2777_45%,#fb7185)]" />
              </div>
              <div className="mt-3 grid gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/[0.08] dark:bg-white/[0.04] sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Live billing</div>
                  <div className="mt-1 text-sm font-semibold text-gray-950 dark:text-white">套餐优先扣次，余额自动抵扣，支付状态实时入账</div>
                </div>
                <div className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  可运营
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-gray-200 bg-white px-4 py-14 dark:border-white/[0.08] dark:bg-gray-900">
        <div className="home-card-stagger mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {capabilityCards.map(({ title, body, icon: Icon, tone }) => (
            <article key={title} className="group rounded-2xl border border-gray-200 bg-gray-50 p-5 transition duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-white/[0.08] dark:bg-white/[0.04]">
              <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${tone}`}>
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-lg font-black text-gray-950 dark:text-white">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="px-4 py-16">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <div className="home-reveal">
            <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-bold text-gray-600 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-300">
              <UserIcon className="h-4 w-4" />
              用户路径
            </div>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-gray-950 dark:text-white">从访问到付费，路径尽量短。</h2>
            <p className="mt-4 text-base leading-7 text-gray-600 dark:text-gray-300">
              用户先在首页建立信任，再进入生图体验；次数不足时自然进入充值页，余额抵扣与第三方支付衔接在同一个订单弹窗里。
            </p>
          </div>
          <div className="home-flow-line grid gap-3 sm:grid-cols-4">
            {flowSteps.map(([step, title, body]) => (
              <div key={step} className="relative rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-gray-900">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gray-950 text-xs font-black text-white dark:bg-white dark:text-gray-950">{step}</div>
                <div className="mt-4 text-base font-black text-gray-950 dark:text-white">{title}</div>
                <div className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="home-final-cta mx-auto flex max-w-7xl flex-col gap-4 rounded-3xl bg-gray-950 p-6 text-white shadow-2xl shadow-gray-950/20 md:flex-row md:items-center md:justify-between dark:bg-white dark:text-gray-950">
          <div>
            <h2 className="text-2xl font-black">准备把 AI 生图做成可收费产品？</h2>
            <p className="mt-2 text-sm text-white/70 dark:text-gray-600">从首页、用户中心、套餐和后台开始，让核心付费闭环先稳定跑起来。</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => navigate('/gallery', 'gallery')} className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-gray-950 transition hover:bg-amber-100 dark:bg-gray-950 dark:text-white">进入生图画廊</button>
            <button type="button" onClick={() => navigate('/user', 'user-center')} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10 dark:border-gray-950/15 dark:text-gray-950 dark:hover:bg-gray-950/5">
              <LinkIcon className="h-5 w-5" />
              打开用户中心
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
