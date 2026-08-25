/**
 * Odoo product.product prices:
 * - `list_price` is related to the template — the same for every variant
 * - `lst_price` is the public/sales price: list_price + attribute price_extra
 * - `price_extra` is the extra from variant attributes (size/color surcharges)
 *
 * Labels and stock lookup must use the variant price, not the template price.
 */
export const ODOO_VARIANT_PRICE_FIELDS = ['list_price', 'lst_price', 'price_extra'] as const;

type OdooNumber = number | boolean | null | undefined;

export function variantListPrice(product: {
  lst_price?: OdooNumber;
  list_price?: OdooNumber;
  price_extra?: OdooNumber;
}): number {
  if (typeof product.lst_price === 'number' && Number.isFinite(product.lst_price)) {
    return product.lst_price;
  }

  const base =
    typeof product.list_price === 'number' && Number.isFinite(product.list_price)
      ? product.list_price
      : 0;
  const extra =
    typeof product.price_extra === 'number' && Number.isFinite(product.price_extra)
      ? product.price_extra
      : 0;

  return base + extra;
}
