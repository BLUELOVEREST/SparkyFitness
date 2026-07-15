import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import MainLayout from '@/layouts/MainLayout';
import { renderWithClient } from '@/tests/test-utils';

const mockActiveUserContext = {
  isActingOnBehalf: false,
  hasPermission: jest.fn<boolean, [string]>(() => true),
  hasWritePermission: jest.fn<boolean, [string]>(() => true),
  activeUserName: 'Eric',
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', role: 'user' },
    signOut: jest.fn(),
  }),
}));

jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => mockActiveUserContext,
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'debug',
    getDateRelationToToday: () => 'today',
  }),
}));

jest.mock('@/hooks/Diary/useMealTypes', () => ({
  useMealTypes: () => ({ data: [] }),
}));

jest.mock('@/hooks/useCycle', () => ({
  useCycleSettings: () => ({ data: { enabled: false } }),
}));

jest.mock('@/hooks/useGeneralQueries', () => ({
  useCurrentVersionQuery: () => ({ data: { version: '0.17.3-eric' } }),
}));

jest.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

jest.mock('@/components/ProfileSwitcher', () => () => null);
jest.mock('@/components/GlobalSyncButton', () => () => null);
jest.mock('@/components/ThemeToggle', () => () => null);
jest.mock('@/components/GlobalNotificationIcon', () => () => null);
jest.mock('@/components/GitHubStarCounter', () => () => null);
jest.mock('@/components/GitHubSponsorButton', () => () => null);
jest.mock('@/pages/Chat/SparkyChat', () => () => null);
jest.mock('@/layouts/AddComp', () => () => null);

describe('MainLayout Kitchen navigation', () => {
  beforeEach(() => {
    mockActiveUserContext.isActingOnBehalf = false;
    mockActiveUserContext.hasPermission.mockReturnValue(true);
    mockActiveUserContext.hasWritePermission.mockReturnValue(true);
  });

  it('shows Kitchen as a top-level desktop navigation item', () => {
    renderWithClient(
      <MemoryRouter initialEntries={['/kitchen']}>
        <MainLayout
          onShowAboutDialog={jest.fn()}
          onShowNewReleaseDialog={jest.fn()}
        />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('button', { name: /Kitchen/i })
    ).toBeInTheDocument();
  });

  it('shows Kitchen for delegated users with read-only diary access', () => {
    mockActiveUserContext.isActingOnBehalf = true;
    mockActiveUserContext.hasPermission.mockImplementation(
      (permission: string) => permission === 'diary'
    );
    mockActiveUserContext.hasWritePermission.mockReturnValue(false);

    renderWithClient(
      <MemoryRouter initialEntries={['/kitchen']}>
        <MainLayout
          onShowAboutDialog={jest.fn()}
          onShowNewReleaseDialog={jest.fn()}
        />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('button', { name: /Kitchen/i })
    ).toBeInTheDocument();
  });
});
