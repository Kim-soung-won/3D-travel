// 고른 경유지에 바깥 링크(구글 지도 등)를 붙이는 칸. 칸을 떠나거나 Enter를 누르면 저장하고, 비우면 링크를 뗀다.
import { useEffect, useState } from 'react';
import { linkLabel, mapsSearchUrl, safeLink } from '../state/link';
import type { Stop } from '../state/route';

export function LinkField({ item, label, onChange }: { item: Stop; label: string; onChange: (link: string | undefined) => void }) {
  const [draft, setDraft] = useState(item.link ?? '');
  const [error, setError] = useState(false);
  useEffect(() => {
    setDraft(item.link ?? '');
    setError(false);
  }, [item.id, item.link]);

  const commit = () => {
    if (!draft.trim()) {
      setError(false);
      if (item.link) onChange(undefined);
      return;
    }
    const link = safeLink(draft);
    setError(!link);
    if (link && link !== item.link) onChange(link);
  };

  return (
    <div className="link-field" onClick={(e) => e.stopPropagation()}>
      <input
        type="url"
        inputMode="url"
        value={draft}
        placeholder="구글 지도 등 링크 붙여넣기"
        aria-label={`${label} 링크`}
        aria-invalid={error}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(item.link ?? '');
            setError(false);
          }
        }}
      />
      <a className="text-btn" href={mapsSearchUrl(item)} target="_blank" rel="noopener noreferrer">
        구글 지도에서 찾기 ↗
      </a>
      {error && <p className="reason">http:// 또는 https://로 시작하는 주소만 넣을 수 있습니다.</p>}
    </div>
  );
}

/** 저장된 링크를 여는 작은 글자 링크. 쓸 수 없는 주소면 그리지 않는다 */
export function OpenLink({ href, className, label }: { href?: string; className: string; label: string }) {
  const link = safeLink(href);
  if (!link) return null;
  return (
    <a className={className} href={link} target="_blank" rel="noopener noreferrer" aria-label={label} onClick={(e) => e.stopPropagation()}>
      {linkLabel(link)} ↗
    </a>
  );
}
