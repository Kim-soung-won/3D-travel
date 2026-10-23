// 겹치는 라벨 풀기: 라벨은 핀 바로 위에 놓이는데, 가까운 핀끼리는 라벨이 겹친다.
// 우선순위(고른 것 → 번호 순)대로 놓으면서, 이미 놓인 라벨과 겹치면 그 위로 띄운다(lift).
// 띄운 라벨과 핀 사이는 화면에서 세로줄로 잇는다. 지구본 라벨과 도시 지도 마커가 함께 쓴다.

export interface LabelBox {
  /** 핀 위치(라벨 아래 가운데), 화면 px */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 작을수록 먼저 제자리에 놓인다 */
  priority: number;
}

const GAP = 3;
/** 이만큼 넘게 띄워야 하면 포기하고 제자리에 둔다(겹침이 너무 많은 경우) */
const MAX_LIFT = 240;

/** 라벨마다 위로 띄울 거리(px). 입력 순서대로 돌려준다 */
export function liftLabels(boxes: LabelBox[]): number[] {
  const lifts = boxes.map(() => 0);
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[a].priority - boxes[b].priority || a - b);
  const placed: { l: number; r: number; t: number; b: number }[] = [];
  for (const i of order) {
    const { x, y, w, h } = boxes[i];
    const l = x - w / 2;
    const r = x + w / 2;
    let bottom = y;
    // 겹치는 라벨이 있으면 그 라벨 위로 올라가고, 다시 검사한다. 놓인 라벨 수만큼이면 끝난다
    for (let guard = 0; guard <= placed.length; guard++) {
      const hit = placed.find((p) => l < p.r + GAP && r > p.l - GAP && bottom - h < p.b + GAP && bottom > p.t - GAP);
      if (!hit) break;
      bottom = hit.t - GAP;
    }
    const lift = y - bottom;
    if (lift > MAX_LIFT) bottom = y;
    lifts[i] = y - bottom;
    placed.push({ l, r, t: bottom - h, b: bottom });
  }
  return lifts;
}
