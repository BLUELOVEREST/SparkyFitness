import { useState } from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderWithClient } from '../test-utils';
import { ModelDiscovery } from '@/components/ai/ModelDiscovery';
import { discoverAIServiceModels } from '@/api/Settings/aiServiceSettingsService';
import { HttpApiError } from '@/api/api';

jest.mock('@/api/Settings/aiServiceSettingsService', () => ({
  discoverAIServiceModels: jest.fn(),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
const discover = jest.mocked(discoverAIServiceModels);

function Harness() {
  const [url, setUrl] = useState('https://first.example/v1');
  const [model, setModel] = useState('manual/model');
  const [key, setKey] = useState('');
  const [provider, setProvider] = useState('openai_compatible');
  const [service, setService] = useState('own-service');
  return (
    <>
      <input
        aria-label="Draft key"
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />
      <input
        aria-label="Provider"
        value={provider}
        onChange={(e) => setProvider(e.target.value)}
      />
      <input
        aria-label="Service"
        value={service}
        onChange={(e) => setService(e.target.value)}
      />
      <input
        aria-label="URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <ModelDiscovery
        serviceId={service}
        serviceType={provider}
        customUrl={url}
        apiKey={key}
        value={model}
        onChange={setModel}
      />
    </>
  );
}

beforeEach(() => jest.clearAllMocks());

it('sorts fetched IDs case-insensitively with deterministic exact-case ties', async () => {
  discover.mockResolvedValue({
    models: ['z/Last:latest', 'beta', 'alpha', 'Beta', 'Alpha'].map((id) => ({
      id,
    })),
  });
  renderWithClient(<Harness />);
  expect(discover).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Fetch models' }));
  const choose = await screen.findByRole('button', { name: 'Choose model' });
  expect(choose).toHaveTextContent('manual/model');
  fireEvent.click(choose);
  expect(
    screen.getAllByRole('option').map((option) => option.textContent)
  ).toEqual(['Alpha', 'alpha', 'Beta', 'beta', 'z/Last:latest']);
  fireEvent.click(screen.getByRole('option', { name: 'z/Last:latest' }));
  expect(choose).toHaveTextContent('z/Last:latest');
  expect(discover).toHaveBeenCalledTimes(1);
});

it('shows only a selected-ID trigger with fetched choices and an explicit manual entry path', async () => {
  discover.mockResolvedValue({
    models: [{ id: 'vendor/a' }, { id: 'vendor/b' }],
  });
  renderWithClient(<Harness />);
  expect(screen.getByRole('textbox', { name: 'Model ID' })).toHaveValue(
    'manual/model'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Fetch models' }));
  const trigger = await screen.findByRole('button', { name: 'Choose model' });
  expect(trigger).toHaveTextContent('manual/model');
  expect(
    screen.queryByRole('textbox', { name: 'Model ID' })
  ).not.toBeInTheDocument();
  fireEvent.click(trigger);
  expect(screen.getByRole('textbox', { name: 'Search models' })).toHaveValue(
    ''
  );
  expect(screen.getAllByRole('option')).toHaveLength(2);
  fireEvent.click(
    screen.getByRole('button', { name: 'Enter model ID manually' })
  );
  const manual = screen.getByRole('textbox', { name: 'Manual model ID' });
  expect(manual).toHaveValue('manual/model');
  fireEvent.change(manual, { target: { value: 'unlisted/provider-model' } });
  fireEvent.click(screen.getByRole('button', { name: 'Use model ID' }));
  expect(trigger).toHaveTextContent('unlisted/provider-model');
  fireEvent.click(trigger);
  expect(screen.getByRole('textbox', { name: 'Search models' })).toHaveValue(
    ''
  );
  expect(screen.getAllByRole('option')).toHaveLength(2);
  expect(discover).toHaveBeenCalledTimes(1);
});

it('keeps search independent from manual entry and supports keyboard navigation', async () => {
  discover.mockResolvedValue({
    models: [{ id: 'fuyao-work' }, { id: 'fuyao-data' }],
  });
  renderWithClient(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Fetch models' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Choose model' }));
  const search = screen.getByRole('textbox', { name: 'Search models' });
  fireEvent.keyDown(search, { key: 'ArrowDown' });
  const first = screen.getByRole('option', { name: 'fuyao-data' });
  const last = screen.getByRole('option', { name: 'fuyao-work' });
  expect(first).toHaveFocus();
  fireEvent.keyDown(first, { key: 'ArrowUp' });
  expect(last).toHaveFocus();
  fireEvent.keyDown(last, { key: 'Home' });
  expect(first).toHaveFocus();
  fireEvent.keyDown(first, { key: 'End' });
  expect(last).toHaveFocus();
  fireEvent.change(search, { target: { value: 'not-in-list' } });
  expect(screen.getByRole('status')).toHaveTextContent('No matching models.');
  expect(screen.getByLabelText('Model ID')).toHaveTextContent('manual/model');
  fireEvent.change(search, { target: { value: 'data' } });
  fireEvent.click(screen.getByRole('option', { name: 'fuyao-data' }));
  expect(screen.getByLabelText('Model ID')).toHaveTextContent('fuyao-data');
  expect(discover).toHaveBeenCalledTimes(1);
});

it('reopens all fetched models with an empty search after selecting one', async () => {
  discover.mockResolvedValue({
    models: [{ id: 'fuyao-work' }, { id: 'fuyao-data' }],
  });
  renderWithClient(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Fetch models' }));
  const choose = await screen.findByRole('button', { name: 'Choose model' });
  expect(choose).toBeEnabled();
  fireEvent.click(choose);
  const search = screen.getByRole('textbox', { name: 'Search models' });
  expect(search).toHaveValue('');
  fireEvent.change(search, { target: { value: 'WORK' } });
  expect(
    screen.queryByRole('option', { name: 'fuyao-data' })
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('option', { name: 'fuyao-work' }));
  expect(screen.getByLabelText('Model ID')).toHaveTextContent('fuyao-work');
  fireEvent.click(choose);
  expect(screen.getByRole('textbox', { name: 'Search models' })).toHaveValue(
    ''
  );
  expect(screen.getByRole('option', { name: 'fuyao-work' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  fireEvent.click(screen.getByRole('option', { name: 'fuyao-data' }));
  expect(screen.getByLabelText('Model ID')).toHaveTextContent('fuyao-data');
  expect(discover).toHaveBeenCalledTimes(1);
});

it('does not retain draft keys in query or mutation caches', async () => {
  const client = new QueryClient();
  discover.mockResolvedValue({ models: [] });
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>
  );
  fireEvent.change(screen.getByLabelText('Draft key'), {
    target: { value: 'private-draft-key' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Fetch models' }));
  await screen.findByRole('status');
  expect(discover).toHaveBeenCalledWith(
    expect.objectContaining({ api_key: 'private-draft-key', id: 'own-service' })
  );
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  expect(client.getMutationCache().getAll()).toHaveLength(0);
});

it.each([
  ['ai_models_auth_failed', 'Authentication failed.'],
  ['ai_models_unsupported', 'Model discovery is unavailable'],
  ['ai_models_rate_limited', 'rate limiting'],
  ['ai_models_timeout', 'timed out'],
])(
  'maps safe provider category %s without showing raw details',
  async (code, text) => {
    discover.mockRejectedValue(
      new HttpApiError('unsafe raw secret', 502, code)
    );
    renderWithClient(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Fetch models' }));
    expect(await screen.findByRole('status')).toHaveTextContent(text);
    expect(screen.queryByText(/unsafe raw/)).not.toBeInTheDocument();
  }
);

it('fetches only on demand, sends own id, uses exact IDs and keeps manual input', async () => {
  discover.mockResolvedValue({ models: [{ id: 'vendor/model:latest' }] });
  renderWithClient(<Harness />);
  expect(discover).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Fetch models' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Choose model' }));
  expect(
    screen.getByRole('option', { name: 'vendor/model:latest' })
  ).toBeInTheDocument();
  expect(discover).toHaveBeenCalledWith({
    id: 'own-service',
    service_type: 'openai_compatible',
    custom_url: 'https://first.example/v1',
  });
  expect(screen.getByLabelText('Model ID')).toHaveTextContent('manual/model');
  fireEvent.click(
    screen.getByRole('button', { name: 'Enter model ID manually' })
  );
  const input = screen.getByRole('textbox', { name: 'Manual model ID' });
  fireEvent.change(input, { target: { value: 'unlisted-model' } });
  fireEvent.click(screen.getByRole('button', { name: 'Use model ID' }));
  expect(screen.getByLabelText('Model ID')).toHaveTextContent('unlisted-model');
});

it.each(['URL', 'Draft key', 'Provider', 'Service'])(
  'discards in-flight results after %s changes without clearing the selected model',
  async (label) => {
    let resolve!: (value: { models: { id: string }[] }) => void;
    discover.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    renderWithClient(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Fetch models' }));
    fireEvent.change(screen.getByLabelText(label), {
      target: { value: 'https://other.example/v1' },
    });
    await act(async () => resolve({ models: [{ id: 'stale-model' }] }));
    expect(screen.queryByText('stale-model')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Model ID')).toHaveValue('manual/model');
    expect(discover).toHaveBeenCalledTimes(1);
  }
);

it('invalidates fetched choices on connection change without fetching automatically', async () => {
  discover.mockResolvedValue({ models: [{ id: 'previous-model' }] });
  renderWithClient(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Fetch models' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Choose model' }));
  expect(
    screen.getByRole('option', { name: 'previous-model' })
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Draft key'), {
    target: { value: 'new-key' },
  });
  expect(screen.queryByText('previous-model')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Model ID')).toHaveValue('manual/model');
  expect(discover).toHaveBeenCalledTimes(1);
});

it('allows manual entry when discovery returns no models', async () => {
  discover.mockResolvedValue({ models: [] });
  renderWithClient(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Fetch models' }));
  expect(await screen.findByRole('status')).toHaveTextContent(
    'No models were returned.'
  );
  fireEvent.change(screen.getByLabelText('Model ID'), {
    target: { value: 'manual-after-empty' },
  });
  expect(screen.getByLabelText('Model ID')).toHaveValue('manual-after-empty');
});

it('shows safe failure text and leaves manual entry usable', async () => {
  discover.mockRejectedValue(new Error('secret-key provider response'));
  renderWithClient(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Fetch models' }));
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Models could not be loaded. Enter a model ID manually or try again.'
  );
  expect(screen.queryByText(/secret-key/)).not.toBeInTheDocument();
  expect(screen.getByLabelText('Model ID')).not.toBeDisabled();
});
