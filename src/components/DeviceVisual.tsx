import type { Device } from '../types';
import { DeviceIcon } from './ui';
export function RouterVisual() {
  return (
    <svg className="router-visual" viewBox="0 0 160 110" aria-hidden="true">
      <defs>
        <linearGradient id="router-case" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#505967" />
          <stop offset="1" stopColor="#151e2b" />
        </linearGradient>
      </defs>
      <path
        d="M28 63 20 13M53 57 51 6M109 57 111 6M132 63 140 13"
        stroke="#66768b"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path d="M28 62 20 13M132 62 140 13" stroke="#192431" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M16 72 42 51h77l25 21-4 23H21Z"
        fill="url(#router-case)"
        stroke="#66778c"
        strokeWidth="1"
      />
      <path d="M17 73h127l-4 22H21Z" fill="#101824" />
      <path d="M27 78h105" stroke="#2186ff" strokeWidth="2" />
      {[36, 43, 50, 57].map((x) => (
        <circle key={x} cx={x} cy="86" r="1.6" fill="#37dfbe" />
      ))}
      <path d="M70 62h20" stroke="#8eacd2" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
export function DeviceVisual({ device }: { device: Device }) {
  const kind = device.icon === 'auto' ? device.deviceType : device.icon;
  if (kind === 'router') return <RouterVisual />;
  const phone = ['smartphone', 'smartwatch'].includes(kind);
  const tablet = kind === 'tablet';
  const screen = ['laptop', 'desktop', 'tv', 'unknown'].includes(kind);
  if (phone || tablet)
    return (
      <svg className={`device-visual visual-${kind}`} viewBox="0 0 100 86" aria-hidden="true">
        <rect
          x={tablet ? 20 : 32}
          y="3"
          width={tablet ? 60 : 36}
          height="76"
          rx="8"
          fill="#1b2330"
          stroke="#71849d"
          strokeWidth="1.5"
        />
        <rect
          x={tablet ? 24 : 36}
          y="9"
          width={tablet ? 52 : 28}
          height="63"
          rx="4"
          fill="var(--accent-soft)"
        />
        <path
          d={tablet ? 'M28 61 67 13h8v16L38 71H28Z' : 'M38 49 61 12h3v20L42 69h-4Z'}
          fill="var(--accent)"
          opacity=".65"
        />
        <path d="M45 7h10" stroke="#05080d" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  if (screen)
    return (
      <svg className={`device-visual visual-${kind}`} viewBox="0 0 100 86" aria-hidden="true">
        <rect
          x="12"
          y="10"
          width="76"
          height="51"
          rx="4"
          fill="#15202d"
          stroke="#6c7e96"
          strokeWidth="1.5"
        />
        <rect x="16" y="14" width="68" height="42" rx="1" fill="var(--accent-soft)" />
        <path d="M17 44 60 15h23v12L40 55H17Z" fill="var(--accent)" opacity=".52" />
        {kind === 'laptop' ? (
          <path d="m12 62-10 8c0 3 4 5 9 5h78c5 0 9-2 9-5l-10-8Z" fill="#67778a" />
        ) : (
          <>
            <path d="M46 62h8v12h-8Z" fill="#5f7086" />
            <path d="M34 75h32" stroke="#7a8ca5" strokeWidth="3" strokeLinecap="round" />
          </>
        )}
      </svg>
    );
  return (
    <div className={`device-visual visual-object kind-${kind}`}>
      <DeviceIcon device={device} size={35} />
      <i />
      <i />
    </div>
  );
}
