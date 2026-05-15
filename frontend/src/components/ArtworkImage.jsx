import { useEffect, useMemo, useState } from 'react';
import { getArtworkSources } from '../utils/artwork';

export default function ArtworkImage({
  item,
  src = '',
  sources = [],
  fallbackSrc = '/logo.svg',
  size = 512,
  onError,
  ...props
}) {
  const candidates = useMemo(() => {
    const sourceItem = {
      ...(item || {}),
      thumbnail: src || item?.thumbnail || '',
    };

    return [
      ...sources,
      ...getArtworkSources(sourceItem, { fallback: fallbackSrc, size }),
    ].filter((value, index, list) => value && list.indexOf(value) === index);
  }, [fallbackSrc, item, size, sources, src]);

  const sourceKey = candidates.join('|');
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [sourceKey]);

  function handleError(event) {
    if (sourceIndex < candidates.length - 1) {
      setSourceIndex(index => index + 1);
      return;
    }

    if (typeof onError === 'function') {
      onError(event);
    }
  }

  return (
    <img
      {...props}
      src={candidates[sourceIndex] || fallbackSrc}
      referrerPolicy="no-referrer"
      decoding="async"
      onError={handleError}
    />
  );
}
