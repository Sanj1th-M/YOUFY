import { useEffect, useState } from 'react';
import { TrendingSection, RecentlyPlayed } from '../components/Home/TrendingSection';
import RecommendedForYou from '../components/Home/RecommendedForYou';
import { getTrending } from '../services/api';
import useAuthStore from '../store/useAuthStore';

export default function Home() {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const user = useAuthStore(s => s.user);

  const userName = user?.displayName || user?.email?.split('@')[0] || 'Guest';

  useEffect(() => {
    getTrending()
      .then(data => setSections(data.sections || []))
      .catch(() => setError('Could not load trending. Is your backend running?'))
      .finally(() => setLoading(false));
  }, []);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="px-4 md:px-8 py-6 max-w-[1800px] mx-auto space-y-8">
      <header>
        <h1 className="text-white text-2xl md:text-3xl font-bold">
          {greeting()}, {userName}
        </h1>
        <p className="text-muted text-sm mt-1">Ad-free music, powered by YouTube</p>
      </header>

      <RecentlyPlayed />

      <RecommendedForYou userId={user?.uid} />

      {loading ? (
        <TrendingSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center py-16 gap-3 text-gray-500">
          <svg className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
          </svg>
          <p className="text-sm">{error}</p>
        </div>
      ) : (
        <TrendingSection sections={sections} />
      )}
    </div>
  );
}

function TrendingSkeleton() {
  return (
    <section>
      <div className="h-7 w-32 bg-elevated rounded-lg mb-4 animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
        {Array(12).fill(0).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="w-full aspect-square bg-elevated rounded-lg mb-3" />
            <div className="h-3.5 bg-elevated rounded w-3/4 mb-2" />
            <div className="h-3 bg-elevated rounded w-1/2" />
          </div>
        ))}
      </div>
    </section>
  );
}
