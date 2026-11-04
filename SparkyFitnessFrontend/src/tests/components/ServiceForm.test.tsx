import { useState } from 'react';
import '@testing-library/jest-dom';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithClient } from '../test-utils';
import { ServiceForm } from '@/components/ai/ServiceForm';
import type { AiServiceSettingsFormInput } from '@/schemas/form/AiServiceSettings.form.zod';
import { discoverAIServiceModels } from '@/api/Settings/aiServiceSettingsService';

jest.mock('@/api/Settings/aiServiceSettingsService', () => ({
  discoverAIServiceModels: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === 'string' ? fallback : key,
  }),
}));

const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

function makeFormData(
  overrides: Partial<AiServiceSettingsFormInput> = {}
): AiServiceSettingsFormInput {
  return {
    service_name: 'My Service',
    service_type: 'openai',
    api_key: 'sk-test',
    custom_url: '',
    system_prompt: '',
    is_active: false,
    model_name: '',
    custom_model_name: '',
    showCustomModelInput: false,
    chat_tool_profile: 'full',
    profile_settings: {},
    ...overrides,
  } as AiServiceSettingsFormInput;
}

function renderForm(
  formData: AiServiceSettingsFormInput,
  onSubmit = jest.fn()
) {
  const utils = renderWithClient(
    <ServiceForm
      formData={formData}
      onFormDataChange={jest.fn()}
      onSubmit={onSubmit}
      onCancel={jest.fn()}
      translationPrefix="settings.aiService.userSettings"
    />
  );
  return { ...utils, onSubmit };
}

describe('ServiceForm — model validation', () => {
  it.each([
    'settings.aiService.userSettings',
    'settings.aiService.globalSettings',
  ])(
    'tests a freshly fetched selected model without saving for %s',
    async (translationPrefix) => {
      jest
        .mocked(discoverAIServiceModels)
        .mockResolvedValue({ models: [{ id: 'Vendor/New:latest' }] });
      const onSubmit = jest.fn();
      const onTestConnection = jest.fn();
      function Editor({ translationPrefix }: { translationPrefix: string }) {
        const [formData, setFormData] = useState(
          makeFormData({
            service_type: 'openai_compatible',
            custom_url: 'https://provider.example/v1',
            model_name: 'old-model',
            custom_model_name: 'old-model',
            showCustomModelInput: true,
          })
        );
        return (
          <ServiceForm
            formData={formData}
            onFormDataChange={(patch) =>
              setFormData((previous) => ({ ...previous, ...patch }))
            }
            onSubmit={onSubmit}
            onCancel={jest.fn()}
            onTestConnection={onTestConnection}
            translationPrefix={translationPrefix}
          />
        );
      }
      const { unmount } = renderWithClient(
        <Editor translationPrefix={translationPrefix} />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Fetch models' }));
      fireEvent.click(
        await screen.findByRole('button', { name: 'Choose model' })
      );
      fireEvent.click(
        screen.getByRole('option', { name: 'Vendor/New:latest' })
      );
      fireEvent.click(
        screen.getByRole('button', {
          name: `${translationPrefix}.testConnection`,
        })
      );
      expect(onTestConnection).toHaveBeenLastCalledWith('Vendor/New:latest');
      expect(onSubmit).not.toHaveBeenCalled();
      unmount();
      expect(onTestConnection).toHaveBeenCalledTimes(1);
    },
    15000
  );
  afterEach(() => {
    mockToast.mockClear();
  });

  // Regression: types without preset models (openai_compatible/custom/ollama)
  // point at user-hosted servers with no reliable server-side default, so the
  // form must not save them without an explicit model.
  it('blocks submit for a no-preset type with no model', () => {
    const { container, onSubmit } = renderForm(
      makeFormData({
        service_type: 'openai_compatible',
        custom_url: 'http://localhost:1234/v1',
        showCustomModelInput: true,
        custom_model_name: '',
        model_name: '',
      })
    );

    fireEvent.submit(container.querySelector('form')!);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledTimes(1);
  });

  it('treats a whitespace-only custom model as missing', () => {
    const { container, onSubmit } = renderForm(
      makeFormData({
        service_type: 'custom',
        custom_url: 'http://localhost:1234/v1',
        showCustomModelInput: true,
        custom_model_name: '   ',
        model_name: '',
      })
    );

    fireEvent.submit(container.querySelector('form')!);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledTimes(1);
  });

  it('submits a no-preset type when a custom model name is provided', () => {
    const { container, onSubmit } = renderForm(
      makeFormData({
        service_type: 'openai_compatible',
        custom_url: 'http://localhost:1234/v1',
        showCustomModelInput: true,
        custom_model_name: 'llama-3.2',
        model_name: '',
      })
    );

    fireEvent.submit(container.querySelector('form')!);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(mockToast).not.toHaveBeenCalled();
  });

  // Preset providers (openai, anthropic, ...) have a sensible server-side
  // default, so a blank model is allowed and must not block submission.
  it('allows a preset provider to submit without a model', () => {
    const { container, onSubmit } = renderForm(
      makeFormData({ service_type: 'openai', model_name: '' })
    );

    fireEvent.submit(container.querySelector('form')!);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(mockToast).not.toHaveBeenCalled();
  });
});

describe('ServiceForm — task profile overrides', () => {
  beforeEach(() => mockToast.mockClear());
  it.each([
    'settings.aiService.userSettings',
    'settings.aiService.globalSettings',
  ])(
    'groups the connection fields and uses four compact profile tabs for %s',
    (translationPrefix) => {
      const { container } = renderWithClient(
        <ServiceForm
          formData={makeFormData({ service_type: 'openai_compatible' })}
          onFormDataChange={jest.fn()}
          onSubmit={jest.fn()}
          onCancel={jest.fn()}
          translationPrefix={translationPrefix}
          onTestConnection={jest.fn()}
        />
      );
      const connection = screen.getByTestId('ai-connection-fields');
      expect(connection).toContainElement(
        container.querySelector('#custom_url')
      );
      expect(connection).toContainElement(container.querySelector('#api_key'));
      expect(connection).toHaveClass('sm:grid-cols-2');
      const tablist = screen.getByRole('tablist', { name: 'Task profiles' });
      expect(within(tablist).getAllByRole('tab')).toHaveLength(4);
      expect(
        container
          .querySelector('#system_prompt')!
          .compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      const footer = screen.getByTestId('ai-service-form-actions');
      expect(within(footer).getAllByRole('button')).toHaveLength(3);
    }
  );

  it('starts extra JSON collapsed and reveals its editable contents on demand', () => {
    renderForm(makeFormData());
    expect(
      screen.queryByRole('textbox', { name: 'Extra request body JSON' })
    ).not.toBeInTheDocument();
    const disclosure = screen.getByRole('button', {
      name: /Extra request body JSON/,
    });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(disclosure);
    expect(
      screen.getByRole('textbox', { name: 'Extra request body JSON' })
    ).toHaveValue('{}');
  });

  it.each([
    ['max_tokens', 'profile_max_tokens', '0'],
    ['max_tokens', 'profile_max_tokens', '1.5'],
    ['timeout_seconds', 'profile_timeout_seconds', '-1'],
    ['timeout_seconds', 'profile_timeout_seconds', '0.5'],
    ['temperature', 'profile_temperature', '2.1'],
    ['temperature', 'profile_temperature', '-0.1'],
  ])(
    'blocks hidden invalid %s using %s=%s, reveals Intent and clears the error after correction',
    (_field, inputId, invalidValue) => {
      const onSubmit = jest.fn();
      const onTestConnection = jest.fn();
      function Editor() {
        const [formData, setFormData] = useState(makeFormData());
        return (
          <ServiceForm
            formData={formData}
            onFormDataChange={(patch) =>
              setFormData((previous) => ({ ...previous, ...patch }))
            }
            onSubmit={onSubmit}
            onCancel={jest.fn()}
            onTestConnection={onTestConnection}
          />
        );
      }
      const { container } = renderWithClient(<Editor />);
      fireEvent.change(container.querySelector(`#${inputId}`)!, {
        target: { value: invalidValue },
      });
      fireEvent.mouseDown(screen.getByRole('tab', { name: /Vision/ }), {
        button: 0,
      });
      const testButton = screen.getByRole('button', { name: /testConnection/ });
      expect(testButton).toBeDisabled();
      fireEvent.submit(container.querySelector('form')!);
      expect(onSubmit).not.toHaveBeenCalled();
      expect(onTestConnection).not.toHaveBeenCalled();
      expect(screen.getByRole('tab', { name: /Intent/ })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Enter valid values for the highlighted profile parameters.'
      );
      const invalidInput = container.querySelector(`#${inputId}`)!;
      expect(invalidInput).toHaveAttribute('aria-invalid', 'true');
      fireEvent.change(invalidInput, { target: { value: '1' } });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(invalidInput).toHaveAttribute('aria-invalid', 'false');
      expect(testButton).toBeEnabled();
      fireEvent.submit(container.querySelector('form')!);
      expect(onSubmit).toHaveBeenCalledTimes(1);
    }
  );

  it('accepts nullable profile defaults and zero temperature across inactive profiles', () => {
    const { container, onSubmit } = renderForm(
      makeFormData({
        profile_settings: {
          chat: { max_tokens: null, timeout_seconds: null, temperature: null },
          vision: { temperature: 0 },
          structured: { max_tokens: 1, timeout_seconds: 1, temperature: 2 },
        },
      })
    );
    fireEvent.submit(container.querySelector('form')!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['chat', 'vision', 'structured'] as const)(
    'blocks save and exposes invalid %s JSON even while Intent is selected',
    (profile) => {
      const onSubmit = jest.fn();
      const { container } = renderForm(
        makeFormData({
          profile_settings: { [profile]: { extra_body_json_draft: '{broken' } },
        }),
        onSubmit
      );
      fireEvent.submit(container.querySelector('form')!);
      expect(onSubmit).not.toHaveBeenCalled();
      expect(
        screen.getByRole('tab', { name: new RegExp(profile, 'i') })
      ).toHaveAttribute('aria-selected', 'true');
      expect(
        screen.getByRole('textbox', { name: 'Extra request body JSON' })
      ).toHaveValue('{broken');
    }
  );

  it('keeps an invalid draft discoverable after changing tabs and allows save once corrected', () => {
    const onSubmit = jest.fn();
    function Editor() {
      const [formData, setFormData] = useState(makeFormData());
      return (
        <ServiceForm
          formData={formData}
          onFormDataChange={(patch) =>
            setFormData((previous) => ({ ...previous, ...patch }))
          }
          onSubmit={onSubmit}
          onCancel={jest.fn()}
        />
      );
    }
    const { container } = renderWithClient(<Editor />);
    fireEvent.click(
      screen.getByRole('button', { name: /Extra request body JSON/ })
    );
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Extra request body JSON' }),
      { target: { value: '[]' } }
    );
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Vision/ }), {
      button: 0,
    });
    fireEvent.submit(container.querySelector('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: /Intent/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Extra request body JSON' }),
      { target: { value: '{"safe":true}' } }
    );
    fireEvent.submit(container.querySelector('form')!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('renders the profile override section with the intent defaults', () => {
    renderForm(makeFormData());

    expect(screen.getByText('Task profiles')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Intent/ })).toBeTruthy();
    expect(screen.getByDisplayValue('1024')).toBeTruthy();
    expect(screen.getByDisplayValue('30')).toBeTruthy();
    expect(screen.getByDisplayValue('0')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: /Extra request body JSON/ })
    );
    expect(screen.getByDisplayValue('{}')).toBeTruthy();
  });

  it('keeps the global system prompt above the profile-specific settings', () => {
    const { container } = renderForm(makeFormData());
    const systemPrompt = container.querySelector('#system_prompt');
    const profileTitle = screen.getByText('Task profiles');
    const profileSection = profileTitle.closest(
      '[data-testid="ai-profile-settings"]'
    );

    expect(systemPrompt).toBeTruthy();
    expect(profileSection).toBeTruthy();
    expect(
      systemPrompt!.compareDocumentPosition(profileTitle) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(profileSection?.className).toContain('pt-4');
  });

  it('uses readable fallback labels when profile translations are missing', () => {
    renderForm(makeFormData());

    expect(
      screen.queryByText('settings.aiService.profileSettings.profiles.intent')
    ).toBeNull();
    expect(
      screen.queryByText('settings.aiService.profileSettings.maxTokens')
    ).toBeNull();
    expect(screen.getByText('Built-in prompts')).toBeTruthy();
    expect(screen.getAllByLabelText('Max tokens').length).toBeGreaterThan(0);
  });

  it('uses readable fallback labels for global max token settings', () => {
    renderWithClient(
      <ServiceForm
        formData={makeFormData()}
        onFormDataChange={jest.fn()}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
        translationPrefix="settings.aiService.globalSettings"
      />
    );

    expect(
      screen.queryByText('settings.aiService.globalSettings.maxTokens')
    ).toBeNull();
    expect(screen.getAllByLabelText('Max tokens').length).toBeGreaterThan(0);
    expect(
      screen.getByPlaceholderText('Leave blank for provider default')
    ).toBeTruthy();
  });

  it('updates the selected profile max tokens and extra JSON fields', () => {
    const onFormDataChange = jest.fn();
    renderWithClient(
      <ServiceForm
        formData={makeFormData()}
        onFormDataChange={onFormDataChange}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
        translationPrefix="settings.aiService.userSettings"
      />
    );

    fireEvent.change(document.getElementById('profile_max_tokens')!, {
      target: { value: '2048' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /Extra request body JSON/ })
    );
    fireEvent.change(screen.getByLabelText('Extra request body JSON'), {
      target: { value: '{"reasoning_effort":"low"}' },
    });

    expect(onFormDataChange).toHaveBeenCalledWith(
      expect.objectContaining({
        profile_settings: expect.objectContaining({
          intent: expect.objectContaining({ max_tokens: 2048 }),
        }),
      })
    );
    expect(onFormDataChange).toHaveBeenCalledWith(
      expect.objectContaining({
        profile_settings: expect.objectContaining({
          intent: expect.objectContaining({
            extra_body_json: { reasoning_effort: 'low' },
          }),
        }),
      })
    );
  });

  it('blocks submit when the selected profile extra JSON is invalid', () => {
    const onSubmit = jest.fn();
    const { container } = renderForm(
      makeFormData({
        profile_settings: {
          intent: {
            extra_body_json: { valid: true },
            extra_body_json_draft: '{bad json',
          },
        },
      }),
      onSubmit
    );

    fireEvent.submit(container.querySelector('form')!);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledTimes(1);
  });
});

describe('ServiceForm — Ollama tool profile default', () => {
  function renderWithChange(formData: AiServiceSettingsFormInput) {
    const onFormDataChange = jest.fn();
    const utils = renderWithClient(
      <ServiceForm
        formData={formData}
        onFormDataChange={onFormDataChange}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
        translationPrefix="settings.aiService.userSettings"
      />
    );
    return { ...utils, onFormDataChange };
  }

  async function pickServiceType(typeKey: string) {
    // The service_type SelectTrigger renders as role="combobox" with
    // id="service_type"; it is the first combobox in the form.
    const trigger = document.getElementById('service_type')!;
    fireEvent.click(trigger);
    const option = await screen.findByRole('option', {
      name: `settings.aiService.serviceTypes.${typeKey}`,
    });
    fireEvent.click(option);
  }

  // Tools default to 'full' for all services including Ollama.
  it('defaults chat_tool_profile to full when Ollama is selected', async () => {
    const { onFormDataChange } = renderWithChange(makeFormData());
    await pickServiceType('ollama');
    expect(onFormDataChange).toHaveBeenCalledWith(
      expect.objectContaining({
        service_type: 'ollama',
        chat_tool_profile: 'full',
      })
    );
  });

  // Switching service type resets the profile to 'full'.
  it('resets chat_tool_profile to full when switching service types', async () => {
    const { onFormDataChange } = renderWithChange(
      makeFormData({ service_type: 'ollama', chat_tool_profile: 'core' })
    );
    await pickServiceType('anthropic');
    expect(onFormDataChange).toHaveBeenCalledWith(
      expect.objectContaining({
        service_type: 'anthropic',
        chat_tool_profile: 'full',
      })
    );
  });
});

describe('ServiceForm — test connection button', () => {
  function renderWithTest(
    formData: AiServiceSettingsFormInput,
    {
      onTestConnection,
      testing,
      testStatus,
    }: {
      onTestConnection?: (model: string) => void;
      testing?: boolean;
      testStatus?:
        { state: 'success' } | { state: 'error'; message: string } | null;
    } = {}
  ) {
    const onSubmit = jest.fn();
    const utils = renderWithClient(
      <ServiceForm
        formData={formData}
        onFormDataChange={jest.fn()}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
        translationPrefix="settings.aiService.userSettings"
        onTestConnection={onTestConnection}
        testing={testing}
        testStatus={testStatus}
      />
    );
    return { ...utils, onSubmit };
  }

  const testButton = (
    utils: ReturnType<typeof renderWithTest>
  ): HTMLElement | null =>
    utils.queryByRole('button', {
      name: /testConnection|\.testing$/,
    });

  it('does not render the button without the onTestConnection prop', () => {
    const utils = renderWithTest(makeFormData());
    expect(testButton(utils)).toBeNull();
  });

  it('renders the button when onTestConnection is provided', () => {
    const utils = renderWithTest(makeFormData(), {
      onTestConnection: jest.fn(),
    });
    expect(testButton(utils)).not.toBeNull();
  });

  it('fires onTestConnection (and not onSubmit) when clicked', () => {
    const onTestConnection = jest.fn();
    const utils = renderWithTest(makeFormData(), { onTestConnection });

    fireEvent.click(testButton(utils)!);

    expect(onTestConnection).toHaveBeenCalledTimes(1);
    expect(utils.onSubmit).not.toHaveBeenCalled();
  });

  it('disables the button while testing', () => {
    const utils = renderWithTest(makeFormData(), {
      onTestConnection: jest.fn(),
      testing: true,
    });
    expect((testButton(utils) as HTMLButtonElement).disabled).toBe(true);
  });

  // Same guard as submit: a no-preset type with no model can't be tested either.
  it('disables the button for a no-preset type with no model', () => {
    const utils = renderWithTest(
      makeFormData({
        service_type: 'openai_compatible',
        custom_url: 'http://localhost:1234/v1',
        showCustomModelInput: true,
        custom_model_name: '',
        model_name: '',
      }),
      { onTestConnection: jest.fn() }
    );
    expect((testButton(utils) as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders the success status text inline', () => {
    const utils = renderWithTest(makeFormData(), {
      onTestConnection: jest.fn(),
      testStatus: { state: 'success' },
    });
    expect(
      utils.getByText('settings.aiService.test.successTitle')
    ).toBeTruthy();
  });

  it('renders the failure status text with the error message inline', () => {
    const utils = renderWithTest(makeFormData(), {
      onTestConnection: jest.fn(),
      testStatus: { state: 'error', message: 'Bad API key' },
    });
    expect(
      utils.getByText('settings.aiService.test.failureTitle: Bad API key')
    ).toBeTruthy();
  });

  // The result is cleared while a fresh test is in flight.
  it('hides the status text while a test is running', () => {
    const utils = renderWithTest(makeFormData(), {
      onTestConnection: jest.fn(),
      testing: true,
      testStatus: { state: 'success' },
    });
    expect(
      utils.queryByText('settings.aiService.test.successTitle')
    ).toBeNull();
  });
});
