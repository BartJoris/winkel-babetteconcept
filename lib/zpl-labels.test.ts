import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateZPL, DEFAULT_LABEL_OPTIONS } from './zpl-labels';

const sample = {
  id: 1,
  name: 'Testproduct',
  barcode: null,
  list_price: 10,
  attributes: null,
  sizeRange: null,
};

describe('generateZPL top margin', () => {
  it('places the first text 35 dots below the label edge', () => {
    assert.equal(DEFAULT_LABEL_OPTIONS.marginTop, 35);
    const zpl = generateZPL([sample]);
    assert.match(zpl, /\^FO20,35\^A0N/);
  });
});
