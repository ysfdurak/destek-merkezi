import test from 'node:test';
import assert from 'node:assert/strict';
import { seoHead } from '../server/main.mjs';

test('demo giriş sayfası için arama ve paylaşım etiketleri', () => {
  const head = seoHead(new URL('https://destek.ysfdurak.com'));
  assert.match(head, /<title>Destek Merkezi · /);
  assert.match(head, /<link rel="canonical" href="https:\/\/destek\.ysfdurak\.com\/">/);
  assert.match(head, /hreflang="en" href="https:\/\/destek\.ysfdurak\.com\/\?lang=en"/);
  assert.match(head, /<meta property="og:image" content="https:\/\/ysfdurak\.com\/img\/destek-merkezi\/og\.jpg">/);
});

test('etiketlerde adres kaçışlanır', () => {
  assert.doesNotMatch(seoHead(new URL('https://a.example/"x')), /"x"/);
});
