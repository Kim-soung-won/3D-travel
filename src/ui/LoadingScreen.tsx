// 화면 전환용 로딩 화면. 덮이는 동안 뒤 화면을 바꾸고, 새 화면이 준비되면 걷힌다.
export type Curtain = 'hidden' | 'covering' | 'covered' | 'revealing';

export function LoadingScreen({ state, title, subtitle, error, onRetry, onBack }: {
  state: Curtain;
  title: string;
  subtitle: string;
  error?: string | null;
  onRetry?: () => void;
  onBack?: () => void;
}) {
  if (state === 'hidden') return null;
  return (
    <div className={`curtain curtain-${state}`} role="status" aria-live="polite">
      <div className="curtain-body">
        <div className="curtain-globe" aria-hidden="true" />
        <p className="curtain-title">{title}</p>
        {error ? (
          <>
            <p className="curtain-error">{error}</p>
            <div className="actions">
              {onRetry && <button type="button" className="btn primary" onClick={onRetry}>다시 시도</button>}
              {onBack && <button type="button" className="btn" onClick={onBack}>지구로 돌아가기</button>}
            </div>
          </>
        ) : (
          <p className="curtain-sub">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
