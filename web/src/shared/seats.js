// 審査員の座席ロック（#25）。
// RTDB の seats/{seat} = { device, at }。1 つの席を持てるのは 1 台だけ（ルールで他端末の上書きを拒否）。
// 席を持っている端末が消えると onDisconnect で自動的に外れる。形の制約は firebase/database.rules.json と揃えること。

export const SEATS_PATH = 'seats';
export const DEVICE_KEY = 'ippon.judge.device';
export const SEAT_KEY = 'ippon.judge.seat';
export const DEVICE_RE = /^d[a-z0-9]{8,32}$/;

// 端末 ID。localStorage に保存して再読み込みしても同じ ID を使う（使えないブラウザではそのページ限り）
export function newDeviceId(random = crypto.getRandomValues.bind(crypto)) {
  const bytes = random(new Uint8Array(12));
  return 'd' + Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

export function loadDeviceId(storage) {
  try {
    const saved = storage?.getItem(DEVICE_KEY);
    if (saved && DEVICE_RE.test(saved)) return saved;
    const id = newDeviceId();
    storage?.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return newDeviceId();
  }
}

// 席の状態: 'free' / 'mine' / 'taken'（他の端末が使用中）
export function seatState(claims, seat, device) {
  const c = claims?.[seat];
  if (!c || typeof c.device !== 'string') return 'free';
  return c.device === device ? 'mine' : 'taken';
}

// トランザクションの更新関数: 空いているか自分の席なら取り、他の端末の席なら中止（undefined）
export function claimUpdate(current, device, at) {
  if (current && current.device && current.device !== device) return undefined;
  return { device, at };
}

// トランザクションの更新関数: 自分の席なら外す（null）、それ以外は何もしない（undefined で中止）
export function releaseUpdate(current, device) {
  return current && current.device === device ? null : undefined;
}
