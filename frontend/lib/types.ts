// Whitelist types
export interface WhitelistRouteItem {
  id: string;
  title: string;
  cover: string | null;
  seriesUrl?: string;
  url?: string;
  source: string;
  sources?: (string | { source: string; url: string })[];
  country?: string | null;
  origin?: string | null;
  type?: string | null;
  description?: string | null;
  genres?: string[] | null;
  rating?: string | null;
  lastNotified?: string | null;
  createdAt?: string | null;
}

// Dashboard snapshot types
export interface DashboardSnapshot {
  whitelistCount: number;
  queueLength: number;
  sourceHealth: Record<
    string,
    {
      status: string;
      successesToday: number;
      failuresToday: number;
      consecutiveFailures: number;
      lastError?: string | null;
    }
  >;
  recentChapters: DashboardChapter[];
  recentFeed: DashboardFeedItem[];
  overview: {
    totalChaptersSent: number;
    totalMangaTracked: number;
    queueLength: number;
    averageChaptersPerDay?: number;
    avgCronDuration?: number;
  } | null;
  cronStatus: {
    outcome: string;
    timestamp: string;
    duration: number | null;
    matched: number;
    sent: number;
  } | null;
  lastDelivery: {
    outcome: string;
    timestamp: string;
    duration: number | null;
    matched: number;
    sent: number;
  } | null;
}

export interface DashboardChapter {
  title: string;
  titleKey: string;
  chapterLabel: string;
  chapterUrl: string;
  source: string;
  sentAt: string;
  cover: string;
  origin: string;
  type?: string | null;
  rating: string;
  description: string;
  seriesUrl?: string;
}

export interface DashboardFeedItem {
  title: string;
  titleKey: string;
  chapterLabel: string;
  chapterUrl?: string;
  source: string;
  updatedTime: string;
  cover: string;
  origin: string;
  type?: string | null;
  rating: string;
  description: string;
  isWhitelisted: boolean;
  seriesUrl?: string;
}

// Dispatch history types
export interface DispatchHistoryItem {
  title: string;
  titleKey: string;
  chapter: string;
  chapterLabel: string;
  url: string;
  source: string;
  cover: string;
  origin: string;
  type?: string | null;
  seriesUrl: string;
  rating: string | null;
  genres: string[];
  description?: string | null;
  sentAt: string;
  isDuplicate?: boolean;
}

// Excluded titles types
export interface ExcludedTitleItem {
  id?: string;
  titleKey: string;
  title?: string | null;
  // Always a concrete source ("shinigami") — exclude has no
  // cross-source "all" scope. The API rejects any other value.
  source: string;
  createdAt?: string | null;
  cover?: string | null;
  seriesUrl?: string | null;
}

import type { FlatChapter } from "@/lib/feed";

// RSS flat types — canonical is lib/feed.ts FlatChapter (deep module Feed)
export type RssFlatItem = FlatChapter;

export interface RssFlatPage {
  results: RssFlatItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

// Catalog resolve types
export interface CatalogResolveResult {
  title: string;
  titleKey: string;
  source: string;
  url: string;
  cover: string | null;
  origin?: string;
  type?: string | null;
}

// Stats types
export interface StatsData {
  total: number;
  rated: number;
  avgRating: number | null;
  bySource: { label: string; count: number; percentage: number }[];
  ratingDistribution: { label: string; count: number; percentage: number }[];
  topRated: {
    id: string;
    title: string;
    cover: string | null;
    rating: number;
  }[];
  recentUpdates: {
    id: string;
    title: string;
    cover: string | null;
    chapterLabel: string;
    chapterNumber: number;
    time: string;
    source: string;
  }[];
  trends: { date: string; chapters: number }[];
  sourceStats: { source: string; chapters: number }[];
}

// Queue depth types
export interface QueueDepth {
  depth: number;
  total_whitelisted: number;
  sent: number;
  queue?: string[];
}

// RSS health status (GET /api/rss/health)
export interface RssHealth {
  status: string;
  lastFetch?: string | null;
  itemsProcessed?: number;
  errors?: number;
  [key: string]: unknown;
}

// Single cron run entry (GET /api/cron/status)
export interface CronRun {
  outcome: string;
  timestamp: string;
  duration: number | null;
  matched: number;
  sent: number;
  action?: string;
}

// Analytics types
export interface AnalyticsOverview {
  popular_series: {
    title_key: string;
    source: string;
    dispatch_count: number;
    last_dispatched: string;
  }[];
  chapter_velocity: {
    date: string;
    total_dispatches: number;
    unique_series: number;
  }[];
  source_distribution: { source: string; count: number }[];
  whitelist_growth: { date: string; new_entries: number }[];
  failed_dispatch_stats: {
    total_failed: number;
    still_failed: number;
    resolved: number;
    permanent: number;
  };
  top_genres: { genre: string; count: number }[];
  generated_at: string;
}

export interface AnalyticsSeriesDetail {
  series: {
    title_key: string;
    source: string;
    title: string;
    cover: string;
    rating: number;
    genres: string[];
    latest_sent_chapter: number;
    latest_chapter: number;
    created_at: string;
  };
  dispatch_history: { chapter_title: string; sent_at: string }[];
  velocity: { week: string; chapters_dispatched: number }[];
}

export interface AnalyticsEngagement {
  active_sessions_24h: number;
  total_reading_sessions: number;
  most_read_series: { title_key: string; reader_count: number }[];
  activity_over_time: { date: string; active_users: number }[];
}

// Custom RSS feed types
export interface RssCustomFeedItem {
  titleKey: string;
  title: string;
  chapter: string;
  chapterNumber: number;
  chapterUrl: string;
  source: string;
  cover: string;
  origin: string;
  seriesUrl: string;
  rating: number;
  genres: string[];
  description: string;
  isWhitelisted: boolean;
  latestSentChapter: number;
  dispatchCount: number;
  updatedTime: string;
}

export interface RssCustomFeedResult {
  results: RssCustomFeedItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
  filters: Record<string, unknown>;
}

export interface RssFilterMetadata {
  genres: string[];
  sources: string[];
  origins: string[];
}
