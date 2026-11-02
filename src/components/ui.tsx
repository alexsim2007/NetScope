import type { ReactNode } from 'react';
import {
  Activity,
  Box,
  CircleHelp,
  Laptop,
  Monitor,
  Router,
  Server,
  Smartphone,
  Tablet,
  Tv,
  Watch,
  Wifi,
  House,
  SearchX,
} from 'lucide-react';
import type { Device } from '../types';
import { humanize } from '../services/format';

export function DeviceIcon({
  device,
  size = 20,
}: {
  device: Pick<Device, 'deviceType' | 'icon'>;
  size?: number;
}) {
  const kind = device.icon === 'auto' ? device.deviceType : device.icon;
  const Icon =
    {
      laptop: Laptop,
      desktop: Monitor,
      smartphone: Smartphone,
      tablet: Tablet,
      tv: Tv,
      server: Server,
      router: Router,
      smartwatch: Watch,
      smart_home: House,
      wifi: Wifi,
      unknown: Box,
    }[kind] || Box;
  return <Icon size={size} strokeWidth={1.5} />;
}
export function Status({ value }: { value: string }) {
  return (
    <span className={`status status-${value}`}>
      <i aria-hidden="true" />
      {humanize(value)}
    </span>
  );
}
export function Empty({
  title,
  children,
  icon,
}: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon || <SearchX size={25} strokeWidth={1.4} />}</span>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}
export function Panel({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function PageTitle({
  title,
  children,
  action,
}: {
  eyebrow?: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading">
      <Activity className="pulse" size={28} />
      <p>Запуск NetScope…</p>
    </div>
  );
}
export function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="error-notice" role="alert">
      <CircleHelp size={17} />
      <span>{message}</span>
    </div>
  );
}
