/**
 * DispatchChart must render real numbers.
 *
 * Two defects made the panel read 0/0/0 with the backend reporting sent_24h=52
 * and total=169:
 *
 *  1. The queryFn called /api/v1/cron/health first and returned its
 *     {total, sent24h} shape on success. That shape has no rows, and the render
 *     path only reads data.rows, so the buckets were permanently empty.
 *  2. groupByDay read `sent_at` / `created_at`, but the API serialises the
 *     timestamp as `sentAt`.
 *
 * These assert both field spellings and the empty case, and pin the shape
 * contract so a future edit cannot reintroduce the silent-zero path.
 */
import { describe, it, expect } from "vitest";
import { groupByDayForTest } from "@/components/notifications/DispatchChart";

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function counts(rows: any[]): number[] {
  return groupByDayForTest(rows).map((g) => g.count);
}

describe("groupByDay", () => {
  it("reads the camelCase sentAt the API actually returns", () => {
    const rows = [
      { sentAt: `${isoDaysAgo(0)}T05:14:12.754770+00:00` },
      { sentAt: `${isoDaysAgo(0)}T06:00:00.000000+00:00` },
      { sentAt: `${isoDaysAgo(1)}T23:59:59.000000+00:00` },
    ];
    // oldest first: 2d ago, Yesterday, Today
    expect(counts(rows)).toEqual([0, 1, 2]);
  });

  it("still reads snake_case for older cached payloads", () => {
    const rows = [
      { sent_at: `${isoDaysAgo(2)}T01:00:00.000000+00:00` },
      { sent_at: `${isoDaysAgo(2)}T02:00:00.000000+00:00` },
      { sent_at: `${isoDaysAgo(0)}T03:00:00.000000+00:00` },
    ];
    expect(counts(rows)).toEqual([2, 0, 1]);
  });

  it("falls back to created_at when no sent timestamp exists", () => {
    const rows = [{ created_at: `${isoDaysAgo(0)}T04:00:00.000000+00:00` }];
    expect(counts(rows)).toEqual([0, 0, 1]);
  });

  it("prefers the sent timestamp over created_at on the same row", () => {
    const rows = [
      {
        sentAt: `${isoDaysAgo(1)}T04:00:00.000000+00:00`,
        created_at: `${isoDaysAgo(0)}T04:00:00.000000+00:00`,
      },
    ];
    expect(counts(rows)).toEqual([0, 1, 0]);
  });

  it("always returns three buckets, oldest first", () => {
    const grouped = groupByDayForTest([]);
    expect(grouped).toHaveLength(3);
    expect(grouped.map((g) => g.day)).toEqual([
      isoDaysAgo(2),
      isoDaysAgo(1),
      isoDaysAgo(0),
    ]);
  });

  it("returns zeros for an empty payload rather than throwing", () => {
    expect(counts([])).toEqual([0, 0, 0]);
  });

  it("skips rows with no usable timestamp instead of bucketing them today", () => {
    const rows = [{ sentAt: "" }, { sentAt: undefined }, { sentAt: `${isoDaysAgo(0)}T05:00:00.000000+00:00` }];
    expect(counts(rows)).toEqual([0, 0, 1]);
  });

  it("ignores timestamps outside the three-day window", () => {
    const rows = [{ sentAt: `${isoDaysAgo(9)}T05:00:00.000000+00:00` }];
    expect(counts(rows)).toEqual([0, 0, 0]);
  });
});