export function tokenAmountToRaw(text: string, decimals: number): bigint | null {
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 18 ||
    text.length > 80 ||
    !/^(0|[1-9]\d*)(?:\.\d+)?$/.test(text)
  )
    return null;
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > decimals) return null;
  return BigInt(whole!) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
}
export function selectedSellQuantity(
  quantity: string,
  decimals: number,
  percentage: number,
  custom: string,
): string {
  const total = BigInt(quantity),
    amount = custom.trim()
      ? tokenAmountToRaw(custom.trim(), decimals)
      : (total * BigInt(percentage)) / 100n;
  if (amount === null || amount <= 0n || amount > total)
    throw Error('Enter a positive token amount within the available position and token precision.');
  return amount.toString();
}
