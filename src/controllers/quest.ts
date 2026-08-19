import { Response } from 'express';
import { Op, QueryTypes, Transaction } from 'sequelize';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import ExcelJS from 'exceljs';

import { CustomRequest } from '../types/api';
import { sequelize } from '../db';
import { User } from '../../models/User';
import { Form } from '../../models/Form';
import { Product } from '../../models/Product';
import { Redemption } from '../../models/Redemption';
import { UserAction } from '../../models/UserAction';
import { PointTransaction } from '../../models/PointTransaction';
import { ThreeDayQuest } from '../../models/ThreeDayQuest';
import { getStockAllocationAvailability, getProductFlowAvailableStock } from '../services/productStockAllocation';
import { awardPoints } from '../services/userPhasePoints';
import { REDEMPTION_TIMEZONE } from '../services/redemptionWindow';
import { REDEMPTION_NOTE_THREE_DAY_QUEST } from '../utils/redemptionFlow';

dayjs.extend(utc);
dayjs.extend(timezone);

const QUEST_FORM_TYPE_ID = 5;
const QUEST_REQUIRED_POS = 5;
const QUEST_DURATION_HOURS = 72;
const QUEST_PRODUCT_ID = 3;
const QUEST_POINTS_FALLBACK = 3000;
const QUEST_FLOW_TYPE = 'three_day_quest' as const;

function isQuestProgramOpen(at: Date = new Date()): boolean {
  const end = process.env.THREE_DAY_QUEST_END;
  if (!end) return true;
  return dayjs(at).tz(REDEMPTION_TIMEZONE).isBefore(
    dayjs.tz(end, REDEMPTION_TIMEZONE).endOf('day')
  );
}

async function requireT2User(userId: number, transaction?: Transaction) {
  const user = await User.findByPk(userId, {
    attributes: ['user_id', 'user_type', 'username', 'fullname', 'email', 'phone_number'],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!user) return { error: { status: 404, message: 'User not found' } as const };
  if (user.user_type !== 'T2') {
    return { error: { status: 403, message: '3 Day Quest is only available for Partner (T2) users' } as const };
  }
  return { user };
}

async function countInWindowForms(
  userId: number,
  startedAt: Date,
  endsAt: Date,
  transaction?: Transaction
) {
  const forms = await Form.findAll({
    where: {
      user_id: userId,
      form_type_id: QUEST_FORM_TYPE_ID,
      createdAt: { [Op.gte]: startedAt, [Op.lte]: endsAt },
    },
    attributes: ['form_id', 'status', 'createdAt'],
    order: [['createdAt', 'ASC']],
    transaction,
  });

  const approved = forms.filter((form) => form.status === 'approved');
  const stillEligible = forms.filter(
    (form) =>
      form.status === 'approved' ||
      form.status === 'submitted' ||
      form.status === 'pending'
  );

  return {
    forms,
    approved_count: approved.length,
    eligible_count: stillEligible.length,
  };
}

function questStatusPayload(args: {
  quest: ThreeDayQuest | null;
  approved_count: number;
  eligible_count: number;
  forms: { form_id: number; status: string; createdAt: Date }[];
  voucher_stock: number;
  program_open: boolean;
}) {
  const now = Date.now();
  const started = Boolean(args.quest);
  const claimed = Boolean(args.quest?.claimed_at);
  const endsAtMs = args.quest ? new Date(args.quest.ends_at).getTime() : null;
  const remaining_ms = endsAtMs != null ? Math.max(0, endsAtMs - now) : null;
  const windowExpired = endsAtMs != null && now > endsAtMs;
  const can_claim = started && !claimed && args.approved_count >= QUEST_REQUIRED_POS;
  const failed =
    started &&
    !claimed &&
    !can_claim &&
    windowExpired &&
    args.eligible_count < QUEST_REQUIRED_POS;
  const can_start = !started && args.program_open;

  let claim_locked_reason: string | null = null;
  if (claimed) claim_locked_reason = 'already_claimed';
  else if (!started) claim_locked_reason = 'not_started';
  else if (can_claim) claim_locked_reason = null;
  else if (failed) claim_locked_reason = 'failed';
  else claim_locked_reason = 'incomplete';

  return {
    started,
    started_at: args.quest?.started_at ?? null,
    ends_at: args.quest?.ends_at ?? null,
    remaining_ms,
    approved_count: args.approved_count,
    required_count: QUEST_REQUIRED_POS,
    eligible_count: args.eligible_count,
    submissions: args.forms,
    can_start,
    can_claim,
    failed,
    claimed,
    reward_type: args.quest?.reward_type ?? null,
    claim_locked_reason,
    voucher_stock: args.voucher_stock,
    voucher_product_id: QUEST_PRODUCT_ID,
    points_fallback: QUEST_POINTS_FALLBACK,
    program_open: args.program_open,
  };
}

export const getQuestStatus = async (req: CustomRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const t2 = await requireT2User(userId);
    if (t2.error) return res.status(t2.error.status).json({ message: t2.error.message });

    const quest = await ThreeDayQuest.findOne({ where: { user_id: userId } });
    const windowForms = quest
      ? await countInWindowForms(userId, quest.started_at, quest.ends_at)
      : { forms: [], approved_count: 0, eligible_count: 0 };

    const voucher_stock = (await getProductFlowAvailableStock(QUEST_PRODUCT_ID, QUEST_FLOW_TYPE)) ?? 0;

    return res.status(200).json(
      questStatusPayload({
        quest,
        approved_count: windowForms.approved_count,
        eligible_count: windowForms.eligible_count,
        forms: windowForms.forms.map((form) => ({
          form_id: form.form_id,
          status: form.status,
          createdAt: form.createdAt,
        })),
        voucher_stock,
        program_open: isQuestProgramOpen(),
      })
    );
  } catch (error: any) {
    req.log.error({ error, stack: error.stack }, 'Error fetching 3 Day Quest status');
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

export const startQuest = async (req: CustomRequest, res: Response) => {
  const transaction = await sequelize.transaction();
  try {
    const userId = req.user?.userId;
    if (!userId) {
      await transaction.rollback();
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const t2 = await requireT2User(userId, transaction);
    if (t2.error) {
      await transaction.rollback();
      return res.status(t2.error.status).json({ message: t2.error.message });
    }

    if (!isQuestProgramOpen()) {
      await transaction.rollback();
      return res.status(400).json({ message: '3 Day Quest is no longer available' });
    }

    const existing = await ThreeDayQuest.findOne({
      where: { user_id: userId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (existing) {
      await transaction.rollback();
      return res.status(400).json({ message: 'You have already started the 3 Day Quest' });
    }

    const started_at = new Date();
    const ends_at = dayjs(started_at).add(QUEST_DURATION_HOURS, 'hour').toDate();
    const quest = await ThreeDayQuest.create(
      { user_id: userId, started_at, ends_at },
      { transaction }
    );

    await transaction.commit();
    return res.status(200).json({
      message: '3 Day Quest started',
      started_at: quest.started_at,
      ends_at: quest.ends_at,
    });
  } catch (error: any) {
    await transaction.rollback();
    req.log.error({ error, stack: error.stack }, 'Error starting 3 Day Quest');
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

export const claimQuestReward = async (req: CustomRequest, res: Response) => {
  const transaction = await sequelize.transaction();
  try {
    const userId = req.user?.userId;
    if (!userId) {
      await transaction.rollback();
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const t2 = await requireT2User(userId, transaction);
    if (t2.error) {
      await transaction.rollback();
      return res.status(t2.error.status).json({ message: t2.error.message });
    }

    const quest = await ThreeDayQuest.findOne({
      where: { user_id: userId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!quest) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Start the 3 Day Quest first' });
    }
    if (quest.claimed_at) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Reward has already been claimed' });
    }

    const windowForms = await countInWindowForms(
      userId,
      quest.started_at,
      quest.ends_at,
      transaction
    );
    if (windowForms.approved_count < QUEST_REQUIRED_POS) {
      await transaction.rollback();
      return res.status(400).json({
        message: `Need ${QUEST_REQUIRED_POS} approved Purchase Orders submitted during the quest window`,
      });
    }

    const stock = await getStockAllocationAvailability(QUEST_PRODUCT_ID, QUEST_FLOW_TYPE, transaction);
    const voucherAvailable = Boolean(stock.allocation && (stock.availableStock ?? 0) > 0);

    if (voucherAvailable && stock.allocation) {
      const { fullname, email, phone_number, shipping_address = 'voucher', postal_code = 'voucher' } = req.body;
      if (!fullname || !email || !phone_number) {
        await transaction.rollback();
        return res.status(400).json({
          message: 'Missing required fields',
          errors: {
            fullname: !fullname ? 'Full name is required' : null,
            email: !email ? 'Email is required' : null,
            phone_number: !phone_number ? 'Phone number is required' : null,
          },
        });
      }

      const product = await Product.findByPk(QUEST_PRODUCT_ID, { transaction });
      if (!product) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Quest voucher product not found' });
      }

      stock.allocation.used_stock = (stock.allocation.used_stock || 0) + 1;
      await stock.allocation.save({ transaction });

      const redemption = await Redemption.create(
        {
          user_id: userId,
          product_id: product.product_id,
          points_spent: 0,
          fullname,
          email,
          phone_number,
          shipping_address,
          postal_code,
          notes: REDEMPTION_NOTE_THREE_DAY_QUEST,
          status: 'active',
        },
        { transaction }
      );

      await UserAction.create(
        {
          user_id: userId,
          entity_type: 'REDEEM',
          action_type: req.method,
          redemption_id: redemption.redemption_id,
        },
        { transaction }
      );

      quest.claimed_at = new Date();
      quest.reward_type = 'voucher';
      quest.redemption_id = redemption.redemption_id;
      await quest.save({ transaction });
      await transaction.commit();

      return res.status(200).json({
        message: '3 Day Quest voucher claim submitted',
        reward_type: 'voucher',
        redemption_id: redemption.redemption_id,
      });
    }

    await awardPoints(userId, QUEST_POINTS_FALLBACK, { transaction });
    await PointTransaction.create(
      {
        user_id: userId,
        points: QUEST_POINTS_FALLBACK,
        transaction_type: 'earn',
        description: `3 Day Quest reward: ${QUEST_POINTS_FALLBACK} points (voucher out of stock)`,
      },
      { transaction }
    );

    quest.claimed_at = new Date();
    quest.reward_type = 'points';
    await quest.save({ transaction });
    await transaction.commit();

    return res.status(200).json({
      message: `3 Day Quest completed. You received ${QUEST_POINTS_FALLBACK} points`,
      reward_type: 'points',
      points: QUEST_POINTS_FALLBACK,
    });
  } catch (error: any) {
    await transaction.rollback();
    req.log.error({ error, stack: error.stack }, 'Error claiming 3 Day Quest reward');
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

type AdminQuestStatus = 'in_progress' | 'ready_to_claim' | 'claimed' | 'failed';

type AdminQuestRow = {
  quest_id: number;
  user_id: number;
  username: string;
  fullname: string | null;
  email: string;
  phone_number: string | null;
  company_name: string | null;
  started_at: Date;
  ends_at: Date;
  claimed_at: Date | null;
  reward_type: 'voucher' | 'points' | null;
  redemption_id: number | null;
  approved_count: number;
  eligible_count: number;
  quest_status: AdminQuestStatus;
};

const ADMIN_QUEST_STATUSES: AdminQuestStatus[] = [
  'in_progress',
  'ready_to_claim',
  'claimed',
  'failed',
];

function parseAdminQuestStatus(value: unknown): AdminQuestStatus | null {
  if (typeof value !== 'string' || !value) return null;
  return ADMIN_QUEST_STATUSES.includes(value as AdminQuestStatus)
    ? (value as AdminQuestStatus)
    : null;
}

const QUEST_LIST_SELECT_SQL = `
  SELECT
    q.quest_id,
    q.user_id,
    u.username,
    u.fullname,
    u.email,
    u.phone_number,
    c.name AS company_name,
    q.started_at,
    q.ends_at,
    q.claimed_at,
    q.reward_type,
    q.redemption_id,
    COALESCE(agg.approved_count, 0)::int AS approved_count,
    COALESCE(agg.eligible_count, 0)::int AS eligible_count,
    CASE
      WHEN q.claimed_at IS NOT NULL THEN 'claimed'
      WHEN COALESCE(agg.approved_count, 0) >= :requiredCount THEN 'ready_to_claim'
      WHEN NOW() > q.ends_at AND COALESCE(agg.eligible_count, 0) < :requiredCount THEN 'failed'
      ELSE 'in_progress'
    END AS quest_status
  FROM three_day_quests q
  INNER JOIN users u ON u.user_id = q.user_id
  LEFT JOIN companies c ON c.company_id = u.company_id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE f.status = 'approved')::int AS approved_count,
      COUNT(*) FILTER (WHERE f.status IN ('approved', 'submitted', 'pending'))::int AS eligible_count
    FROM forms f
    WHERE f.user_id = q.user_id
      AND f.form_type_id = :formTypeId
      AND f.created_at >= q.started_at
      AND f.created_at <= q.ends_at
  ) agg ON TRUE
`;

function mapAdminQuestRow(row: AdminQuestRow) {
  return {
    quest_id: Number(row.quest_id),
    user_id: Number(row.user_id),
    username: row.username,
    fullname: row.fullname,
    email: row.email,
    phone_number: row.phone_number,
    company_name: row.company_name,
    started_at: row.started_at,
    ends_at: row.ends_at,
    claimed_at: row.claimed_at,
    reward_type: row.reward_type,
    redemption_id: row.redemption_id != null ? Number(row.redemption_id) : null,
    approved_count: Number(row.approved_count) || 0,
    eligible_count: Number(row.eligible_count) || 0,
    required_count: QUEST_REQUIRED_POS,
    quest_status: row.quest_status,
  };
}

async function queryAdminQuestRows(args: {
  status: AdminQuestStatus | null;
  usernameLike: string | null;
  limit?: number;
  offset?: number;
}) {
  const replacements: Record<string, unknown> = {
    formTypeId: QUEST_FORM_TYPE_ID,
    requiredCount: QUEST_REQUIRED_POS,
    status: args.status,
    usernameLike: args.usernameLike,
  };

  const filterSql = `
    WHERE (:status IS NULL OR rows.quest_status = :status)
      AND (:usernameLike IS NULL OR rows.username ILIKE :usernameLike)
  `;

  const countRows = await sequelize.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM (${QUEST_LIST_SELECT_SQL}) rows ${filterSql}`,
    { replacements, type: QueryTypes.SELECT }
  );
  const total = Number(countRows[0]?.total) || 0;

  let dataSql = `SELECT * FROM (${QUEST_LIST_SELECT_SQL}) rows ${filterSql} ORDER BY rows.started_at DESC, rows.quest_id DESC`;
  if (args.limit != null) {
    dataSql += ' LIMIT :limit OFFSET :offset';
    replacements.limit = args.limit;
    replacements.offset = args.offset ?? 0;
  }

  const rows = await sequelize.query<AdminQuestRow>(dataSql, {
    replacements,
    type: QueryTypes.SELECT,
  });

  return { total, rows: rows.map(mapAdminQuestRow) };
}

export const getQuestList = async (req: CustomRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
    const offset = (page - 1) * limit;
    const status = parseAdminQuestStatus(req.query.status);
    if (req.query.status && !status) {
      return res.status(400).json({
        message: `status must be one of: ${ADMIN_QUEST_STATUSES.join(', ')}`,
      });
    }
    const username = typeof req.query.username === 'string' ? req.query.username.trim() : '';
    const usernameLike = username ? `%${username}%` : null;

    const { total, rows } = await queryAdminQuestRows({
      status,
      usernameLike,
      limit,
      offset,
    });
    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      message: '3 Day Quest list retrieved successfully',
      data: rows,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_items: total,
        items_per_page: limit,
        has_next_page: page < totalPages,
        has_prev_page: page > 1,
      },
    });
  } catch (error: any) {
    req.log.error({ error, stack: error.stack }, 'Error fetching 3 Day Quest list');
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

export const downloadQuestList = async (req: CustomRequest, res: Response) => {
  try {
    const status = parseAdminQuestStatus(req.query.status);
    if (req.query.status && !status) {
      return res.status(400).json({
        message: `status must be one of: ${ADMIN_QUEST_STATUSES.join(', ')}`,
      });
    }
    const username = typeof req.query.username === 'string' ? req.query.username.trim() : '';
    const usernameLike = username ? `%${username}%` : null;

    const { rows } = await queryAdminQuestRows({ status, usernameLike });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('three_day_quests');
    worksheet.columns = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Username', key: 'username', width: 18 },
      { header: 'Company', key: 'company', width: 24 },
      { header: 'Fullname', key: 'fullname', width: 22 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Phone Number', key: 'phone_number', width: 16 },
      { header: 'Started At', key: 'started_at', width: 20 },
      { header: 'Ends At', key: 'ends_at', width: 20 },
      { header: 'Progress', key: 'progress', width: 12 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Reward Type', key: 'reward_type', width: 14 },
      { header: 'Claimed At', key: 'claimed_at', width: 20 },
    ];

    rows.forEach((row, index) => {
      worksheet.addRow({
        no: index + 1,
        username: row.username || '-',
        company: row.company_name || '-',
        fullname: row.fullname || '-',
        email: row.email || '-',
        phone_number: row.phone_number || '-',
        started_at: row.started_at ? dayjs(row.started_at).format('DD MMM YYYY HH:mm') : '-',
        ends_at: row.ends_at ? dayjs(row.ends_at).format('DD MMM YYYY HH:mm') : '-',
        progress: `${row.approved_count} / ${row.required_count}`,
        status: row.quest_status,
        reward_type: row.reward_type || '-',
        claimed_at: row.claimed_at ? dayjs(row.claimed_at).format('DD MMM YYYY HH:mm') : '-',
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=three_day_quests.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    req.log.error({ error, stack: error.stack }, 'Error downloading 3 Day Quest list');
    return res.status(500).json({ message: 'Something went wrong' });
  }
};
