import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts'
import {
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Briefcase,
  Users,
  HelpCircle,
  Wallet,
  PiggyBank,
  ArrowDownUp,
} from 'lucide-react'
import { format, parseISO, addDays } from 'date-fns'

import {
  transactionsApi,
  budgetSettingsApi,
  EXPENSE_CATEGORIES,
  type Transaction,
  type TransactionCreate,
  type WeekSummary,
  type BudgetSettings,
  type MultiWeekEntry,
  type IncomeSummary,
  type BalanceSummary,
} from '../../lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

// =============================================================================
// Route
// =============================================================================

export const Route = createFileRoute('/dashboard/budget')({
  component: BudgetPage,
})

// =============================================================================
// Constants
// =============================================================================

const INCOME_SOURCES = [
  { value: 'work', label: 'work', icon: Briefcase },
  { value: 'parents', label: 'parents', icon: Users },
  { value: 'other', label: 'other', icon: HelpCircle },
]

const CATEGORY_COLORS: Record<string, string> = {
  food: '#f97316',
  transport: '#3b82f6',
  entertainment: '#a855f7',
  shopping: '#ec4899',
  utilities: '#6366f1',
  health: '#10b981',
  education: '#06b6d4',
  other: '#64748b',
}

type Tab = 'weekly' | 'income' | 'overview' | 'settings'

// =============================================================================
// Helpers
// =============================================================================

function getCurrentWeekMonday(): string {
  const today = new Date()
  const day = today.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(today)
  monday.setDate(today.getDate() + diff)
  return monday.toISOString().split('T')[0]
}

// =============================================================================
// Main Component
// =============================================================================

function BudgetPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('weekly')
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const { data: balance } = useQuery({
    queryKey: ['transactions', 'balance'],
    queryFn: () => transactionsApi.getBalance(),
  })

  const deleteTransaction = useMutation({
    mutationFn: (id: string) => transactionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      setDeleteTarget(null)
    },
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground lowercase">budget</h1>
          <p className={`text-2xl font-bold ${(balance?.current_balance ?? 0) >= 0 ? 'text-green-500' : 'text-red-400'}`}>
            {(balance?.current_balance ?? 0) >= 0 ? '+' : ''}${(balance?.current_balance ?? 0).toFixed(2)}
          </p>
        </div>
        <Button
          onClick={() => setShowAddForm(true)}
          className="gap-1 lowercase"
        >
          <Plus className="w-4 h-4" />
          add
        </Button>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 glass-card rounded-lg w-fit">
        {(['weekly', 'income', 'overview', 'settings'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors lowercase ${
              activeTab === tab
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'weekly' && <WeeklyTab onDelete={setDeleteTarget} />}
      {activeTab === 'income' && <IncomeTab onDelete={setDeleteTarget} />}
      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'settings' && <SettingsTab />}

      {/* Add Transaction Dialog */}
      {showAddForm && (
        <AddTransactionDialog
          onClose={() => setShowAddForm(false)}
          onSuccess={() => {
            setShowAddForm(false)
            queryClient.invalidateQueries({ queryKey: ['transactions'] })
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="glass-strong border-0">
          <DialogHeader>
            <DialogTitle className="lowercase">delete transaction</DialogTitle>
            <DialogDescription className="lowercase">
              are you sure you want to delete this transaction?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              className="lowercase"
            >
              cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteTransaction.mutate(deleteTarget.id)}
              disabled={deleteTransaction.isPending}
              className="lowercase"
            >
              {deleteTransaction.isPending ? 'deleting...' : 'delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// =============================================================================
// Weekly Tab
// =============================================================================

function WeeklyTab({ onDelete }: { onDelete: (t: Transaction) => void }) {
  const [weekStart, setWeekStart] = useState(getCurrentWeekMonday)

  const { data: weekData, isLoading } = useQuery({
    queryKey: ['transactions', 'week-summary', weekStart],
    queryFn: () => transactionsApi.getWeekSummary(weekStart),
  })

  const navigateWeek = (direction: -1 | 1) => {
    const d = parseISO(weekStart)
    const next = addDays(d, direction * 7)
    setWeekStart(next.toISOString().split('T')[0])
  }

  const isCurrentWeek = weekStart === getCurrentWeekMonday()

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 rounded-lg" />
        <Skeleton className="h-8 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    )
  }

  if (!weekData) return null

  const weeklyTxns = weekData.transactions.filter((t: Transaction) => t.is_weekly)
  const extraneousTxns = weekData.transactions.filter((t: Transaction) => !t.is_weekly)

  return (
    <div className="space-y-4">
      {/* Week Navigator */}
      <div className="flex items-center justify-between glass-card p-3">
        <Button variant="ghost" size="icon" onClick={() => navigateWeek(-1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="text-center">
          <div className="flex items-center gap-2 justify-center">
            <span className="text-sm font-medium">
              {format(parseISO(weekData.week_start), 'MMM d')} - {format(parseISO(weekData.week_end), 'MMM d, yyyy')}
            </span>
            {isCurrentWeek && (
              <Badge variant="secondary" className="text-[10px] lowercase">this week</Badge>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => navigateWeek(1)}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Budget Progress Bar */}
      <BudgetProgressBar
        spent={weekData.weekly_spend}
        target={weekData.budget_target}
        remaining={weekData.budget_remaining}
      />

      {/* Spend Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card p-3 text-center">
          <p className="text-xs text-muted-foreground lowercase">weekly</p>
          <p className="text-lg font-bold text-red-400">${weekData.weekly_spend.toFixed(2)}</p>
        </div>
        <div className="glass-card p-3 text-center">
          <p className="text-xs text-muted-foreground lowercase">extraneous</p>
          <p className="text-lg font-bold text-orange-400">${weekData.extraneous_spend.toFixed(2)}</p>
        </div>
        <div className="glass-card p-3 text-center">
          <p className="text-xs text-muted-foreground lowercase">total</p>
          <p className="text-lg font-bold">${weekData.total_spend.toFixed(2)}</p>
        </div>
      </div>

      {/* Category Breakdown (weekly only) */}
      {weekData.category_breakdown.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="text-sm font-medium text-muted-foreground lowercase mb-3">categories</h3>
          <div className="space-y-2">
            {weekData.category_breakdown.map((cat) => (
              <div key={cat.category} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: CATEGORY_COLORS[cat.category] || CATEGORY_COLORS.other }}
                />
                <span className="text-sm flex-1 lowercase">{cat.category}</span>
                <span className="text-sm font-medium">${cat.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly Expenses List */}
      {weeklyTxns.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="p-3 border-b border-border/30">
            <h3 className="text-sm font-medium text-muted-foreground lowercase">weekly expenses</h3>
          </div>
          <div className="divide-y divide-border/20">
            {weeklyTxns.map((t: Transaction) => (
              <TransactionRow key={t.id} transaction={t} onDelete={() => onDelete(t)} />
            ))}
          </div>
        </div>
      )}

      {/* Extraneous Section */}
      {extraneousTxns.length > 0 && (
        <details className="glass-card overflow-hidden">
          <summary className="p-3 cursor-pointer text-sm font-medium text-muted-foreground lowercase flex items-center justify-between">
            <span>extraneous ({extraneousTxns.length})</span>
            <span className="text-orange-400">${weekData.extraneous_spend.toFixed(2)}</span>
          </summary>
          <div className="divide-y divide-border/20 border-t border-border/30">
            {extraneousTxns.map((t: Transaction) => (
              <TransactionRow key={t.id} transaction={t} onDelete={() => onDelete(t)} />
            ))}
          </div>
        </details>
      )}

      {weekData.transactions.length === 0 && (
        <div className="glass-card p-8 text-center text-sm text-muted-foreground lowercase">
          no expenses this week
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Budget Progress Bar
// =============================================================================

function BudgetProgressBar({
  spent,
  target,
  remaining,
}: {
  spent: number
  target: number | null
  remaining: number | null
}) {
  if (target === null) {
    return (
      <div className="glass-card p-3 text-center text-xs text-muted-foreground lowercase">
        set a weekly budget goal in settings to track progress
      </div>
    )
  }

  const pct = Math.min((spent / target) * 100, 100)
  const color = pct < 75 ? 'bg-green-500' : pct < 100 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="glass-card p-3 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground lowercase">budget</span>
        <span className={`font-medium ${remaining !== null && remaining < 0 ? 'text-red-400' : 'text-green-500'}`}>
          {remaining !== null ? (remaining >= 0 ? `$${remaining.toFixed(2)} left` : `-$${Math.abs(remaining).toFixed(2)} over`) : ''}
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>${spent.toFixed(2)}</span>
        <span>${target.toFixed(2)}</span>
      </div>
    </div>
  )
}

// =============================================================================
// Income Tab
// =============================================================================

function IncomeTab({ onDelete }: { onDelete: (t: Transaction) => void }) {
  const { data: incomeData, isLoading } = useQuery({
    queryKey: ['transactions', 'income-summary'],
    queryFn: () => transactionsApi.getIncomeSummary(),
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    )
  }

  if (!incomeData) return null

  return (
    <div className="space-y-4">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span className="text-xs text-muted-foreground lowercase">total income</span>
          </div>
          <p className="text-xl font-bold text-green-500">
            +${incomeData.total_income.toFixed(2)}
          </p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <ArrowDownUp className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-muted-foreground lowercase">sources</span>
          </div>
          <p className="text-xl font-bold">{incomeData.by_source.length}</p>
        </div>
      </div>

      {/* Per-source breakdown */}
      {incomeData.by_source.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="text-sm font-medium text-muted-foreground lowercase mb-3">by source</h3>
          <div className="space-y-2">
            {incomeData.by_source.map((s) => (
              <div key={s.source} className="flex items-center justify-between">
                <span className="text-sm lowercase">{s.source}</span>
                <span className="text-sm font-medium text-green-500">+${s.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monthly Bar Chart */}
      {incomeData.monthly_trend.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="text-sm font-medium text-muted-foreground lowercase mb-4">monthly income</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={incomeData.monthly_trend}>
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => {
                    const [, m] = v.split('-')
                    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
                    return months[parseInt(m) - 1] || v
                  }}
                />
                <YAxis hide />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="glass-card p-2 text-xs">
                          <p className="text-muted-foreground">{payload[0].payload.month}</p>
                          <p className="text-green-500">+${(payload[0].value as number).toFixed(2)}</p>
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <Bar dataKey="amount" fill="#4ade80" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recent Income List */}
      {incomeData.recent.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="p-3 border-b border-border/30">
            <h3 className="text-sm font-medium text-muted-foreground lowercase">recent income</h3>
          </div>
          <div className="divide-y divide-border/20">
            {incomeData.recent.map((t: Transaction) => (
              <TransactionRow key={t.id} transaction={t} onDelete={() => onDelete(t)} />
            ))}
          </div>
        </div>
      )}

      {incomeData.total_income === 0 && (
        <div className="glass-card p-8 text-center text-sm text-muted-foreground lowercase">
          no income recorded yet
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Overview Tab
// =============================================================================

function OverviewTab() {
  const { data: multiWeek, isLoading: multiLoading } = useQuery({
    queryKey: ['transactions', 'multi-week'],
    queryFn: () => transactionsApi.getMultiWeek(8),
  })

  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ['transactions', 'balance'],
    queryFn: () => transactionsApi.getBalance(),
  })

  const { data: settings } = useQuery({
    queryKey: ['budget', 'settings'],
    queryFn: () => budgetSettingsApi.get(),
  })

  if (multiLoading || balanceLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Multi-Week Bar Chart */}
      {multiWeek && multiWeek.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="text-sm font-medium text-muted-foreground lowercase mb-4">8-week spending</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={multiWeek}>
                <XAxis
                  dataKey="week_start"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => format(parseISO(v), 'M/d')}
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload as MultiWeekEntry
                      return (
                        <div className="glass-card p-2 text-xs">
                          <p className="text-muted-foreground">week of {format(parseISO(d.week_start), 'MMM d')}</p>
                          <p className="text-blue-400">weekly: ${d.weekly_spend.toFixed(2)}</p>
                          <p className="text-indigo-400">extraneous: ${d.extraneous_spend.toFixed(2)}</p>
                          <p className="font-medium">total: ${d.total_spend.toFixed(2)}</p>
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <Bar dataKey="weekly_spend" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                <Bar dataKey="extraneous_spend" stackId="a" fill="#6366f1" radius={[4, 4, 0, 0]} />
                {settings?.weekly_budget_target && (
                  <ReferenceLine
                    y={settings.weekly_budget_target}
                    stroke="#f97316"
                    strokeDasharray="4 4"
                    label={{ value: 'goal', position: 'right', fontSize: 10, fill: '#f97316' }}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-blue-500" />
              <span className="lowercase">weekly</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-indigo-500" />
              <span className="lowercase">extraneous</span>
            </div>
            {settings?.weekly_budget_target && (
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 bg-orange-500" />
                <span className="lowercase">budget goal</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Balance Card */}
      {balance && (
        <div className="glass-card p-4">
          <h3 className="text-sm font-medium text-muted-foreground lowercase mb-3">balance</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PiggyBank className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground lowercase">starting balance</span>
              </div>
              <span className="font-medium">${balance.starting_balance.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <span className="text-muted-foreground lowercase">total income</span>
              </div>
              <span className="font-medium text-green-500">+${balance.total_income.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-red-400" />
                <span className="text-muted-foreground lowercase">total expenses</span>
              </div>
              <span className="font-medium text-red-400">${balance.total_expenses.toFixed(2)}</span>
            </div>
            <div className="border-t border-border/30 pt-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                <span className="font-medium lowercase">current balance</span>
              </div>
              <span className={`text-lg font-bold ${balance.current_balance >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                {balance.current_balance >= 0 ? '+' : ''}${balance.current_balance.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Settings Tab
// =============================================================================

function SettingsTab() {
  const queryClient = useQueryClient()

  const { data: settings, isLoading } = useQuery({
    queryKey: ['budget', 'settings'],
    queryFn: () => budgetSettingsApi.get(),
  })

  const updateSettings = useMutation({
    mutationFn: (data: Partial<BudgetSettings>) => budgetSettingsApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget'] })
      queryClient.invalidateQueries({ queryKey: ['transactions', 'week-summary'] })
      queryClient.invalidateQueries({ queryKey: ['transactions', 'balance'] })
    },
  })

  const [startingBalance, setStartingBalance] = useState<string>('')
  const [weeklyGoal, setWeeklyGoal] = useState<string>('')
  const [threshold, setThreshold] = useState<string>('')
  const [initialized, setInitialized] = useState(false)

  // Initialize form values from settings
  if (settings && !initialized) {
    setStartingBalance(settings.starting_balance?.toString() || '0')
    setWeeklyGoal(settings.weekly_budget_target?.toString() || '')
    setThreshold(settings.large_expense_threshold?.toString() || '100')
    setInitialized(true)
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 rounded-lg" />
      </div>
    )
  }

  const handleBlur = (field: string, value: string) => {
    const num = parseFloat(value)
    const data: Record<string, number | null> = {}

    if (field === 'starting_balance') {
      data.starting_balance = isNaN(num) ? 0 : num
    } else if (field === 'weekly_budget_target') {
      data.weekly_budget_target = value === '' ? null : (isNaN(num) ? null : num)
    } else if (field === 'large_expense_threshold') {
      data.large_expense_threshold = isNaN(num) ? 100 : num
    }

    updateSettings.mutate(data)
  }

  return (
    <div className="glass-card p-4 space-y-6">
      <div>
        <label className="text-sm text-muted-foreground lowercase block mb-1">starting balance</label>
        <p className="text-xs text-muted-foreground/70 mb-2 lowercase">
          your initial balance to anchor the overall financial picture
        </p>
        <div className="relative">
          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="number"
            value={startingBalance}
            onChange={(e) => setStartingBalance(e.target.value)}
            onBlur={() => handleBlur('starting_balance', startingBalance)}
            className="pl-9"
            step="0.01"
          />
        </div>
      </div>

      <div>
        <label className="text-sm text-muted-foreground lowercase block mb-1">weekly budget goal</label>
        <p className="text-xs text-muted-foreground/70 mb-2 lowercase">
          how much you want to spend on weekly expenses each week
        </p>
        <div className="relative">
          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="number"
            placeholder="no goal set"
            value={weeklyGoal}
            onChange={(e) => setWeeklyGoal(e.target.value)}
            onBlur={() => handleBlur('weekly_budget_target', weeklyGoal)}
            className="pl-9"
            min="0"
            step="0.01"
          />
        </div>
      </div>

      <div>
        <label className="text-sm text-muted-foreground lowercase block mb-1">large expense threshold</label>
        <p className="text-xs text-muted-foreground/70 mb-2 lowercase">
          purchases above this amount are flagged as large
        </p>
        <div className="relative">
          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="number"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            onBlur={() => handleBlur('large_expense_threshold', threshold)}
            className="pl-9"
            min="0"
            step="0.01"
          />
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Transaction Row
// =============================================================================

function TransactionRow({
  transaction,
  onDelete,
}: {
  transaction: Transaction
  onDelete: () => void
}) {
  const isIncome = transaction.is_income

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
          isIncome ? 'bg-green-500/20' : 'bg-red-400/20'
        }`}
      >
        {isIncome ? (
          <TrendingUp className="w-4 h-4 text-green-500" />
        ) : (
          <TrendingDown className="w-4 h-4 text-red-400" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {transaction.merchant || (isIncome ? 'Income' : 'Expense')}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{format(parseISO(transaction.date), 'MMM d').toLowerCase()}</span>
          {transaction.category && (
            <Badge
              variant="outline"
              className="text-[10px] lowercase"
              style={{
                borderColor: CATEGORY_COLORS[transaction.category] || CATEGORY_COLORS.other,
                color: CATEGORY_COLORS[transaction.category] || CATEGORY_COLORS.other,
              }}
            >
              {transaction.category}
            </Badge>
          )}
          {transaction.is_weekly && (
            <Badge variant="outline" className="text-[10px] gap-0.5">
              <RefreshCw className="w-2.5 h-2.5" />
              weekly
            </Badge>
          )}
          {isIncome && transaction.income_source && (
            <Badge variant="secondary" className="text-[10px] lowercase">
              {transaction.income_source}
            </Badge>
          )}
        </div>
      </div>

      <p
        className={`text-sm font-semibold ${
          isIncome ? 'text-green-500' : 'text-red-400'
        }`}
      >
        {isIncome ? '+' : '-'}${Math.abs(transaction.amount_signed).toFixed(2)}
      </p>

      <Button
        size="icon"
        variant="ghost"
        onClick={onDelete}
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  )
}

// =============================================================================
// Add Transaction Dialog
// =============================================================================

function AddTransactionDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: () => void
}) {
  const [isIncome, setIsIncome] = useState(false)
  const [merchant, setMerchant] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [isWeekly, setIsWeekly] = useState(false)
  const [incomeSource, setIncomeSource] = useState<string>('')
  const [category, setCategory] = useState<string>('')

  const createTransaction = useMutation({
    mutationFn: (data: TransactionCreate) => transactionsApi.create(data),
    onSuccess,
  })

  const handleSubmit = () => {
    const numAmount = parseFloat(amount)
    if (!amount || isNaN(numAmount) || numAmount <= 0) return

    createTransaction.mutate({
      date,
      amount_signed: isIncome ? numAmount : -numAmount,
      merchant: merchant || undefined,
      category: !isIncome && category ? category : undefined,
      is_income: isIncome,
      is_weekly: isWeekly,
      income_source: isIncome && incomeSource ? incomeSource : undefined,
    })
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="glass-strong border-0">
        <DialogHeader>
          <DialogTitle className="lowercase">add transaction</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {/* Type Toggle */}
          <div className="flex gap-2">
            <Button
              variant={!isIncome ? 'default' : 'outline'}
              onClick={() => setIsIncome(false)}
              className="flex-1 lowercase"
            >
              expense
            </Button>
            <Button
              variant={isIncome ? 'default' : 'outline'}
              onClick={() => setIsIncome(true)}
              className="flex-1 lowercase"
            >
              income
            </Button>
          </div>

          {/* Description */}
          <Input
            placeholder="description"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            className="lowercase"
          />

          {/* Amount */}
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="pl-9"
              min="0"
              step="0.01"
            />
          </div>

          {/* Date */}
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />

          {/* Category (expenses only) */}
          {!isIncome && (
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="lowercase">
                <SelectValue placeholder="category" />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat} className="lowercase">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: CATEGORY_COLORS[cat] }}
                      />
                      {cat}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Weekly Toggle (expenses only) */}
          {!isIncome && (
            <div className="flex items-center gap-3">
              <Button
                variant={isWeekly ? 'default' : 'outline'}
                size="sm"
                onClick={() => setIsWeekly(!isWeekly)}
                className="gap-1 lowercase"
              >
                <RefreshCw className="w-3 h-3" />
                weekly
              </Button>
              <span className="text-xs text-muted-foreground lowercase">
                weekly expense like groceries, gas, etc.
              </span>
            </div>
          )}

          {/* Income Source (income only) */}
          {isIncome && (
            <Select value={incomeSource} onValueChange={setIncomeSource}>
              <SelectTrigger className="lowercase">
                <SelectValue placeholder="income source" />
              </SelectTrigger>
              <SelectContent>
                {INCOME_SOURCES.map((source) => (
                  <SelectItem key={source.value} value={source.value} className="lowercase">
                    {source.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="lowercase">
              cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!amount || createTransaction.isPending}
              className="lowercase"
            >
              {createTransaction.isPending ? 'saving...' : 'save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// Loading State
// =============================================================================

function BudgetLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-8 w-32 mt-1" />
        </div>
        <Skeleton className="h-9 w-20" />
      </div>

      <Skeleton className="h-10 w-64 rounded-lg" />

      <div className="space-y-4">
        <Skeleton className="h-12 rounded-lg" />
        <Skeleton className="h-8 rounded-lg" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>
        <Skeleton className="h-48 rounded-lg" />
      </div>
    </div>
  )
}
