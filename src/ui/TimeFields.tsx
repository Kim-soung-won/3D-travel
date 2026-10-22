// 시간 단위 일정 입력: 첫 도시 도착(날짜·시각), 숙박 도시의 출발 시각, 당일 도시·장소의 머무는 시간.
// 시각은 모두 그 도시의 현지 시각이다. 계산은 state/schedule.ts에 있다.
import { clampStay, DEFAULT_LEAVE, DEFAULT_START, formatOffset, formatSpan, formatWhen, isTime, MAX_STAY_MIN, STAY_STEP_MIN, type CityTime, type Schedule, type TripStart } from '../state/schedule';

/** 첫 도시 도착 날짜·시각. 날짜를 비우면 "n일차"로 보인다 */
export function TripStartField({ start, onChange }: { start: TripStart | undefined; onChange: (s: TripStart | undefined) => void }) {
  const s = start ?? DEFAULT_START;
  const set = (patch: Partial<TripStart>) => {
    const next = { ...s, ...patch };
    if (!next.date) delete next.date;
    onChange(next.time === DEFAULT_START.time && !next.date ? undefined : next);
  };
  return (
    <div className="trip-start">
      <span className="trip-start-label">첫 도시 도착</span>
      <input type="date" value={s.date ?? ''} aria-label="여행 시작 날짜 (비우면 n일차로 표시)" onChange={(e) => set({ date: e.target.value || undefined })} />
      <input type="time" value={s.time} aria-label="첫 도시 도착 시각 (현지)" onChange={(e) => set({ time: isTime(e.target.value) ? e.target.value : DEFAULT_START.time })} />
      {!s.date && <span className="trip-start-hint">날짜를 정하면 요일과 함께 보입니다</span>}
    </div>
  );
}

/** 머무는 시간 조절 (30분 단위, 0~24시간) */
export function StayStepper({ minutes, label, onChange }: { minutes: number; label: string; onChange: (min: number) => void }) {
  return (
    <span className="stay" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="icon-btn" aria-label={`${label} 머무는 시간 ${STAY_STEP_MIN}분 줄이기`} disabled={minutes <= 0} onClick={() => onChange(clampStay(minutes - STAY_STEP_MIN))}>−</button>
      <span className="stay-value" aria-live="polite">{formatSpan(minutes)}</span>
      <button type="button" className="icon-btn" aria-label={`${label} 머무는 시간 ${STAY_STEP_MIN}분 늘리기`} disabled={minutes >= MAX_STAY_MIN} onClick={() => onChange(clampStay(minutes + STAY_STEP_MIN))}>+</button>
    </span>
  );
}

interface CityTimesProps {
  name: string;
  nights: number;
  leaveAt: string | undefined;
  stayMin: number;
  time: CityTime | null;
  schedule: Schedule | null;
  last: boolean;
  onLeaveAt: (t: string | undefined) => void;
  onStay: (min: number) => void;
}

/** 도시의 도착·출발 시각과 머무는 시간. 숙박하면 출발 시각을, 당일이면 머무는 시간을 정한다 */
export function CityTimes({ name, nights, leaveAt, stayMin, time, schedule, last, onLeaveAt, onStay }: CityTimesProps) {
  const when = (ms: number) => (schedule && time ? formatWhen(ms, time.tz, schedule.base, schedule.withDate) : '…');
  return (
    <div className="city-times" onClick={(e) => e.stopPropagation()}>
      <div className="city-times-row">
        <span className="city-times-key">도착</span>
        <span className="city-times-val">{time ? when(time.arrive) : '시간대 확인 중…'}</span>
        {time && <span className="city-times-tz">현지 {formatOffset(time.arrive, time.tz)}</span>}
      </div>
      <div className="city-times-row">
        <span className="city-times-key">{last ? '여행 끝' : '출발'}</span>
        {nights > 0 ? (
          <>
            <span className="city-times-val">{time ? when(time.leave).replace(/\s\d\d:\d\d$/, '') : ''}</span>
            <input
              type="time"
              value={isTime(leaveAt) ? leaveAt : DEFAULT_LEAVE}
              aria-label={`${name} ${last ? '여행 끝' : '출발'} 시각 (현지)`}
              onChange={(e) => onLeaveAt(isTime(e.target.value) && e.target.value !== DEFAULT_LEAVE ? e.target.value : undefined)}
            />
          </>
        ) : (
          <span className="city-times-val">{time ? when(time.leave) : ''}</span>
        )}
      </div>
      {nights === 0 && (
        <div className="city-times-row">
          <span className="city-times-key">머무름</span>
          <StayStepper minutes={stayMin} label={name} onChange={onStay} />
        </div>
      )}
      {time && nights > 0 && <p className="city-times-note">머무는 시간 {formatSpan((time.leave - time.arrive) / 60000)}</p>}
    </div>
  );
}
