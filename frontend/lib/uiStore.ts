import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type Feed = "all" | "nowl" | "wl";
type SortMode = "newest" | "title";
type ContentView = "all" | "fav";
type Density = "compact" | "comfortable";

interface UiState {
  feed: Feed;
  groupMode: boolean;
  sortMode: SortMode;
  contentView: ContentView;
  sourceFilter: string | null;
  typeFilter: string | null;
  searchQuery: string;
  genreFilter: string | null;
  minRating: string | null;
  whitelistOnly: boolean;
  density: Density;
  _hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  setFeed: (f: Feed) => void;
  toggleGroupMode: () => void;
  setSortMode: (s: SortMode) => void;
  setContentView: (v: ContentView) => void;
  setSourceFilter: (s: string | null) => void;
  setTypeFilter: (t: string | null) => void;
  setSearchQuery: (q: string) => void;
  setGenreFilter: (g: string | null) => void;
  setMinRating: (r: string | null) => void;
  setWhitelistOnly: (v: boolean) => void;
  setDensity: (d: Density) => void;
  toggleDensity: () => void;
  resetFilters: () => void;
}

/**
 * Global UI preferences for the All feed (shared across tabs in the future).
 * Persisted to localStorage so view/filter/sort choices survive reloads.
 * `createJSONStorage` is SSR-safe: on the server the getter throws and the
 * middleware falls back to in-memory (see zustand's createJSONStorage).
 */
export const useUiStore = create<UiState>()(
    persist(
    (set) => ({
      feed: "all",
      groupMode: false,
      sortMode: "newest",
      contentView: "all",
      sourceFilter: null,
      typeFilter: null,
      searchQuery: "",
      genreFilter: null,
      minRating: null,
      whitelistOnly: false,
      density: "comfortable" as Density,
      _hasHydrated: false,
      setHasHydrated: (v) => set({ _hasHydrated: v }),
      setFeed: (feed) => set({ feed }),
      toggleGroupMode: () => set((s) => ({ groupMode: !s.groupMode })),
      setSortMode: (sortMode) => set({ sortMode }),
      setContentView: (contentView) => set({ contentView }),
      setSourceFilter: (sourceFilter) => set({ sourceFilter }),
      setTypeFilter: (typeFilter) => set({ typeFilter }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setGenreFilter: (genreFilter) => set({ genreFilter }),
      setMinRating: (minRating) => set({ minRating }),
      setWhitelistOnly: (whitelistOnly) => set({ whitelistOnly }),
      setDensity: (density) => set({ density }),
      toggleDensity: () => set((s) => ({ density: s.density === "compact" ? "comfortable" : "compact" })),
      resetFilters: () =>
        set({
          sourceFilter: null,
          typeFilter: null,
          searchQuery: "",
          genreFilter: null,
          minRating: null,
          whitelistOnly: false,
        }),
    }),
    {
      name: "alltab-ui",
      storage: createJSONStorage(() => localStorage),
      // skipHydration true = hindari mismatch SSR (server default) vs client persisted value
      // hydration dilakukan manual via onRehydrateStorage + _hasHydrated
      partialize: (s) => ({
        feed: s.feed,
        groupMode: s.groupMode,
        sortMode: s.sortMode,
        contentView: s.contentView,
        sourceFilter: s.sourceFilter,
        typeFilter: s.typeFilter,
        searchQuery: s.searchQuery,
        genreFilter: s.genreFilter,
        minRating: s.minRating,
        whitelistOnly: s.whitelistOnly,
        density: s.density,
      }),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

// rehydrate on client — diperlukan karena skipHydration: true
if (typeof window !== "undefined") {
  void useUiStore.persist.rehydrate();
}
