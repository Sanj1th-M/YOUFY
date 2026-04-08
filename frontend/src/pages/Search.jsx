import { useSearch } from '../hooks/useSearch';
import SearchResultTile from '../components/Search/SearchResultTile';

export default function Search() {
  const { query, setQuery, results, loading, error } = useSearch();

  return (
    <div className="px-4 md:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      {/* Search bar */}
      <div className="relative mb-8 max-w-2xl">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search songs, artists, albums..."
          autoFocus
          className="w-full bg-elevated text-white rounded-full pl-12 pr-12 py-3.5 text-sm
                     border border-subtle focus:border-primary outline-none transition-colors"
        />
        {query && (
          <button onClick={() => setQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        )}
      </div>

      {/* States */}
      {!query && (
        <div className="flex flex-col items-center py-20 gap-3 text-gray-500">
          <svg className="w-16 h-16" fill="none" stroke="currentColor" strokeWidth="1.2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <p>Search for any song, artist or album</p>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-12 h-12 bg-elevated rounded" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-elevated rounded w-2/3" />
                <div className="h-3 bg-elevated rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="text-center py-12 text-red-400 text-sm">{error}</div>
      )}

      {!loading && !error && results && (
        <SearchResultTile results={results} />
      )}
    </div>
  );
}
