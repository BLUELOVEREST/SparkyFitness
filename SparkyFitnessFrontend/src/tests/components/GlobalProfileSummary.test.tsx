import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { AiServiceSettingsResponse } from '@workspace/shared';
import { GlobalProfileSummary } from '@/components/ai/GlobalProfileSummary';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

const service: AiServiceSettingsResponse = {
  id: 'global',
  user_id: 'admin',
  service_name: 'Global AI',
  service_type: 'openai_compatible',
  custom_url: 'https://provider.example/v1',
  model_name: 'working-model',
  is_active: true,
  is_public: true,
  system_prompt: null,
};

function profile(name: string) {
  const section = screen.getByRole('heading', { name }).closest('section');
  if (!section) throw new Error('Missing profile section');
  return within(section);
}

it('shows concrete built-in defaults rather than opaque Default labels', () => {
  render(<GlobalProfileSummary service={service} />);
  for (const [name, tokens, seconds] of [
    ['Chat', '4096', '300'],
    ['Intent', '1024', '30'],
    ['Vision', '4096', '120'],
    ['Structured', '2048', '60'],
  ]) {
    expect(profile(name!).getByText(tokens!)).toBeInTheDocument();
    expect(profile(name!).getByText(seconds!)).toBeInTheDocument();
  }
  expect(profile('Chat').getByText('0.3')).toBeInTheDocument();
  expect(profile('Intent').getByText('0')).toBeInTheDocument();
  expect(screen.queryByText('Default')).not.toBeInTheDocument();
});

it('applies task overrides before service token fallback and retains zero', () => {
  render(
    <GlobalProfileSummary
      service={{
        ...service,
        max_tokens: 9000,
        reasoning_effort: 'max',
        profile_settings: {
          chat: { max_tokens: null, temperature: 0 },
          intent: { max_tokens: 500, reasoning_effort: 'high' },
          structured: {
            max_tokens: 1200,
            timeout_seconds: 75,
            extra_body_json: { secret: 'not-for-display' },
          },
        },
      }}
    />
  );
  expect(profile('Chat').getByText('9000')).toBeInTheDocument();
  expect(profile('Chat').getByText('max')).toBeInTheDocument();
  expect(profile('Chat').getByText('0')).toBeInTheDocument();
  expect(profile('Intent').getByText('500')).toBeInTheDocument();
  expect(profile('Intent').getByText('high')).toBeInTheDocument();
  expect(profile('Vision').getByText('9000')).toBeInTheDocument();
  expect(profile('Structured').getByText('1200')).toBeInTheDocument();
  expect(profile('Structured').getByText('75')).toBeInTheDocument();
  expect(screen.queryByText(/not-for-display/)).not.toBeInTheDocument();
});

it('prefers an explicit chat reasoning override over the service setting', () => {
  render(
    <GlobalProfileSummary
      service={{
        ...service,
        reasoning_effort: 'max',
        profile_settings: { chat: { reasoning_effort: 'low' } },
      }}
    />
  );
  expect(profile('Chat').getByText('low')).toBeInTheDocument();
  expect(profile('Chat').queryByText('max')).not.toBeInTheDocument();
});
