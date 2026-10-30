import { describe, expect, test, vi } from 'vitest';
import axios from 'axios';
import https from 'https';
import announcementService, {
  parseFrontmatter,
} from '../services/announcementService.js';

describe('announcementService', () => {
  test('should parse YAML frontmatter and markdown body correctly', () => {
    const md = `---
id: notice-test-123
active: true
title: Maintenance Alert
---

### System Update

We will be upgrading servers on **August 1st**.
`;

    const parsed = parseFrontmatter(md);
    expect(parsed.frontmatter.id).toBe('notice-test-123');
    expect(parsed.frontmatter.active).toBe(true);
    expect(parsed.frontmatter.title).toBe('Maintenance Alert');
    expect(parsed.body).toContain('### System Update');
    expect(parsed.body).toContain('August 1st');
  });

  test('should handle frontmatter with extra leading --- lines', () => {
    const md = `---

---
id: notice-test-456
active: true
title: Extra Line Test
---

### Content Here
`;

    const parsed = parseFrontmatter(md);
    expect(parsed.frontmatter.id).toBe('notice-test-456');
    expect(parsed.frontmatter.active).toBe(true);
    expect(parsed.frontmatter.title).toBe('Extra Line Test');
    expect(parsed.body).toContain('### Content Here');
  });

  test('should return local fallback announcement when offline or fetching', async () => {
    const axiosFailure = vi
      .spyOn(axios, 'get')
      .mockRejectedValueOnce(new Error('Offline fixture'));
    const httpsFailure = vi.spyOn(https, 'get').mockImplementation(() => {
      throw new Error('Offline fixture');
    });
    try {
      const result = await announcementService.getLatestAnnouncement(true);
      expect(axiosFailure).toHaveBeenCalledOnce();
      expect(httpsFailure).toHaveBeenCalledOnce();
      expect(result).toBeDefined();
      expect(typeof result.id).toBe('string');
      expect(typeof result.active).toBe('boolean');
      expect(typeof result.message).toBe('string');
    } finally {
      axiosFailure.mockRestore();
      httpsFailure.mockRestore();
    }
  });
});
