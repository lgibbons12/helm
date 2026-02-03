import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  RefreshCw,
  Briefcase,
  Users,
  HelpCircle,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'

import {
  transactionsApi,
  type Transaction,
  type TransactionCreate,
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

const PIE_COLORS = ['#3b82f6', '#6366f1'] // blue for weekly, indigo for large

// =============================================================================
// Main Component
// =============================================================================

function BudgetPage() {
  const queryClient = useQueryClient()
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  // Fetch all data
  const { data: transactions = [], isLoading: transactionsLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => transactionsApi.list(),
  })

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['transactions', 'summary'],
    queryFn: () => transactionsApi.getSummary(),
  })

  const { data: breakdown, isLoading: breakdownLoading } = useQuery({
    queryKey: ['transactions', 'breakdown'],
    queryFn: () => transactionsApi.getBreakdown(),
  })

  const { data: trend, isLoading: trendLoading } = useQuery({
    queryKey: ['transactions', 'trend'],
    queryFn: () => transactionsApi.getTrend(30),
  })

  const { data: weeklyAvg, isLoading: weeklyAvgLoading } = useQuery({
    queryKey: ['transactions', 'weekly-average'],
    queryFn: () => transactionsApi.getWeeklyAverage(),
  })

  // Delete mutation
  const deleteTransaction = useMutation({
    mutationFn: (id: string) => transactionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      setDeleteTarget(null)
    },
  })

  const isLoading = transactionsLoading || summaryLoading || breakdownLoading || trendLoading || weeklyAvgLoading

  if (isLoading) {
    return <BudgetLoading />
  }

  const balance = summary?.net || 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground lowercase">budget</h1>
          <p className={`text-2xl font-bold ${balance >= 0 ? 'text-green-500' : 'text-red-400'}`}>
            {balance >= 0 ? '+' : ''}${balance.toFixed(2)}
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

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="total income"
          value={summary?.total_income || 0}
          icon={TrendingUp}
          color="text-green-500"
          prefix="+"
        />
        <StatCard
          label="total spent"
          value={Math.abs(summary?.total_expenses || 0)}
          icon={TrendingDown}
          color="text-red-400"
          prefix="-"
        />
        <StatCard
          label="weekly avg"
          value={weeklyAvg?.weekly_average || 0}
          icon={Calendar}
          color="text-blue-400"
        />
        <StatCard
          label="balance"
          value={balance}
          icon={DollarSign}
          color={balance >= 0 ? 'text-green-500' : 'text-red-400'}
          prefix={balance >= 0 ? '+' : ''}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pie Chart - Recurring vs One-time */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-medium text-muted-foreground lowercase mb-4">
            expense breakdown
          </h3>
          {breakdown && breakdown.total > 0 ? (
            <div className="flex items-center gap-4">
              <div className="w-32 h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'weekly', value: breakdown.weekly },
                        { name: 'large', value: breakdown.large },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={30}
                      outerRadius={50}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {PIE_COLORS.map((color, index) => (
                        <Cell key={`cell-${index}`} fill={color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span className="text-muted-foreground lowercase">weekly</span>
                  </div>
                  <span className="font-medium">${breakdown.weekly.toFixed(0)} ({breakdown.weekly_pct}%)</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-indigo-500" />
                    <span className="text-muted-foreground lowercase">large</span>
                  </div>
                  <span className="font-medium">${breakdown.large.toFixed(0)} ({breakdown.large_pct}%)</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-sm text-muted-foreground lowercase">
              no expenses yet
            </div>
          )}
        </div>

        {/* Line Chart - Spending Trend */}
        <div className="glass-card p-4">
          <h3 className="text-sm font-medium text-muted-foreground lowercase mb-4">
            spending trend (30 days)
          </h3>
          {trend && trend.length > 0 ? (
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => format(parseISO(value), 'M/d')}
                    interval="preserveStartEnd"
                  />
                  <YAxis hide />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload
                        return (
                          <div className="glass-card p-2 text-xs">
                            <p className="text-muted-foreground">{format(parseISO(data.date), 'MMM d')}</p>
                            <p className="text-red-400">spent: ${data.expenses.toFixed(0)}</p>
                            <p className="text-green-500">income: ${data.income.toFixed(0)}</p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="expenses"
                    stroke="#f87171"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="income"
                    stroke="#4ade80"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-sm text-muted-foreground lowercase">
              no data yet
            </div>
          )}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="glass-card overflow-hidden">
        <div className="p-4 border-b border-border/30">
          <h3 className="text-sm font-medium text-muted-foreground lowercase">
            recent transactions
          </h3>
        </div>
        {transactions.length > 0 ? (
          <div className="divide-y divide-border/20">
            {transactions.slice(0, 20).map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                onDelete={() => setDeleteTarget(transaction)}
              />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-muted-foreground lowercase">
            no transactions yet
          </div>
        )}
      </div>

      {/* Add Transaction Form */}
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
// Stat Card
// =============================================================================

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  prefix = '',
}: {
  label: string
  value: number
  icon: React.ElementType
  color: string
  prefix?: string
}) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-muted-foreground lowercase">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color}`}>
        {prefix}${Math.abs(value).toFixed(2)}
      </p>
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>

      <Skeleton className="h-64 rounded-lg" />
    </div>
  )
}
