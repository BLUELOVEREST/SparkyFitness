import { apiCall, HttpApiError } from '@/api/api';
import * as logging from '@/utils/logging';

jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));
jest.mock('@/utils/logging');
jest.mock('@/utils/userPreferences', () => ({
  getUserLoggingLevel: () => 'DEBUG',
}));

const response = (status: number, value: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    type: 'basic',
    redirected: false,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(value),
    json: async () => value,
  }) as unknown as Response;

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

it('sends sensitive credentials without recording them in debug logs', async () => {
  jest
    .mocked(global.fetch)
    .mockResolvedValue(
      response(200, { models: [], echo: 'private-test-credential' })
    );
  await apiCall('/chat/ai-service-settings/models', {
    method: 'POST',
    body: { api_key: 'private-test-credential' },
    sensitiveBody: true,
  });
  expect(jest.mocked(global.fetch).mock.calls[0]?.[1]?.body).toContain(
    'private-test-credential'
  );
  expect(jest.mocked(global.fetch).mock.calls[0]?.[1]).not.toHaveProperty(
    'sensitiveBody'
  );
  expect(JSON.stringify(jest.mocked(logging.debug).mock.calls)).not.toContain(
    'private-test-credential'
  );
});

it('redacts sensitive transport diagnostics from error logs', async () => {
  jest
    .mocked(global.fetch)
    .mockRejectedValue(new Error('private-test-credential'));
  await expect(
    apiCall('/chat/ai-service-settings/models', {
      sensitiveBody: true,
      suppressErrorToast: true,
    })
  ).rejects.toThrow();
  const details = jest.mocked(logging.error).mock.calls.flat();
  expect(details.map(String).join(' ')).not.toContain(
    'private-test-credential'
  );
});

it('retains safe error codes when the caller suppresses error toasts', async () => {
  jest.mocked(global.fetch).mockResolvedValue(
    response(502, {
      error: 'Unable to load models.',
      code: 'ai_models_auth_failed',
    })
  );
  await expect(
    apiCall('/chat/ai-service-settings/models', {
      method: 'POST',
      sensitiveBody: true,
      suppressErrorToast: true,
    })
  ).rejects.toMatchObject<HttpApiError>({
    name: 'HttpApiError',
    message: 'Unable to load models.',
    status: 502,
    code: 'ai_models_auth_failed',
  });
});
