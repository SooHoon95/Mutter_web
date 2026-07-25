import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { encodeToMatrix } from './qrEncoder';

it('emit qr svg path for artifact', () => {
  const url = 'https://mutter.app/download';
  const m = encodeToMatrix(url);
  const margin = 2;
  const dim = m.length;
  let d = '';
  for (let y = 0; y < dim; y++)
    for (let x = 0; x < dim; x++) if (m[y][x]) d += `M${x + margin} ${y + margin}h1v1h-1z`;
  writeFileSync(
    '/private/tmp/claude-501/-Users-choesuhun-Desktop-Code-letter-app/3229c7d2-914a-4c5e-999b-950453f91cf3/scratchpad/qr-path.json',
    JSON.stringify({ viewBox: dim + margin * 2, d, url }),
  );
});
