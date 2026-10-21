import { MODES, type Mode } from '../geo/modes';
import { MODE_ICON } from './modeIcons';

/** 구간 수단 고르기. 아이콘 버튼마다 이름을 aria-label·title로 단다 */
export function ModePicker({ value, options, onChange, legLabel }: { value: Mode; options: Mode[]; onChange: (m: Mode) => void; legLabel: string }) {
  return (
    <div className="mode-picker" role="radiogroup" aria-label={`${legLabel} 이동 수단`}>
      {options.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={value === m}
          aria-label={MODES[m].label}
          title={MODES[m].label}
          className={value === m ? 'mode is-on' : 'mode'}
          style={{ ['--mode-color' as string]: MODES[m].color }}
          onClick={(e) => {
            e.stopPropagation();
            onChange(m);
          }}
          dangerouslySetInnerHTML={{ __html: MODE_ICON[m] }}
        />
      ))}
    </div>
  );
}
