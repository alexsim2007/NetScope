import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/app/App';
import { api } from '../src/services/ipc';
import { useUI } from '../src/stores/ui';
import { device, settings, snapshot } from './fixtures/network';
import type { Snapshot } from '../src/types';
import { MetricChart } from '../src/components/MetricChart';
import { NetworkGraph } from '../src/components/NetworkGraph';

vi.mock('../src/services/ipc', () => ({
  desktopAvailable: () => true,
  errorMessage: (e: Error) => e?.message || 'Request failed',
  api: {
    snapshot: vi.fn(),
    subscribe: vi.fn(),
    navigate: vi.fn(),
    metrics: vi.fn(),
    events: vi.fn(),
    settings: vi.fn(),
    connect: vi.fn(),
    checkConnection: vi.fn(),
    disconnect: vi.fn(),
    refresh: vi.fn(),
    pause: vi.fn(),
    updateDevice: vi.fn(),
    saveSettings: vi.fn(),
    desktopStatus: vi.fn(),
    setAutostart: vi.fn(),
    testNotification: vi.fn(),
    openFeedback: vi.fn(),
  },
}));
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>,
    ),
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  window.location.hash = '#/';
  localStorage.clear();
  useUI.setState({
    selectedId: null,
    setupOpen: false,
    toast: null,
    collapsed: false,
    theme: 'system',
  });
  vi.mocked(api.snapshot).mockResolvedValue(structuredClone(snapshot));
  vi.mocked(api.subscribe).mockResolvedValue(() => {});
  vi.mocked(api.navigate).mockResolvedValue(() => {});
  vi.mocked(api.metrics).mockResolvedValue([]);
  vi.mocked(api.events).mockResolvedValue([]);
  vi.mocked(api.settings).mockResolvedValue(settings);
  vi.mocked(api.desktopStatus).mockResolvedValue({
    platform: 'macos',
    alcoveInstalled: true,
    autostartEnabled: false,
  });
});
describe('desktop workspace', () => {
  it('renders overview with actual device and no invented history', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: 'Обзор' })).toBeInTheDocument();
    expect(screen.getByLabelText('Состояние сети')).toBeInTheDocument();
    expect(screen.getAllByText('Sample MacBook').length).toBeGreaterThan(0);
    expect(screen.queryByRole('img', { name: 'Reported traffic history' })).not.toBeInTheDocument();
    expect(screen.queryByText('ДЕМО')).not.toBeInTheDocument();
  });
  it('searches and filters devices by name, IP, MAC and status', async () => {
    window.location.hash = '#/devices';
    mount();
    const input = await screen.findByRole('textbox', {
      name: 'Поиск устройств',
    });
    const user = userEvent.setup();
    await user.type(input, '192.168.50.21');
    expect(screen.getByRole('button', { name: /Sample MacBook/ })).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, 'not-a-device');
    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument();
    await user.clear(input);
    await user.selectOptions(screen.getByLabelText('Состояние устройств'), 'offline');
    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument();
  });
  it('selects a device and saves its local name, type and favorite preference', async () => {
    window.location.hash = '#/devices';
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Sample MacBook/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('RSSI (исходный)')).toBeInTheDocument();
    expect(within(dialog).getByText('78')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('tab', { name: 'Настройки' }));
    await user.type(within(dialog).getByLabelText('Своё название'), 'My laptop');
    await user.click(within(dialog).getByLabelText(/Избранное устройство/));
    vi.mocked(api.updateDevice).mockResolvedValue({
      ...device,
      customName: 'My laptop',
      favorite: true,
    });
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(api.updateDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          id: device.id,
          customName: 'My laptop',
          favorite: true,
        }),
      ),
    );
  });
  it('updates the overview and history from a native event', async () => {
    let receive: ((s: Snapshot) => void) | undefined;
    vi.mocked(api.subscribe).mockImplementation(async (cb) => {
      receive = cb;
      return () => {};
    });
    mount();
    await screen.findByRole('heading', { name: 'Обзор' });
    act(() =>
      receive?.({
        ...snapshot,
        devices: [{ ...device, customName: 'Renamed by event' }],
      }),
    );
    expect((await screen.findAllByText('Renamed by event')).length).toBeGreaterThan(0);
    expect(api.metrics).toHaveBeenCalled();
  });
  it('keeps the device inspector closed after a graph selection is cleared', async () => {
    window.location.hash = '#/network';
    mount();
    const user = userEvent.setup();
    fireEvent.keyDown(
      await screen.findByRole('button', { name: 'Выбрать устройство Sample MacBook' }),
      { key: 'Enter' },
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Закрыть сведения об устройстве' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(useUI.getState().selectedId).toBeNull();
  });
  it('shows router failure without marking every device offline', async () => {
    vi.mocked(api.snapshot).mockResolvedValue({
      ...snapshot,
      connection: 'reconnecting',
      error: 'Unable to reach your router.',
      devices: [{ ...device, status: 'unknown' }],
      nextRetrySeconds: 10,
    });
    mount();
    expect(await screen.findByText('Связь прервана')).toBeInTheDocument();
    expect(screen.getByText(/через 10 с/)).toBeInTheDocument();
    expect(screen.getByLabelText('Состояние сети')).toHaveTextContent('—');
    expect(screen.getByLabelText('Sample MacBook · Неизвестно')).toBeInTheDocument();
  });
  it('reloads native state after returning from the system tray', async () => {
    mount();
    await screen.findByRole('heading', { name: 'Обзор' });
    vi.mocked(api.snapshot).mockResolvedValue({
      ...snapshot,
      connection: 'paused',
      devices: [{ ...device, status: 'unknown' }],
    });
    act(() => {
      window.dispatchEvent(new window.Event('focus'));
    });
    expect(await screen.findByText('Наблюдение на паузе')).toBeInTheDocument();
    expect(api.refresh).not.toHaveBeenCalled();
  });
  it('saves validated monitoring settings through IPC', async () => {
    window.location.hash = '#/settings';
    mount();
    const user = userEvent.setup();
    const input = await screen.findByLabelText('Интервал обновления');
    await user.clear(input);
    await user.type(input, '10');
    await user.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
    await waitFor(() =>
      expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ pollSeconds: 10 })),
    );
  });
  it('switches both themes immediately and remembers the choice across navigation', async () => {
    window.location.hash = '#/settings';
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Тёмная' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('netscope.theme')).toBe('dark');
    await user.click(screen.getByRole('link', { name: 'Обзор' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.click(screen.getByRole('button', { name: 'Включить светлую тему' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('netscope.theme')).toBe('light');
  });
  it('follows system theme changes only while System is selected', async () => {
    let dark = false;
    const media = new EventTarget();
    const previousMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => Object.assign(media, { matches: dark }),
    });
    try {
      mount();
      await screen.findByRole('heading', { name: 'Обзор' });
      expect(document.documentElement.dataset.theme).toBe('light');
      dark = true;
      act(() => media.dispatchEvent(new Event('change')));
      expect(document.documentElement.dataset.theme).toBe('dark');
      act(() => useUI.getState().setTheme('light'));
      act(() => media.dispatchEvent(new Event('change')));
      expect(document.documentElement.dataset.theme).toBe('light');
    } finally {
      if (previousMedia) Object.defineProperty(window, 'matchMedia', previousMedia);
      else Reflect.deleteProperty(window, 'matchMedia');
    }
  });

  it('opens a model with blank fields even when a private profile was previously saved', async () => {
    vi.mocked(api.snapshot).mockResolvedValue({
      ...snapshot,
      router: { ...snapshot.router!, address: 'http://10.77.33.1' },
    });
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByTitle('Настроить подключение'));
    await user.click(screen.getByRole('button', { name: 'Подключить маршрутизатор' }));
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Адрес маршрутизатора')).toHaveValue('');
    expect(within(dialog).getByLabelText('Имя пользователя')).toHaveValue('');
    expect(within(dialog).getByLabelText('Пароль')).toHaveValue('');
    await user.type(within(dialog).getByLabelText('Адрес маршрутизатора'), '10.1.2.3');
    await user.type(within(dialog).getByLabelText('Имя пользователя'), 'test-user');
    await user.click(within(dialog).getByRole('button', { name: 'Назад' }));
    await user.click(screen.getByRole('button', { name: /D-Link DIR-815S/ }));
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(screen.getByLabelText('Адрес маршрутизатора')).toHaveValue('');
    expect(screen.getByLabelText('Имя пользователя')).toHaveValue('');
  });
  it('changes OS autostart only after an explicit switch action', async () => {
    window.location.hash = '#/settings';
    vi.mocked(api.setAutostart).mockResolvedValue({
      platform: 'macos',
      alcoveInstalled: true,
      autostartEnabled: true,
    });
    mount();
    const user = userEvent.setup();
    const toggle = await screen.findByRole('switch', { name: /Запускать при входе/ });
    expect(toggle).not.toBeChecked();
    expect(api.setAutostart).not.toHaveBeenCalled();
    await user.click(toggle);
    await waitFor(() => expect(api.setAutostart).toHaveBeenCalledWith(true));
    expect(await screen.findByText('Автозапуск включён')).toBeInTheDocument();
  });
  it('opens the fixed feedback destination without sending network data', async () => {
    window.location.hash = '#/support';
    vi.mocked(api.openFeedback).mockResolvedValue(undefined);
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Открыть Telegram/ }));
    expect(api.openFeedback).toHaveBeenCalledWith();
    expect(screen.getByText('Telegram @allllllIlIl')).toBeInTheDocument();
    expect(screen.getByText('Модель, ревизия, прошивка')).toBeInTheDocument();
  });
  it('requests history for the selected device and period', async () => {
    window.location.hash = '#/analytics';
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '24 часа' }));
    await user.selectOptions(screen.getByLabelText('Устройство на графике'), device.id);
    await waitFor(() =>
      expect(api.metrics).toHaveBeenCalledWith(86400, device.id, {
        mode: 'live',
        routerId: 'test',
      }),
    );
  });
  it('shows an IPC error as a readable startup error', async () => {
    vi.mocked(api.snapshot).mockRejectedValue(new Error('Local database unavailable'));
    mount();
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent(
      'Local database unavailable',
    );
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });
});
describe('first launch and honest empty states', () => {
  it('starts Demo Mode only after the user explicitly chooses it', async () => {
    vi.mocked(api.snapshot).mockResolvedValue({
      ...snapshot,
      router: null,
      devices: [],
      connection: 'disconnected',
    });
    vi.mocked(api.connect).mockResolvedValue({ ...snapshot, mode: 'demo' });
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Подключить маршрутизатор/ }));
    await user.click(screen.getByRole('button', { name: /Открыть демосеть/ }));
    expect(api.connect).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Продолжить/ }));
    expect(await screen.findByRole('heading', { name: 'Подключено' })).toBeInTheDocument();
    expect(api.connect).toHaveBeenCalledWith('demo', '', '', '');
    await user.click(screen.getByRole('button', { name: /Открыть обзор/ }));
    expect(screen.getByText('ДЕМО')).toBeInTheDocument();
  });
  it('keeps failed router setup in Live Mode and clears the password', async () => {
    vi.mocked(api.snapshot).mockResolvedValue({
      ...snapshot,
      router: null,
      devices: [],
      connection: 'disconnected',
    });
    vi.mocked(api.connect).mockRejectedValue(new Error('Authentication failed.'));
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Подключить маршрутизатор/ }));
    await user.click(screen.getByRole('button', { name: /Продолжить/ }));
    await user.type(screen.getByLabelText('Адрес маршрутизатора'), '192.168.0.1');
    await user.type(screen.getByLabelText('Имя пользователя'), 'admin');
    await user.type(screen.getByLabelText('Пароль'), 'not-real');
    await user.click(screen.getByRole('button', { name: /Проверить и подключить/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Authentication failed.');
    expect(screen.getByLabelText('Пароль')).toHaveValue('');
    expect(api.connect).toHaveBeenCalledTimes(1);
    expect(api.connect).toHaveBeenCalledWith('live', '192.168.0.1', 'admin', 'not-real');
  });
  it('checks router availability separately without submitting credentials or enabling demo', async () => {
    vi.mocked(api.snapshot).mockResolvedValue({
      ...snapshot,
      router: null,
      devices: [],
      connection: 'disconnected',
    });
    vi.mocked(api.checkConnection).mockResolvedValue({ httpStatus: 401, digestAvailable: true });
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Подключить маршрутизатор/ }));
    await user.click(screen.getByRole('button', { name: /Продолжить/ }));
    await user.type(screen.getByLabelText('Адрес маршрутизатора'), '192.168.0.1');
    await user.type(screen.getByLabelText('Пароль'), 'not-sent');
    await user.click(screen.getByRole('button', { name: 'Проверить доступность' }));
    expect(
      await screen.findByText(/Маршрутизатор доступен, Digest поддерживается/),
    ).toBeInTheDocument();
    expect(api.checkConnection).toHaveBeenCalledWith('192.168.0.1');
    expect(api.connect).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Пароль')).toHaveValue('not-sent');
    expect(screen.queryByText('ДЕМО')).not.toBeInTheDocument();
  });
  it('renders a network map empty state and never invents nodes', () => {
    render(<NetworkGraph snapshot={{ ...snapshot, devices: [] }} />);
    expect(screen.getByText('Пока нет устройств')).toBeInTheDocument();
  });
  it('renders the interactive graph and selects a supplied device', () => {
    render(<NetworkGraph snapshot={snapshot} />);
    expect(screen.getByLabelText('Карта локальной сети')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сбросить расположение' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Показать всю сеть' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Sample MacBook'));
    expect(useUI.getState().selectedId).toBe(device.id);
  });
  it('does not turn null counters into zero-valued chart data', () => {
    render(
      <MetricChart
        data={[
          {
            timestamp: 1000,
            txBps: null,
            rxBps: null,
            linkRate: null,
            rssiRaw: null,
            connectedDevices: null,
          },
        ]}
      />,
    );
    expect(screen.getByText('Ожидание данных')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
