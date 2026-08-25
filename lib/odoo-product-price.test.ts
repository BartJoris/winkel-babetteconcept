import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { variantListPrice } from './odoo-product-price';

describe('variantListPrice', () => {
  it('uses lst_price when variants have extra (different prices)', () => {
    assert.equal(
      variantListPrice({ list_price: 45, lst_price: 55, price_extra: 10 }),
      55
    );
  });

  it('falls back to list_price + price_extra when lst_price is missing', () => {
    assert.equal(variantListPrice({ list_price: 45, price_extra: 10 }), 55);
  });

  it('uses list_price when all variants share the template price', () => {
    assert.equal(variantListPrice({ list_price: 45, lst_price: 45 }), 45);
  });

  it('treats Odoo false as missing', () => {
    assert.equal(variantListPrice({ list_price: 45, lst_price: false }), 45);
    assert.equal(variantListPrice({ list_price: false, lst_price: false }), 0);
  });
});
