// 경유지 목록(지구·도시 공용). 구간마다 수단·거리·시간을 보이고, 도로를 못 찾았으면 그 이유를 쓴다.
import type { ReactNode } from 'react';
import { formatKm, formatLatLon } from '../geo/geo';
import { formatDuration, MODES, type Mode } from '../geo/modes';
import type { LegState } from '../hooks/useLegs';
import type { Stop } from '../state/route';
import { ModePicker } from './ModePicker';

interface StopListProps {
  items: Stop[];
  legs: LegState[];
  modes: Mode[];
  selectedId: string | null;
  noun: string;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onRemove: (id: string) => void;
  onMode: (id: string, mode: Mode) => void;
  extra?: (item: Stop) => ReactNode;
}

export function StopList({ items, legs, modes, selectedId, noun, onSelect, onRename, onMove, onRemove, onMode, extra }: StopListProps) {
  return (
    <ol className="stops">
      {items.map((w, i) => {
        const leg = legs[i];
        return (
          <li key={w.id} className={w.id === selectedId ? 'stop is-selected' : 'stop'}>
            <div className="stop-row" onClick={() => onSelect(w.id)}>
              <span className="stop-num" aria-hidden="true">{i + 1}</span>
              <div className="stop-main">
                <input
                  className="stop-name"
                  value={w.name}
                  aria-label={`${i + 1}번 ${noun} 이름`}
                  onChange={(e) => onRename(w.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="stop-coord">{w.area || formatLatLon(w)}</span>
              </div>
              <div className="stop-actions">
                <button type="button" className="icon-btn" aria-label={`${i + 1}번 ${noun}를 위로`} disabled={i === 0}
                  onClick={(e) => { e.stopPropagation(); onMove(w.id, -1); }}>↑</button>
                <button type="button" className="icon-btn" aria-label={`${i + 1}번 ${noun}를 아래로`} disabled={i === items.length - 1}
                  onClick={(e) => { e.stopPropagation(); onMove(w.id, 1); }}>↓</button>
                <button type="button" className="icon-btn danger" aria-label={`${i + 1}번 ${noun} "${w.name}" 삭제`}
                  onClick={(e) => { e.stopPropagation(); onRemove(w.id); }}>✕</button>
              </div>
            </div>
            {extra?.(w)}
            {leg && (
              <div className="leg">
                <ModePicker value={w.mode} options={modes} onChange={(m) => onMode(w.id, m)} legLabel={`${i + 1}→${i + 2} 구간`} />
                <span className="leg-info">
                  {leg.loading ? (
                    '경로 찾는 중…'
                  ) : (
                    <>
                      {MODES[leg.mode].label} · {formatKm(leg.distanceKm)}
                      {(leg.mode !== 'plane' || leg.timeKnown) && <> · {leg.estimated ? '약 ' : ''}{formatDuration(leg.durationS)}</>}
                    </>
                  )}
                </span>
                {leg.note && <span className="leg-note">{leg.note}</span>}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
