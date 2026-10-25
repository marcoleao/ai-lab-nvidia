import {randomInt} from 'node:crypto';

// Only for new Systems created by isolated acceptance tests. Existing mocked
// records retain their original keys to exercise compatibility with the archive.
export const systemKey=()=>Array.from({length:6},()=>String.fromCharCode(65+randomInt(26))).join('');
