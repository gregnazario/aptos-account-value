import { AccountAddress, AccountAddressInput, Aptos } from "@aptos-labs/ts-sdk";
import { Asset, OutputCurrency } from "./core";
import { fetchCoins, fetchStake } from "./fetchers";
import { AppraiseResult, appraise, getPrices } from "./appraisers";

export { AppraiseResult } from "./appraisers";
export { Asset, OutputCurrency } from "./core";

/**
 * @returns A map of account addresses to AppraiseResult. The account addresses are
 * strings in AIP-40 format (accountAddress.toString()). We don't use the
 * AccountAddress type itself because two identical AccountAddresses don't compare as
 * equal due to the magic of compare by reference for non primitives in JS.
 */
export async function getAccountValueMany({
  client,
  accountAddresses,
  outputCurrency = OutputCurrency.USD,
}: {
  client: Aptos;
  accountAddresses: AccountAddressInput[];
  outputCurrency?: OutputCurrency;
}): Promise<Map<string, AppraiseResult>> {
  // Confirm the given addresses are valid.
  accountAddresses.forEach((address) => AccountAddress.from(address));

  // Fetch assets on the accounts.
  const addressToAssets = await Promise.all(
    accountAddresses.map(async (accountAddress) => {
      const assets: Asset[] = [];
      assets.push(...(await fetchCoins({ client, accountAddress })));
      assets.push(...(await fetchStake({ client, accountAddress })));
      return [accountAddress, assets] as const;
    }),
  );

  // Get all the addresses of the assets across all accounts, deduplicating.
  const addresses = new Set<string>();
  for (const [_, assets] of addressToAssets.values()) {
    for (const asset of assets) {
      addresses.add(asset.typeString);
    }
  }

  // Lookup the prices of the assets.
  const prices = await getPrices({ addresses: Array.from(addresses), outputCurrency });

  // Get the value of the assets for each account.
  const out = new Map<string, AppraiseResult>();
  for (const [accountAddress, assets] of addressToAssets) {
    const result = appraise({ assets, prices });
    out.set(AccountAddress.from(accountAddress).toString(), result);
  }

  return out;
}
