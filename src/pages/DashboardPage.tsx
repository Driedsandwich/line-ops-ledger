import { useState } from 'react';
import { Link } from 'react-router-dom';
import { lineDraftStore, normalizeReviewDate, type BenefitRecord, type LineDraft } from '../lib/lineDrafts';
import { lineHistoryStore, type LineHistoryEntry } from '../lib/lineHistory';
import {
  loadNotificationSettings,
  type NotificationRelaunchPolicy,
  type NotificationReminderWindow,
} from '../lib/notificationSettings';
import { importBundledSampleData } from '../lib/sampleData';

function startOfDay(input: Date): Date {
  const date = new Date(input);
  date.setHours(0, 0, 0, 0);
  return date;
}

function diffInDays(from: Date, to: Date): number {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.round(ms / 86400000);
}

function parseReviewDate(value: string): Date | null {
  const normalized = normalizeReviewDate(value);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatReviewDate(value: string): string {
  const date = parseReviewDate(value);
  if (!date) {
    return '未設定';
  }

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatCurrency(value: number): string {
  return `${new Intl.NumberFormat('ja-JP').format(value)}円/月`;
}

function formatYenAmount(value: number): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${new Intl.NumberFormat('ja-JP').format(value)}円`;
}

function formatBenefitAmount(value: number | null): string {
  if (value == null) {
    return '金額未設定';
  }

  return `${new Intl.NumberFormat('ja-JP').format(value)}円相当`;
}

function formatReminderWindow(value: NotificationReminderWindow): string {
  switch (value) {
    case 'overdue':
      return '期限超過だけを対象にする';
    case 'today':
      return '今日期限までを対象にする';
    case 'within-3-days':
      return '3日以内までを対象にする';
    case 'within-7-days':
      return '7日以内までを対象にする';
    default:
      return '不明';
  }
}

function formatRelaunchPolicy(value: NotificationRelaunchPolicy): string {
  switch (value) {
    case 'none':
      return '再通知しない';
    case 'on-app-launch':
      return '次回起動時に再表示する';
    default:
      return '不明';
  }
}

const INACTIVE_THRESHOLD_DAYS = 90;

function getLatestActivityDate(entries: LineHistoryEntry[]): string | null {
  let latest: string | null = null;
  for (const entry of entries) {
    for (const log of entry.activityLogs) {
      if (log.activityDate && (!latest || log.activityDate > latest)) {
        latest = log.activityDate;
      }
    }
  }
  return latest;
}

function findRelatedHistoryEntries(draft: LineDraft, allEntries: LineHistoryEntry[]): LineHistoryEntry[] {
  if (draft.phoneNumber) {
    const exact = allEntries.filter((e) => e.phoneNumber === draft.phoneNumber);
    if (exact.length > 0) {
      return exact;
    }
  }
  if (draft.last4) {
    return allEntries.filter((e) => e.phoneNumber.slice(-4) === draft.last4);
  }
  return [];
}

function isNotificationTarget(diff: number, window: NotificationReminderWindow): boolean {
  switch (window) {
    case 'overdue':
      return diff < 0;
    case 'today':
      return diff <= 0;
    case 'within-3-days':
      return diff <= 3;
    case 'within-7-days':
      return diff <= 7;
    default:
      return false;
  }
}

type NotificationReasonLabel = '期限超過' | '今日期限' | '3日以内' | '7日以内';

type NotificationReasonParam = 'overdue' | 'today' | 'within-3-days' | 'within-7-days';

const notificationReasonLinkMap: Record<NotificationReasonLabel, NotificationReasonParam> = {
  '期限超過': 'overdue',
  '今日期限': 'today',
  '3日以内': 'within-3-days',
  '7日以内': 'within-7-days',
};

function buildLinesLink(options: { reasonLabel: NotificationReasonLabel; notificationTargetOnly?: boolean }): string {
  const params = new URLSearchParams({
    notificationReason: notificationReasonLinkMap[options.reasonLabel],
  });

  if (options.notificationTargetOnly) {
    params.set('notificationTargetOnly', 'true');
  }

  return `/lines?${params.toString()}`;
}

type NotificationReasonSummary = {
  overdue: number;
  today: number;
  within3Days: number;
  within7Days: number;
};

type NotificationTargetItem = {
  draft: LineDraft;
  reasonLabel: NotificationReasonLabel;
};

type InactiveLineItem = {
  draft: LineDraft;
  latestActivityDate: string | null;
};

const CONTRACT_END_ALERT_DAYS = 30;

type ContractEndAlertItem = {
  draft: LineDraft;
  daysUntilEnd: number;
};

const PLANNED_ACTION_ALERT_DAYS = 60;

type PlannedActionItem = {
  draft: LineDraft;
  daysUntilAction: number;
};

const MNP_DEADLINE_ALERT_DAYS = 3;
const BENEFIT_ALERT_DAYS = 30;

type DeadlineAlertType = 'mnpReservationExpiry' | 'freeOptionDeadline';

type DeadlineAlertItem = {
  draft: LineDraft;
  type: DeadlineAlertType;
  deadline: string;
  daysUntilDeadline: number;
};

type BenefitDeadlineItem = {
  draft: LineDraft;
  benefit: BenefitRecord;
  daysUntilDeadline: number;
};

type ContractHolderSummaryItem = {
  holder: string;
  totalLines: number;
  activeLines: number;
  monthlyTotal: number;
  avgContractMonths: number;
};

type BalanceSummary = {
  totalPaidCost: number;
  totalReceivedBenefit: number;
  netBalance: number;
  coveredLineCount: number;
  receivedBenefitLines: Array<{
    draft: LineDraft;
    receivedBenefit: number;
  }>;
};

type FiberDebtItem = {
  draft: LineDraft;
  debtClearDate: string | null;
  daysUntilClear: number | null;
  remainingDebt: number | null;
};

type UsageSummary = {
  hasCommunication: boolean;
  hasCall: boolean;
  hasSms: boolean;
  lastActivityDate: string | null;
  withinDays: number;
};

type UsageAlertItem = {
  draft: LineDraft;
  usageSummary: UsageSummary;
};

type DashboardSummary = {
  dangerCount: number;
  todayCount: number;
  within3Days: number;
  within7Days: number;
  activeCount: number;
  closingCount: number;
  monthlyTotal: number;
  notificationEligibleCount: number;
  notificationReasonSummary: NotificationReasonSummary;
  notificationTargets: NotificationTargetItem[];
  nearest: LineDraft[];
  inactiveLines: InactiveLineItem[];
  contractEndAlerts: ContractEndAlertItem[];
  plannedActions: PlannedActionItem[];
  deadlineAlerts: DeadlineAlertItem[];
  benefitDeadlineAlerts: BenefitDeadlineItem[];
  contractHolderSummary: ContractHolderSummaryItem[];
  balanceSummary: BalanceSummary;
  fiberDebtItems: FiberDebtItem[];
  usageAlertItems: UsageAlertItem[];
};

function createEmptyNotificationReasonSummary(): NotificationReasonSummary {
  return {
    overdue: 0,
    today: 0,
    within3Days: 0,
    within7Days: 0,
  };
}

function buildReasonLabel(diff: number): NotificationReasonLabel {
  if (diff < 0) {
    return '期限超過';
  }
  if (diff === 0) {
    return '今日期限';
  }
  if (diff <= 3) {
    return '3日以内';
  }
  return '7日以内';
}

function incrementReasonSummary(summary: NotificationReasonSummary, reasonLabel: NotificationReasonLabel): void {
  switch (reasonLabel) {
    case '期限超過':
      summary.overdue += 1;
      return;
    case '今日期限':
      summary.today += 1;
      return;
    case '3日以内':
      summary.within3Days += 1;
      return;
    case '7日以内':
      summary.within7Days += 1;
      return;
  }
}

function formatDeadlineAlertLabel(item: DeadlineAlertItem): string {
  if (item.daysUntilDeadline < 0) {
    return '期限超過';
  }
  if (item.daysUntilDeadline === 0) {
    return '今日期限';
  }
  return `あと${item.daysUntilDeadline}日`;
}

function formatDeadlineAlertType(type: DeadlineAlertType): string {
  return type === 'mnpReservationExpiry' ? 'MNP予約番号期限' : '無料オプション期限';
}

function formatBenefitDeadlineLabel(daysUntilDeadline: number): string {
  if (daysUntilDeadline < 0) {
    return '期限超過';
  }
  if (daysUntilDeadline === 0) {
    return '今日期限';
  }
  return `あと${daysUntilDeadline}日`;
}

function buildContractHolderSummary(drafts: LineDraft[]): ContractHolderSummaryItem[] {
  const groupedDrafts = new Map<string, LineDraft[]>();

  for (const draft of drafts) {
    const holder = draft.contractHolder.trim() || '（名義未設定）';
    const current = groupedDrafts.get(holder) ?? [];
    current.push(draft);
    groupedDrafts.set(holder, current);
  }

  if (groupedDrafts.size < 2) {
    return [];
  }

  return Array.from(groupedDrafts.entries())
    .map(([holder, holderDrafts]) => {
      const activeDrafts = holderDrafts.filter((draft) => draft.status === '利用中');
      const monthlyTotal = holderDrafts.reduce((sum, draft) => sum + (draft.monthlyCost ?? 0), 0);
      const totalContractMonths = activeDrafts.reduce((sum, draft) => {
        const contractStartDate = parseReviewDate(draft.contractStartDate);
        if (!contractStartDate) {
          return sum;
        }
        return sum + diffInDays(contractStartDate, new Date()) / 30;
      }, 0);

      return {
        holder,
        totalLines: holderDrafts.length,
        activeLines: activeDrafts.length,
        monthlyTotal,
        avgContractMonths: activeDrafts.length === 0 ? 0 : Math.round(totalContractMonths / activeDrafts.length),
      };
    })
    .sort((a, b) => {
      if (b.totalLines !== a.totalLines) {
        return b.totalLines - a.totalLines;
      }
      return a.holder.localeCompare(b.holder, 'ja');
    });
}

function buildBalanceSummary(drafts: LineDraft[]): BalanceSummary {
  let totalPaidCost = 0;
  let totalReceivedBenefit = 0;
  let coveredLineCount = 0;
  const receivedBenefitLines: BalanceSummary['receivedBenefitLines'] = [];

  for (const draft of drafts) {
    const contractStartDate = parseReviewDate(draft.contractStartDate);
    if (draft.monthlyCost != null && contractStartDate) {
      const elapsedDays = Math.max(diffInDays(contractStartDate, new Date()), 0);
      const elapsedMonths = Math.floor(elapsedDays / 30);
      totalPaidCost += draft.monthlyCost * elapsedMonths;
    }

    const receivedBenefit = draft.benefits
      .filter((benefit) => benefit.receivedFlag && benefit.amount != null)
      .reduce((sum, benefit) => sum + (benefit.amount ?? 0), 0);

    if (receivedBenefit > 0) {
      coveredLineCount += 1;
      receivedBenefitLines.push({
        draft,
        receivedBenefit,
      });
    }

    totalReceivedBenefit += receivedBenefit;
  }

  return {
    totalPaidCost,
    totalReceivedBenefit,
    netBalance: totalReceivedBenefit - totalPaidCost,
    coveredLineCount,
    receivedBenefitLines: receivedBenefitLines
      .sort((a, b) => {
        if (b.receivedBenefit !== a.receivedBenefit) {
          return b.receivedBenefit - a.receivedBenefit;
        }
        return a.draft.lineName.localeCompare(b.draft.lineName, 'ja');
      })
      .slice(0, 5),
  };
}

function calculateFiberDebtClearDate(contractStartDate: string, fiberConstructionFeeMonths: number | null): Date | null {
  const startDate = parseReviewDate(contractStartDate);
  if (!startDate || fiberConstructionFeeMonths == null) {
    return null;
  }

  const result = new Date(startDate);
  result.setMonth(result.getMonth() + fiberConstructionFeeMonths);
  return Number.isNaN(result.getTime()) ? null : result;
}

function calculateElapsedMonths(contractStartDate: string, today: Date): number | null {
  const startDate = parseReviewDate(contractStartDate);
  if (!startDate) {
    return null;
  }

  const elapsedDays = Math.max(diffInDays(startDate, today), 0);
  return Math.floor(elapsedDays / 30);
}

function calculateFiberRemainingDebt(draft: LineDraft, today: Date): number | null {
  if (draft.fiberConstructionFee == null || draft.fiberMonthlyDiscount == null || draft.fiberConstructionFeeMonths == null) {
    return null;
  }

  const elapsedMonths = calculateElapsedMonths(draft.contractStartDate, today);
  if (elapsedMonths == null) {
    return null;
  }

  const appliedMonths = Math.min(elapsedMonths, draft.fiberConstructionFeeMonths);
  return Math.max(draft.fiberConstructionFee - (appliedMonths * draft.fiberMonthlyDiscount), 0);
}

function buildFiberDebtItems(drafts: LineDraft[], today: Date): FiberDebtItem[] {
  return drafts
    .filter((draft) => draft.lineType === '光回線' && (draft.status === '利用中' || draft.status === '解約予定'))
    .map((draft) => {
      const debtClearDate = calculateFiberDebtClearDate(draft.contractStartDate, draft.fiberConstructionFeeMonths);
      return {
        draft,
        debtClearDate: debtClearDate ? debtClearDate.toISOString().slice(0, 10) : null,
        daysUntilClear: debtClearDate ? diffInDays(today, debtClearDate) : null,
        remainingDebt: calculateFiberRemainingDebt(draft, today),
      } satisfies FiberDebtItem;
    })
    .sort((a, b) => {
      if (a.daysUntilClear == null && b.daysUntilClear == null) {
        return a.draft.lineName.localeCompare(b.draft.lineName, 'ja');
      }
      if (a.daysUntilClear == null) {
        return 1;
      }
      if (b.daysUntilClear == null) {
        return -1;
      }
      return a.daysUntilClear - b.daysUntilClear;
    })
    .slice(0, 5);
}

const USAGE_SUMMARY_DAYS = 180;

function buildUsageSummary(entries: LineHistoryEntry[], withinDays: number): UsageSummary {
  const cutoff = startOfDay(new Date());
  cutoff.setDate(cutoff.getDate() - withinDays);

  let hasCommunication = false;
  let hasCall = false;
  let hasSms = false;
  let lastActivityDate: string | null = null;

  for (const entry of entries) {
    for (const log of entry.activityLogs) {
      const activityDate = parseReviewDate(log.activityDate);
      if (!activityDate || activityDate < cutoff) {
        continue;
      }

      if (log.activityType === '通信実施') {
        hasCommunication = true;
      }
      if (log.activityType === '通話実施') {
        hasCall = true;
      }
      if (log.activityType === 'SMS送信') {
        hasSms = true;
      }
      if (!lastActivityDate || log.activityDate > lastActivityDate) {
        lastActivityDate = log.activityDate;
      }
    }
  }

  return {
    hasCommunication,
    hasCall,
    hasSms,
    lastActivityDate,
    withinDays,
  };
}

function countMissingUsageKinds(summary: UsageSummary): number {
  let missing = 0;
  if (!summary.hasCommunication) {
    missing += 1;
  }
  if (!summary.hasCall) {
    missing += 1;
  }
  if (!summary.hasSms) {
    missing += 1;
  }
  return missing;
}

function buildUsageAlertItems(drafts: LineDraft[], allHistoryEntries: LineHistoryEntry[]): UsageAlertItem[] {
  return drafts
    .filter((draft) => draft.status === '利用中' || draft.status === '解約予定')
    .map((draft) => {
      const relatedEntries = findRelatedHistoryEntries(draft, allHistoryEntries);
      return {
        draft,
        usageSummary: buildUsageSummary(relatedEntries, USAGE_SUMMARY_DAYS),
      } satisfies UsageAlertItem;
    })
    .filter(({ usageSummary }) => countMissingUsageKinds(usageSummary) > 0)
    .sort((a, b) => {
      const missingDiff = countMissingUsageKinds(b.usageSummary) - countMissingUsageKinds(a.usageSummary);
      if (missingDiff !== 0) {
        return missingDiff;
      }
      if (!a.usageSummary.lastActivityDate && !b.usageSummary.lastActivityDate) {
        return b.draft.createdAt.localeCompare(a.draft.createdAt);
      }
      if (!a.usageSummary.lastActivityDate) {
        return -1;
      }
      if (!b.usageSummary.lastActivityDate) {
        return 1;
      }
      return a.usageSummary.lastActivityDate.localeCompare(b.usageSummary.lastActivityDate);
    })
    .slice(0, 5);
}

function buildSummary(drafts: LineDraft[], allHistoryEntries: LineHistoryEntry[], reminderWindow: NotificationReminderWindow): DashboardSummary {
  const today = new Date();
  let dangerCount = 0;
  let todayCount = 0;
  let within3Days = 0;
  let within7Days = 0;
  let activeCount = 0;
  let closingCount = 0;
  let monthlyTotal = 0;
  let notificationEligibleCount = 0;
  const notificationReasonSummary = createEmptyNotificationReasonSummary();

  const nearest = drafts
    .filter((draft) => Boolean(normalizeReviewDate(draft.nextReviewDate)))
    .sort((a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate))
    .slice(0, 5);

  const notificationTargets = drafts
    .flatMap((draft) => {
      const reviewDate = parseReviewDate(draft.nextReviewDate);
      if (!reviewDate) {
        return [];
      }

      const diff = diffInDays(today, reviewDate);
      if (!isNotificationTarget(diff, reminderWindow)) {
        return [];
      }

      return [{
        draft,
        reasonLabel: buildReasonLabel(diff),
      } satisfies NotificationTargetItem];
    })
    .sort((a, b) => a.draft.nextReviewDate.localeCompare(b.draft.nextReviewDate))
    .slice(0, 5);

  for (const draft of drafts) {
    if (draft.status === '利用中') {
      activeCount += 1;
    } else {
      closingCount += 1;
    }

    if (draft.monthlyCost != null) {
      monthlyTotal += draft.monthlyCost;
    }

    const reviewDate = parseReviewDate(draft.nextReviewDate);
    if (!reviewDate) {
      continue;
    }

    const diff = diffInDays(today, reviewDate);

    if (diff <= 0) {
      dangerCount += 1;
    }
    if (diff === 0) {
      todayCount += 1;
    }
    if (diff >= 1 && diff <= 3) {
      within3Days += 1;
    }
    if (diff >= 4 && diff <= 7) {
      within7Days += 1;
    }
    if (isNotificationTarget(diff, reminderWindow)) {
      const reasonLabel = buildReasonLabel(diff);
      notificationEligibleCount += 1;
      incrementReasonSummary(notificationReasonSummary, reasonLabel);
    }
  }

  const todayStr = today.toISOString().slice(0, 10);
  const inactiveLines = drafts
    .filter((draft) => draft.status === '利用中' || draft.status === '解約予定')
    .map((draft) => {
      const related = findRelatedHistoryEntries(draft, allHistoryEntries);
      const latestActivityDate = getLatestActivityDate(related);
      return { draft, latestActivityDate };
    })
    .filter(({ latestActivityDate }) => {
      if (!latestActivityDate) {
        return true;
      }
      const diff = diffInDays(new Date(`${latestActivityDate}T00:00:00`), new Date(`${todayStr}T00:00:00`));
      return diff >= INACTIVE_THRESHOLD_DAYS;
    })
    .sort((a, b) => {
      if (!a.latestActivityDate && !b.latestActivityDate) {
        return b.draft.createdAt.localeCompare(a.draft.createdAt);
      }
      if (!a.latestActivityDate) {
        return -1;
      }
      if (!b.latestActivityDate) {
        return 1;
      }
      return a.latestActivityDate.localeCompare(b.latestActivityDate);
    })
    .slice(0, 5);

  const contractEndAlerts = drafts
    .filter((draft) => draft.status === '利用中' || draft.status === '解約予定')
    .flatMap((draft) => {
      const endDate = parseReviewDate(draft.contractEndDate);
      if (!endDate) {
        return [];
      }
      const daysUntilEnd = diffInDays(today, endDate);
      if (daysUntilEnd > CONTRACT_END_ALERT_DAYS) {
        return [];
      }
      return [{ draft, daysUntilEnd }];
    })
    .sort((a, b) => a.daysUntilEnd - b.daysUntilEnd)
    .slice(0, 5);

  const plannedActions = drafts
    .filter((draft) => (draft.status === '利用中' || draft.status === '解約予定') && draft.plannedExitDate)
    .flatMap((draft) => {
      const plannedDate = parseReviewDate(draft.plannedExitDate);
      if (!plannedDate) {
        return [];
      }
      const daysUntilAction = diffInDays(today, plannedDate);
      if (daysUntilAction > PLANNED_ACTION_ALERT_DAYS) {
        return [];
      }
      return [{ draft, daysUntilAction }];
    })
    .sort((a, b) => a.daysUntilAction - b.daysUntilAction)
    .slice(0, 5);

  const deadlineAlerts = drafts
    .filter((draft) => draft.status === '利用中' || draft.status === '解約予定')
    .flatMap((draft) => {
      const alerts: DeadlineAlertItem[] = [];
      const mnpExpiry = parseReviewDate(draft.mnpReservationExpiry);
      if (draft.mnpReservationNumber && mnpExpiry) {
        const daysUntilDeadline = diffInDays(today, mnpExpiry);
        if (daysUntilDeadline <= MNP_DEADLINE_ALERT_DAYS) {
          alerts.push({
            draft,
            type: 'mnpReservationExpiry',
            deadline: draft.mnpReservationExpiry,
            daysUntilDeadline,
          });
        }
      }

      const freeOptionDeadline = parseReviewDate(draft.freeOptionDeadline);
      if (freeOptionDeadline) {
        const daysUntilDeadline = diffInDays(today, freeOptionDeadline);
        if (daysUntilDeadline <= MNP_DEADLINE_ALERT_DAYS) {
          alerts.push({
            draft,
            type: 'freeOptionDeadline',
            deadline: draft.freeOptionDeadline,
            daysUntilDeadline,
          });
        }
      }

      return alerts;
    })
    .sort((a, b) => a.daysUntilDeadline - b.daysUntilDeadline)
    .slice(0, 5);

  const benefitDeadlineAlerts = drafts
    .flatMap((draft) => {
      const alerts: BenefitDeadlineItem[] = [];

      for (const benefit of draft.benefits) {
        if (benefit.receivedFlag || !benefit.deadlineDate) {
          continue;
        }

        const deadlineDate = parseReviewDate(benefit.deadlineDate);
        if (!deadlineDate) {
          continue;
        }

        const daysUntilDeadline = diffInDays(today, deadlineDate);
        if (daysUntilDeadline > BENEFIT_ALERT_DAYS) {
          continue;
        }

        alerts.push({
          draft,
          benefit,
          daysUntilDeadline,
        });
      }

      return alerts;
    })
    .sort((a, b) => a.daysUntilDeadline - b.daysUntilDeadline)
    .slice(0, 5);

  const contractHolderSummary = buildContractHolderSummary(drafts);
  const balanceSummary = buildBalanceSummary(drafts);
  const fiberDebtItems = buildFiberDebtItems(drafts, today);
  const usageAlertItems = buildUsageAlertItems(drafts, allHistoryEntries);

  return {
    dangerCount,
    todayCount,
    within3Days,
    within7Days,
    activeCount,
    closingCount,
    monthlyTotal,
    notificationEligibleCount,
    notificationReasonSummary,
    notificationTargets,
    nearest,
    inactiveLines,
    contractEndAlerts,
    plannedActions,
    deadlineAlerts,
    benefitDeadlineAlerts,
    contractHolderSummary,
    balanceSummary,
    fiberDebtItems,
    usageAlertItems,
  };
}

export function DashboardPage(): JSX.Element {
  const [drafts, setDrafts] = useState<LineDraft[]>(() => lineDraftStore.load());
  const [historyEntries, setHistoryEntries] = useState<LineHistoryEntry[]>(() => lineHistoryStore.load());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const notificationSettings = loadNotificationSettings();
  const summary = buildSummary(drafts, historyEntries, notificationSettings.reminderWindow);
  const isFirstRun = drafts.length === 0 && historyEntries.length === 0;

  function handleImportSampleData(): void {
    try {
      const result = importBundledSampleData();
      setDrafts(result.drafts);
      setHistoryEntries(result.historyEntries);
      setErrorMessage(null);
      setSuccessMessage(`確認用サンプルデータを読み込みました（主台帳 ${result.draftCount} 件 / 履歴 ${result.historyCount} 件）。`);
    } catch {
      setSuccessMessage(null);
      setErrorMessage('確認用サンプルデータの読み込みに失敗しました。');
    }
  }

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>今日やることと危険案件の入口</h2>
          <p className="page__lead">
            保存済み回線の次回確認日、契約状態、月額費用に加えて、通知方針を見比べながら今日の優先度を確認できます。
          </p>
        </div>
      </header>

      {errorMessage ? <p className="notice notice--warn">{errorMessage}</p> : null}
      {successMessage ? <p className="notice">{successMessage}</p> : null}

      {isFirstRun ? (
        <section className="card-grid card-grid--single">
          <article className="card card--accent">
            <div className="card__header">
              <h3>最初の1件を登録する</h3>
              <span className="badge badge--info">初回ガイド</span>
            </div>
            <p className="muted">
              まだ回線も履歴もありません。最初は `/lines` で回線を1件登録するか、既存データがある場合は `/settings/backup` から統合バックアップを復元してください。
            </p>
            <ol className="list">
              <li>
                <strong>1. 回線一覧で基本情報を入れる</strong>
                <span>回線名・キャリア・電話番号・次回確認日だけでも保存できます。</span>
              </li>
              <li>
                <strong>2. 必要なら履歴・タイムラインで活動を記録する</strong>
                <span>過去契約や MNP 転出済みは `/lines/history` で追加できます。</span>
              </li>
              <li>
                <strong>3. 既存データがあるならバックアップから戻す</strong>
                <span>設定画面の統合バックアップ復元で、主台帳と履歴をまとめて読み込めます。</span>
              </li>
            </ol>
            <div className="button-row">
              <Link className="button button--primary" to="/lines">回線一覧で1件追加する</Link>
              <button type="button" className="button" onClick={handleImportSampleData}>確認用サンプルデータを読み込む</button>
              <Link className="button" to="/settings/backup">バックアップを復元する</Link>
              <Link className="button" to="/lines/history">履歴ページを見る</Link>
            </div>
          </article>
        </section>
      ) : null}

      <section className="card-grid">
        <article className="card card--accent">
          <div className="card__header">
            <h3>危険案件サマリー</h3>
            <span className={summary.dangerCount === 0 ? 'badge badge--ok' : 'badge'}>
              {summary.dangerCount === 0 ? '問題なし' : '要確認'}
            </span>
          </div>
          <p className="metric">{summary.dangerCount}件</p>
          <p className="muted">
            次回確認日が今日以前の回線を危険案件として集計します。日付未設定の回線は件数に含めません。
          </p>
        </article>

        <article className="card card--accent">
          <div className="card__header">
            <h3>契約終了が近い回線</h3>
            <span className={summary.contractEndAlerts.length === 0 ? 'badge badge--ok' : 'badge'}>
              {summary.contractEndAlerts.length === 0 ? '該当なし' : `${summary.contractEndAlerts.length}件`}
            </span>
          </div>
          <p className="muted">契約終了日が{CONTRACT_END_ALERT_DAYS}日以内（または超過）の利用中・解約予定回線を表示します（最大5件）。</p>
          {summary.contractEndAlerts.length === 0 ? (
            <p className="muted">契約終了が近い回線はありません。</p>
          ) : (
            <>
              <ul className="list list--drafts">
                {summary.contractEndAlerts.map((item) => (
                  <li key={item.draft.id}>
                    <div className="list__row">
                      <strong>{item.draft.lineName}</strong>
                      <span className={item.draft.status === '利用中' ? 'badge badge--ok' : 'badge'}>{item.draft.status}</span>
                    </div>
                    <span>{item.draft.carrier}</span>
                    <span>契約終了日: {item.draft.contractEndDate}</span>
                    <span className="badge">
                      {item.daysUntilEnd < 0
                        ? `${Math.abs(item.daysUntilEnd)}日超過`
                        : item.daysUntilEnd === 0
                          ? '今日終了'
                          : `あと${item.daysUntilEnd}日`}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="button-row">
                <Link className="button" to="/lines">回線一覧で確認する</Link>
              </div>
            </>
          )}
        </article>

        <article className="card card--accent">
          <div className="card__header">
            <h3>今後のアクション予定</h3>
            <span className={summary.plannedActions.length === 0 ? 'badge badge--ok' : 'badge'}>
              {summary.plannedActions.length === 0 ? '該当なし' : `${summary.plannedActions.length}件`}
            </span>
          </div>
          <p className="muted">予定日が{PLANNED_ACTION_ALERT_DAYS}日以内、または超過している利用中・解約予定回線を表示します（最大5件）。</p>
          {summary.plannedActions.length === 0 ? (
            <p className="muted">直近のアクション予定はありません。</p>
          ) : (
            <>
              <ul className="list list--drafts">
                {summary.plannedActions.map((item) => (
                  <li key={item.draft.id}>
                    <div className="list__row">
                      <strong>{item.draft.lineName}</strong>
                      <span className={item.draft.status === '利用中' ? 'badge badge--ok' : 'badge'}>{item.draft.status}</span>
                    </div>
                    <span>{item.draft.carrier}</span>
                    <span>予定種別: {item.draft.plannedExitType || '未設定'}</span>
                    <span>予定日: {formatReviewDate(item.draft.plannedExitDate)}</span>
                    <span>次キャリア: {item.draft.plannedNextCarrier || '未設定'}</span>
                    <span className="badge">
                      {item.daysUntilAction < 0
                        ? '予定日超過'
                        : item.daysUntilAction === 0
                          ? '今日'
                          : `あと${item.daysUntilAction}日`}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="button-row">
                <Link className="button" to="/lines">回線一覧で確認する</Link>
              </div>
            </>
          )}
        </article>

        <article className="card card--accent">
          <div className="card__header">
            <h3>番号・無料オプション期限</h3>
            <span className={summary.deadlineAlerts.length === 0 ? 'badge badge--ok' : 'badge'}>
              {summary.deadlineAlerts.length === 0 ? '該当なし' : `${summary.deadlineAlerts.length}件`}
            </span>
          </div>
          <p className="muted">MNP予約番号の有効期限と無料オプション期限が3日以内、または超過している利用中・解約予定回線を表示します（最大5件）。</p>
          {summary.deadlineAlerts.length === 0 ? (
            <p className="muted">直近の番号・無料オプション期限アラートはありません。</p>
          ) : (
            <>
              <ul className="list list--drafts">
                {summary.deadlineAlerts.map((item) => (
                  <li key={`${item.draft.id}-${item.type}`}>
                    <div className="list__row">
                      <strong>{item.draft.lineName}</strong>
                      <span className={item.draft.status === '利用中' ? 'badge badge--ok' : 'badge'}>{item.draft.status}</span>
                    </div>
                    <span>{item.draft.carrier}</span>
                    <span>{formatDeadlineAlertType(item.type)}: {formatReviewDate(item.deadline)}</span>
                    {item.type === 'mnpReservationExpiry' ? <span>予約番号: {item.draft.mnpReservationNumber}</span> : null}
                    <span className="badge">{formatDeadlineAlertLabel(item)}</span>
                  </li>
                ))}
              </ul>
              <div className="button-row">
                <Link className="button" to="/lines">回線一覧で確認する</Link>
              </div>
            </>
          )}
        </article>

        <article className="card card--accent">
          <div className="card__header">
            <h3>特典期限アラート</h3>
            <span className={summary.benefitDeadlineAlerts.length === 0 ? 'badge badge--ok' : 'badge'}>
              {summary.benefitDeadlineAlerts.length === 0 ? '該当なし' : `${summary.benefitDeadlineAlerts.length}件`}
            </span>
          </div>
          <p className="muted">未受取かつ受取期限日が{BENEFIT_ALERT_DAYS}日以内、または超過している特典を表示します（最大5件）。</p>
          {summary.benefitDeadlineAlerts.length === 0 ? (
            <p className="muted">直近の特典期限アラートはありません。</p>
          ) : (
            <>
              <ul className="list list--drafts">
                {summary.benefitDeadlineAlerts.map((item) => (
                  <li key={`${item.draft.id}-${item.benefit.id}`}>
                    <div className="list__row">
                      <strong>{item.draft.lineName}</strong>
                      <span className="badge">{formatBenefitDeadlineLabel(item.daysUntilDeadline)}</span>
                    </div>
                    <span>{item.draft.carrier}</span>
                    <span>特典種別: {item.benefit.benefitType}</span>
                    <span>金額: {formatBenefitAmount(item.benefit.amount)}</span>
                    <span>受取期限日: {formatReviewDate(item.benefit.deadlineDate)}</span>
                  </li>
                ))}
              </ul>
              <div className="button-row">
                <Link className="button" to="/lines">回線一覧で確認する</Link>
              </div>
            </>
          )}
        </article>

        <article className="card card--accent">
          <div className="card__header">
            <h3>光回線の残債解消予定</h3>
            <span className={summary.fiberDebtItems.length === 0 ? 'badge badge--ok' : 'badge'}>
              {summary.fiberDebtItems.length === 0 ? '該当なし' : `${summary.fiberDebtItems.length}件`}
            </span>
          </div>
          <p className="muted">`利用中` または `解約予定` の光回線について、残債解消予定日と概算残債を表示します（最大5件）。</p>
          {summary.fiberDebtItems.length === 0 ? (
            <p className="muted">直近で確認が必要な光回線はありません。</p>
          ) : (
            <>
              <ul className="list list--drafts">
                {summary.fiberDebtItems.map((item) => (
                  <li key={item.draft.id}>
                    <div className="list__row">
                      <strong>{item.draft.lineName}</strong>
                      <span className={item.draft.status === '利用中' ? 'badge badge--ok' : 'badge'}>{item.draft.status}</span>
                    </div>
                    <span>{item.draft.fiberIspName || item.draft.carrier}</span>
                    <span>残債解消予定日: {item.debtClearDate ? formatReviewDate(item.debtClearDate) : '算出不可'}</span>
                    <span>概算残債: {item.remainingDebt == null ? '算出不可' : formatYenAmount(item.remainingDebt)}</span>
                    {item.daysUntilClear != null ? (
                      <span className="badge">
                        {item.daysUntilClear < 0
                          ? '経過済み'
                          : item.daysUntilClear === 0
                            ? '今日'
                            : `あと${item.daysUntilClear}日`}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <div className="button-row">
                <Link className="button" to="/lines">回線一覧で確認する</Link>
              </div>
            </>
          )}
        </article>

        <article className="card">
          <div className="card__header">
            <h3>状態別件数</h3>
            <span className="badge">実データ</span>
          </div>
          <div className="stats-row">
            <div className="stat-box">
              <span>利用中</span>
              <strong>{summary.activeCount}件</strong>
            </div>
            <div className="stat-box">
              <span>解約予定</span>
              <strong>{summary.closingCount}件</strong>
            </div>
            <div className="stat-box">
              <span>登録総数</span>
              <strong>{drafts.length}件</strong>
            </div>
          </div>
        </article>

        <article className="card">
          <div className="card__header">
            <h3>近日期限</h3>
            <span className="badge">実データ</span>
          </div>
          <div className="stats-row">
            <div className="stat-box">
              <span>今日期限</span>
              <strong>{summary.todayCount}件</strong>
            </div>
            <div className="stat-box">
              <span>1〜3日</span>
              <strong>{summary.within3Days}件</strong>
            </div>
            <div className="stat-box">
              <span>4〜7日</span>
              <strong>{summary.within7Days}件</strong>
            </div>
          </div>
        </article>

        <article className="card">
          <div className="card__header">
            <h3>通知方針サマリー</h3>
            <span className={notificationSettings.enabled ? 'badge badge--ok' : 'badge'}>
              {notificationSettings.enabled ? '利用する' : '利用しない'}
            </span>
          </div>
          <dl className="definition-list">
            <div>
              <dt>通知対象の期限</dt>
              <dd>{formatReminderWindow(notificationSettings.reminderWindow)}</dd>
            </div>
            <div>
              <dt>再通知の扱い</dt>
              <dd>{formatRelaunchPolicy(notificationSettings.relaunchPolicy)}</dd>
            </div>
            <div>
              <dt>現在の通知対象件数</dt>
              <dd>{notificationSettings.enabled ? `${summary.notificationEligibleCount}件` : '無効'}</dd>
            </div>
          </dl>
          <p className="muted">
            {notificationSettings.enabled
              ? '現在の設定と次回確認日から、通知対象になり得る回線件数を表示しています。閉アプリ時通知そのものはこの MVP では保証しません。'
              : '通知は無効です。`/settings/notifications` で有効にすると、現在の設定で通知対象になる件数をここで確認できます。'}
          </p>
        </article>
      </section>

      <section className="card-grid card-grid--single">
        <article className="card">
          <div className="card__header">
            <h3>通知理由別件数</h3>
            <span className={notificationSettings.enabled ? 'badge badge--ok' : 'badge'}>
              {notificationSettings.enabled ? '理由別集計' : '無効'}
            </span>
          </div>
          {!notificationSettings.enabled ? (
            <p className="muted">通知は無効です。`/settings/notifications` で通知を有効にすると、理由別件数をここで確認できます。</p>
          ) : (
            <div className="stats-row">
              <Link className="stat-box" to={buildLinesLink({ reasonLabel: '期限超過' })}>
                <span>期限超過</span>
                <strong>{summary.notificationReasonSummary.overdue}件</strong>
              </Link>
              <Link className="stat-box" to={buildLinesLink({ reasonLabel: '今日期限' })}>
                <span>今日期限</span>
                <strong>{summary.notificationReasonSummary.today}件</strong>
              </Link>
              <Link className="stat-box" to={buildLinesLink({ reasonLabel: '3日以内' })}>
                <span>3日以内</span>
                <strong>{summary.notificationReasonSummary.within3Days}件</strong>
              </Link>
              <Link className="stat-box" to={buildLinesLink({ reasonLabel: '7日以内' })}>
                <span>7日以内</span>
                <strong>{summary.notificationReasonSummary.within7Days}件</strong>
              </Link>
            </div>
          )}
        </article>

        <article className="card">
          <div className="card__header">
            <h3>通知対象の回線一覧</h3>
            <span className={notificationSettings.enabled ? 'badge badge--ok' : 'badge'}>
              {notificationSettings.enabled ? `最大${summary.notificationTargets.length}件` : '無効'}
            </span>
          </div>
          {!notificationSettings.enabled ? (
            <p className="muted">通知は無効です。`/settings/notifications` で通知を有効にすると、ここに対象回線が表示されます。</p>
          ) : summary.notificationTargets.length === 0 ? (
            <p className="muted">現在の設定では通知対象になる回線はありません。期限設定か次回確認日を見直すと、ここに候補が表示されます。</p>
          ) : (
            <>
              <ul className="list list--drafts">
                {summary.notificationTargets.map((item) => (
                  <li key={item.draft.id}>
                    <div className="list__row">
                      <strong>{item.draft.lineName}</strong>
                      <span className={item.draft.status === '利用中' ? 'badge badge--ok' : 'badge'}>{item.draft.status}</span>
                    </div>
                    <span>{item.draft.carrier}</span>
                    <span>次回確認日: {formatReviewDate(item.draft.nextReviewDate)}</span>
                    <span>下4桁: {item.draft.last4 || '未設定'}</span>
                    <span>契約名義メモ: {item.draft.contractHolderNote || '未設定'}</span>
                    <span className="badge">{item.reasonLabel}</span>
                    <div className="button-row button-row--tight">
                      <Link className="button" to={buildLinesLink({ reasonLabel: item.reasonLabel, notificationTargetOnly: true })}>
                        この条件で回線一覧を開く
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="button-row">
                <Link className="button" to="/lines">
                  回線一覧で確認する
                </Link>
              </div>
            </>
          )}
        </article>

        <article className="card">
          <div className="card__header">
            <h3>月額費用サマリー</h3>
            <span className="badge">実データ</span>
          </div>
          <p className="metric">{formatCurrency(summary.monthlyTotal)}</p>
          <p className="muted">月額費用が入力された回線だけを合計します。未設定の回線は合計に含めません。</p>
        </article>

        <article className="card">
          <div className="card__header">
            <h3>収支サマリー</h3>
            <span className="badge">概算</span>
          </div>
          <dl className="definition-list">
            <div>
              <dt>累計支払コスト</dt>
              <dd>{formatYenAmount(summary.balanceSummary.totalPaidCost)}</dd>
            </div>
            <div>
              <dt>受取済み特典</dt>
              <dd>{formatYenAmount(summary.balanceSummary.totalReceivedBenefit)}</dd>
            </div>
            <div>
              <dt>実質収支</dt>
              <dd>{formatYenAmount(summary.balanceSummary.netBalance)}</dd>
            </div>
            <div>
              <dt>受取済み特典あり回線</dt>
              <dd>{summary.balanceSummary.coveredLineCount}件</dd>
            </div>
          </dl>
          <p className="muted">月額費用は `契約開始日` からの経過月数で概算し、受取済み特典は `receivedFlag = true` かつ金額ありの特典だけを集計します。</p>
          {summary.balanceSummary.receivedBenefitLines.length > 0 ? (
            <>
              <ul className="list list--drafts">
                {summary.balanceSummary.receivedBenefitLines.map((item) => (
                  <li key={item.draft.id}>
                    <div className="list__row">
                      <strong>{item.draft.lineName}</strong>
                      <span className={item.draft.status === '利用中' ? 'badge badge--ok' : 'badge'}>{item.draft.status}</span>
                    </div>
                    <span>{item.draft.carrier}</span>
                    <span>受取済み特典: {formatYenAmount(item.receivedBenefit)}</span>
                  </li>
                ))}
              </ul>
              <div className="button-row">
                <Link className="button" to="/lines">回線一覧で確認する</Link>
              </div>
            </>
          ) : null}
        </article>

        {summary.contractHolderSummary.length > 0 ? (
          <article className="card">
            <div className="card__header">
              <h3>名義別サマリー</h3>
              <span className="badge">{summary.contractHolderSummary.length}名義</span>
            </div>
            <p className="muted">名義が2種類以上あるときだけ、契約者ごとの回線数・利用中件数・月額合計・平均契約月数を表示します。</p>
            <ul className="list list--drafts">
              {summary.contractHolderSummary.map((item) => (
                <li key={item.holder}>
                  <div className="list__row">
                    <strong>{item.holder}</strong>
                    <span className={item.activeLines > 0 ? 'badge badge--ok' : 'badge'}>
                      利用中 {item.activeLines}件
                    </span>
                  </div>
                  <span>総回線数: {item.totalLines}件</span>
                  <span>月額合計: {formatCurrency(item.monthlyTotal)}</span>
                  <span>平均契約月数: {item.avgContractMonths}ヶ月</span>
                </li>
              ))}
            </ul>
          </article>
        ) : null}

        <article className="card">
          <div className="card__header">
            <h3>利用実績種別の巡回</h3>
            <span className={summary.usageAlertItems.length === 0 ? 'badge badge--ok' : 'badge'}>
              {summary.usageAlertItems.length === 0 ? '問題なし' : `${summary.usageAlertItems.length}件`}
            </span>
          </div>
          <p className="muted">`利用中` または `解約予定` の回線について、直近 {USAGE_SUMMARY_DAYS} 日の `通 / 話 / S` 実績に不足がある回線を表示します（最大5件）。</p>
          {summary.usageAlertItems.length === 0 ? (
            <p className="muted">利用実績種別の不足がある回線はありません。</p>
          ) : (
            <>
              <ul className="list list--drafts">
                {summary.usageAlertItems.map((item) => {
                  const missingUsageKinds = countMissingUsageKinds(item.usageSummary);
                  const hasNoUsageActivity = missingUsageKinds === 3;
                  return (
                    <li key={item.draft.id}>
                      <div className="list__row">
                        <strong>{item.draft.lineName}</strong>
                        <span className={item.draft.status === '利用中' ? 'badge badge--ok' : 'badge'}>{item.draft.status}</span>
                      </div>
                      <span>{item.draft.carrier}</span>
                      <span>最終活動: {item.usageSummary.lastActivityDate ? formatReviewDate(item.usageSummary.lastActivityDate) : '記録なし'}</span>
                      <div className="badge-row">
                        <span className={item.usageSummary.hasCommunication ? 'badge badge--ok' : 'badge'}>通</span>
                        <span className={item.usageSummary.hasCall ? 'badge badge--ok' : 'badge'}>話</span>
                        <span className={item.usageSummary.hasSms ? 'badge badge--ok' : 'badge'}>S</span>
                        {hasNoUsageActivity ? (
                          <span className="badge badge--warn">利用実績なし</span>
                        ) : (
                          <span className="badge">不足 {missingUsageKinds}種別</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="button-row">
                <Link className="button" to="/lines?sort=latestActivityAsc">回線一覧で確認する</Link>
              </div>
            </>
          )}
        </article>

        <article className="card">
          <div className="card__header">
            <h3>長期未活動の回線</h3>
            <span className={summary.inactiveLines.length === 0 ? 'badge badge--ok' : 'badge'}>
              {summary.inactiveLines.length === 0 ? '問題なし' : `${summary.inactiveLines.length}件`}
            </span>
          </div>
          <p className="muted">活動ログがない、または最終活動日から{INACTIVE_THRESHOLD_DAYS}日以上経過している回線を表示します（最大5件）。</p>
          {summary.inactiveLines.length === 0 ? (
            <p className="muted">長期未活動の回線はありません。</p>
          ) : (
            <>
              <ul className="list list--drafts">
                {summary.inactiveLines.map((item) => (
                  <li key={item.draft.id}>
                    <div className="list__row">
                      <strong>{item.draft.lineName}</strong>
                      <span className={item.draft.status === '利用中' ? 'badge badge--ok' : 'badge'}>{item.draft.status}</span>
                    </div>
                    <span>{item.draft.carrier}</span>
                    <span>最終活動: {item.latestActivityDate ? new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(`${item.latestActivityDate}T00:00:00`)) : '記録なし'}</span>
                    {item.draft.phoneNumber && (
                      <Link className="button button--sm" to={`/lines/history?quickActivity=${encodeURIComponent(item.draft.phoneNumber)}`}>活動を記録</Link>
                    )}
                  </li>
                ))}
              </ul>
              <div className="button-row">
                <Link className="button" to="/lines?sort=latestActivityAsc">回線一覧で確認する</Link>
              </div>
            </>
          )}
        </article>

        <article className="card">
          <div className="card__header">
            <h3>次回確認日が近い回線</h3>
            <span className="badge">最大5件</span>
          </div>
          {summary.nearest.length === 0 ? (
            <p className="muted">次回確認日が設定された回線はまだありません。`/lines` から日付を入れるとここに表示されます。</p>
          ) : (
            <ul className="list list--drafts">
              {summary.nearest.map((draft) => (
                <li key={draft.id}>
                  <div className="list__row">
                    <strong>{draft.lineName}</strong>
                    <span className={draft.status === '利用中' ? 'badge badge--ok' : 'badge'}>{draft.status}</span>
                  </div>
                  <span>{draft.carrier}</span>
                  <span>回線種別: {draft.lineType}</span>
                  <span>月額費用: {draft.monthlyCost == null ? '未設定' : formatCurrency(draft.monthlyCost)}</span>
                  <span>次回確認日: {formatReviewDate(draft.nextReviewDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </div>
  );
}
