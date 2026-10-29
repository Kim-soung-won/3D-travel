import { useState } from 'react';
import { MODES, type Mode } from '../geo/modes';
import { MODE_ICON } from './modeIcons';

/**
 * 구간 수단 고르기. 아이콘 버튼마다 이름을 aria-label·title로 단다.
 * 고를 수 없는 수단(blocked)은 흐리게 두고, 누르면 바꾸지 않고 이유를 글로 보인다.
 */
export function ModePicker({ value, options, onChange, legLabel, blocked }: {
  value: Mode;
  options: Mode[];
  onChange: (m: Mode) => void;
  legLabel: string;
  blocked?: Partial<Record<Mode, string | null>>;
}) {
  const [why, setWhy] = useState<string | null>(null);
  return (
    <>
      <div className="mode-picker" role="radiogroup" aria-label={`${legLabel} 이동 수단`}>
        {options.map((m) => {
          const reason = blocked?.[m];
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={value === m}
              aria-disabled={reason ? true : undefined}
              aria-label={reason ? `${MODES[m].label} (고를 수 없음)` : MODES[m].label}
              title={reason ?? MODES[m].label}
              className={`mode${value === m ? ' is-on' : ''}${reason ? ' is-blocked' : ''}`}
              style={{ ['--mode-color' as string]: MODES[m].color }}
              onClick={(e) => {
                e.stopPropagation();
                if (reason) return setWhy(reason);
                setWhy(null);
                onChange(m);
              }}
              dangerouslySetInnerHTML={{ __html: MODE_ICON[m] }}
            />
          );
        })}
      </div>
      {why && <p className="reason mode-why" role="status">{why}</p>}
    </>
  );
}
