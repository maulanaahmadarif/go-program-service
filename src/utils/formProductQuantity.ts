/** Sum of `numberOfQuantity` across all product line items in form_data. */
export function getProductQuantityFromFormData(formData: unknown): number {
  if (!Array.isArray(formData)) return 0;

  const productsEntry = formData.find((entry: { label?: string }) => entry?.label === 'products');
  if (!productsEntry || !Array.isArray((productsEntry as { value?: unknown }).value)) return 0;

  const total = (productsEntry as { value: { numberOfQuantity?: unknown }[] }).value.reduce((sum, product) => {
    const qty = Number(product?.numberOfQuantity ?? 0);
    return sum + (Number.isFinite(qty) ? Math.max(0, Math.trunc(qty)) : 0);
  }, 0);

  return total;
}

export function resolveProductQuantity(
  storedQuantity: number | null | undefined,
  formData: unknown
): number {
  if (storedQuantity != null && Number.isFinite(Number(storedQuantity))) {
    return Math.max(0, Math.trunc(Number(storedQuantity)));
  }
  return getProductQuantityFromFormData(formData);
}
