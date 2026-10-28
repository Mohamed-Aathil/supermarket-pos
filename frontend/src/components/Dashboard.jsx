import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '../lib/api'
import { formatCompact, formatMoney, formatNumber } from '../lib/format'
import { useCatalogStore } from '../store/useCatalogStore'
import LowStockTable from './LowStockTable'
import RollingNumber from './RollingNumber'

const REFRESH_MS = 30_000
const DAYS = 14 // two weeks: this week for the line (vs last week), all 14 for the profit bars
const MONTH_DAYS = 400 // enough to always cover the last 12 full months + the one before (for MoM change)

const COLORS = { revenue: '#059669', previous: '#94a3b8', profit: '#059669', loss: '#e11d48', grid: '#e2e8f0' }

/** 'YYYY-MM-DD' -> local Date without the UTC off-by-one that new Date(str) causes. */
const parseDay = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const weekday = (s) => parseDay(s).toLocaleDateString('en-IN', { weekday: 'short' })
const monthLabel = (s) => {
  const [y, m] = s.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
}
const dayMonth = (s) => parseDay(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

function Kpi({ icon, label, value, decimals = 0, prefix = '', hint, tone = 'text-slate-900' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        {icon && <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-lg">{icon}</span>}
      </div>
      <RollingNumber value={value} decimals={decimals} prefix={prefix} className={`mt-2 text-3xl font-extrabold ${tone}`} />
      {hint && <p className="mt-2 text-sm text-slate-500">{hint}</p>}
    </motion.div>
  )
}

function ChartCard({ title, subtitle, children, tall }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mb-4 text-sm text-slate-500">{subtitle}</p>
      <div className={tall ? 'h-80' : 'h-72'}>{children}</div>
    </section>
  )
}

const moneyTooltip = (value) => formatMoney(value)

export default function Dashboard() {
  const [report, setReport] = useState(null)
  const [monthly, setMonthly] = useState(null)
  const [error, setError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const loadCatalog = useCatalogStore((s) => s.load)

  const refresh = useCallback(async () => {
    try {
      const [daily, months] = await Promise.all([
        api.dashboard({ group_by: 'day', days: DAYS }),
        api.dashboard({ group_by: 'month', days: MONTH_DAYS }),
      ])
      setReport(daily)
      setMonthly(months)
      setUpdatedAt(new Date())
      setError(null)
    } catch (err) {
      setError(err.isNetwork ? 'offline' : err.message) // keep showing the last good data
    }
    loadCatalog() // low-stock table reads the catalogue store
  }, [loadCatalog])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, REFRESH_MS)
    window.addEventListener('online', refresh)
    return () => {
      clearInterval(id)
      window.removeEventListener('online', refresh)
    }
  }, [refresh])

  const { weekData, profitData, today, thisWeek, lastWeek } = useMemo(() => {
    const series = report?.series ?? []
    const last7 = series.slice(-7)
    const prev7 = series.slice(-14, -7)
    return {
      weekData: last7.map((p, i) => ({
        label: weekday(p.period),
        date: dayMonth(p.period),
        revenue: p.revenue,
        previous: prev7[i]?.revenue ?? 0,
      })),
      profitData: series.map((p) => ({ label: dayMonth(p.period), profit: p.net_profit })),
      today: series.at(-1),
      thisWeek: last7.reduce((sum, p) => sum + p.revenue, 0),
      lastWeek: prev7.reduce((sum, p) => sum + p.revenue, 0),
    }
  }, [report])

  const { monthRows, thisMonth, ytd } = useMemo(() => {
    const series = monthly?.series ?? []
    const rows = series.map((p, i) => {
      const prev = series[i - 1]
      return {
        ...p,
        label: monthLabel(p.period),
        margin: p.revenue > 0 ? (p.net_profit / p.revenue) * 100 : 0,
        delta: prev && prev.revenue > 0 ? ((p.revenue - prev.revenue) / prev.revenue) * 100 : null,
      }
    })
    const year = monthly?.end?.slice(0, 4)
    const ytdRows = rows.filter((r) => r.period.startsWith(year))
    return {
      monthRows: rows.slice(-12),
      thisMonth: rows.at(-1),
      ytd: {
        revenue: ytdRows.reduce((a, r) => a + r.revenue, 0),
        profit: ytdRows.reduce((a, r) => a + r.net_profit, 0),
        units: ytdRows.reduce((a, r) => a + r.units_sold, 0),
        year,
      },
    }
  }, [monthly])

  const weekDelta = lastWeek > 0 ? ((thisWeek - lastWeek) / lastWeek) * 100 : null

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-slate-100 to-slate-50"><div className="mx-auto max-w-7xl space-y-5 p-4 pb-10 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900">Business overview</h2>
          <p className="text-sm text-slate-500">Daily, weekly and monthly performance</p>
        </div>
        <p className="text-sm text-slate-500">
          {updatedAt ? `Updated ${updatedAt.toLocaleTimeString('en-IN')}` : 'Loading…'}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error === 'offline'
            ? "Can't reach the server - sales charts are paused (showing the last data received). Low-stock alerts use the stock levels saved on this device."
            : `Couldn't refresh the dashboard: ${error}`}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon="💰" label="Revenue today" value={today?.revenue ?? 0} decimals={2} prefix="₹" tone="text-emerald-700" />
        <Kpi
          icon="📈"
          label="Net profit today"
          value={today?.net_profit ?? 0}
          decimals={2}
          prefix="₹"
          tone={(today?.net_profit ?? 0) < 0 ? 'text-rose-600' : 'text-emerald-700'}
        />
        <Kpi icon="📦" label="Units sold today" value={today?.units_sold ?? 0} hint={`${formatNumber(today?.transactions ?? 0)} transactions`} />
        <Kpi
          icon="🗓️"
          label="Revenue, last 7 days"
          value={thisWeek}
          decimals={2}
          prefix="₹"
          hint={
            weekDelta === null
              ? 'No data for the week before'
              : `${weekDelta >= 0 ? '▲' : '▼'} ${Math.abs(weekDelta).toFixed(1)}% vs previous 7 days`
          }
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon="🏪" label={`Revenue, ${thisMonth?.label ?? 'this month'}`} value={thisMonth?.revenue ?? 0} decimals={2} prefix="₹" tone="text-indigo-700" hint={thisMonth?.delta == null ? undefined : `${thisMonth.delta >= 0 ? '▲' : '▼'} ${Math.abs(thisMonth.delta).toFixed(1)}% vs last month`} />
        <Kpi icon="🧾" label={`Net profit, ${thisMonth?.label ?? 'this month'}`} value={thisMonth?.net_profit ?? 0} decimals={2} prefix="₹" tone="text-indigo-700" hint={`${(thisMonth?.margin ?? 0).toFixed(1)}% margin`} />
        <Kpi icon="🛍️" label="Units sold this month" value={thisMonth?.units_sold ?? 0} hint={`${formatNumber(thisMonth?.transactions ?? 0)} transactions`} />
        <Kpi icon="🏆" label={`Year to date ${ytd.year ?? ''}`} value={ytd.revenue} decimals={2} prefix="₹" hint={`Profit ₹${formatNumber(ytd.profit, 2)} · ${formatNumber(ytd.units)} units`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Weekly revenue" subtitle="Last 7 days compared with the 7 days before">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weekData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickFormatter={formatCompact} tickLine={false} axisLine={false} fontSize={12} width={48} />
              <Tooltip
                formatter={(v, name) => [moneyTooltip(v), name]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
              />
              <Legend verticalAlign="top" height={28} iconType="plainline" />
              <Line
                type="monotone"
                dataKey="previous"
                name="Previous week"
                stroke={COLORS.previous}
                strokeDasharray="5 4"
                strokeWidth={2}
                dot={false}
                isAnimationActive
              />
              <Line
                type="monotone"
                dataKey="revenue"
                name="This week"
                stroke={COLORS.revenue}
                strokeWidth={3}
                dot={{ r: 3.5, strokeWidth: 2, fill: '#fff' }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Daily net profit" subtitle="Last 14 days - red bars are days with a loss">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={profitData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} interval="preserveStartEnd" />
              <YAxis tickFormatter={formatCompact} tickLine={false} axisLine={false} fontSize={12} width={48} />
              <Tooltip formatter={(v) => [moneyTooltip(v), 'Net profit']} cursor={{ fill: '#f1f5f9' }} />
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Bar dataKey="profit" radius={[6, 6, 0, 0]} maxBarSize={36}>
                {profitData.map((d) => (
                  <Cell key={d.label} fill={d.profit < 0 ? COLORS.loss : COLORS.profit} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Monthly sales" subtitle="Revenue and net profit for the last 12 months" tall>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthRows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickFormatter={formatCompact} tickLine={false} axisLine={false} fontSize={12} width={52} />
            <Tooltip formatter={(v, name) => [moneyTooltip(v), name]} cursor={{ fill: '#f1f5f9' }} />
            <Legend verticalAlign="top" height={28} iconType="circle" />
            <Bar dataKey="revenue" name="Revenue" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={28} />
            <Bar dataKey="net_profit" name="Net profit" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">Month-by-month breakdown</h3>
          <p className="text-sm text-slate-500">Revenue, profit, margin, units and transactions</p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Month</th>
                <th className="px-3 py-2.5 text-right font-semibold">Revenue</th>
                <th className="px-3 py-2.5 text-right font-semibold">Net profit</th>
                <th className="px-3 py-2.5 text-right font-semibold">Margin</th>
                <th className="px-3 py-2.5 text-right font-semibold">Units</th>
                <th className="px-3 py-2.5 text-right font-semibold">Sales</th>
                <th className="px-5 py-2.5 text-right font-semibold">vs prev. month</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {[...monthRows].reverse().map((r) => (
                <tr key={r.period} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-5 py-3 font-semibold text-slate-800">{r.label}</td>
                  <td className="px-3 py-3 text-right">{formatMoney(r.revenue)}</td>
                  <td className={`px-3 py-3 text-right font-semibold ${r.net_profit < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {formatMoney(r.net_profit)}
                  </td>
                  <td className="px-3 py-3 text-right">{r.margin.toFixed(1)}%</td>
                  <td className="px-3 py-3 text-right">{formatNumber(r.units_sold)}</td>
                  <td className="px-3 py-3 text-right">{formatNumber(r.transactions)}</td>
                  <td className={`px-5 py-3 text-right font-semibold ${r.delta == null ? 'text-slate-400' : r.delta >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {r.delta == null ? '—' : `${r.delta >= 0 ? '▲' : '▼'} ${Math.abs(r.delta).toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <LowStockTable />
    </div></div>
  )
}
