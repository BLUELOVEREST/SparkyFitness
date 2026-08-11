import fs from 'node:fs';
import path from 'node:path';

describe('frontend nginx uploads proxy', () => {
  it('preserves the full uploads request URI when proxying to the backend', () => {
    const nginxConfig = fs.readFileSync(
      path.join(__dirname, '../../../../docker/nginx.conf'),
      'utf8'
    );

    const uploadsLocation = nginxConfig.match(
      /location \^~ \/uploads\/ \{[\s\S]*?\n {2}\}/
    )?.[0];

    expect(uploadsLocation).toContain(
      'proxy_pass $sparky_backend$request_uri;'
    );
    expect(uploadsLocation).not.toContain(
      'proxy_pass $sparky_backend/uploads/;'
    );
  });
});
