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

    // The upstream DNS resolver uses $backend. A URI-less proxy_pass keeps the
    // incoming uploads path; an explicit $request_uri is equivalent here.
    expect(uploadsLocation).toMatch(
      /proxy_pass\s+http:\/\/\$backend(?:\$request_uri)?;/
    );
    expect(uploadsLocation).not.toContain(
      'proxy_pass http://$backend/uploads/;'
    );
  });
});
