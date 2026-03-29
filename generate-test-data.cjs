/**
 * テストデータ生成スクリプト
 * node generate-test-data.js で test-data.json を上書き生成します
 *
 * 設計：
 *   家族4人（本人・配偶者・子1・子2）の合計25回線
 *   全キャリア・全回線種別・全ステータスを網羅
 *   ダッシュボードの全カードが有意義に表示されるよう日付を調整
 *   MNP遍歴を持つ電話番号複数・活動ログ充実で履歴タイムラインを確認
 */

const NOW = '2026-03-29T10:00:00.000Z';

// ─── ユーティリティ ───────────────────────────────────────────────
function daysFromNow(days) {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

let idSeq = 1;
function uid(prefix) {
  return `${prefix}-${String(idSeq++).padStart(3, '0')}`;
}

function draft({
  id, lineName, carrier, lineType, monthlyCost, phoneNumber, last4,
  contractHolderNote = '', contractStartDate, contractEndDate = '',
  contractHolder, serviceUser, paymentMethod = 'クレジットカード',
  planName = '', deviceName = '', status, memo = '', nextReviewDate = '',
  createdAt,
}) {
  return {
    id, lineName, carrier, lineType,
    monthlyCost: monthlyCost ?? null,
    phoneNumber: phoneNumber ?? '',
    last4: last4 ?? '',
    contractHolderNote, contractStartDate, contractEndDate,
    contractHolder, serviceUser, paymentMethod, planName, deviceName,
    status, memo, nextReviewDate, createdAt,
  };
}

function histEntry({
  id, phoneNumber, carrier, status,
  contractStartDate, contractEndDate = '',
  activityLogs = [], memo = '', createdAt,
}) {
  return { id, phoneNumber, carrier, status, contractStartDate, contractEndDate, activityLogs, memo, createdAt };
}

function log(id, activityDate, activityType, activityMemo = '') {
  return { id, activityDate, activityType, activityMemo };
}

// ─── 回線台帳（25件） ─────────────────────────────────────────────
const lineDraftItems = [

  // ============================================================
  // 【本人】山田 太郎  電話番号: 090-1111-xxxx 系
  // ============================================================

  // [1] メイン音声（ドコモ）- 次回確認期限超過
  draft({
    id: 'd-001',
    lineName: 'メイン音声（本人）',
    carrier: 'NTTドコモ',
    lineType: '音声SIM',
    monthlyCost: 3278,
    phoneNumber: '09011110001',
    last4: '0001',
    contractHolder: '山田 太郎',
    serviceUser: '本人',
    paymentMethod: 'クレジットカード',
    planName: 'eximo / かけ放題オプション',
    deviceName: 'iPhone 16 Pro',
    contractHolderNote: '本人名義',
    contractStartDate: '2022-04-01',
    status: '利用中',
    memo: '特典期間 2026-06 まで。月額変動に注意。',
    nextReviewDate: daysFromNow(-5),  // 期限超過（5日前）
    createdAt: '2022-04-01T09:00:00.000Z',
  }),

  // [2] サブ音声（ahamo）- 7日以内
  draft({
    id: 'd-002',
    lineName: 'サブ音声（本人 ahamo）',
    carrier: 'ahamo',
    lineType: '音声SIM',
    monthlyCost: 2970,
    phoneNumber: '09011110002',
    last4: '0002',
    contractHolder: '山田 太郎',
    serviceUser: '本人',
    paymentMethod: 'クレジットカード',
    planName: 'ahamo 20GB',
    deviceName: 'Pixel 9',
    contractStartDate: '2023-06-15',
    status: '利用中',
    memo: '仕事用。',
    nextReviewDate: daysFromNow(3),  // 3日以内
    createdAt: '2023-06-15T10:00:00.000Z',
  }),

  // [3] データ SIM（IIJmio）- 7日以内
  draft({
    id: 'd-003',
    lineName: 'タブレット用データ（本人）',
    carrier: 'IIJmio',
    lineType: 'データSIM',
    monthlyCost: 880,
    phoneNumber: '09011110003',
    last4: '0003',
    contractHolder: '山田 太郎',
    serviceUser: '本人',
    paymentMethod: 'クレジットカード',
    planName: '2ギガプラン',
    deviceName: 'iPad Pro',
    contractStartDate: '2023-09-01',
    contractEndDate: '2026-08-31',
    status: '利用中',
    memo: '更新月（2026-08）に解約を検討。',
    nextReviewDate: daysFromNow(6),  // 7日以内
    createdAt: '2023-09-01T10:00:00.000Z',
  }),

  // [4] ホームルーター（楽天モバイル）- 30日以内
  draft({
    id: 'd-004',
    lineName: 'ホームルーター（本人）',
    carrier: '楽天モバイル',
    lineType: 'ホームルーター',
    monthlyCost: 3278,
    phoneNumber: '09011110004',
    last4: '0004',
    contractHolder: '山田 太郎',
    serviceUser: '本人',
    paymentMethod: 'クレジットカード',
    planName: 'Rakuten最強プラン',
    deviceName: 'Rakuten Turbo 5G',
    contractStartDate: '2023-04-01',
    status: '利用中',
    memo: '',
    nextReviewDate: daysFromNow(20),  // 20日後（30日以内）
    createdAt: '2023-04-01T10:00:00.000Z',
  }),

  // [5] 光回線（NTT フレッツ）- 30日以内・契約終了近い
  draft({
    id: 'd-005',
    lineName: '光回線（本人）',
    carrier: 'その他',
    lineType: '光回線',
    monthlyCost: 5500,
    phoneNumber: '',
    last4: '',
    contractHolder: '山田 太郎',
    serviceUser: '本人',
    paymentMethod: '口座振替',
    planName: 'フレッツ光ネクスト ファミリー・スーパーハイスピードタイプ 隼',
    deviceName: 'ONU: PR-500KI',
    contractStartDate: '2020-01-10',
    contractEndDate: daysFromNow(18),  // 18日後に契約終了（アラート対象）
    status: '利用中',
    memo: '2026-04月に更新か乗り換え要検討。',
    nextReviewDate: daysFromNow(15),
    createdAt: '2020-01-10T10:00:00.000Z',
  }),

  // [6] 解約予定（povo）
  draft({
    id: 'd-006',
    lineName: '旧サブ音声（本人 povo）',
    carrier: 'povo',
    lineType: '音声SIM',
    monthlyCost: 0,
    phoneNumber: '09011110006',
    last4: '0006',
    contractHolder: '山田 太郎',
    serviceUser: '本人',
    paymentMethod: 'クレジットカード',
    planName: 'povo2.0（基本プラン0円）',
    deviceName: '',
    contractStartDate: '2022-10-01',
    status: '解約予定',
    memo: 'MNP予約番号取得済み。2026-04に転出予定。',
    nextReviewDate: daysFromNow(5),
    createdAt: '2022-10-01T10:00:00.000Z',
  }),

  // [7] MNP転出済み（旧ソフトバンク）
  draft({
    id: 'd-007',
    lineName: '旧メイン音声（本人 SoftBank）',
    carrier: 'ソフトバンク',
    lineType: '音声SIM',
    monthlyCost: null,
    phoneNumber: '09011110007',
    last4: '0007',
    contractHolder: '山田 太郎',
    serviceUser: '本人',
    paymentMethod: 'クレジットカード',
    planName: 'ワイモバイル Sプラン（旧）',
    deviceName: '',
    contractStartDate: '2018-05-01',
    contractEndDate: '2022-03-31',
    status: 'MNP転出済み',
    memo: 'NTTドコモ（d-001）へ MNP 転出済み。',
    nextReviewDate: '',
    createdAt: '2020-01-01T00:00:00.000Z',
  }),

  // ============================================================
  // 【配偶者】山田 花子  電話番号: 090-2222-xxxx 系
  // ============================================================

  // [8] メイン音声（au）- 今日期限
  draft({
    id: 'd-008',
    lineName: 'メイン音声（配偶者）',
    carrier: 'au',
    lineType: '音声SIM',
    monthlyCost: 4928,
    phoneNumber: '09022220001',
    last4: '0001',
    contractHolder: '山田 太郎',
    serviceUser: '配偶者',
    paymentMethod: '家族合算',
    planName: 'スマートバリュー / 使い放題MAX 5G ALL STAR',
    deviceName: 'Galaxy S25',
    contractHolderNote: '夫名義',
    contractStartDate: '2021-01-15',
    status: '利用中',
    memo: '',
    nextReviewDate: daysFromNow(0),  // 今日期限
    createdAt: '2021-01-15T10:00:00.000Z',
  }),

  // [9] データ SIM（UQ mobile）
  draft({
    id: 'd-009',
    lineName: 'ウォッチ用（配偶者）',
    carrier: 'UQ mobile',
    lineType: 'データSIM',
    monthlyCost: 550,
    phoneNumber: '09022220002',
    last4: '0002',
    contractHolder: '山田 太郎',
    serviceUser: '配偶者',
    paymentMethod: '家族合算',
    planName: 'コミコミプラン（ウォッチ）',
    deviceName: 'Apple Watch Ultra 2',
    contractStartDate: '2024-02-01',
    status: '利用中',
    memo: '',
    nextReviewDate: daysFromNow(45),
    createdAt: '2024-02-01T10:00:00.000Z',
  }),

  // [10] 解約済み（旧 Y!mobile）
  draft({
    id: 'd-010',
    lineName: '旧音声（配偶者 Y!mobile）',
    carrier: 'Y!mobile',
    lineType: '音声SIM',
    monthlyCost: null,
    phoneNumber: '09022220003',
    last4: '0003',
    contractHolder: '山田 太郎',
    serviceUser: '配偶者',
    paymentMethod: 'クレジットカード',
    planName: 'シンプルS（旧）',
    deviceName: '',
    contractStartDate: '2019-03-01',
    contractEndDate: '2021-01-14',
    status: '解約済み',
    memo: 'au（d-008）へ番号移行（同番）で解約。',
    nextReviewDate: '',
    createdAt: '2019-03-01T00:00:00.000Z',
  }),

  // ============================================================
  // 【子1】山田 一郎（高校生）  電話番号: 090-3333-xxxx 系
  // ============================================================

  // [11] メイン音声（LINEMO）- 長期未活動対象
  draft({
    id: 'd-011',
    lineName: 'メイン音声（子1）',
    carrier: 'LINEMO',
    lineType: '音声SIM',
    monthlyCost: 990,
    phoneNumber: '09033330001',
    last4: '0001',
    contractHolder: '山田 太郎',
    serviceUser: '子1',
    paymentMethod: 'クレジットカード',
    planName: 'ミニプラン 3GB',
    deviceName: 'iPhone SE 第3世代',
    contractHolderNote: '親名義',
    contractStartDate: '2023-04-01',
    status: '利用中',
    memo: '高校入学時に開通。',
    nextReviewDate: daysFromNow(60),
    createdAt: '2023-04-01T10:00:00.000Z',
  }),

  // [12] データ SIM（mineo）
  draft({
    id: 'd-012',
    lineName: 'ゲーム機用データ（子1）',
    carrier: 'mineo',
    lineType: 'データSIM',
    monthlyCost: 250,
    phoneNumber: '',
    last4: '3312',
    contractHolder: '山田 太郎',
    serviceUser: '子1',
    paymentMethod: 'クレジットカード',
    planName: 'マイそくスーパーライト',
    deviceName: 'Nintendo Switch',
    contractStartDate: '2024-01-01',
    status: '利用中',
    memo: 'ゲーム用低速 SIM。解約検討中。',
    nextReviewDate: daysFromNow(14),
    createdAt: '2024-01-01T10:00:00.000Z',
  }),

  // [13] MNP転出済み（旧 irumo）
  draft({
    id: 'd-013',
    lineName: '旧音声（子1 irumo）',
    carrier: 'irumo',
    lineType: '音声SIM',
    monthlyCost: null,
    phoneNumber: '09033330001',
    last4: '0001',
    contractHolder: '山田 太郎',
    serviceUser: '子1',
    paymentMethod: 'クレジットカード',
    planName: 'irumo 3GB',
    deviceName: '',
    contractStartDate: '2022-04-01',
    contractEndDate: '2023-03-31',
    status: 'MNP転出済み',
    memo: 'LINEMO（d-011）へ MNP 転出済み。',
    nextReviewDate: '',
    createdAt: '2022-04-01T00:00:00.000Z',
  }),

  // ============================================================
  // 【子2】山田 二郎（中学生）  電話番号: 090-4444-xxxx 系
  // ============================================================

  // [14] メイン音声（NUROモバイル）
  draft({
    id: 'd-014',
    lineName: 'メイン音声（子2）',
    carrier: 'NUROモバイル',
    lineType: '音声SIM',
    monthlyCost: 792,
    phoneNumber: '09044440001',
    last4: '0001',
    contractHolder: '山田 太郎',
    serviceUser: '子2',
    paymentMethod: 'クレジットカード',
    planName: 'バリュープラス 3GB',
    deviceName: 'OPPO A79 5G',
    contractHolderNote: '親名義',
    contractStartDate: '2024-04-01',
    status: '利用中',
    memo: '中学入学時に開通。月額管理要。',
    nextReviewDate: daysFromNow(30),  // 30日後（ちょうど境界）
    createdAt: '2024-04-01T10:00:00.000Z',
  }),

  // [15] タブレット用（楽天モバイル）- 長期未活動対象（活動ログ 100日前）
  draft({
    id: 'd-015',
    lineName: 'タブレット用（子2）',
    carrier: '楽天モバイル',
    lineType: 'データSIM',
    monthlyCost: 1078,
    phoneNumber: '09044440002',
    last4: '0002',
    contractHolder: '山田 太郎',
    serviceUser: '子2',
    paymentMethod: 'クレジットカード',
    planName: 'Rakuten最強プラン（データのみ）',
    deviceName: 'Fire HD 10',
    contractStartDate: '2024-04-01',
    status: '利用中',
    memo: '学習タブレット用。',
    nextReviewDate: daysFromNow(90),
    createdAt: '2024-04-01T10:00:00.000Z',
  }),

  // ============================================================
  // 【本人追加】法人・その他系
  // ============================================================

  // [16] 法人用音声（ドコモ）- 次回確認1日後
  draft({
    id: 'd-016',
    lineName: '法人用メイン音声',
    carrier: 'NTTドコモ',
    lineType: '音声SIM',
    monthlyCost: 5280,
    phoneNumber: '09011110016',
    last4: '0016',
    contractHolder: '株式会社サンプル',
    serviceUser: '本人',
    paymentMethod: '請求書',
    planName: 'ビジネス5Gプラス / かけ放題',
    deviceName: 'iPhone 16',
    contractHolderNote: '法人名義（本人が実使用）',
    contractStartDate: '2021-10-01',
    status: '利用中',
    memo: '会社契約。経費精算あり。',
    nextReviewDate: daysFromNow(1),  // 1日後（7日以内）
    createdAt: '2021-10-01T10:00:00.000Z',
  }),

  // [17] 法人用データ（SoftBank）- 解約予定・契約終了間近（アラート対象）
  draft({
    id: 'd-017',
    lineName: '法人用データ回線',
    carrier: 'ソフトバンク',
    lineType: 'データSIM',
    monthlyCost: 1650,
    phoneNumber: '09011110017',
    last4: '0017',
    contractHolder: '株式会社サンプル',
    serviceUser: '本人',
    paymentMethod: '請求書',
    planName: 'メリハリ無制限+（データ専用）',
    deviceName: 'モバイルWi-Fi',
    contractStartDate: '2022-04-01',
    contractEndDate: daysFromNow(10),  // 10日後に契約終了（アラート対象）
    status: '解約予定',
    memo: '2026-04 解約手続き済み。',
    nextReviewDate: daysFromNow(8),
    createdAt: '2022-04-01T10:00:00.000Z',
  }),

  // [18] 本人旧回線（au → UQ mobile 番号移行）
  draft({
    id: 'd-018',
    lineName: '旧音声（本人 au）',
    carrier: 'au',
    lineType: '音声SIM',
    monthlyCost: null,
    phoneNumber: '09011110018',
    last4: '0018',
    contractHolder: '山田 太郎',
    serviceUser: '本人',
    paymentMethod: 'クレジットカード',
    planName: 'au フラットプラン25 Netto（旧）',
    deviceName: '',
    contractStartDate: '2016-08-01',
    contractEndDate: '2023-05-31',
    status: 'MNP転出済み',
    memo: 'ahamo（d-002）へ MNP 転出済み。',
    nextReviewDate: '',
    createdAt: '2016-08-01T00:00:00.000Z',
  }),

  // [19] 本人旧回線（ドコモ → ahamo 切替元）
  draft({
    id: 'd-019',
    lineName: '旧サブ音声（本人 旧ドコモ）',
    carrier: 'NTTドコモ',
    lineType: '音声SIM',
    monthlyCost: null,
    phoneNumber: '09011110002',
    last4: '0002',
    contractHolder: '山田 太郎',
    serviceUser: '本人',
    paymentMethod: 'クレジットカード',
    planName: 'ギガライト（旧）',
    deviceName: '',
    contractStartDate: '2019-10-01',
    contractEndDate: '2023-06-14',
    status: '解約済み',
    memo: 'ahamo（d-002）開通に伴い解約。同番号継続ではなく別番号取得。',
    nextReviewDate: '',
    createdAt: '2019-10-01T00:00:00.000Z',
  }),

  // [20] 配偶者 旧回線（楽天モバイル）- 長期未活動で解約済み
  draft({
    id: 'd-020',
    lineName: '旧データ（配偶者 楽天）',
    carrier: '楽天モバイル',
    lineType: 'データSIM',
    monthlyCost: null,
    phoneNumber: '09022220010',
    last4: '0010',
    contractHolder: '山田 太郎',
    serviceUser: '配偶者',
    paymentMethod: 'クレジットカード',
    planName: 'Rakutenアンリミット（旧）',
    deviceName: '',
    contractStartDate: '2021-04-01',
    contractEndDate: '2022-09-30',
    status: '解約済み',
    memo: '無料期間終了に伴い解約。',
    nextReviewDate: '',
    createdAt: '2021-04-01T00:00:00.000Z',
  }),

  // [21] ウォッチ用（本人 - Apple Watch）
  draft({
    id: 'd-021',
    lineName: 'ウォッチ用（本人）',
    carrier: 'NTTドコモ',
    lineType: 'データSIM',
    monthlyCost: 550,
    phoneNumber: '',
    last4: '0021',
    contractHolder: '山田 太郎',
    serviceUser: '本人',
    paymentMethod: 'クレジットカード',
    planName: 'ワンナンバーサービス',
    deviceName: 'Apple Watch Series 10',
    contractStartDate: '2024-09-20',
    status: '利用中',
    memo: 'iPhoneと同番号で共有。',
    nextReviewDate: daysFromNow(180),
    createdAt: '2024-09-20T10:00:00.000Z',
  }),

  // [22] ルーター（本人 - 外出用）
  draft({
    id: 'd-022',
    lineName: '外出用モバイルルーター',
    carrier: 'NUROモバイル',
    lineType: 'ホームルーター',
    monthlyCost: 1320,
    phoneNumber: '',
    last4: '0022',
    contractHolder: '山田 太郎',
    serviceUser: '本人',
    paymentMethod: 'クレジットカード',
    planName: 'NEOプランS 20GB',
    deviceName: 'Speed Wi-Fi 5G X12',
    contractStartDate: '2023-12-01',
    status: '利用中',
    memo: '出張時に活用。',
    nextReviewDate: daysFromNow(50),
    createdAt: '2023-12-01T10:00:00.000Z',
  }),

  // [23] 子1の旧旧回線（MNP前の最初の回線）
  draft({
    id: 'd-023',
    lineName: '旧旧音声（子1 格安SIM初代）',
    carrier: 'その他',
    lineType: '音声SIM',
    monthlyCost: null,
    phoneNumber: '09033330001',
    last4: '0001',
    contractHolder: '山田 太郎',
    serviceUser: '子1',
    paymentMethod: 'クレジットカード',
    planName: '日本通信SIM（旧）',
    deviceName: '',
    contractStartDate: '2020-04-01',
    contractEndDate: '2022-03-31',
    status: 'MNP転出済み',
    memo: 'irumo（d-013）へ MNP 転出済み。',
    nextReviewDate: '',
    createdAt: '2020-04-01T00:00:00.000Z',
  }),

  // [24] 未分類（詳細不明回線）
  draft({
    id: 'd-024',
    lineName: '詳細不明回線（要確認）',
    carrier: 'その他',
    lineType: '未分類',
    monthlyCost: null,
    phoneNumber: '',
    last4: '9999',
    contractHolder: '山田 太郎',
    serviceUser: '不明',
    paymentMethod: 'その他',
    planName: '',
    deviceName: '',
    contractStartDate: '',
    status: '利用中',
    memo: '引き落とし明細で発見。詳細を要確認。',
    nextReviewDate: daysFromNow(-10),  // 期限超過（10日前）- 要確認
    createdAt: '2026-01-01T10:00:00.000Z',
  }),

  // [25] 本人追加（楽天モバイル 音声 - 長期未活動）
  draft({
    id: 'd-025',
    lineName: '楽天音声（本人 サブ）',
    carrier: '楽天モバイル',
    lineType: '音声SIM',
    monthlyCost: 1078,
    phoneNumber: '09011110025',
    last4: '0025',
    contractHolder: '山田 太郎',
    serviceUser: '本人',
    paymentMethod: 'クレジットカード',
    planName: 'Rakuten最強プラン',
    deviceName: 'Rakuten Hand 5G',
    contractStartDate: '2021-04-01',
    status: '利用中',
    memo: '楽天経済圏のため維持。ほぼ未使用。',
    nextReviewDate: daysFromNow(25),
    createdAt: '2021-04-01T10:00:00.000Z',
  }),
];

// ─── 契約履歴（36件） ─────────────────────────────────────────────
const lineHistoryEntries = [

  // ============================================================
  // 090-1111-0001（本人メイン）
  // 遍歴: 日本通信SIM → ソフトバンク → NTTドコモ（現在）
  // ============================================================
  histEntry({
    id: 'h-001',
    phoneNumber: '09011110001',
    carrier: '日本通信SIM',
    status: 'MNP転出済み',
    contractStartDate: '2014-06-01',
    contractEndDate: '2018-04-30',
    activityLogs: [
      log('l-001-a', '2018-04-20', 'その他', 'MNP予約番号取得。ソフトバンクへ転出準備。'),
    ],
    memo: '最初のスマートフォン回線。ソフトバンクへ MNP 転出。',
    createdAt: '2020-01-01T00:00:00.000Z',
  }),

  histEntry({
    id: 'h-002',
    phoneNumber: '09011110001',
    carrier: 'ソフトバンク',
    status: 'MNP転出済み',
    contractStartDate: '2018-05-01',
    contractEndDate: '2022-03-31',
    activityLogs: [
      log('l-002-a', '2021-06-01', '料金確認', '請求明細確認。月額 7,920円。'),
      log('l-002-b', '2022-02-15', 'その他', 'MNP予約番号取得。ドコモへ転出準備完了。'),
      log('l-002-c', '2022-03-20', '通話実施', '最終通話テスト実施。正常。'),
    ],
    memo: 'iPhone 8 → iPhone 13 Pro と機種変更。ドコモへ MNP 転出。',
    createdAt: '2020-01-01T00:00:00.000Z',
  }),

  histEntry({
    id: 'h-003',
    phoneNumber: '09011110001',
    carrier: 'NTTドコモ',
    status: '利用中',
    contractStartDate: '2022-04-01',
    contractEndDate: '',
    activityLogs: [
      log('l-003-a', '2024-04-01', '料金確認', '請求明細確認。eximo 割引適用中。月額 3,278円。'),
      log('l-003-b', '2025-04-01', '利用実績確認', '通信速度テスト。下り 320Mbps。正常。'),
      log('l-003-c', '2025-12-01', '料金確認', '年末請求確認。月額変動なし。'),
      log('l-003-d', '2026-03-01', '料金確認', '請求明細確認。特典期間（〜2026-06）継続中。'),
    ],
    memo: 'iPhone 14 Pro → iPhone 16 Pro へ機種変更済み。',
    createdAt: '2022-04-01T09:00:00.000Z',
  }),

  // ============================================================
  // 090-1111-0002（本人サブ ahamo）
  // 遍歴: NTTドコモ旧 → ahamo（同社内ブランド変更＋番号変更）
  // ============================================================
  histEntry({
    id: 'h-004',
    phoneNumber: '09011110002',
    carrier: 'NTTドコモ',
    status: '解約済み',
    contractStartDate: '2019-10-01',
    contractEndDate: '2023-06-14',
    activityLogs: [
      log('l-004-a', '2022-01-01', '料金確認', 'ギガライト 月額確認。'),
      log('l-004-b', '2023-05-01', 'その他', 'ahamo に切替予定。番号は変更。'),
    ],
    memo: '仕事用サブ回線。ahamo 開通（新規番号）に伴い解約。',
    createdAt: '2019-10-01T00:00:00.000Z',
  }),

  histEntry({
    id: 'h-005',
    phoneNumber: '09011110002',
    carrier: 'ahamo',
    status: '利用中',
    contractStartDate: '2023-06-15',
    contractEndDate: '',
    activityLogs: [
      log('l-005-a', '2023-07-01', '通信実施', '通信速度テスト。下り 180Mbps。'),
      log('l-005-b', '2024-01-15', '料金確認', '請求確認。月額 2,970円。大盛りオプションなし。'),
      log('l-005-c', '2025-04-01', '利用実績確認', '発信テスト・通信テスト実施。正常。'),
      log('l-005-d', '2026-02-20', '料金確認', '請求確認。月額変動なし。'),
    ],
    memo: '仕事用。月 20GB 超過月あり。大盛りオプション検討。',
    createdAt: '2023-06-15T10:00:00.000Z',
  }),

  // ============================================================
  // 090-1111-0003（本人タブレット IIJmio）
  // ============================================================
  histEntry({
    id: 'h-006',
    phoneNumber: '09011110003',
    carrier: 'IIJmio',
    status: '利用中',
    contractStartDate: '2023-09-01',
    contractEndDate: '2026-08-31',
    activityLogs: [
      log('l-006-a', '2024-03-01', '通信実施', 'iPad Pro にて通信テスト実施。正常。'),
      log('l-006-b', '2025-09-01', '利用実績確認', '1周年確認。速度・容量問題なし。'),
      log('l-006-c', '2026-02-10', '料金確認', '月次請求確認。880円/月。'),
    ],
    memo: '2ギガで十分。更新月（2026-08）に解約か乗り換えを検討。',
    createdAt: '2023-09-01T10:00:00.000Z',
  }),

  // ============================================================
  // 090-2222-0001（配偶者 au）
  // 遍歴: Y!mobile → au（同番号移行）
  // ============================================================
  histEntry({
    id: 'h-007',
    phoneNumber: '09022220001',
    carrier: 'Y!mobile',
    status: '解約済み',
    contractStartDate: '2019-03-01',
    contractEndDate: '2021-01-14',
    activityLogs: [
      log('l-007-a', '2020-06-01', '利用実績確認', '通話テスト実施。正常。'),
      log('l-007-b', '2021-01-05', 'その他', 'au へ同番号で移行手続き完了。'),
    ],
    memo: 'Y!mobile シンプルS。au へ番号移行（MNP）。',
    createdAt: '2019-03-01T00:00:00.000Z',
  }),

  histEntry({
    id: 'h-008',
    phoneNumber: '09022220001',
    carrier: 'au',
    status: '利用中',
    contractStartDate: '2021-01-15',
    contractEndDate: '',
    activityLogs: [
      log('l-008-a', '2022-04-01', '料金確認', 'スマートバリュー割引確認。月額 4,928円。'),
      log('l-008-b', '2023-06-15', '機種変更', 'Galaxy S23 → Galaxy S25 に機種変更。', ),
      log('l-008-c', '2024-04-01', '料金確認', '年次確認。月額変動なし。'),
      log('l-008-d', '2025-07-10', '利用実績確認', '通話・通信テスト実施。正常。'),
      log('l-008-e', daysFromNow(-95), '料金確認', '請求確認。（最終確認）'),  // 長期未活動の基点
    ],
    memo: 'au スマートバリュー適用中。光回線（d-005）とセット割引あり。',
    createdAt: '2021-01-15T10:00:00.000Z',
  }),

  // ============================================================
  // 090-3333-0001（子1）
  // 遍歴: 日本通信SIM → irumo → LINEMO（現在）
  // ============================================================
  histEntry({
    id: 'h-009',
    phoneNumber: '09033330001',
    carrier: 'その他（日本通信SIM）',
    status: 'MNP転出済み',
    contractStartDate: '2020-04-01',
    contractEndDate: '2022-03-31',
    activityLogs: [
      log('l-009-a', '2021-04-01', '利用実績確認', '通信テスト実施。正常。'),
      log('l-009-b', '2022-03-01', 'その他', 'MNP予約番号取得。irumo へ転出予定。'),
    ],
    memo: '子1の初回線。日本通信 SIM → irumo へ MNP。',
    createdAt: '2020-04-01T00:00:00.000Z',
  }),

  histEntry({
    id: 'h-010',
    phoneNumber: '09033330001',
    carrier: 'irumo',
    status: 'MNP転出済み',
    contractStartDate: '2022-04-01',
    contractEndDate: '2023-03-31',
    activityLogs: [
      log('l-010-a', '2022-05-01', '通信実施', '通信テスト実施。速度良好。'),
      log('l-010-b', '2022-10-01', '料金確認', '月次確認。irumo 3GB 月額変動なし。'),
      log('l-010-c', '2023-02-15', 'その他', 'LINEMO へ MNP 転出予定。予約番号取得。'),
    ],
    memo: 'irumo 3GB 利用。LINEMO へ MNP 転出。',
    createdAt: '2022-04-01T00:00:00.000Z',
  }),

  histEntry({
    id: 'h-011',
    phoneNumber: '09033330001',
    carrier: 'LINEMO',
    status: '利用中',
    contractStartDate: '2023-04-01',
    contractEndDate: '',
    activityLogs: [
      log('l-011-a', '2023-05-01', '通信実施', '通信テスト実施。LINEギガフリー確認済み。'),
      log('l-011-b', '2024-04-01', '利用実績確認', '1周年確認。速度・容量問題なし。'),
      log('l-011-c', daysFromNow(-120), '料金確認', '月次請求確認。（最終確認）'),  // 長期未活動の基点（120日前）
    ],
    memo: '高校生。LINEギガフリーあり。月 3GB で足りている様子。',
    createdAt: '2023-04-01T10:00:00.000Z',
  }),

  // ============================================================
  // 090-4444-0001（子2 NUROモバイル）
  // ============================================================
  histEntry({
    id: 'h-012',
    phoneNumber: '09044440001',
    carrier: 'NUROモバイル',
    status: '利用中',
    contractStartDate: '2024-04-01',
    contractEndDate: '',
    activityLogs: [
      log('l-012-a', '2024-05-01', '通信実施', '通信テスト実施。正常。'),
      log('l-012-b', '2024-10-01', '料金確認', '月次確認。792円/月。'),
      log('l-012-c', '2025-04-01', '利用実績確認', '1周年確認。速度・容量問題なし。'),
      log('l-012-d', '2026-01-15', '料金確認', '請求確認。月額変動なし。'),
    ],
    memo: '中学生。3GB で不足気味。プランアップ検討。',
    createdAt: '2024-04-01T10:00:00.000Z',
  }),

  // ============================================================
  // 090-4444-0002（子2 楽天モバイル タブレット）- 長期未活動
  // ============================================================
  histEntry({
    id: 'h-013',
    phoneNumber: '09044440002',
    carrier: '楽天モバイル',
    status: '利用中',
    contractStartDate: '2024-04-01',
    contractEndDate: '',
    activityLogs: [
      log('l-013-a', '2024-05-01', '通信実施', '通信テスト実施。正常。'),
      log('l-013-b', daysFromNow(-100), '料金確認', '月次確認。（最終確認）'),  // 長期未活動（100日前）
    ],
    memo: '子2の学習タブレット用。定期確認が漏れがち。',
    createdAt: '2024-04-01T10:00:00.000Z',
  }),

  // ============================================================
  // 090-1111-0006（本人 旧povo）
  // ============================================================
  histEntry({
    id: 'h-014',
    phoneNumber: '09011110006',
    carrier: 'povo',
    status: '解約予定',
    contractStartDate: '2022-10-01',
    contractEndDate: '',
    activityLogs: [
      log('l-014-a', '2022-11-01', '通信実施', 'トッピング「1GB 3日間」でテスト利用。'),
      log('l-014-b', '2023-06-01', 'SMS送信', 'SMS 送受信テスト実施。正常。'),
      log('l-014-c', '2024-04-01', '利用実績確認', '半年ごと通話テスト。正常。'),
      log('l-014-d', '2025-10-01', '通話実施', '180日以内通話テスト実施。'),
      log('l-014-e', '2026-03-01', 'その他', 'MNP予約番号取得。2026-04 に転出予定。'),
    ],
    memo: 'povo2.0 基本プラン（0円）。維持目的。2026-04 に別回線へ転出予定。',
    createdAt: '2022-10-01T10:00:00.000Z',
  }),

  // ============================================================
  // 090-1111-0007（本人旧 SoftBank → ドコモ d-001 の前身）
  // ============================================================
  histEntry({
    id: 'h-015',
    phoneNumber: '09011110007',
    carrier: 'ソフトバンク',
    status: 'MNP転出済み',
    contractStartDate: '2018-05-01',
    contractEndDate: '2022-03-31',
    activityLogs: [
      log('l-015-a', '2020-01-01', '料金確認', '月次確認。月額 8,250円（旧プラン）。'),
      log('l-015-b', '2022-03-01', 'その他', 'ドコモへ MNP 転出手続き完了。'),
    ],
    memo: 'd-001 の前身。当時は主回線として利用。ドコモへ MNP。',
    createdAt: '2020-01-01T00:00:00.000Z',
  }),

  // ============================================================
  // 090-1111-0016（本人 法人用）
  // ============================================================
  histEntry({
    id: 'h-016',
    phoneNumber: '09011110016',
    carrier: 'NTTドコモ',
    status: '利用中',
    contractStartDate: '2021-10-01',
    contractEndDate: '',
    activityLogs: [
      log('l-016-a', '2022-04-01', '料金確認', '法人請求確認。月額 5,280円。'),
      log('l-016-b', '2023-04-01', '料金確認', '年次確認。月額変動なし。'),
      log('l-016-c', '2024-04-01', '料金確認', '年次確認。プラン継続。'),
      log('l-016-d', '2025-04-01', '利用実績確認', '通信・通話テスト実施。正常。'),
      log('l-016-e', '2026-02-01', '料金確認', '法人請求確認。月額変動なし。'),
    ],
    memo: '会社名義。経費精算あり。次回確認で法人側との更新有無確認要。',
    createdAt: '2021-10-01T10:00:00.000Z',
  }),

  // ============================================================
  // 090-1111-0017（法人用データ - 解約予定）
  // ============================================================
  histEntry({
    id: 'h-017',
    phoneNumber: '09011110017',
    carrier: 'ソフトバンク',
    status: '解約予定',
    contractStartDate: '2022-04-01',
    contractEndDate: daysFromNow(10),
    activityLogs: [
      log('l-017-a', '2023-04-01', '料金確認', '法人請求確認。月額 1,650円。'),
      log('l-017-b', '2024-04-01', '料金確認', '年次確認。'),
      log('l-017-c', '2026-02-01', 'その他', '解約手続き完了。2026-04上旬に終了予定。'),
    ],
    memo: '法人用モバイルWi-Fi。解約手続き済み。返却要。',
    createdAt: '2022-04-01T10:00:00.000Z',
  }),

  // ============================================================
  // 090-1111-0018（本人旧 au → ahamo の前の別番号）
  // ============================================================
  histEntry({
    id: 'h-018',
    phoneNumber: '09011110018',
    carrier: 'au',
    status: 'MNP転出済み',
    contractStartDate: '2016-08-01',
    contractEndDate: '2023-05-31',
    activityLogs: [
      log('l-018-a', '2020-04-01', '料金確認', '月次確認。'),
      log('l-018-b', '2022-06-01', '利用実績確認', '通信テスト実施。'),
      log('l-018-c', '2023-04-15', 'その他', 'ahamo へ MNP 転出手続き。'),
    ],
    memo: '長期au利用。ahamo（d-002）の前身。MNP 転出済み。',
    createdAt: '2016-08-01T00:00:00.000Z',
  }),

  // ============================================================
  // 090-1111-0025（本人 楽天 サブ - 長期未活動）
  // ============================================================
  histEntry({
    id: 'h-019',
    phoneNumber: '09011110025',
    carrier: '楽天モバイル',
    status: '利用中',
    contractStartDate: '2021-04-01',
    contractEndDate: '',
    activityLogs: [
      log('l-019-a', '2021-05-01', '通信実施', '通信テスト実施。正常。'),
      log('l-019-b', '2022-04-01', '料金確認', '1周年確認。月額 1,078円。'),
      log('l-019-c', '2023-04-01', '利用実績確認', '通話テスト。正常。'),
      log('l-019-d', daysFromNow(-110), '料金確認', '月次確認。（最終確認）'),  // 長期未活動（110日前）
    ],
    memo: '楽天ポイント獲得目的で維持。ほぼ未使用。解約検討中。',
    createdAt: '2021-04-01T10:00:00.000Z',
  }),

  // ============================================================
  // 090-2222-0010（配偶者 楽天 解約済み）
  // ============================================================
  histEntry({
    id: 'h-020',
    phoneNumber: '09022220010',
    carrier: '楽天モバイル',
    status: '解約済み',
    contractStartDate: '2021-04-01',
    contractEndDate: '2022-09-30',
    activityLogs: [
      log('l-020-a', '2021-06-01', '通信実施', 'テスト利用。速度良好。'),
      log('l-020-b', '2022-08-01', 'その他', '無料期間終了予告確認。解約決定。'),
    ],
    memo: '楽天モバイル無料期間後、費用対効果が低いため解約。',
    createdAt: '2021-04-01T00:00:00.000Z',
  }),

  // ============================================================
  // 090-2222-0002（配偶者 UQ watch）
  // ============================================================
  histEntry({
    id: 'h-021',
    phoneNumber: '09022220002',
    carrier: 'UQ mobile',
    status: '利用中',
    contractStartDate: '2024-02-01',
    contractEndDate: '',
    activityLogs: [
      log('l-021-a', '2024-03-01', '通信実施', 'ウォッチ単体通信テスト実施。正常。'),
      log('l-021-b', '2025-02-01', '利用実績確認', '1周年確認。問題なし。'),
      log('l-021-c', '2026-01-10', '料金確認', '請求確認。550円/月。'),
    ],
    memo: 'Apple Watch Ultra 2 用。au回線（d-008）とセット割引適用。',
    createdAt: '2024-02-01T10:00:00.000Z',
  }),

  // ============================================================
  // 090-3333-0001 の下4桁マッチ確認用（d-012 last4=3312）
  // ============================================================
  histEntry({
    id: 'h-022',
    phoneNumber: '09033333312',
    carrier: 'mineo',
    status: '利用中',
    contractStartDate: '2024-01-01',
    contractEndDate: '',
    activityLogs: [
      log('l-022-a', '2024-02-01', '通信実施', '通信テスト実施。低速安定。'),
      log('l-022-b', '2025-01-01', '利用実績確認', '1周年確認。マイそくスーパーライト問題なし。'),
      log('l-022-c', '2026-01-01', '料金確認', '請求確認。250円/月。'),
    ],
    memo: 'ゲーム機（Switch）のオンライン維持用。低速でも支障なし。',
    createdAt: '2024-01-01T10:00:00.000Z',
  }),

  // ============================================================
  // その他・追加履歴
  // ============================================================

  // NTTドコモ法人用ウォッチ（d-021 対応）
  histEntry({
    id: 'h-023',
    phoneNumber: '09011110021',
    carrier: 'NTTドコモ',
    status: '利用中',
    contractStartDate: '2024-09-20',
    contractEndDate: '',
    activityLogs: [
      log('l-023-a', '2024-10-01', '通信実施', 'Apple Watch 単体通信テスト。正常。'),
      log('l-023-b', '2025-09-20', '利用実績確認', '1周年確認。問題なし。'),
      log('l-023-c', '2026-03-01', '料金確認', '請求確認。550円/月（ワンナンバー）。'),
    ],
    memo: 'iPhoneと同番号シェア。ワンナンバーサービス。',
    createdAt: '2024-09-20T10:00:00.000Z',
  }),

  // NUROモバイル モバイルルーター（d-022）
  histEntry({
    id: 'h-024',
    phoneNumber: '09011110022',
    carrier: 'NUROモバイル',
    status: '利用中',
    contractStartDate: '2023-12-01',
    contractEndDate: '',
    activityLogs: [
      log('l-024-a', '2024-01-15', '通信実施', '外出先での通信テスト。下り 120Mbps。'),
      log('l-024-b', '2024-12-01', '利用実績確認', '1周年確認。容量 20GB で余裕あり。'),
      log('l-024-c', '2026-01-10', '料金確認', '月次確認。1,320円/月。'),
    ],
    memo: '出張時メイン。20GB で足りている。',
    createdAt: '2023-12-01T10:00:00.000Z',
  }),

  // povo → 新回線への転出先（将来的な記録例）
  histEntry({
    id: 'h-025',
    phoneNumber: '09011110006',
    carrier: 'povo',
    status: '解約予定',
    contractStartDate: '2022-10-01',
    contractEndDate: daysFromNow(5),
    activityLogs: [
      log('l-025-a', '2026-03-25', 'その他', 'MNP 転出先確定。手数料無料確認。'),
    ],
    memo: '2026-04 に転出確定。ポータビリティ番号は 09011110006 のまま。',
    createdAt: '2026-03-01T00:00:00.000Z',
  }),
];

// ─── 統合バックアップ形式にまとめる ─────────────────────────────
const backup = {
  exportedAt: NOW,
  version: 1,
  lineDrafts: {
    schemaVersion: 4,
    updatedAt: NOW,
    items: lineDraftItems,
  },
  lineHistory: lineHistoryEntries,
};

require('fs').writeFileSync('test-data.json', JSON.stringify(backup, null, 2), 'utf8');

const uniquePhones = new Set(lineHistoryEntries.map(e => e.phoneNumber));
console.log('lineDrafts:', lineDraftItems.length, '件');
console.log('lineHistory entries:', lineHistoryEntries.length, '件');
console.log('電話番号ユニーク数:', uniquePhones.size, '番号');
console.log('活動ログ総数:', lineHistoryEntries.reduce((s, e) => s + e.activityLogs.length, 0), '件');

const statusCounts = {};
for (const d of lineDraftItems) {
  statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
}
console.log('ステータス内訳:', statusCounts);

const carrierCounts = {};
for (const d of lineDraftItems) {
  carrierCounts[d.carrier] = (carrierCounts[d.carrier] || 0) + 1;
}
console.log('キャリア使用数:', Object.keys(carrierCounts).length, '種類');
console.log('');
console.log('ダッシュボード確認ポイント：');
const overdue = lineDraftItems.filter(d => d.nextReviewDate && d.nextReviewDate < '2026-03-29');
const within7 = lineDraftItems.filter(d => d.nextReviewDate && d.nextReviewDate >= '2026-03-29' && d.nextReviewDate <= '2026-04-05');
const contractEndAlert = lineDraftItems.filter(d => d.contractEndDate && d.contractEndDate >= '2026-03-29' && d.contractEndDate <= '2026-04-28');
console.log('  期限超過（危険案件）:', overdue.length, '件', overdue.map(d => d.lineName));
console.log('  7日以内:', within7.length, '件', within7.map(d => d.lineName));
console.log('  契約終了30日以内アラート:', contractEndAlert.length, '件', contractEndAlert.map(d => d.lineName));
