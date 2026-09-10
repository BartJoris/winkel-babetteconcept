import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatVariantAttributes,
  sizeRangeFromSizes,
  sizeToMonths,
  sortSizeLabels,
} from './product-variant-display';

describe('formatVariantAttributes', () => {
  it('drops merk attributes and joins the rest', () => {
    const formatted = formatVariantAttributes([1, 2, 3], {
      1: { name: 'Babe&Tess', attributeName: 'MERK' },
      2: { name: '3 maand', attributeName: "MAAT Baby's" },
      3: { name: 'Naturale', attributeName: 'Kleur' },
    });
    assert.equal(formatted, '3 maand, Naturale');
  });

  it('returns null when only merk remains', () => {
    assert.equal(
      formatVariantAttributes([1], {
        1: { name: 'Babe&Tess', attributeName: 'Merk 1' },
      }),
      null
    );
  });
});

describe('size sorting and range', () => {
  it('orders months before years', () => {
    assert.deepEqual(sortSizeLabels(['3 jaar', '9 maand', '12 maand']), [
      '9 maand',
      '12 maand',
      '3 jaar',
    ]);
  });

  it('builds a range from first to last size', () => {
    assert.equal(sizeRangeFromSizes(['3 jaar', '9 maand', '12 maand']), '9 maand - 3 jaar');
    assert.equal(sizeRangeFromSizes(['6 maand']), null);
    assert.equal(sizeToMonths('2 jaar'), 24);
  });
});
