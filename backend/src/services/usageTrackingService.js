const TenantDailyUsage = require('../models/TenantDailyUsage');
const Tenant = require('../models/Tenant');
const ChatSession = require('../models/ChatSession');

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const VALID_PERIODS = ['7d', '30d', '90d', 'all'];

function getUtcDateString(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

/**
 * Validate that a string is a legitimate calendar date in YYYY-MM-DD format (rejects e.g. Feb 31)
 */
function isValidDateString(str) {
  if (typeof str !== 'string' || !DATE_REGEX.test(str)) return false;
  const d = new Date(`${str}T00:00:00.000Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
}

/**
 * Record an operational chat event atomically.
 *
 * Metric Definitions & Counting Semantics:
 * - successfulResponses: Successful model generations counted by the server.
 *   Tracked server-side after generation and before HTTP response dispatch.
 *   (Reflects successful server-side generation, not confirmed receipt by the client).
 * - fallbackResponses: Fallback responses handled by the server following a ModelAdapterError.
 * - totalResponses: Sum of these two server-side response counts (successfulResponses + fallbackResponses).
 * - fallbackRate: Fallback responses divided by the total counted responses.
 * - periodSessions: Newly created sessions during the selected period.
 * - lifetimeSessions: Currently stored ChatSession documents.
 *
 * Concurrency & Resilience Guarantees:
 * - Uses MongoDB $inc for atomic counter updates (no read-modify-write).
 * - Catches E11000 duplicate key error on concurrent first-time upserts and retries
 *   the update once against the newly created document.
 * - Any remaining analytics recording error is logged and suppressed so it never turns
 *   a successfully generated customer response into a failed 500 request.
 *
 * @param {Object} params
 * @param {string|mongoose.Types.ObjectId} params.tenantId
 * @param {'successfulResponse'|'fallbackResponse'|'newSession'} params.eventType
 * @param {number} [params.count=1]
 * @param {string} [params.date] - Optional explicit YYYY-MM-DD (defaults to UTC today)
 */
async function recordUsageEvent({ tenantId, eventType, count = 1, date }) {
  if (!tenantId) return;

  const fieldMap = {
    successfulResponse: 'successfulResponses',
    fallbackResponse: 'fallbackResponses',
    newSession: 'newSessions',
  };

  const field = fieldMap[eventType];
  if (!field) return;

  const targetDate = date && isValidDateString(date) ? date : getUtcDateString();

  try {
    await TenantDailyUsage.updateOne(
      { tenantId, date: targetDate },
      { $inc: { [field]: count } },
      { upsert: true }
    );
  } catch (err) {
    // When multiple concurrent requests attempt an upsert for a new (tenantId, date)
    // record simultaneously, one succeeds and others may encounter an E11000 duplicate key error.
    // In this race, the winning request already inserted the document.
    // Retrying updateOne without upsert safely applies the $inc to the newly created document.
    if (err.code === 11000 || (err.message && err.message.includes('E11000'))) {
      try {
        await TenantDailyUsage.updateOne(
          { tenantId, date: targetDate },
          { $inc: { [field]: count } }
        );
      } catch (retryErr) {
        console.error('Failed to record usage event on E11000 retry:', retryErr.message);
      }
    } else {
      console.error('Failed to record usage event:', err.message);
    }
  }
}

/**
 * Resolve start and end dates based on query parameters.
 *
 * Precedence Rule:
 * - Custom date boundaries (startDate and/or endDate) take precedence over period.
 * - When custom dates are specified, period is ignored.
 * - If only startDate is provided, endDate defaults to UTC today.
 * - If only endDate is provided, startDate defaults to '2020-01-01'.
 * - If neither is provided, period ('7d', '30d', '90d', 'all') is used (defaults to '30d').
 */
function resolveDateRange({ period = '30d', startDate, endDate }) {
  const today = getUtcDateString();

  // Validate period if provided
  if (period !== undefined && !VALID_PERIODS.includes(period)) {
    const error = new Error(`period must be one of: ${VALID_PERIODS.join(', ')}`);
    error.code = 'INVALID_PERIOD';
    throw error;
  }

  // Validate startDate if provided
  if (startDate !== undefined) {
    if (!isValidDateString(startDate)) {
      const error = new Error('startDate must be a valid date in YYYY-MM-DD format');
      error.code = 'INVALID_DATE';
      throw error;
    }
  }

  // Validate endDate if provided
  if (endDate !== undefined) {
    if (!isValidDateString(endDate)) {
      const error = new Error('endDate must be a valid date in YYYY-MM-DD format');
      error.code = 'INVALID_DATE';
      throw error;
    }
  }

  // Check reversed date range
  if (startDate && endDate && startDate > endDate) {
    const error = new Error('startDate cannot be after endDate');
    error.code = 'INVALID_DATE_RANGE';
    throw error;
  }

  // Custom date range takes precedence over period
  if (startDate || endDate) {
    const effectiveStart = startDate || '2020-01-01';
    const effectiveEnd = endDate || today;

    if (effectiveStart > effectiveEnd) {
      const error = new Error('startDate cannot be after endDate');
      error.code = 'INVALID_DATE_RANGE';
      throw error;
    }

    return {
      startDate: effectiveStart,
      endDate: effectiveEnd,
    };
  }

  if (period === 'all') {
    return { startDate: '2020-01-01', endDate: today };
  }

  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return {
    startDate: getUtcDateString(d),
    endDate: today,
  };
}

/**
 * Get usage analytics for a single tenant.
 * Uses tenant-scoped index { tenantId: 1, date: 1 } and lean queries for scalability.
 */
async function getTenantUsageSummary(tenantId, queryOptions = {}) {
  const { startDate, endDate } = resolveDateRange(queryOptions);

  const [records, lifetimeSessions] = await Promise.all([
    TenantDailyUsage.find({
      tenantId,
      date: { $gte: startDate, $lte: endDate },
    })
      .sort({ date: 1 })
      .lean(),
    ChatSession.countDocuments({ tenantId }),
  ]);

  let successfulResponses = 0;
  let fallbackResponses = 0;
  let periodSessions = 0;

  const dailyTrends = records.map((rec) => {
    successfulResponses += rec.successfulResponses;
    fallbackResponses += rec.fallbackResponses;
    periodSessions += rec.newSessions;

    const totalDayResponses = rec.successfulResponses + rec.fallbackResponses;
    return {
      date: rec.date,
      successfulResponses: rec.successfulResponses,
      fallbackResponses: rec.fallbackResponses,
      newSessions: rec.newSessions,
      totalResponses: totalDayResponses,
    };
  });

  const totalResponses = successfulResponses + fallbackResponses;
  const fallbackRate =
    totalResponses > 0 ? Number(((fallbackResponses / totalResponses) * 100).toFixed(2)) : 0;

  return {
    period: { startDate, endDate },
    totals: {
      successfulResponses,
      fallbackResponses,
      totalResponses,
      periodSessions,
      lifetimeSessions,
      fallbackRate,
    },
    dailyTrends,
  };
}

/**
 * Get platform-wide aggregated usage summary and per-tenant breakdown.
 * Queries lean tenant summaries and daily records bounded by date range.
 */
async function getPlatformUsageSummary(queryOptions = {}) {
  const { startDate, endDate } = resolveDateRange(queryOptions);

  const [tenants, usageRecords, totalLifetimeSessions] = await Promise.all([
    Tenant.find({}, { name: 1, slug: 1, status: 1 }).sort({ createdAt: -1 }).lean(),
    TenantDailyUsage.find({
      date: { $gte: startDate, $lte: endDate },
    })
      .sort({ date: 1 })
      .lean(),
    ChatSession.countDocuments({}),
  ]);

  // Aggregate daily trends across all tenants
  const dailyMap = {};
  // Aggregate totals per tenant
  const tenantMap = {};

  tenants.forEach((t) => {
    const tId = t._id.toString();
    tenantMap[tId] = {
      tenantId: tId,
      tenantName: t.name,
      tenantSlug: t.slug,
      status: t.status,
      successfulResponses: 0,
      fallbackResponses: 0,
      totalResponses: 0,
      newSessions: 0,
      fallbackRate: 0,
    };
  });

  let platformSuccessful = 0;
  let platformFallback = 0;
  let platformPeriodSessions = 0;

  usageRecords.forEach((rec) => {
    platformSuccessful += rec.successfulResponses;
    platformFallback += rec.fallbackResponses;
    platformPeriodSessions += rec.newSessions;

    // Daily trends
    if (!dailyMap[rec.date]) {
      dailyMap[rec.date] = {
        date: rec.date,
        successfulResponses: 0,
        fallbackResponses: 0,
        newSessions: 0,
        totalResponses: 0,
      };
    }
    dailyMap[rec.date].successfulResponses += rec.successfulResponses;
    dailyMap[rec.date].fallbackResponses += rec.fallbackResponses;
    dailyMap[rec.date].newSessions += rec.newSessions;
    dailyMap[rec.date].totalResponses += rec.successfulResponses + rec.fallbackResponses;

    // Per-tenant breakdown
    const tId = rec.tenantId.toString();
    if (tenantMap[tId]) {
      tenantMap[tId].successfulResponses += rec.successfulResponses;
      tenantMap[tId].fallbackResponses += rec.fallbackResponses;
      tenantMap[tId].newSessions += rec.newSessions;
      tenantMap[tId].totalResponses += rec.successfulResponses + rec.fallbackResponses;
    }
  });

  // Calculate per-tenant fallback rate
  const tenantBreakdown = Object.values(tenantMap).map((item) => {
    item.fallbackRate =
      item.totalResponses > 0
        ? Number(((item.fallbackResponses / item.totalResponses) * 100).toFixed(2))
        : 0;
    return item;
  });

  const dailyTrends = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
  const platformTotalResponses = platformSuccessful + platformFallback;
  const platformFallbackRate =
    platformTotalResponses > 0
      ? Number(((platformFallback / platformTotalResponses) * 100).toFixed(2))
      : 0;

  return {
    period: { startDate, endDate },
    totals: {
      totalTenants: tenants.length,
      totalLifetimeSessions,
      lifetimeSessions: totalLifetimeSessions,
      periodSessions: platformPeriodSessions,
      successfulResponses: platformSuccessful,
      fallbackResponses: platformFallback,
      totalResponses: platformTotalResponses,
      fallbackRate: platformFallbackRate,
    },
    dailyTrends,
    tenantBreakdown,
  };
}

module.exports = {
  recordUsageEvent,
  resolveDateRange,
  getTenantUsageSummary,
  getPlatformUsageSummary,
  getUtcDateString,
  isValidDateString,
  VALID_PERIODS,
};
