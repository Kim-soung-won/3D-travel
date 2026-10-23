// 시간 단위 일정 입력: 첫 도시 도착(날짜·시각), 숙박 도시의 출발 시각, 당일 도시·장소의 머무는 시간, 도시 안 날마다 시작 시각.
// 시각은 모두 그 도시의 현지 시각이다. 계산은 state/schedule.ts에 있다.
import {
  clampStay,
  DEFAULT_DAY_START,
  DEFAULT_LEAVE,
  DEFAULT_START,
  formatClock,
  formatOffset,
  formatSpan,
  formatWhen,
  isTime,
  MAX_STAY_MIN,
  STAY_STEP_MIN,
  type CityTime,
  type DayPlan,
  type PlaceTime,
  type Schedule,
  type TripStart,
} from '../state/schedule';

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

/** 도시 안 하루의 머리: 날짜, 시작 시각, 끝나는 시각. 첫날은 도착 뒤에 시작하고, 마지막 날이 출발을 넘기면 알린다 */
export function DayHead({ plan, label, onStart }: { plan: DayPlan; label: string; onStart: (t: string | undefined) => void }) {
  const end = plan.places.at(-1)?.leave;
  const late = end !== undefined && plan.leaveAt !== undefined ? end - plan.leaveAt : 0;
  return (
    <div className="day-head">
      <div className="trip-start">
        <span className="trip-start-label">{label}</span>
        <input
          type="time"
          value={formatClock(plan.start)}
          aria-label={`${label} 일정 시작 시각`}
          onChange={(e) => onStart(isTime(e.target.value) && e.target.value !== DEFAULT_DAY_START ? e.target.value : undefined)}
        />
        {end !== undefined ? (
          <span className="trip-start-hint">
            {formatClock(end)}에 끝 · 모두 {formatSpan(end - plan.begin)}
            {plan.pending && ' (경로를 찾는 중이라 바뀔 수 있음)'}
          </span>
        ) : (
          <span className="trip-start-hint">아직 장소가 없습니다</span>
        )}
      </div>
      {plan.arriveAt !== undefined && plan.begin > plan.start && (
        <p className="day-note">도시에 {formatClock(plan.arriveAt)}에 도착해서 그 뒤부터 시작합니다</p>
      )}
      {late > 0 && <p className="day-note warn">떠나는 시각({formatClock(plan.leaveAt!)})보다 {formatSpan(late)} 늦게 끝납니다. 머무는 시간을 줄이거나 다른 날로 옮기세요.</p>}
      {late <= 0 && plan.leaveAt !== undefined && end !== undefined && <p className="day-note">{formatClock(plan.leaveAt)}에 이 도시를 떠납니다</p>}
    </div>
  );
}

/** 세부 경유지의 머무는 시각과 머무는 시간. 여러 날이면 날을 고른다 */
export function PlaceTimes({ name, place, stayMin, onStay, days, day, onDay }: {
  name: string; place: PlaceTime | undefined; stayMin: number; onStay: (min: number) => void;
  /** 고를 수 있는 날 이름(1일째부터). 하루뿐이면 비운다 */
  days?: string[]; day?: number; onDay?: (day: number) => void;
}) {
  return (
    <div className="city-times" onClick={(e) => e.stopPropagation()}>
      {days && days.length > 1 && (
        <div className="city-times-row">
          <span className="city-times-key">날</span>
          <select value={day ?? 1} aria-label={`${name} 가는 날`} onChange={(e) => onDay?.(Number(e.target.value))}>
            {days.map((d, k) => <option key={k} value={k + 1}>{d}</option>)}
          </select>
        </div>
      )}
      <div className="city-times-row">
        <span className="city-times-key">시간</span>
        <span className="city-times-val">{place ? `${formatClock(place.arrive)} – ${formatClock(place.leave)}` : '…'}</span>
      </div>
      <div className="city-times-row">
        <span className="city-times-key">머무름</span>
        <StayStepper minutes={stayMin} label={name} onChange={onStay} />
      </div>
    </div>
  );
}
