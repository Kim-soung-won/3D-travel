// 공유: 링크(일정을 URL # 뒤에 압축), 이미지 카드, 파일 내보내기·가져오기, 휴대폰 공유 시트.
// 받은 일정은 바로 덮어쓰지 않고 미리 본 뒤 가져온다. 계획: docs/plan/sharing.md
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { canvasToBlob, cardFileName, drawTripCard } from '../share/card';
import { encodeTrip, shareUrl } from '../share/codec';
import { fromShared, toShared, TripFormatError } from '../share/format';
import { cityDays, formatDayRange, formatTrip, nightsOf, totalNights } from '../state/itinerary';
import type { Waypoint } from '../state/route';

/** 이 주소로 만든 링크를 다른 기기에서 열 수 있는가 */
export const isLocalHost = (host = location.hostname) => /^(localhost|127\.0\.0\.1|\[::1\]|.+\.localhost)$/.test(host);

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className="modal" aria-label={title} onCancel={(e) => (e.preventDefault(), onClose())} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="modal-body">
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}>✕</button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 파일을 읽어 일정으로. 실패하면 TripFormatError */
export async function readTripFile(file: File): Promise<Waypoint[]> {
  if (file.size > 1_000_000) throw new TripFormatError('파일이 너무 큽니다 (최대 1MB)');
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new TripFormatError('여행 지구본 일정 파일(.json)이 아닙니다');
  }
  return fromShared(data);
}

export function ShareDialog({ waypoints, onClose, onImportFile }: { waypoints: Waypoint[]; onClose: () => void; onImportFile: (file: File) => void }) {
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState<'idle' | 'done' | 'fail'>('idle');
  const [cardUrl, setCardUrl] = useState('');
  const [message, setMessage] = useState('');
  const cardBlob = useRef<Blob | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const empty = waypoints.length === 0;

  useEffect(() => {
    if (empty) return;
    let alive = true;
    encodeTrip(waypoints).then((code) => alive && setLink(shareUrl(code)));
    canvasToBlob(drawTripCard(waypoints)).then((blob) => {
      if (!alive) return;
      cardBlob.current = blob;
      setCardUrl(URL.createObjectURL(blob));
    });
    return () => {
      alive = false;
    };
  }, [waypoints, empty]);
  useEffect(() => () => void (cardUrl && URL.revokeObjectURL(cardUrl)), [cardUrl]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied('done');
    } catch {
      setCopied('fail');
    }
  };
  const title = `여행 일정 ${formatTrip(totalNights(waypoints))}`;
  const canShareLink = typeof navigator.share === 'function';
  const cardFile = () => cardBlob.current && new File([cardBlob.current], cardFileName(waypoints), { type: 'image/png' });
  const canShareFiles = (() => {
    try {
      const f = cardFile();
      return !!f && typeof navigator.canShare === 'function' && navigator.canShare({ files: [f] });
    } catch {
      return false;
    }
  })();
  const shareSheet = async (data: ShareData) => {
    try {
      await navigator.share(data);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMessage('공유 창을 열지 못했습니다.');
    }
  };

  return (
    <Modal title="일정 공유" onClose={onClose}>
      {empty ? (
        <p className="share-note">공유할 일정이 없습니다. 지구본에서 도시를 먼저 추가하세요. 받은 일정 파일은 아래에서 가져올 수 있습니다.</p>
      ) : (
        <>
          <section className="share-section">
            <h3>링크</h3>
            <p className="share-note">링크 안에 일정이 들어 있어 서버에 저장하지 않습니다. 받은 사람은 링크를 열어 보고 자기 일정으로 가져올 수 있습니다. 공유한 뒤 고친 내용은 링크에 반영되지 않습니다.</p>
            <div className="share-row">
              <input className="share-link" readOnly value={link || '링크 만드는 중…'} aria-label="공유 링크" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn" disabled={!link} onClick={copy}>
                {copied === 'done' ? '복사됨' : '링크 복사'}
              </button>
            </div>
            {copied === 'fail' && <p className="share-warn">복사하지 못했습니다. 링크 칸을 눌러 직접 복사하세요.</p>}
            {isLocalHost() && <p className="share-warn">지금 주소({location.host})는 이 컴퓨터에서만 열립니다. 다른 사람에게 보내려면 배포한 주소에서 링크를 만드세요.</p>}
            {canShareLink && link && (
              <button type="button" className="text-btn" onClick={() => shareSheet({ title, url: link })}>다른 앱으로 링크 보내기</button>
            )}
          </section>
          <section className="share-section">
            <h3>이미지 카드</h3>
            {cardUrl ? <img className="share-card" src={cardUrl} alt={`${title} 이미지 카드 미리보기`} /> : <p className="share-note">이미지 만드는 중…</p>}
            <div className="share-row">
              <button type="button" className="btn" disabled={!cardBlob.current} onClick={() => cardBlob.current && download(cardBlob.current, cardFileName(waypoints))}>이미지 저장</button>
              {canShareFiles && (
                <button type="button" className="btn" onClick={() => shareSheet({ title, files: [cardFile()!] })}>이미지 보내기</button>
              )}
            </div>
          </section>
        </>
      )}
      <section className="share-section">
        <h3>파일</h3>
        <p className="share-note">일정을 파일(.json)로 백업하거나, 받은 파일을 가져옵니다.</p>
        <div className="share-row">
          <button
            type="button"
            className="btn"
            disabled={empty}
            onClick={() => download(new Blob([JSON.stringify(toShared(waypoints), null, 2)], { type: 'application/json' }), `travel-globe-${formatTrip(totalNights(waypoints)).replace(/\s/g, '')}.json`)}
          >
            파일로 내보내기
          </button>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>파일 가져오기</button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) onImportFile(f);
            }}
          />
        </div>
      </section>
      {message && <p className="share-warn" role="status">{message}</p>}
    </Modal>
  );
}

export type Incoming = { source: '링크' | '파일'; waypoints: Waypoint[] } | { source: '링크' | '파일'; error: string };

/** 받은 일정 미리보기. 가져오기 전에는 내 일정을 바꾸지 않는다 */
export function IncomingDialog({ incoming, hasOwnTrip, onImport, onClose }: { incoming: Incoming; hasOwnTrip: boolean; onImport: (w: Waypoint[]) => void; onClose: () => void }) {
  if ('error' in incoming)
    return (
      <Modal title={`공유받은 ${incoming.source === '링크' ? '링크를' : '파일을'} 열지 못했습니다`} onClose={onClose}>
        <p className="share-warn">{incoming.error}</p>
        <p className="share-note">내 일정은 그대로입니다. 보낸 사람에게 {incoming.source === '링크' ? '링크 전체를 다시 복사해' : '파일을 다시'} 보내 달라고 하세요.</p>
        <div className="share-row">
          <button type="button" className="btn primary" onClick={onClose}>확인</button>
        </div>
      </Modal>
    );
  const w = incoming.waypoints;
  const days = cityDays(w);
  return (
    <Modal title="공유받은 일정" onClose={onClose}>
      <p className="incoming-sum">
        <strong>{formatTrip(totalNights(w))}</strong> · 도시 {w.length}곳
      </p>
      <ol className="incoming-list">
        {w.map((c, i) => (
          <li key={c.id}>
            <span className="incoming-name">{i + 1}. {c.name}</span>
            <span className="incoming-meta">
              {nightsOf(c) ? `${nightsOf(c)}박` : '당일'} · {formatDayRange(days[i])}
              {c.stops.length > 0 && ` · 세부 ${c.stops.length}곳`}
            </span>
          </li>
        ))}
      </ol>
      {hasOwnTrip && <p className="share-note">가져오면 지금 일정이 바뀝니다. 바로 [되돌리기]로 원래 일정으로 돌아갈 수 있습니다.</p>}
      <div className="share-row">
        <button type="button" className="btn primary" onClick={() => onImport(w)} disabled={!w.length}>내 일정으로 가져오기</button>
        <button type="button" className="btn" onClick={onClose}>가져오지 않기</button>
      </div>
    </Modal>
  );
}
