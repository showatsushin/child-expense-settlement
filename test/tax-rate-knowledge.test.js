import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestedTaxRateForProduct, taxRateSuggestionsForProduct } from '../src/services/taxRateKnowledge.js';

test('tax-rate Knowledge offers beverage and food as reduced-rate candidates only', () => {
  assert.equal(suggestedTaxRateForProduct('いろはす 555ml'), '8');
  assert.equal(suggestedTaxRateForProduct('お菓子'), '8');
  assert.equal(taxRateSuggestionsForProduct('お菓子')[0].basis, '飲食料品候補');
});

test('tax-rate Knowledge offers tissue as a standard-rate candidate only', () => {
  assert.equal(suggestedTaxRateForProduct('ネピア ティッシュ 5コパック'), '10');
});

test('tax-rate Knowledge leaves an unmatched product unknown', () => {
  assert.equal(suggestedTaxRateForProduct('該当しない商品'), 'unknown');
  assert.deepEqual(taxRateSuggestionsForProduct('該当しない商品'), []);
});
