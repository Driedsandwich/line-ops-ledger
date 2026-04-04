import { useState } from 'react';
import { Link } from 'react-router-dom';
import { lineDraftStore, type BenefitRecord, type LineDraft } from '../lib/lineDrafts';
import { lineHistoryStore, type LineHistoryEntry } from '../lib/lineHistory';
import {
  calculateFiberDebtClearDate,
  calculateFiberRemainingDebt,
  calculateElapsedMonths,
  calculateSafeExitDate,
  diffInDays,
  findRelatedHistoryEntriesForDraft,
  getLatestActivityDateFromEntries,
  parseReviewDate,
  startOfDay,
} from '../lib/lineAnalytics';
import { buildHistoryLink, buildLineEventFeed, groupLineEventsBySeverity, type LineEvent, type LineEventGroup, type LineEventOrigin } from '../lib/lineEvents';
import {
  loadNotificationSettings,
  type NotificationRelaunchPolicy,
  type NotificationReminderWindow,
} from '../lib/notificationSettings';
import { importBundledSampleData } from '../lib/sampleData';

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

type UsagePriorityKind = 'communication' | 'call' | 'sms';

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

type KpiCardViewModel = {
  id: string;
  accent: string;
  label: string;
  value: string;
  detail: string;
  tone: 'ok' | 'warn' | 'danger' | 'info';
  to: string;
  ctaLabel: string;
};

type HealthRingViewModel = {
  id: string;
  label: string;
  ratio: number;
  tone: 'ok' | 'warn' | 'danger' | 'info';
  metric: string;
  status: string;
  detail: string;
  to: string;
  ctaLabel: string;
};

type ActionGroupViewModel = {
  id: 'critical' | 'warning' | 'watch';
  label: string;
  description: string;
  tone: 'danger' | 'warn' | 'info';
  count: number;
  defaultOpen: boolean;
  events: LineEvent[];
};

const SAFE_EXIT_DAYS = 181;
const FIBER_DEBT_ALERT_DAYS = 60;

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
        const contractMonths = calculateElapsedMonths(draft.contractStartDate, new Date());
        if (contractMonths == null) {
          return sum;
        }
        return sum + contractMonths;
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
    const elapsedMonths = calculateElapsedMonths(draft.contractStartDate, new Date());
    if (draft.monthlyCost != null && elapsedMonths != null) {
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

function buildFiberDebtItems(drafts: LineDraft[], today: Date): FiberDebtItem[] {
  return drafts
    .filter((draft) => draft.lineType === '光回線' && (draft.status === '利用中' || draft.status === '解約予定'))
    .map((draft) => {
      const debtClearDate = calculateFiberDebtClearDate(draft.contractStartDate, draft.fiberConstructionFeeMonths);
      return {
        draft,
        debtClearDate: debtClearDate ? debtClearDate.toISOString().slice(0, 10) : null,
        daysUntilClear: debtClearDate ? diffInDays(today, debtClearDate) : null,
        remainingDebt: calculateFiberRemainingDebt(
          draft.contractStartDate,
          draft.fiberConstructionFee,
          draft.fiberMonthlyDiscount,
          draft.fiberConstructionFeeMonths,
          today,
        ),
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

function formatUsagePriorityLabel(priority: UsagePriorityKind): string {
  switch (priority) {
    case 'communication':
      return '通';
    case 'call':
      return '話';
    case 'sms':
      return 'S';
  }
}

function buildUsagePriorityLinesLink(priority: UsagePriorityKind): string {
  const params = new URLSearchParams({
    sort: 'latestActivityAsc',
    contractActiveOnly: 'true',
    usagePriority: priority,
  });

  return `/lines?${params.toString()}`;
}

function buildUsageAlertItems(drafts: LineDraft[], allHistoryEntries: LineHistoryEntry[]): UsageAlertItem[] {
  return drafts
    .filter((draft) => draft.status === '利用中' || draft.status === '解約予定')
    .map((draft) => {
      const relatedEntries = findRelatedHistoryEntriesForDraft(draft, allHistoryEntries);
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
    .filter((draft) => Boolean(parseReviewDate(draft.nextReviewDate)))
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
      const related = findRelatedHistoryEntriesForDraft(draft, allHistoryEntries);
      const latestActivityDate = getLatestActivityDateFromEntries(related);
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

function isCurrentContractStatus(status: LineDraft['status']): boolean {
  return status === '利用中' || status === '解約予定';
}

function clampRatio(value: number): number {
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function buildKpiCards(summary: DashboardSummary, notificationSettingsEnabled: boolean): KpiCardViewModel[] {
  return [
    {
      id: 'danger',
      accent: 'ALERT',
      label: 'Danger Alerts',
      value: `${summary.dangerCount}件`,
      detail: '次回確認日が今日以前の回線',
      tone: summary.dangerCount === 0 ? 'ok' : 'danger',
      to: buildLinesLink({ reasonLabel: '期限超過' }),
      ctaLabel: '期限超過を確認',
    },
    {
      id: 'notifications',
      accent: 'REVIEW',
      label: 'Notifications',
      value: notificationSettingsEnabled ? `${summary.notificationEligibleCount}件` : '無効',
      detail: notificationSettingsEnabled ? '通知設定上の対象件数' : '通知設定で有効化',
      tone: notificationSettingsEnabled
        ? (summary.notificationEligibleCount === 0 ? 'ok' : 'info')
        : 'warn',
      to: '/settings/notifications',
      ctaLabel: '通知設定を開く',
    },
    {
      id: 'monthly',
      accent: 'COST',
      label: 'Monthly Cost',
      value: formatCurrency(summary.monthlyTotal),
      detail: '月額費用の入力済み回線のみ集計',
      tone: 'info',
      to: '/lines',
      ctaLabel: '回線一覧で確認',
    },
    {
      id: 'balance',
      accent: 'NET',
      label: 'Net Balance',
      value: formatYenAmount(summary.balanceSummary.netBalance),
      detail: '受取済み特典を反映した概算収支',
      tone: summary.balanceSummary.netBalance > 0 ? 'ok' : summary.balanceSummary.netBalance < 0 ? 'warn' : 'info',
      to: '/lines',
      ctaLabel: '特典と費用を確認',
    },
  ];
}

function buildHealthRings(summary: DashboardSummary, drafts: LineDraft[]): HealthRingViewModel[] {
  const today = new Date();
  const currentDrafts = drafts.filter((draft) => isCurrentContractStatus(draft.status));
  const safeExitEligibleCount = currentDrafts.filter((draft) => {
    const safeExitDate = calculateSafeExitDate(draft.contractStartDate);
    return safeExitDate ? diffInDays(today, safeExitDate) <= 0 : false;
  }).length;
  const safeExitRatio = currentDrafts.length === 0 ? 0 : safeExitEligibleCount / currentDrafts.length;

  const deadlineDraftIds = new Set<string>([
    ...summary.contractEndAlerts.map((item) => item.draft.id),
    ...summary.plannedActions.map((item) => item.draft.id),
    ...summary.deadlineAlerts.map((item) => item.draft.id),
    ...summary.benefitDeadlineAlerts.map((item) => item.draft.id),
  ]);
  const deadlineRatio = currentDrafts.length === 0 ? 0 : deadlineDraftIds.size / currentDrafts.length;
  const hasCriticalDeadline =
    summary.notificationReasonSummary.overdue > 0
    || summary.deadlineAlerts.some((item) => item.daysUntilDeadline <= 0)
    || summary.benefitDeadlineAlerts.some((item) => item.daysUntilDeadline <= 0);

  const usageDraftIds = new Set<string>([
    ...summary.usageAlertItems.map((item) => item.draft.id),
    ...summary.inactiveLines.map((item) => item.draft.id),
  ]);
  const usageRatio = currentDrafts.length === 0 ? 0 : usageDraftIds.size / currentDrafts.length;

  return [
    {
      id: 'safe-exit',
      label: '安全離脱',
      ratio: clampRatio(safeExitRatio),
      tone: currentDrafts.length === 0 ? 'info' : safeExitEligibleCount === 0 ? 'warn' : safeExitRatio >= 0.5 ? 'ok' : 'info',
      metric: `${safeExitEligibleCount}/${currentDrafts.length || 0}件`,
      status: currentDrafts.length === 0 ? '対象なし' : safeExitEligibleCount === 0 ? 'まだ離脱推奨前' : '離脱候補あり',
      detail: `利用中 / 解約予定のうち ${SAFE_EXIT_DAYS} 日経過済み`,
      to: '/lines?contractActiveOnly=true',
      ctaLabel: '契約中の回線を見る',
    },
    {
      id: 'deadline-alerts',
      label: '期限警告',
      ratio: clampRatio(deadlineRatio),
      tone: hasCriticalDeadline ? 'danger' : deadlineDraftIds.size > 0 ? 'warn' : 'ok',
      metric: `${deadlineDraftIds.size}/${currentDrafts.length || 0}件`,
      status: hasCriticalDeadline ? '期限超過あり' : deadlineDraftIds.size > 0 ? '要確認' : '警告なし',
      detail: '契約終了・予定・番号/無料オプション・特典期限の警戒度',
      to: hasCriticalDeadline ? buildLinesLink({ reasonLabel: '期限超過' }) : '/lines',
      ctaLabel: '期限系を確認',
    },
    {
      id: 'usage-gaps',
      label: '実績不足',
      ratio: clampRatio(usageRatio),
      tone: usageDraftIds.size === 0 ? 'ok' : summary.inactiveLines.length > 0 ? 'danger' : 'warn',
      metric: `${usageDraftIds.size}/${currentDrafts.length || 0}件`,
      status: usageDraftIds.size === 0 ? '巡回良好' : summary.inactiveLines.length > 0 ? '未活動あり' : '種別不足あり',
      detail: `直近 ${USAGE_SUMMARY_DAYS} 日の 通 / 話 / S の不足`,
      to: '/lines?sort=latestActivityAsc&contractActiveOnly=true',
      ctaLabel: '利用実績を確認',
    },
  ];
}

function buildActionGroups(eventGroups: LineEventGroup[]): ActionGroupViewModel[] {
  const criticalGroup = eventGroups.find((group) => group.severity === 'critical');
  const warningGroup = eventGroups.find((group) => group.severity === 'warning');
  const watchGroup = eventGroups.find((group) => group.severity === 'watch');
  const criticalCount = criticalGroup?.events.length ?? 0;

  return [
    {
      id: 'critical',
      label: 'Critical',
      description: '期限超過と直近失効を優先的に処理する一覧です。',
      tone: 'danger',
      count: criticalCount,
      defaultOpen: true,
      events: criticalGroup?.events ?? [],
    },
    {
      id: 'warning',
      label: 'Warning',
      description: '30〜60日以内の予定と近づく解消タイミングを整理します。',
      tone: 'warn',
      count: warningGroup?.events.length ?? 0,
      defaultOpen: criticalCount === 0,
      events: warningGroup?.events ?? [],
    },
    {
      id: 'watch',
      label: 'Watch',
      description: '利用実績、通知対象、巡回対象をまとめます。',
      tone: 'info',
      count: watchGroup?.events.length ?? 0,
      defaultOpen: false,
      events: watchGroup?.events ?? [],
    },
  ];
}

function renderEventMetaTags(event: LineEvent): JSX.Element | null {
  const metaTags = Array.from(new Set([event.carrier, event.status, ...getUniqueEventMetaTags(event)].filter(Boolean)));
  if (metaTags.length === 0) {
    return null;
  }

  return (
    <div className="badge-row">
      {metaTags.slice(0, 4).map((tag) => (
        <span key={`${event.id}-${tag}`} className="badge">
          {tag}
        </span>
      ))}
      {event.dueDateLabel ? <span className="badge badge--info">{event.dueDateLabel}</span> : null}
    </div>
  );
}

function getUniqueEventMetaTags(event: LineEvent): string[] {
  return Array.from(new Set(event.meta.filter(Boolean)));
}

function getEventOriginLabel(origin: LineEventOrigin): string {
  return origin === 'history' ? '履歴由来' : '回線由来';
}

function renderActionEventRow(event: LineEvent): JSX.Element {
  const showHistoryLink = Boolean(event.phoneNumber) && !event.to.startsWith('/lines/history');

  return (
    <li key={event.id} className={`dashboard-event-row dashboard-event-row--${event.severity}`}>
      <div className="dashboard-event-row__main">
        <div className="dashboard-event-row__title-row">
          <strong>{event.title}</strong>
          <span className="badge">{getEventOriginLabel(event.origin)}</span>
          <span className={`badge badge--${event.severity === 'critical' ? 'danger' : event.severity === 'warning' ? 'warn' : 'info'}`}>
            {event.severity === 'critical' ? 'Critical' : event.severity === 'warning' ? 'Warning' : 'Watch'}
          </span>
        </div>
        <span className="dashboard-event-row__summary">{event.summary}</span>
        <p className="muted dashboard-event-row__detail">{event.detail}</p>
        {renderEventMetaTags(event)}
      </div>
      <div className="button-row button-row--tight">
        <Link className="button button--sm" to={event.to}>
          {event.ctaLabel}
        </Link>
        {showHistoryLink ? (
          <Link className="button button--sm" to={buildHistoryLink(event.phoneNumber, event.kind)}>
            履歴で記録
          </Link>
        ) : null}
      </div>
    </li>
  );
}

function renderActionGroupCard(group: ActionGroupViewModel): JSX.Element {
  return (
    <details
      key={group.id}
      className={`dashboard-accordion dashboard-accordion--${group.tone}`}
      open={group.defaultOpen}
    >
      <summary className="dashboard-accordion__summary">
        <div>
          <strong>{group.label}</strong>
          <p className="muted">{group.description}</p>
        </div>
        <span className={`badge badge--${group.tone === 'danger' ? 'danger' : group.tone === 'warn' ? 'warn' : 'info'}`}>
          {group.count}件
        </span>
      </summary>

      <div className="dashboard-accordion__content">
        {group.events.length === 0 ? (
          <p className="muted">対象はありません。</p>
        ) : (
          <ul className="dashboard-event-list">
            {group.events.slice(0, 5).map((event) => renderActionEventRow(event))}
          </ul>
        )}
      </div>
    </details>
  );
}

function renderRingGauge(ring: HealthRingViewModel): JSX.Element {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ring.ratio);

  return (
    <article key={ring.id} className={`card dashboard-ring-card dashboard-ring-card--${ring.tone}`}>
      <div className="dashboard-ring-card__visual">
        <svg viewBox="0 0 140 140" className="dashboard-ring-card__svg" aria-hidden="true">
          <circle className="dashboard-ring-card__track" cx="70" cy="70" r={radius} />
          <circle
            className="dashboard-ring-card__progress"
            cx="70"
            cy="70"
            r={radius}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="dashboard-ring-card__center">
          <span className="dashboard-ring-card__metric">{ring.metric}</span>
          <strong>{ring.label}</strong>
        </div>
      </div>
      <div className="dashboard-ring-card__body">
        <span className={`badge badge--${ring.tone === 'danger' ? 'danger' : ring.tone === 'warn' ? 'warn' : ring.tone === 'ok' ? 'ok' : 'info'}`}>
          {ring.status}
        </span>
        <p className="muted">{ring.detail}</p>
        <div className="button-row button-row--tight">
          <Link className="button button--sm" to={ring.to}>
            {ring.ctaLabel}
          </Link>
        </div>
      </div>
    </article>
  );
}

function renderCriticalPanels(summary: DashboardSummary): JSX.Element {
  return (
    <div className="card-grid">
      <article className="card">
        <div className="card__header">
          <h3>期限超過の次回確認</h3>
          <span className={summary.notificationReasonSummary.overdue === 0 ? 'badge badge--ok' : 'badge badge--danger'}>
            {summary.notificationReasonSummary.overdue === 0 ? '0件' : `${summary.notificationReasonSummary.overdue}件`}
          </span>
        </div>
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
        </div>
        <p className="muted">通知設定の reminder window を維持しつつ、overdue を最優先で見られるようにしています。</p>
      </article>

      <article className="card">
        <div className="card__header">
          <h3>番号・無料オプション期限</h3>
          <span className={summary.deadlineAlerts.length === 0 ? 'badge badge--ok' : 'badge'}>
            {summary.deadlineAlerts.length === 0 ? '該当なし' : `${summary.deadlineAlerts.length}件`}
          </span>
        </div>
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

      <article className="card">
        <div className="card__header">
          <h3>特典期限アラート</h3>
          <span className={summary.benefitDeadlineAlerts.length === 0 ? 'badge badge--ok' : 'badge'}>
            {summary.benefitDeadlineAlerts.length === 0 ? '該当なし' : `${summary.benefitDeadlineAlerts.length}件`}
          </span>
        </div>
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
                  <div className="button-row button-row--tight">
                    <Link className="button button--sm" to={`/lines?openDraft=${encodeURIComponent(item.draft.id)}&focusSection=benefits`}>
                      該当回線を開く
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
            <div className="button-row">
              <Link className="button" to="/lines">回線一覧で確認する</Link>
            </div>
          </>
        )}
      </article>
    </div>
  );
}

function renderWarningPanels(summary: DashboardSummary): JSX.Element {
  return (
    <div className="card-grid">
      <article className="card">
        <div className="card__header">
          <h3>契約終了が近い回線</h3>
          <span className={summary.contractEndAlerts.length === 0 ? 'badge badge--ok' : 'badge'}>
            {summary.contractEndAlerts.length === 0 ? '該当なし' : `${summary.contractEndAlerts.length}件`}
          </span>
        </div>
        <p className="muted">契約終了日が{CONTRACT_END_ALERT_DAYS}日以内（または超過）の利用中・解約予定回線を表示します。</p>
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

      <article className="card">
        <div className="card__header">
          <h3>今後のアクション予定</h3>
          <span className={summary.plannedActions.length === 0 ? 'badge badge--ok' : 'badge'}>
            {summary.plannedActions.length === 0 ? '該当なし' : `${summary.plannedActions.length}件`}
          </span>
        </div>
        <p className="muted">予定日が{PLANNED_ACTION_ALERT_DAYS}日以内、または超過している利用中・解約予定回線を表示します。</p>
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

      <article className="card">
        <div className="card__header">
          <h3>光回線の残債解消予定</h3>
          <span className={summary.fiberDebtItems.length === 0 ? 'badge badge--ok' : 'badge'}>
            {summary.fiberDebtItems.length === 0 ? '該当なし' : `${summary.fiberDebtItems.length}件`}
          </span>
        </div>
        <p className="muted">`利用中` または `解約予定` の光回線について、残債解消予定日と概算残債を表示します。</p>
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
                  <div className="button-row button-row--tight">
                    <Link className="button button--sm" to={`/lines?openDraft=${encodeURIComponent(item.draft.id)}&focusSection=fiber`}>
                      該当回線を開く
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
            <div className="button-row">
              <Link className="button" to="/lines">回線一覧で確認する</Link>
            </div>
          </>
        )}
      </article>
    </div>
  );
}

function renderWatchPanels(
  summary: DashboardSummary,
  drafts: LineDraft[],
  notificationSettings: ReturnType<typeof loadNotificationSettings>,
): JSX.Element {
  return (
    <div className="card-grid">
      <article className="card">
        <div className="card__header">
          <h3>利用実績種別の巡回</h3>
          <span className={summary.usageAlertItems.length === 0 ? 'badge badge--ok' : 'badge'}>
            {summary.usageAlertItems.length === 0 ? '問題なし' : `${summary.usageAlertItems.length}件`}
          </span>
        </div>
        <p className="muted">`利用中` または `解約予定` の回線について、直近 {USAGE_SUMMARY_DAYS} 日の `通 / 話 / S` 実績に不足がある回線を表示します。</p>
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
              <Link className="button" to="/lines?sort=latestActivityAsc&contractActiveOnly=true">回線一覧で確認する</Link>
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
                  {item.draft.phoneNumber ? (
                    <div className="button-row button-row--tight">
                      <Link className="button button--sm" to={`/lines/history?quickActivity=${encodeURIComponent(item.draft.phoneNumber)}`}>
                        活動を記録
                      </Link>
                    </div>
                  ) : null}
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
          <h3>通知方針と対象</h3>
          <span className={notificationSettings.enabled ? 'badge badge--ok' : 'badge'}>
            {notificationSettings.enabled ? `${summary.notificationEligibleCount}件` : '無効'}
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
            <dt>状態別件数</dt>
            <dd>利用中 {summary.activeCount}件 / 解約予定 {summary.closingCount}件 / 登録総数 {drafts.length}件</dd>
          </div>
        </dl>
        {!notificationSettings.enabled ? (
          <p className="muted">通知は無効です。`/settings/notifications` で有効化すると、ここに対象回線が並びます。</p>
        ) : summary.notificationTargets.length === 0 ? (
          <p className="muted">現在の設定では通知対象になる回線はありません。</p>
        ) : (
          <ul className="list list--drafts">
            {summary.notificationTargets.map((item) => (
              <li key={item.draft.id}>
                <div className="list__row">
                  <strong>{item.draft.lineName}</strong>
                  <span className="badge">{item.reasonLabel}</span>
                </div>
                <span>{item.draft.carrier}</span>
                <span>次回確認日: {formatReviewDate(item.draft.nextReviewDate)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="button-row">
          <Link className="button" to="/settings/notifications">通知設定を開く</Link>
        </div>
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
        {summary.balanceSummary.receivedBenefitLines.length > 0 ? (
          <ul className="list list--drafts">
            {summary.balanceSummary.receivedBenefitLines.map((item) => (
              <li key={item.draft.id}>
                <div className="list__row">
                  <strong>{item.draft.lineName}</strong>
                  <span className={item.draft.status === '利用中' ? 'badge badge--ok' : 'badge'}>{item.draft.status}</span>
                </div>
                <span>{item.draft.carrier}</span>
                <span>受取済み特典: {formatYenAmount(item.receivedBenefit)}</span>
                <div className="button-row button-row--tight">
                  <Link className="button button--sm" to={`/lines?openDraft=${encodeURIComponent(item.draft.id)}&focusSection=benefits`}>
                    該当回線を開く
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">受取済み特典のある回線はまだありません。</p>
        )}
      </article>

      <article className="card">
        <div className="card__header">
          <h3>次回確認日が近い回線</h3>
          <span className="badge">最大5件</span>
        </div>
        {summary.nearest.length === 0 ? (
          <p className="muted">次回確認日が設定された回線はまだありません。</p>
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

      {summary.contractHolderSummary.length > 0 ? (
        <article className="card">
          <div className="card__header">
            <h3>名義別サマリー</h3>
            <span className="badge">{summary.contractHolderSummary.length}名義</span>
          </div>
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
    </div>
  );
}

export function DashboardPage(): JSX.Element {
  const [drafts, setDrafts] = useState<LineDraft[]>(() => lineDraftStore.load());
  const [historyEntries, setHistoryEntries] = useState<LineHistoryEntry[]>(() => lineHistoryStore.load());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const notificationSettings = loadNotificationSettings();
  const summary = buildSummary(drafts, historyEntries, notificationSettings.reminderWindow);
  const isFirstRun = drafts.length === 0 && historyEntries.length === 0;
  const kpiCards = buildKpiCards(summary, notificationSettings.enabled);
  const healthRings = buildHealthRings(summary, drafts);
  const lineEvents = buildLineEventFeed(drafts, historyEntries);
  const actionGroups = buildActionGroups(groupLineEventsBySeverity(lineEvents));

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
        <div className="dashboard-header-chips" aria-label="dashboard status summary">
          <span className={`badge ${summary.notificationReasonSummary.overdue > 0 ? 'badge--danger' : 'badge--info'}`}>
            期限超過 {summary.notificationReasonSummary.overdue}件
          </span>
          <span className={`badge ${summary.todayCount > 0 ? 'badge--warn' : 'badge--info'}`}>
            今日期限 {summary.todayCount}件
          </span>
          <span className="badge badge--ok">契約中 {summary.activeCount}件</span>
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

      <section className="dashboard-command">
        <section className="card dashboard-hero-panel" aria-label="Command Center overview">
          <div className="dashboard-hero-panel__content">
            <div>
              <p className="eyebrow">Command Center</p>
              <h3>既存の期限・予定・実績を、今日の判断に必要な密度へ再配置しています。</h3>
              <p className="muted">
                KPI は量、Hopping Health は傾向、Actionable Alerts は処理順を示します。既存の drilldown はそのまま使えます。
              </p>
            </div>
            <div className="dashboard-hero-panel__chips" aria-label="command center quick metrics">
              <span className="badge badge--info">通知対象 {summary.notificationEligibleCount}件</span>
              <span className={`badge ${summary.contractEndAlerts.length > 0 ? 'badge--warn' : 'badge--ok'}`}>
                契約終了警告 {summary.contractEndAlerts.length}件
              </span>
              <span className={`badge ${summary.usageAlertItems.length > 0 ? 'badge--warn' : 'badge--ok'}`}>
                実績不足 {summary.usageAlertItems.length}件
              </span>
              <span className={`badge ${summary.balanceSummary.netBalance >= 0 ? 'badge--ok' : 'badge--warn'}`}>
                概算収支 {formatYenAmount(summary.balanceSummary.netBalance)}
              </span>
            </div>
          </div>
        </section>

        <section className="dashboard-kpi-grid" aria-label="Summary KPI">
          {kpiCards.map((item) => (
            <article key={item.id} className={`card dashboard-kpi-card dashboard-kpi-card--${item.tone}`}>
              <div className="dashboard-kpi-card__topline">
                <span className="dashboard-kpi-card__accent">{item.accent}</span>
                <span className={`badge badge--${item.tone === 'danger' ? 'danger' : item.tone === 'warn' ? 'warn' : item.tone === 'ok' ? 'ok' : 'info'}`}>
                  {item.label}
                </span>
              </div>
              <span className="dashboard-kpi-card__label">{item.label}</span>
              <strong className="dashboard-kpi-card__value">{item.value}</strong>
              <p className="muted">{item.detail}</p>
              <div className="button-row button-row--tight">
                <Link className="button button--sm" to={item.to}>
                  {item.ctaLabel}
                </Link>
              </div>
            </article>
          ))}
        </section>

        <section className="card dashboard-health-panel" aria-label="Hopping Health">
          <div className="card__header">
            <div>
              <p className="eyebrow">Hopping Health</p>
              <h3>既存集計を 3 つの観点でまとめ直したファーストビュー</h3>
            </div>
            <span className="badge badge--info">KPI first</span>
          </div>
          <p className="muted">
            総合点は作らず、`安全離脱` `期限警告` `実績不足` を分けて可視化します。各リングから既存の drilldown にそのまま入れます。
          </p>
          <div className="dashboard-ring-grid">
            {healthRings.map((ring) => renderRingGauge(ring))}
          </div>
        </section>

      <section className="dashboard-action-groups" aria-label="Actionable Alerts">
        <div className="card__header">
          <div>
            <p className="eyebrow">Actionable Alerts</p>
            <h3>共通イベントフィードを優先度ごとにまとめたアコーディオン</h3>
          </div>
        </div>

        {actionGroups.map((group) => renderActionGroupCard(group))}
      </section>
    </section>
  </div>
  );
}
