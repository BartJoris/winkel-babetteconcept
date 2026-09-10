import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  brandAttributeRank,
  dedupeBrands,
  isBrandAttributeName,
  recordIsFavorite,
} from './product-brands';

describe('isBrandAttributeName', () => {
  it('matches MERK and Merk 1', () => {
    assert.equal(isBrandAttributeName('MERK'), true);
    assert.equal(isBrandAttributeName('Merk 1'), true);
    assert.equal(isBrandAttributeName('MAAT Kinderen'), false);
  });
});

describe('dedupeBrands', () => {
  it('keeps distinct names as separate brands', () => {
    const brands = dedupeBrands([
      { id: 741, name: 'Babe&Tess', attributeName: 'MERK' },
      { id: 576, name: 'Babe & Tess', attributeName: 'Merk 1' },
    ]);
    assert.equal(brands.length, 2);
    assert.deepEqual(
      brands.map((b) => b.name).sort(),
      ['Babe & Tess', 'Babe&Tess']
    );
  });

  it('prefers MERK id but keeps both value ids for the same name', () => {
    const brands = dedupeBrands([
      { id: 517, name: 'Hvid', attributeName: 'Merk 1' },
      { id: 884, name: 'Hvid', attributeName: 'MERK' },
    ]);
    assert.equal(brands.length, 1);
    assert.equal(brands[0].id, 884);
    assert.deepEqual(brands[0].valueIds.sort((a, b) => a - b), [517, 884]);
  });

  it('sorts names in Dutch alphabetical order', () => {
    const brands = dedupeBrands([
      { id: 2, name: 'Hvid', attributeName: 'MERK' },
      { id: 1, name: 'Babe&Tess', attributeName: 'MERK' },
    ]);
    assert.deepEqual(
      brands.map((b) => b.name),
      ['Babe&Tess', 'Hvid']
    );
  });
});

describe('brandAttributeRank', () => {
  it('ranks MERK above Merk 1', () => {
    assert.equal(brandAttributeRank('MERK') < brandAttributeRank('Merk 1'), true);
  });
});

describe('recordIsFavorite', () => {
  it('treats Odoo priority 1 and is_favorite as favorite', () => {
    assert.equal(recordIsFavorite({ priority: '1' }), true);
    assert.equal(recordIsFavorite({ priority: 1 }), true);
    assert.equal(recordIsFavorite({ is_favorite: true }), true);
    assert.equal(recordIsFavorite({ priority: '0' }), false);
    assert.equal(recordIsFavorite({ is_favorite: false, priority: '0' }), false);
  });
});
